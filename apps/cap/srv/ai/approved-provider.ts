/**
 * Approved LLM Provider Adapter
 * Phase 6 — AI Request Understanding & Clarification Engine
 *
 * Implements LLMProvider for a corporate-approved enterprise runtime LLM.
 *
 * GOVERNANCE GATE (ADR-004):
 *  - This adapter remains GATED pending corporate data-privacy and provider approval.
 *  - If RUNTIME_LLM_PROVIDER is not set or set to 'mock', it automatically delegates
 *    to MockLLMProvider.
 *  - Do NOT store or hardcode API keys, tokens, or endpoints here.
 *  - Never log prompts containing customer financial figures.
 */

import type { LLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResponse } from './llm-provider.ts';
import { MockLLMProvider } from './mock-llm-provider.ts';

export class RuntimeLLMNotApprovedError extends Error {
  constructor(providerName: string) {
    super(
      `[RuntimeLLMNotApprovedError] Runtime LLM provider "${providerName}" has not been approved ` +
      `by corporate governance. Set RUNTIME_LLM_PROVIDER=mock for local/test execution.`
    );
    this.name = 'RuntimeLLMNotApprovedError';
  }
}

export class ApprovedLLMProvider implements LLMProvider {
  private readonly _providerName: string;
  private readonly _apiKey?: string;
  private readonly _endpoint?: string;
  private readonly _fallbackMock: MockLLMProvider;

  constructor() {
    this._providerName = process.env['RUNTIME_LLM_PROVIDER'] || 'mock';
    this._apiKey = process.env['RUNTIME_LLM_API_KEY'];
    this._endpoint = process.env['RUNTIME_LLM_ENDPOINT'];
    this._fallbackMock = new MockLLMProvider();

    if (this._providerName === 'mock') {
      console.log('[ApprovedLLMProvider] Operating in MOCK mode (synthetic evaluation).');
    } else {
      console.warn(`[ApprovedLLMProvider] Configured for provider="${this._providerName}".`);
    }
  }

  getProviderName(): string {
    return this._providerName;
  }

  async isAvailable(): Promise<boolean> {
    if (this._providerName === 'mock') {
      return true;
    }
    // Gated: live provider is available only if credentials are confirmed
    return Boolean(this._apiKey && this._endpoint);
  }

  async complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResponse> {
    if (this._providerName === 'mock') {
      return this._fallbackMock.complete(messages, options);
    }

    // Gate check
    if (!this._apiKey || !this._endpoint) {
      throw new RuntimeLLMNotApprovedError(this._providerName);
    }

    // Placeholder for approved enterprise provider HTTP call (e.g. Azure OpenAI / Vertex AI)
    // Server-side call only, keeping secrets out of git and client-side code.
    throw new Error(
      `[ApprovedLLMProvider] Live HTTP integration for "${this._providerName}" is pending corporate gateway registration.`
    );
  }
}
