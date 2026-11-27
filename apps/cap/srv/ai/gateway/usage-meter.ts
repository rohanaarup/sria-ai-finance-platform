/**
 * Usage metering and budgets (G2-04).
 *
 * Every model call costs money and time. This module:
 *  - records ONE line per request (tokens in/out, latency, cost estimate, prompt id/version/hash,
 *    model, redaction counts, outcome) — never the prompt or the answer;
 *  - enforces budgets BEFORE a call: a token budget per run and per tenant per day, so a bug or an
 *    abusive loop cannot run up an unbounded bill.
 *
 * The cost figure is an ESTIMATE: tokens × the price per million tokens set in configuration
 * (AI_PRICE_IN_PER_MTOK / AI_PRICE_OUT_PER_MTOK). With no price configured it is 0.
 */
import type { UsageRecord } from './types.ts';
import { LLMError } from './types.ts';

export interface MeterOptions {
  priceInPerMTok: number;
  priceOutPerMTok: number;
  maxTokensPerRun: number;
  maxTokensPerTenantDay: number;
  /** where records go besides memory (for example the ModelCalls table) */
  sink?: (r: UsageRecord) => Promise<void> | void;
  now?: () => Date;
}

export const estimateCostUsd = (inTok: number, outTok: number, priceIn: number, priceOut: number) =>
  Math.round(((inTok * priceIn + outTok * priceOut) / 1_000_000) * 1e6) / 1e6;

export class UsageMeter {
  private readonly o: MeterOptions;
  readonly records: UsageRecord[] = [];
  private readonly perRun = new Map<string, number>();
  private readonly perTenantDay = new Map<string, number>();

  constructor(options: MeterOptions) { this.o = options; }

  private day() { return (this.o.now ?? (() => new Date()))().toISOString().slice(0, 10); }

  /** Throws BUDGET_EXCEEDED when the next call may not start. `expectedTokens` is a conservative guess for the call. */
  checkBudget(tenant: string, runId: string | undefined, expectedTokens: number): void {
    const run = runId ? this.perRun.get(runId) ?? 0 : 0;
    if (runId && run + expectedTokens > this.o.maxTokensPerRun) {
      throw new LLMError('BUDGET_EXCEEDED', `The token budget for this run (${this.o.maxTokensPerRun}) is used up.`);
    }
    const day = this.perTenantDay.get(`${tenant}|${this.day()}`) ?? 0;
    if (day + expectedTokens > this.o.maxTokensPerTenantDay) {
      throw new LLMError('BUDGET_EXCEEDED', `The daily token budget for this organisation (${this.o.maxTokensPerTenantDay}) is used up.`);
    }
  }

  /** Record a finished request (successful or not) and charge its tokens to the budgets. */
  async record(r: Omit<UsageRecord, 'at' | 'costEstimateUsd'>): Promise<UsageRecord> {
    const full: UsageRecord = {
      ...r, at: (this.o.now ?? (() => new Date()))().toISOString(),
      costEstimateUsd: estimateCostUsd(r.inputTokens, r.outputTokens, this.o.priceInPerMTok, this.o.priceOutPerMTok)
    };
    const tokens = r.inputTokens + r.outputTokens;
    if (r.runId) this.perRun.set(r.runId, (this.perRun.get(r.runId) ?? 0) + tokens);
    const k = `${r.tenant}|${this.day()}`;
    this.perTenantDay.set(k, (this.perTenantDay.get(k) ?? 0) + tokens);
    this.records.push(full);
    if (this.records.length > 5000) this.records.splice(0, this.records.length - 5000);
    try { await this.o.sink?.(full); } catch { /* a failing log sink must never fail a user request */ }
    return full;
  }

  tokensUsedByRun(runId: string): number { return this.perRun.get(runId) ?? 0; }
  tokensUsedByTenantToday(tenant: string): number { return this.perTenantDay.get(`${tenant}|${this.day()}`) ?? 0; }
}

/** Rough token estimate (about 4 characters per token) used only for budget pre-checks. */
export const roughTokens = (text: string) => Math.ceil(text.length / 4);

/** Persist a usage record to the ModelCalls table in its own transaction (no bodies). */
export async function persistModelCall(r: UsageRecord): Promise<void> {
  const cds = (await import('@sap/cds')).default as any;
  if (!cds.db) return;
  const row = {
    tenantId: r.tenant, userId: r.userId, runId: r.runId ?? null, task: r.task, promptId: r.promptId, promptVersion: r.promptVersion,
    promptHash: r.promptHash, provider: r.provider, mode: r.mode, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
    latencyMs: r.latencyMs, costEstimateUsd: r.costEstimateUsd, attempts: r.attempts, repairs: r.repairs,
    redactionCounts: JSON.stringify(r.redactionCounts), outcome: r.outcome
  };
  // Inside a request, join its transaction (one connection); outside one (scripts), use a privileged transaction of our own.
  if (cds.context) await cds.db.run(INSERT.into('sria.finance.ModelCalls').entries(row));
  else await cds.db.tx({ user: new cds.User.Privileged() }, (tx: any) => tx.run(INSERT.into('sria.finance.ModelCalls').entries(row)));
}
