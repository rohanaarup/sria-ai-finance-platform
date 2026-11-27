/**
 * Builds the process-wide gateway from validated configuration (G2-04).
 *   mock   -> MockProvider (test double)           replay -> ReplayProvider (recorded answers)
 *   openai -> OpenAI-compatible adapter            anthropic -> Anthropic adapter
 * Live providers are created only when configuration says they are approved (see app-config.ts).
 */
import { loadConfig } from '../../lib/config/app-config.ts';
import type { AppConfig } from '../../lib/config/app-config.ts';
import { LLMGateway } from './llm-gateway.ts';
import { UsageMeter, persistModelCall } from './usage-meter.ts';
import { MockProvider } from './providers/mock-provider.ts';
import { ReplayProvider } from './providers/replay-provider.ts';
import { OpenAICompatibleProvider, AnthropicProvider } from './providers/http-providers.ts';
import type { ProviderV2 } from './types.ts';
import { LLMError } from './types.ts';

export * from './types.ts';
export { LLMGateway } from './llm-gateway.ts';
export { UsageMeter } from './usage-meter.ts';
export { MockProvider } from './providers/mock-provider.ts';
export { ReplayProvider, RecordingProvider } from './providers/replay-provider.ts';

export const MOCK_MODEL_ID = 'mock-goal-model-v2';

export function createProvider(cfg: AppConfig): ProviderV2 {
  switch (cfg.aiProvider) {
    case 'mock': return new MockProvider();
    case 'replay': return ReplayProvider.fromPath(cfg.aiReplayFile!);
    case 'openai': return new OpenAICompatibleProvider({ apiKey: cfg.aiApiKey ?? '', endpoint: cfg.aiEndpoint, approved: cfg.aiApproved });
    case 'anthropic': return new AnthropicProvider({ apiKey: cfg.aiApiKey ?? '', endpoint: cfg.aiEndpoint, approved: cfg.aiApproved });
    default: throw new LLMError('BAD_REQUEST', `No adapter for AI_RUNTIME_PROVIDER=${cfg.aiProvider}`);
  }
}

export function createGateway(cfg: AppConfig = loadConfig(), provider: ProviderV2 = createProvider(cfg), persist = true): LLMGateway {
  const meter = new UsageMeter({
    priceInPerMTok: cfg.ai.priceInPerMTok, priceOutPerMTok: cfg.ai.priceOutPerMTok,
    maxTokensPerRun: cfg.ai.maxTokensPerRun, maxTokensPerTenantDay: cfg.ai.maxTokensPerTenantDay,
    sink: persist ? persistModelCall : undefined
  });
  return new LLMGateway({
    provider, meter, models: { goal: cfg.aiModels.goal, planner: cfg.aiModels.planner, fallback: provider.mode === 'live' ? (cfg.aiModel as string) : MOCK_MODEL_ID },
    timeoutMs: cfg.ai.timeoutMs, maxRetries: cfg.ai.maxRetries
  });
}

let shared: LLMGateway | null = null;
export function getGateway(): LLMGateway { return (shared ??= createGateway()); }
/** @internal tests */
export function resetGateway(g: LLMGateway | null = null): void { shared = g; }
