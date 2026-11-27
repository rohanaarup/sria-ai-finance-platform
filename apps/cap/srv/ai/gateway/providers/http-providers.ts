/**
 * Live provider adapters (G2-04): OpenAI-compatible chat completions and Anthropic Messages.
 *
 * Both are thin: they translate our ProviderRequest into the provider's HTTP request, translate
 * the answer back, and map HTTP statuses to LLMError codes. All policy (redaction, retries,
 * validation, budgets, logging) lives in the gateway, not here.
 *
 * SAFETY RULES enforced here:
 *  - A live adapter refuses to be created unless the provider is marked approved
 *    (AI_PROVIDER_APPROVED=true, see docs/ai/PROVIDER-APPROVAL.md) and an API key is present.
 *  - The API key is read from configuration (environment / secret store). It is sent only in the
 *    provider's auth header and never logged, returned or put into error messages.
 *  - Errors carry a status class and a generic message, never the request or response body
 *    (a body may echo financial text).
 *
 * VERIFICATION STATUS: these adapters follow the providers' documented request/response formats and
 * are tested against local HTTP stand-ins that imitate those formats. They have NOT been run against
 * a real provider (no approved account yet). The opt-in live test (S4-style smoke test) in
 * tests/eval/live-smoke.test.ts is how that gets verified.
 */
import type { ProviderV2, ProviderRequest, ProviderResponse } from '../types.ts';
import { LLMError } from '../types.ts';

export interface LiveProviderOptions {
  apiKey: string;
  /** base URL, for example the provider's API root */
  endpoint?: string;
  approved: boolean;
  /** injectable for tests */
  fetchImpl?: typeof fetch;
}

function assertAllowed(name: string, o: LiveProviderOptions) {
  if (!o.approved) throw new LLMError('NOT_APPROVED', `Provider "${name}" is not approved. Record the approval in docs/ai/PROVIDER-APPROVAL.md and set AI_PROVIDER_APPROVED=true.`);
  if (!o.apiKey) throw new LLMError('AUTH', `Provider "${name}" has no API key configured.`);
}

/** Map an HTTP status (and optional Retry-After seconds) to a typed error. Never includes the body. */
export function errorFromHttp(status: number, retryAfter?: string | null): LLMError {
  const secs = retryAfter ? Number(retryAfter) : NaN;
  const ra = Number.isFinite(secs) ? Math.min(secs, 60) * 1000 : undefined;
  if (status === 401 || status === 403) return new LLMError('AUTH', `The provider rejected the credentials (HTTP ${status}).`);
  if (status === 429) return new LLMError('RATE_LIMITED', 'The provider is rate limiting requests (HTTP 429).', ra);
  if (status === 408 || status === 504) return new LLMError('TIMEOUT', `The provider timed out (HTTP ${status}).`);
  if (status === 400 || status === 404 || status === 413 || status === 422) return new LLMError('BAD_REQUEST', `The provider rejected the request (HTTP ${status}). Check the model name and schema support.`);
  if (status >= 500 || status === 529) return new LLMError('SERVER_ERROR', `The provider reported a server error (HTTP ${status}).`, ra);
  return new LLMError('SERVER_ERROR', `Unexpected provider response (HTTP ${status}).`);
}

async function post(f: typeof fetch, url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
  try {
    const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
    if (!res.ok) { await res.arrayBuffer().catch(() => undefined); throw errorFromHttp(res.status, res.headers.get('retry-after')); }
    return await res.json() as any;
  } catch (e) {
    if (e instanceof LLMError) throw e;
    if (signal.aborted) throw new LLMError('ABORTED', 'The request was cancelled or timed out.');
    throw new LLMError('SERVER_ERROR', 'Could not reach the provider.');
  }
}

/** Works with any service that implements the OpenAI "chat completions" API (the endpoint decides who it is). */
export class OpenAICompatibleProvider implements ProviderV2 {
  readonly name = 'openai-compatible';
  readonly mode = 'live' as const;
  private readonly o: LiveProviderOptions;
  constructor(o: LiveProviderOptions) {
    assertAllowed(this.name, o);
    if (!o.endpoint) throw new LLMError('BAD_REQUEST', 'An endpoint (base URL) is required for the OpenAI-compatible provider.');
    this.o = o;
  }
  async isAvailable() { return true; }
  async complete(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse> {
    const body: Record<string, unknown> = {
      model: req.model, temperature: req.temperature, max_tokens: req.maxOutputTokens,
      messages: [{ role: 'system', content: req.system }, ...req.messages.map((m) => ({ role: m.role, content: m.content }))]
    };
    if (req.schema) body['response_format'] = { type: 'json_schema', json_schema: { name: req.schema.name, strict: true, schema: req.schema.jsonSchema } };
    const j = await post(this.o.fetchImpl ?? fetch, `${this.o.endpoint!.replace(/\/$/, '')}/chat/completions`, { authorization: `Bearer ${this.o.apiKey}` }, body, signal);
    const choice = j?.choices?.[0];
    const text = choice?.message?.content;
    if (typeof text !== 'string') throw new LLMError('SERVER_ERROR', 'The provider answer had no message content.');
    return {
      text, modelId: String(j.model ?? req.model),
      usage: { inputTokens: Number(j.usage?.prompt_tokens ?? 0), outputTokens: Number(j.usage?.completion_tokens ?? 0) },
      finishReason: choice.finish_reason === 'stop' ? 'stop' : choice.finish_reason === 'length' ? 'length' : 'other'
    };
  }
}

/** Anthropic Messages API. Structured output is requested by forcing a tool call whose input is our schema. */
export class AnthropicProvider implements ProviderV2 {
  readonly name = 'anthropic';
  readonly mode = 'live' as const;
  private readonly o: LiveProviderOptions;
  constructor(o: LiveProviderOptions) { assertAllowed(this.name, o); this.o = o; }
  async isAvailable() { return true; }
  async complete(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse> {
    const body: Record<string, unknown> = {
      model: req.model, max_tokens: req.maxOutputTokens, temperature: req.temperature, system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content }))
    };
    if (req.schema) {
      body['tools'] = [{ name: req.schema.name, description: 'Return the result in exactly this structure.', input_schema: req.schema.jsonSchema }];
      body['tool_choice'] = { type: 'tool', name: req.schema.name };
    }
    const base = (this.o.endpoint ?? 'https://api.anthropic.com').replace(/\/$/, '');
    const j = await post(this.o.fetchImpl ?? fetch, `${base}/v1/messages`, { 'x-api-key': this.o.apiKey, 'anthropic-version': '2023-06-01' }, body, signal);
    const blocks: any[] = Array.isArray(j?.content) ? j.content : [];
    const tool = blocks.find((b) => b?.type === 'tool_use');
    const textBlock = blocks.find((b) => b?.type === 'text');
    const text = tool ? JSON.stringify(tool.input) : typeof textBlock?.text === 'string' ? textBlock.text : undefined;
    if (text === undefined) throw new LLMError('SERVER_ERROR', 'The provider answer had no usable content.');
    return {
      text, modelId: String(j.model ?? req.model),
      usage: { inputTokens: Number(j.usage?.input_tokens ?? 0), outputTokens: Number(j.usage?.output_tokens ?? 0) },
      finishReason: j.stop_reason === 'end_turn' || j.stop_reason === 'tool_use' ? 'stop' : j.stop_reason === 'max_tokens' ? 'length' : 'other'
    };
  }
}
