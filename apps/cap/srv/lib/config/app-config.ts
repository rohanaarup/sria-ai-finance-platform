/**
 * AppConfig — the single, validated source of runtime configuration (G2-00).
 *
 * Every environment variable the backend reads is defined here once. Invalid or
 * missing values fail at startup (ConfigError) instead of silently falling back.
 * /health, the provider factory, the planner and the CORS middleware all read this
 * module, so what /health reports is what the code actually uses (finding F-06).
 *
 * Environment tiers:
 *   mock        synthetic data, mock AI. CI, demos, offline development.
 *   local       developer machine; synthetic data allowed.
 *   pilot       live pilot on BTP. Must be set explicitly.
 *   production  production. Synthetic providers are rejected.
 */
import { z } from 'zod';

export const ENVIRONMENT_TIERS = ['mock', 'local', 'pilot', 'production'] as const;
export type EnvironmentTier = (typeof ENVIRONMENT_TIERS)[number];

export class ConfigError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Invalid configuration:\n - ${problems.join('\n - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  APP_ENV_TIER: z.enum(ENVIRONMENT_TIERS).optional(),
  FINANCE_DATA_PROVIDER: z.enum(['mock', 's4hana']).default('mock'),
  FINANCE_S4HANA_DESTINATION_NAME: z.string().min(1).optional(),
  // mock = deterministic test double · replay = recorded answers (CI) · openai/anthropic = live adapters
  // (azure-openai and gemini-api are accepted names but have no adapter yet; startup fails clearly if selected)
  AI_RUNTIME_PROVIDER: z.enum(['mock', 'replay', 'openai', 'anthropic', 'azure-openai', 'gemini-api']).default('mock'),
  // Live providers refuse to start unless this is 'true' AND docs/ai/PROVIDER-APPROVAL.md records the approval (D-08/D-09)
  AI_PROVIDER_APPROVED: z.enum(['true', 'false']).default('false'),
  AI_REPLAY_FILE: z.string().min(1).optional(),
  // Model routing: a smaller model for goal parsing, a stronger one for planning. Falls back to AI_RUNTIME_MODEL.
  AI_MODEL_GOAL: z.string().min(1).optional(),
  AI_MODEL_PLANNER: z.string().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().min(500).max(120_000).default(20_000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  AI_MAX_TOKENS_PER_RUN: z.coerce.number().int().min(100).max(2_000_000).default(20_000),
  AI_MAX_TOKENS_PER_TENANT_DAY: z.coerce.number().int().min(100).max(100_000_000).default(500_000),
  // Cost estimate inputs (USD per million tokens). Default 0 = unknown; set from your provider's price list.
  AI_PRICE_IN_PER_MTOK: z.coerce.number().min(0).default(0),
  AI_PRICE_OUT_PER_MTOK: z.coerce.number().min(0).default(0),
  AGENT_GOAL: z.enum(['on', 'off']).default('on'),
  AI_RUNTIME_API_KEY: z.string().min(1).optional(),
  AI_RUNTIME_ENDPOINT: z.string().url().optional(),
  AI_RUNTIME_MODEL: z.string().min(1).optional(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  SEMANTIC_LAYER: z.enum(['on', 'off']).default('on'),
  DATA_PRODUCT: z.enum(['on', 'off']).default('on'),
  DP_MAX_ENTITIES: z.coerce.number().int().min(1).max(100).default(10),
  DP_MAX_PERIODS: z.coerce.number().int().min(1).max(16).default(16),
  DP_MAX_ROWS: z.coerce.number().int().min(1).max(1_000_000).default(50_000),
  DP_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(10_000),
  // G2-03 S/4HANA adapter. All values are candidates until confirmed against the real system's $metadata.
  S4_SERVICE_ROOT: z.string().regex(/^\/[A-Za-z0-9_\-\/.]+$/, 'must be a URL path starting with /').default('/sap/opu/odata/sap/API_JOURNALENTRYITEMBASIC_SRV'),
  S4_ENTITY_SET: z.string().regex(/^[A-Za-z0-9_]+$/).default('A_JournalEntryItemBasic'),
  S4_LEDGER: z.string().regex(/^[A-Za-z0-9]{1,4}$/, 'ledger code, 1-4 characters').default('0L'),
  S4_AMOUNT_CONVENTION: z.enum(['INDICATOR', 'SIGNED_DEBIT_POSITIVE']).default('INDICATOR'),
  S4_REVENUE_ACCOUNTS: z.string().regex(/^\d{1,10}-\d{1,10}(,\d{1,10}-\d{1,10})*$/).default('400000-499999'),
  S4_EXPENSE_ACCOUNTS: z.string().regex(/^\d{1,10}-\d{1,10}(,\d{1,10}-\d{1,10})*$/).default('500000-699999')
});

export interface AppConfig {
  nodeEnv: string;
  tier: EnvironmentTier;
  financeProvider: 'mock' | 's4hana';
  s4DestinationName?: string;
  aiProvider: 'mock' | 'replay' | 'openai' | 'anthropic' | 'azure-openai' | 'gemini-api';
  aiApiKey?: string;
  aiEndpoint?: string;
  aiModel?: string;
  /** G2-04 */
  aiApproved: boolean;
  /** 'live' only for a real provider; mock and replay are never live */
  aiMode: 'mock' | 'replay' | 'live';
  aiReplayFile?: string;
  aiModels: { goal?: string; planner?: string };
  ai: { timeoutMs: number; maxRetries: number; maxTokensPerRun: number; maxTokensPerTenantDay: number; priceInPerMTok: number; priceOutPerMTok: number };
  /** AgentGoal understanding (G2-04); 'off' keeps the legacy keyword-intent path */
  agentGoal: boolean;
  corsAllowedOrigins: string[];
  /** G2-01: semantic layer drives gate and formulas; 'off' = legacy hard-coded catalog (rollback). */
  semanticLayer: boolean;
  /** G2-02: tools read through the FinancialPerformance data product; 'off' = legacy provider path (rollback). */
  dataProduct: boolean;
  /** G2-02 retrieval bounds: queries beyond them are rejected, never silently cut short. */
  bounds: { maxEntities: number; maxPeriods: number; maxRows: number; timeoutMs: number };
  /** G2-03: S/4HANA adapter settings (candidates until confirmed from the real system's metadata). */
  s4: { serviceRoot: string; entitySet: string; ledger: string; amountConvention: 'INDICATOR' | 'SIGNED_DEBIT_POSITIVE'; revenueAccounts: string; expenseAccounts: string };
  /** true when answers are built from synthetic data or the mock model */
  isSynthetic: boolean;
}

const LOCAL_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const problems: string[] = [];
  // Treat empty strings as unset so a blank .env line cannot silently change behaviour.
  const cleaned: Record<string, string | undefined> = {};
  for (const k of Object.keys(EnvSchema.shape)) cleaned[k] = env[k] === '' ? undefined : env[k];

  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problems.push(`${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(problems);
  }
  const e = parsed.data;
  const nodeEnv = e.NODE_ENV ?? 'development';

  if (nodeEnv === 'production' && !e.APP_ENV_TIER) {
    problems.push('APP_ENV_TIER must be set explicitly (pilot or production) when NODE_ENV=production');
  }
  const tier: EnvironmentTier = e.APP_ENV_TIER ?? 'local';

  if (nodeEnv === 'production' && (tier === 'mock' || tier === 'local')) {
    problems.push(`APP_ENV_TIER=${tier} is not allowed when NODE_ENV=production`);
  }
  if (tier === 'production' && (e.FINANCE_DATA_PROVIDER === 'mock' || e.AI_RUNTIME_PROVIDER === 'mock')) {
    problems.push('APP_ENV_TIER=production cannot use the mock finance provider or the mock AI provider');
  }
  if (e.FINANCE_DATA_PROVIDER === 's4hana' && !e.FINANCE_S4HANA_DESTINATION_NAME) {
    problems.push('FINANCE_S4HANA_DESTINATION_NAME is required when FINANCE_DATA_PROVIDER=s4hana');
  }
  const p = e.AI_RUNTIME_PROVIDER;
  const isLive = p !== 'mock' && p !== 'replay';
  if (isLive) {
    if (p === 'azure-openai' || p === 'gemini-api') problems.push(`AI_RUNTIME_PROVIDER=${p} has no adapter yet; use 'openai' (any OpenAI-compatible endpoint) or 'anthropic'`);
    if (e.AI_PROVIDER_APPROVED !== 'true') problems.push(`AI_RUNTIME_PROVIDER=${p} is a live provider and may not start until it is approved: record the approval in docs/ai/PROVIDER-APPROVAL.md, then set AI_PROVIDER_APPROVED=true`);
    if (!e.AI_RUNTIME_API_KEY) problems.push(`AI_RUNTIME_API_KEY is required when AI_RUNTIME_PROVIDER=${p} (set it in the secret store or a local .env, never in git)`);
    if (p === 'openai' && !e.AI_RUNTIME_ENDPOINT) problems.push('AI_RUNTIME_ENDPOINT is required for AI_RUNTIME_PROVIDER=openai (for example your provider base URL ending in /v1)');
    if (!(e.AI_MODEL_GOAL ?? e.AI_RUNTIME_MODEL)) problems.push('AI_RUNTIME_MODEL (or AI_MODEL_GOAL) is required for a live provider; no model is chosen by default');
  }
  if (p === 'replay' && !e.AI_REPLAY_FILE) problems.push('AI_REPLAY_FILE is required when AI_RUNTIME_PROVIDER=replay');
  if (tier === 'production' && p === 'replay') problems.push('APP_ENV_TIER=production cannot use the replay AI provider');
  if (problems.length) throw new ConfigError(problems);

  let corsAllowedOrigins: string[];
  if (e.CORS_ALLOWED_ORIGINS !== undefined) {
    corsAllowedOrigins = e.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
    if (corsAllowedOrigins.includes('*')) {
      throw new ConfigError(['CORS_ALLOWED_ORIGINS must list explicit origins; "*" is not allowed']);
    }
  } else {
    corsAllowedOrigins = tier === 'mock' || tier === 'local' ? LOCAL_ORIGINS : [];
  }

  return {
    nodeEnv,
    tier,
    financeProvider: e.FINANCE_DATA_PROVIDER,
    s4DestinationName: e.FINANCE_S4HANA_DESTINATION_NAME,
    aiProvider: e.AI_RUNTIME_PROVIDER,
    aiApiKey: e.AI_RUNTIME_API_KEY,
    aiEndpoint: e.AI_RUNTIME_ENDPOINT,
    aiModel: e.AI_RUNTIME_MODEL,
    aiApproved: e.AI_PROVIDER_APPROVED === 'true',
    aiMode: isLive ? 'live' : p,
    aiReplayFile: e.AI_REPLAY_FILE,
    aiModels: { goal: e.AI_MODEL_GOAL ?? e.AI_RUNTIME_MODEL, planner: e.AI_MODEL_PLANNER ?? e.AI_RUNTIME_MODEL },
    ai: { timeoutMs: e.AI_TIMEOUT_MS, maxRetries: e.AI_MAX_RETRIES, maxTokensPerRun: e.AI_MAX_TOKENS_PER_RUN, maxTokensPerTenantDay: e.AI_MAX_TOKENS_PER_TENANT_DAY, priceInPerMTok: e.AI_PRICE_IN_PER_MTOK, priceOutPerMTok: e.AI_PRICE_OUT_PER_MTOK },
    agentGoal: e.AGENT_GOAL === 'on',
    corsAllowedOrigins,
    semanticLayer: e.SEMANTIC_LAYER === 'on',
    dataProduct: e.DATA_PRODUCT === 'on',
    s4: { serviceRoot: e.S4_SERVICE_ROOT, entitySet: e.S4_ENTITY_SET, ledger: e.S4_LEDGER, amountConvention: e.S4_AMOUNT_CONVENTION, revenueAccounts: e.S4_REVENUE_ACCOUNTS, expenseAccounts: e.S4_EXPENSE_ACCOUNTS },
    bounds: { maxEntities: e.DP_MAX_ENTITIES, maxPeriods: e.DP_MAX_PERIODS, maxRows: e.DP_MAX_ROWS, timeoutMs: e.DP_TIMEOUT_MS },
    isSynthetic: e.FINANCE_DATA_PROVIDER === 'mock' || !isLive
  };
}

let cached: AppConfig | null = null;

/** Validated configuration, loaded once per process. */
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}

/** @internal tests only */
export function resetConfig(): void {
  cached = null;
}
