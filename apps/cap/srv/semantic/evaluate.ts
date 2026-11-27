/**
 * Semantic calculation (G2-01): computes metrics from source records using the formulas,
 * sign rules and rounding stored in the semantic layer, with Decimal arithmetic only.
 *
 * Pipeline: inspect records (mixed currencies refused) → resolve runnable versions and their
 * dependencies (gate) → BASE: signed sum per account type → DERIVED: formula over the rounded
 * values of its dependencies → round to the version's decimals. Every result records the
 * metric version used.
 */
import type { FinanceRecord } from '@sria/contracts';
import type { EnvironmentTier } from '../lib/config/app-config.ts';
import { Dec, ZERO, dec, sum, roundTo } from '../lib/finance/decimal.ts';
import { DataQualityError } from '../lib/finance/calculation-engine.ts';
import { normalizeAndInspectRecords, evaluateDataState } from '../finance/normalization.ts';
import type { DataAvailabilityState } from '../finance/normalization.ts';
import { evaluateFormula } from './formula.ts';
import type { SemanticCatalog } from './catalog.ts';
import { GLOBAL } from './catalog.ts';

export interface SemanticMetricResult {
  metricId: string;
  label: string;
  value: Dec;
  unit: 'CURRENCY' | 'PERCENT';
  decimals: number;
  /** e.g. "total_revenue@v1" */
  metricVersion: string;
  versionStatus: string;
  recordCount: number;
  dataState: DataAvailabilityState;
  isZeroDenominator: boolean;
}

export interface SemanticEvaluation {
  results: Map<string, SemanticMetricResult>;
  currency: string;
  hasDuplicates: boolean;
  duplicateIds: string[];
}

export function evaluateMetrics(
  records: FinanceRecord[],
  catalog: SemanticCatalog,
  metricIds: readonly string[],
  opts: { tier: EnvironmentTier; tenant?: string; companyCode?: string; fiscalPeriod?: string }
): SemanticEvaluation {
  const inScope = records.filter((r) =>
    (opts.companyCode === undefined || r.companyCode === opts.companyCode) &&
    (opts.fiscalPeriod === undefined || r.fiscalPeriod === opts.fiscalPeriod));
  const summary = normalizeAndInspectRecords(inScope);
  if (summary.hasMixedCurrencies) {
    throw new DataQualityError('MIXED_CURRENCIES',
      `Records contain more than one currency (${summary.currenciesFound.join(', ')}); no conversion table is configured, so the figures are not calculated.`);
  }

  const plan = catalog.resolveForExecution(metricIds, opts.tier, opts.tenant ?? GLOBAL);
  const results = new Map<string, SemanticMetricResult>();
  const values = new Map<string, Dec>();

  for (const m of plan) {
    const v = m.version;
    let value: Dec, recordCount = 0, isZeroDenominator = false, dataState: DataAvailabilityState;
    if (v.kind === 'BASE') {
      const rows = inScope.filter((r) => r.accountType === v.accountType);
      recordCount = rows.length;
      const positive = v.signRule === 'CREDIT_POSITIVE' ? 'C' : 'D';
      value = roundTo(sum(rows.map((r) => (r.debitCredit === positive ? dec(r.amount) : dec(r.amount).negated()))), v.decimals);
      dataState = evaluateDataState(recordCount, value.isZero() ? 0 : 1);
    } else {
      const r = evaluateFormula(m.formula!, values);
      value = roundTo(r.value, v.decimals);
      isZeroDenominator = r.zeroDenominator;
      recordCount = Math.max(0, ...v.dependsOn.map((d) => results.get(d)?.recordCount ?? 0));
      const depStates = v.dependsOn.map((d) => results.get(d)?.dataState);
      dataState = depStates.every((s) => s === 'MISSING_DATA') ? 'MISSING_DATA' : value.isZero() ? 'ZERO_VALUE' : 'AVAILABLE';
    }
    if (value.isZero()) value = ZERO; // normalise -0
    values.set(m.metricId, value);
    results.set(m.metricId, {
      metricId: m.metricId, label: m.label, value, unit: v.unit, decimals: v.decimals,
      metricVersion: `${m.metricId}@v${v.version}`, versionStatus: v.status, recordCount, dataState, isZeroDenominator
    });
  }
  return { results, currency: summary.primaryCurrency, hasDuplicates: summary.hasDuplicates, duplicateIds: summary.duplicateIds };
}
