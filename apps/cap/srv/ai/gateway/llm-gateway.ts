/**
 * LLM gateway v2 (G2-04) — the single door to any language model.
 *
 * What happens to every request, in order (read this top to bottom to learn the pattern):
 *   1. ROUTE      pick the model for the task from configuration (small model for parsing, stronger for planning)
 *   2. REDACT     replace amounts, identifiers, personal data and secrets in the user-supplied text
 *   3. BUDGET     refuse to start if the run or the organisation has used up its token budget
 *   4. CALL       send to the provider with a hard timeout and the caller's cancel signal
 *   5. RETRY      only for "try again later" failures (rate limit 429, server error 5xx) with growing, jittered waits
 *   6. BREAKER    after repeated failures stop calling for a while instead of hammering a broken service
 *   7. VALIDATE   structured output must parse as JSON, fit the Zod schema and pass business rules
 *   8. REPAIR     if not, tell the model what was wrong and ask again — at most twice — then give up safely
 *   9. METER      write ONE log line (ids, hashes, tokens, latency, cost estimate) — never the text
 *
 * The caller receives either a validated object or a typed LLMError. Model output is never trusted
 * until step 7 has passed, and nothing downstream runs on unvalidated output.
 */
import { createHash } from 'node:crypto';
import { LLMError, RETRYABLE } from './types.ts';
import type { LLMRequest, LLMResult, ProviderV2, ProviderRequest, ProviderResponse, UsageRecord, ChatMessage } from './types.ts';
import { redact, mergeCounts, restorePlaceholders } from './redaction.ts';
import type { RedactionReport } from './redaction.ts';
import { UsageMeter, roughTokens } from './usage-meter.ts';
import { inputHashOf } from './providers/replay-provider.ts';

export interface GatewayOptions {
  provider: ProviderV2;
  meter: UsageMeter;
  models: { goal?: string; planner?: string; fallback: string };
  timeoutMs?: number;
  maxRetries?: number;
  maxRepairs?: number;
  breaker?: { failureThreshold: number; openMs: number };
  retryDelay?: { baseMs: number; maxMs: number };
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

const defaultSleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) return reject(new LLMError('ABORTED', 'The request was cancelled.'));
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); reject(new LLMError('ABORTED', 'The request was cancelled.')); }, { once: true });
});

/** Extract a JSON object from model text (models sometimes wrap JSON in markdown fences). */
export function extractJson(text: string): unknown {
  let s = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s);
  if (fence) s = fence[1]!;
  return JSON.parse(s);
}

export class LLMGateway {
  private readonly o: Required<Omit<GatewayOptions, 'models' | 'provider' | 'meter'>> & Pick<GatewayOptions, 'models' | 'provider' | 'meter'>;
  private consecutiveFailures = 0;
  private openUntil = 0;

  constructor(options: GatewayOptions) {
    this.o = {
      timeoutMs: 20_000, maxRetries: 2, maxRepairs: 2, breaker: { failureThreshold: 5, openMs: 30_000 }, retryDelay: { baseMs: 300, maxMs: 5000 },
      sleep: defaultSleep, random: Math.random, now: Date.now, ...options
    };
  }

  get mode() { return this.o.provider.mode; }
  get providerName() { return this.o.provider.name; }
  get meter() { return this.o.meter; }
  isAvailable() { return this.o.provider.isAvailable(); }

  modelFor(task: LLMRequest['task']): string {
    const m = task === 'planning' ? this.o.models.planner : this.o.models.goal;
    return m ?? this.o.models.fallback;
  }

