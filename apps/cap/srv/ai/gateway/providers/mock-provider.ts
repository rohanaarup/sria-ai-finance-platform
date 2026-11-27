/**
 * MockProvider: the deterministic test double behind the gateway (mode 'mock'). TEST-ONLY.
 * It never calls a network. For structured requests named "AgentGoal" it answers with the
 * keyword-based mock goal model; anything else gets a clearly labelled stub reply.
 */
import type { ProviderV2, ProviderRequest, ProviderResponse } from '../types.ts';
import { LLMError } from '../types.ts';
import { mockGoalModel } from './mock-goal-model.ts';

export class MockProvider implements ProviderV2 {
  readonly name = 'mock-test-double';
  readonly mode = 'mock' as const;
  /** test hooks: simulate failures on the next calls */
  private failures: LLMError[] = [];
  private malformed: string[] = [];
  calls = 0;

  failNext(...errors: LLMError[]): void { this.failures.push(...errors); }
  answerNext(...texts: string[]): void { this.malformed.push(...texts); }

  async isAvailable() { return true; }

  async complete(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResponse> {
    this.calls++;
    if (signal.aborted) throw new LLMError('ABORTED', 'The request was cancelled.');
    const f = this.failures.shift(); if (f) throw f;
    const forced = this.malformed.shift();
    let text: string;
    if (forced !== undefined) text = forced;
    else if (req.schema?.name === 'AgentGoal') {
      const last = [...req.messages].reverse().find((m) => m.role === 'user');
      const m = /<user_request>\n?([\s\S]*?)\n?<\/user_request>/.exec(last?.content ?? '');
      text = JSON.stringify(mockGoalModel(req.system, m ? m[1]! : last?.content ?? ''));
    } else text = JSON.stringify({ note: 'mock provider: no handler for this request' });
    const inTok = Math.ceil((req.system.length + req.messages.reduce((n, m) => n + m.content.length, 0)) / 4);
    return { text, usage: { inputTokens: inTok, outputTokens: Math.ceil(text.length / 4) }, modelId: req.model, finishReason: 'stop' };
  }
}
