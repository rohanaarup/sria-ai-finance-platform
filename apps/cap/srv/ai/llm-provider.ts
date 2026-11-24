/**
 * LLM Provider Abstraction
 * Phase 6 — AI Request Understanding & Clarification Engine
 *
 * Decouples the development coding agent (e.g. Gemini Flash) from the
 * application's runtime LLM provider as mandated by ADR-004.
 *
 * Rules:
 *  - No credentials hardcoded.
 *  - Provider selection strictly governed by corporate approval.
 *  - All calls remain server-side behind CAP services.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface LLMCompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  modelName: string;
  isMock: boolean;
}

export interface LLMProvider {
  /** Return human-readable provider name (e.g., 'mock', 'azure-openai', 'vertex-ai') */
  getProviderName(): string;

  /** Health-check: check if provider endpoint is configured and reachable */
  isAvailable(): Promise<boolean>;

  /** Execute a chat completion call */
  complete(messages: LLMMessage[], options?: LLMCompletionOptions): Promise<LLMCompletionResponse>;
}
