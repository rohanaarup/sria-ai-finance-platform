/**
 * LLM gateway types (G2-04).
 *
 * The GATEWAY is the single door through which the application talks to any language model.
 * Everything that must be true for every model call (redaction, timeouts, retries, validation,
 * metering, no logging of bodies) is done once, here, instead of being re-done by each caller.
 *
 * Vocabulary:
 *  - request:   what the application wants ("understand this text and give me an AgentGoal")
 *  - provider:  an adapter to one model service (mock, replay, OpenAI-compatible, Anthropic)
 *  - structured output: the model must answer in a JSON shape we define (a Zod schema)
 *  - repair:    when the answer does not fit the shape, we tell the model what was wrong and ask again
 */
import type { ZodType } from 'zod';

export type LLMErrorCode =
  | 'TIMEOUT'          // the model did not answer in time
  | 'RATE_LIMITED'     // provider said 429 (retryable)
  | 'SERVER_ERROR'     // provider 5xx / overloaded (retryable)
  | 'AUTH'             // bad or missing credentials
  | 'BAD_REQUEST'      // provider rejected our request (a bug or an unsupported feature)
  | 'MALFORMED'        // the answer never fit the required shape, even after repairs
  | 'ABORTED'          // the caller cancelled
  | 'NOT_APPROVED'     // a live provider was used without the approval flag
  | 'CIRCUIT_OPEN'     // too many recent failures; calls are paused briefly
  | 'BUDGET_EXCEEDED'  // token budget for this run or tenant is used up
  | 'REPLAY_MISS';     // replay mode has no recorded answer for this input

/** Only these may be retried automatically (a timeout is NOT retried: it may double the cost). */
export const RETRYABLE: ReadonlySet<LLMErrorCode> = new Set(['RATE_LIMITED', 'SERVER_ERROR']);

export class LLMError extends Error {
  readonly code: LLMErrorCode;
  /** how long the provider asked us to wait (Retry-After), in ms */
  readonly retryAfterMs?: number;
  constructor(code: LLMErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export type LLMTask = 'goal_understanding' | 'planning';

/** What a caller asks the gateway for. */
export interface LLMRequest<T = unknown> {
  task: LLMTask;
  /** The immutable system prompt, rendered from the prompt registry. Never contains user text. */
  system: string;
  promptId: string;
  promptVersion: string;
  /** sha256 of the prompt TEMPLATE file (identifies exactly which prompt text was used) */
  promptHash: string;
  /** User text and any retrieved data. The caller delimits it as data; the gateway redacts it. */
  messages: ChatMessage[];
  /** Ask for structured output: the JSON Schema is sent to the provider, the Zod schema validates the answer. */
  schema?: {
    name: string;
    jsonSchema: Record<string, unknown>;
    zod: ZodType<T>;
    /** Extra business-rule check run after the Zod check; returned problems feed the repair prompt. */
    validate?: (value: T) => string[];
  };
  temperature?: number;
  maxOutputTokens?: number;
  /** identifiers used for budgets and metering only (never sent to the provider) */
  context: { tenant: string; userId: string; runId?: string };
  /** identifiers and numbers that may reach the provider unchanged (company codes, years) */
  redaction?: { allowedIdentifiers?: string[] };
}

/** What a provider adapter receives (already redacted and routed to a model). */
export interface ProviderRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  schema?: { name: string; jsonSchema: Record<string, unknown> };
  temperature: number;
  maxOutputTokens: number;
  promptVersion: string;
  promptHash: string;
  /** sha256 of the request content; the replay provider's lookup key */
  inputHash: string;
}

export interface ProviderResponse {
  /** the model's answer as text (for structured output: the JSON text) */
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  modelId: string;
  finishReason: 'stop' | 'length' | 'other';
}

export interface ProviderV2 {
  readonly name: string;
  /** mock = deterministic test double, replay = recorded answers, live = a real model */
  readonly mode: 'mock' | 'replay' | 'live';
  complete(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse>;
  isAvailable(): Promise<boolean>;
}

/** One line in the model-call log. Contains NO prompt or answer text: only identifiers, hashes and counts. */
export interface UsageRecord {
  at: string;
  tenant: string;
  userId: string;
  runId?: string;
  task: LLMTask;
  promptId: string;
  promptVersion: string;
  promptHash: string;
  provider: string;
  mode: 'mock' | 'replay' | 'live';
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  /** estimate only: tokens × the configured price per million tokens (0 when no price is configured) */
  costEstimateUsd: number;
  /** model calls made for this request (1 = no retry or repair) */
  attempts: number;
  repairs: number;
  redactionCounts: Record<string, number>;
  outcome: 'OK' | LLMErrorCode;
}

export interface LLMResult<T = unknown> {
  /** the validated object when a schema was requested, otherwise undefined */
  data: T | undefined;
  text: string;
  usage: UsageRecord;
}