  async complete<T>(req: LLMRequest<T>, opts: { signal?: AbortSignal } = {}): Promise<LLMResult<T>> {
    const started = this.o.now();
    const model = this.modelFor(req.task);
    let attempts = 0, repairs = 0, inTok = 0, outTok = 0, counts: Record<string, number> = {};
    let outcome: UsageRecord['outcome'] = 'OK';
    let lastText = '';
    const restores: RedactionReport[] = [];
    try {
      // 2. REDACT (system prompt is ours and contains no user text, so only messages are redacted)
      const messages: ChatMessage[] = req.messages.map((m) => {
        const r = redact(m.content, { allowedIdentifiers: req.redaction?.allowedIdentifiers });
        counts = mergeCounts(counts, r.report.counts); restores.push(r.report);
        return { role: m.role, content: r.text };
      });
      // 3. BUDGET
      const maxOut = req.maxOutputTokens ?? 1500;
      this.o.meter.checkBudget(req.context.tenant, req.context.runId, roughTokens(req.system + messages.map((m) => m.content).join('')) + maxOut);
      // 6. BREAKER (checked before spending anything)
      if (this.o.now() < this.openUntil) throw new LLMError('CIRCUIT_OPEN', 'Model calls are paused after repeated failures; try again shortly.');

      const conversation: ChatMessage[] = [...messages];
      const maxRepairs = req.schema ? this.o.maxRepairs : 0;
      for (let round = 0; ; round++) {
        const res = await this.callWithRetry(req, model, conversation, maxOut, opts.signal, (n) => { attempts += n; });
        inTok += res.usage.inputTokens; outTok += res.usage.outputTokens; lastText = res.text;
        if (!req.schema) {
          return { data: undefined, text: res.text, usage: await this.finish(req, model, started, attempts, repairs, inTok, outTok, counts, 'OK') } as LLMResult<T>;
        }
        // 7. VALIDATE
        const problems: string[] = [];
        let value: T | undefined;
        try {
          const parsed = extractJson(res.text);
          const z = req.schema.zod.safeParse(parsed);
          if (z.success) {
            value = z.data;
            const extra = req.schema.validate?.(z.data) ?? [];
            if (extra.length) problems.push(...extra);
          } else problems.push(...z.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
        } catch { problems.push('the answer was not valid JSON'); }
        if (!problems.length && value !== undefined) {
          return { data: value, text: res.text, usage: await this.finish(req, model, started, attempts, repairs, inTok, outTok, counts, 'OK') };
        }
        // 8. REPAIR (bounded)
        if (round >= maxRepairs) throw new LLMError('MALFORMED', `The model's answer did not fit the required structure after ${repairs} repair attempt(s).`);
        repairs++;
        conversation.push({ role: 'assistant', content: res.text.slice(0, 4000) });
        conversation.push({ role: 'user', content: `Your previous answer was not accepted: ${problems.join('; ')}. Reply again with ONLY the corrected JSON object, nothing else.` });
        this.o.meter.checkBudget(req.context.tenant, req.context.runId, roughTokens(conversation.map((m) => m.content).join('')) + maxOut);
      }
    } catch (e) {
      const err = e instanceof LLMError ? e : new LLMError('SERVER_ERROR', 'Unexpected failure while calling the model.');
      outcome = err.code;
      await this.finish(req, model, started, attempts, repairs, inTok, outTok, counts, outcome);
      throw err;
    } finally {
      void lastText; void restores;
    }
  }

  /** Restoring redacted values is available to callers that kept the report; see goal-service. */
  static restore(text: string, report: RedactionReport): string { return restorePlaceholders(text, report); }

  // ── 4/5/6: one logical call with retry and the circuit breaker ───────────────────────────
  private async callWithRetry(req: LLMRequest<any>, model: string, messages: ChatMessage[], maxOut: number, callerSignal: AbortSignal | undefined, count: (n: number) => void): Promise<ProviderResponse> {
    const temperature = req.temperature ?? 0;
    const preq: ProviderRequest = {
      model, system: req.system, messages, temperature, maxOutputTokens: maxOut, promptVersion: req.promptVersion, promptHash: req.promptHash,
      schema: req.schema ? { name: req.schema.name, jsonSchema: req.schema.jsonSchema } : undefined, inputHash: ''
    };
    preq.inputHash = inputHashOf(preq);
    let lastErr: LLMError | undefined;
    for (let attempt = 0; attempt <= this.o.maxRetries; attempt++) {
      count(1);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), this.o.timeoutMs);   // referenced timer, cleared in finally
      const signal = callerSignal ? AbortSignal.any([callerSignal, ctl.signal]) : ctl.signal;
      try {
        const res = await this.o.provider.complete(preq, signal);
        this.consecutiveFailures = 0;
        return res;
      } catch (e) {
        let err = e instanceof LLMError ? e : new LLMError('SERVER_ERROR', 'Unexpected provider failure.');
        if (callerSignal?.aborted) err = new LLMError('ABORTED', 'The request was cancelled.');
        else if (ctl.signal.aborted && err.code === 'ABORTED') err = new LLMError('TIMEOUT', `The model did not answer within ${this.o.timeoutMs} ms.`);
        lastErr = err;
        if (!RETRYABLE.has(err.code) || attempt === this.o.maxRetries) break;
        const exp = Math.min(this.o.retryDelay.maxMs, this.o.retryDelay.baseMs * 2 ** attempt);
        const wait = err.retryAfterMs !== undefined ? Math.min(this.o.retryDelay.maxMs, err.retryAfterMs) : exp + Math.floor(this.o.random() * exp * 0.5);
        try { await this.o.sleep(wait, callerSignal ?? new AbortController().signal); } catch { throw new LLMError('ABORTED', 'The request was cancelled.'); }
      } finally { clearTimeout(timer); }
    }
    const err = lastErr!;
    // permanent client-side problems (auth, bad request, cancel, approval, replay) are not "the service is down"
    if (err.code === 'RATE_LIMITED' || err.code === 'SERVER_ERROR' || err.code === 'TIMEOUT') {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.o.breaker.failureThreshold) { this.openUntil = this.o.now() + this.o.breaker.openMs; this.consecutiveFailures = 0; }
    }
    throw err;
  }

  // ── 9: metering ─────────────────────────────────────────────────────────────────────────
  private finish(req: LLMRequest<any>, model: string, started: number, attempts: number, repairs: number, inTok: number, outTok: number, counts: Record<string, number>, outcome: UsageRecord['outcome']): Promise<UsageRecord> {
    return this.o.meter.record({
      tenant: req.context.tenant, userId: req.context.userId, runId: req.context.runId, task: req.task, promptId: req.promptId, promptVersion: req.promptVersion,
      promptHash: req.promptHash, provider: this.o.provider.name, mode: this.o.provider.mode, model, inputTokens: inTok, outputTokens: outTok,
      latencyMs: this.o.now() - started, attempts, repairs, redactionCounts: counts, outcome
    });
  }
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
