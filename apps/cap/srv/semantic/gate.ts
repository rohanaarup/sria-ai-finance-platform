/**
 * MetricGate — the single question "may this metric run here?" (G2-00 gate, G2-01 semantic).
 * With SEMANTIC_LAYER=on (default) the semantic catalog answers; SEMANTIC_LAYER=off restores
 * the legacy hard-coded registry (roadmap rollback switch).
 */
import type { EnvironmentTier } from '../lib/config/app-config.ts';
import { loadConfig } from '../lib/config/app-config.ts';
import { getSemanticCatalog } from './runtime.ts';
import { defaultMetricRegistry } from '../finance-metric-registry.ts';

export interface MetricGate {
  assertExecutable(ids: readonly string[], tier: EnvironmentTier, tenant?: string): void;
}

export function defaultGate(): MetricGate {
  return loadConfig().semanticLayer ? getSemanticCatalog() : defaultMetricRegistry;
}
