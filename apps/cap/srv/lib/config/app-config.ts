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
  AI_RUNTIME_PROVIDER: z.enum(['mock', 'openai', 'azure-openai', 'gemini-api']).default('mock'),
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
  aiProvider: 'mock' | 'openai' | 'azure-openai' | 'gemini-api';
  aiApiKey?: string;
  aiEndpoint?: string;
  aiModel?: string;
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
  if (e.AI_RUNTIME_PROVIDER !== 'mock' && (!e.AI_RUNTIME_API_KEY || !e.AI_RUNTIME_ENDPOINT)) {
    problems.push(`AI_RUNTIME_API_KEY and AI_RUNTIME_ENDPOINT are required when AI_RUNTIME_PROVIDER=${e.AI_RUNTIME_PROVIDER}`);
  }
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
    corsAllowedOrigins,
    semanticLayer: e.SEMANTIC_LAYER === 'on',
    dataProduct: e.DATA_PRODUCT === 'on',
    s4: { serviceRoot: e.S4_SERVICE_ROOT, entitySet: e.S4_ENTITY_SET, ledger: e.S4_LEDGER, amountConvention: e.S4_AMOUNT_CONVENTION, revenueAccounts: e.S4_REVENUE_ACCOUNTS, expenseAccounts: e.S4_EXPENSE_ACCOUNTS },
    bounds: { maxEntities: e.DP_MAX_ENTITIES, maxPeriods: e.DP_MAX_PERIODS, maxRows: e.DP_MAX_ROWS, timeoutMs: e.DP_TIMEOUT_MS },
    isSynthetic: e.FINANCE_DATA_PROVIDER === 'mock' || e.AI_RUNTIME_PROVIDER === 'mock'
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
