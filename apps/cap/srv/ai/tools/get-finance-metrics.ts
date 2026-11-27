/**
 * Approved Tool: get_finance_metrics
 * Phase 7 — AI Planning, Tool Orchestration & Controlled Execution
 *
 * G2-02: a thin client of the FinancialPerformance data product (srv/dataproduct).
 *
 * RULES:
 *  - Only retrieves records on-demand using server-verified tenant context.
 *  - Deterministic calculations only; no model arithmetic.
 *  - Returns normalized metrics and provenance metadata; NEVER logs raw SAP rows.
 */

import { z } from 'zod';
import { MetricIdEnum } from '@sria/contracts';
import type { ToolDefinition, ExecutionContext } from '../tool-registry.ts';
import { DataQualityError } from '../../lib/finance/calculation-engine.ts';
import { getPerformance, legacyFetchRecords } from '../../dataproduct/financial-performance.ts';
import type { DataSourceOverride } from '../../dataproduct/financial-performance.ts';
import type { ProvenanceV2 } from '@sria/contracts';
import { toApiNumber, toFixedString } from '../../lib/finance/decimal.ts';
import { evaluateMetrics } from '../../semantic/evaluate.ts';
import { getSemanticCatalog, ensureSemanticLoaded } from '../../semantic/runtime.ts';
import { loadConfig } from '../../lib/config/app-config.ts';
import type { EnvironmentTier } from '../../lib/config/app-config.ts';
import { defaultGate } from '../../semantic/gate.ts';
import type { MetricGate } from '../../semantic/gate.ts';

// ─── Input Schema ─────────────────────────────────────────────────────────────

export const GetFinanceMetricsParamsSchema = z.object({
  companyCode: z.string().min(1, 'Company code is required').regex(/^[A-Za-z0-9_]{1,10}$/, 'Invalid company code'),
  fiscalYear: z.number().int().min(2000).max(2100),
  fiscalPeriod: z.string().regex(/^([0-1][0-9]|20\d{2}-[0-1][0-9])$/).optional(),
  metrics: z.array(MetricIdEnum).min(1, 'At least one allowlisted metric is required')
}).strict();

export type GetFinanceMetricsParams = z.infer<typeof GetFinanceMetricsParamsSchema>;

// ─── Output Schema ────────────────────────────────────────────────────────────

export interface ComputedMetricValue {
  metricId: string;
  label: string;
  value: number;
  formattedValue: string;
  currency: string;
  isZeroDenominator?: boolean;
  /** AVAILABLE | ZERO_VALUE | MISSING_DATA — "no data" is never presented as 0.00 */
  dataState?: string;
  /** Semantic metric version used, e.g. "total_revenue@v1" (G2-01) */
  metricVersion?: string;
}

export interface ToolDataQuality { currency: string; recordCount: number; hasDuplicates: boolean; duplicateIds: string[] }

export interface GetFinanceMetricsResult {
  companyCode: string;
  fiscalYear: number;
  fiscalPeriod?: string;
  sourceType: 'mock' | 's4hana';
  isSynthetic: boolean;
  recordCount: number;
  calculatedAt: string;
  metrics: ComputedMetricValue[];
  dataQuality: ToolDataQuality;
  /** G2-02 provenance v2 (absent only on the DATA_PRODUCT=off rollback path) */
  provenance?: ProvenanceV2;
}

// ─── Tool Factory ─────────────────────────────────────────────────────────────

export function createGetFinanceMetricsTool(
  source?: DataSourceOverride,
  gate?: { tier?: EnvironmentTier; registry?: MetricGate }
): ToolDefinition<GetFinanceMetricsParams, GetFinanceMetricsResult> {
  return {
    name: 'get_finance_metrics',
    description: 'Retrieves authorized financial records and calculates approved metrics deterministically.',
    paramSchema: GetFinanceMetricsParamsSchema,
    async execute(params: GetFinanceMetricsParams, ctx: ExecutionContext): Promise<GetFinanceMetricsResult> {
      await ensureSemanticLoaded();
      // Approval gate (defence in depth: the planner checks too, the tool never trusts its caller)
      const tier = gate?.tier ?? loadConfig().tier;
      (gate?.registry ?? defaultGate()).assertExecutable(params.metrics, tier, ctx.organizationId);
      const period = params.fiscalPeriod ? params.fiscalPeriod.slice(-2) : undefined;
      const currencyOf = (c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c === 'XXX' ? 'USD' : c });

      if (!loadConfig().dataProduct) return legacyExecute(params, ctx, tier, period, source);

      // G2-02: the tool is a thin client of the FinancialPerformance data product. It never
      // touches a provider or adapter; bounds, entity access, quality and provenance live there.
      const result = await getPerformance(
        { entities: [params.companyCode], fiscalYear: params.fiscalYear, periodFrom: period ?? '01', periodTo: period ?? '16', metrics: params.metrics, groupBy: ['company_code'] },
        { tenant: ctx.organizationId, userId: ctx.userId, roles: ctx.userRoles, runCache: ctx.runCache, signal: ctx.signal },
        { source, tier }
      );
      if (result.groups.length > 1) {
        throw new DataQualityError('MIXED_CURRENCIES',
          `Company ${params.companyCode} has postings in ${result.currencies.join(', ')}. Figures are available per currency but are not converted into one total.`);
      }
      const group = result.groups[0]!;
      const metricList: ComputedMetricValue[] = group.metrics.map((m) => {
        const pct = m.unit === 'PERCENT';
        return {
          metricId: m.metricId, label: m.label, value: m.value,
          formattedValue: pct ? `${m.valueText}%` : currencyOf(group.currency).format(m.value),
          currency: pct ? 'PCT' : (group.currency === 'XXX' ? 'USD' : group.currency),
          ...(pct ? { isZeroDenominator: m.isZeroDenominator } : {}),
          dataState: m.dataState, metricVersion: m.metricVersion
        };
      });
      const flags = result.provenance.qualityFlags;
      return {
        companyCode: params.companyCode, fiscalYear: params.fiscalYear, ...(params.fiscalPeriod ? { fiscalPeriod: params.fiscalPeriod } : {}),
        sourceType: result.provenance.sourceType, isSynthetic: result.provenance.isSynthetic, recordCount: result.provenance.recordCount,
        calculatedAt: result.provenance.retrievedAt, metrics: metricList,
        dataQuality: {
          currency: group.currency === 'XXX' ? 'USD' : group.currency, recordCount: result.provenance.recordCount,
          hasDuplicates: flags.some((f) => f.code === 'DUPLICATE_POSTING_KEY'),
          duplicateIds: flags.filter((f) => f.code === 'DUPLICATE_POSTING_KEY').map((f) => f.message.split(' ')[2]!)
        },
        provenance: result.provenance
      };
    }
  };
}

/** DATA_PRODUCT=off rollback path: fetch through the data-product module's legacy helper, calculate as in G2-01. */
async function legacyExecute(params: GetFinanceMetricsParams, ctx: ExecutionContext, tier: EnvironmentTier, period: string | undefined, source?: DataSourceOverride): Promise<GetFinanceMetricsResult> {
  const { records, caps } = await legacyFetchRecords({ companyCode: params.companyCode, fiscalYear: params.fiscalYear, fiscalPeriod: period }, { tenant: ctx.organizationId, userId: ctx.userId }, source);
  const ev = evaluateMetrics(records, getSemanticCatalog(), params.metrics, { tier, tenant: ctx.organizationId, companyCode: params.companyCode, fiscalPeriod: period });
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: ev.currency });
  return {
    companyCode: params.companyCode, fiscalYear: params.fiscalYear, ...(params.fiscalPeriod ? { fiscalPeriod: params.fiscalPeriod } : {}),
    sourceType: caps.sourceType, isSynthetic: caps.isSynthetic, recordCount: records.length, calculatedAt: new Date().toISOString(),
    metrics: params.metrics.map((id) => {
      const r = ev.results.get(id)!; const pct = r.unit === 'PERCENT';
      return { metricId: id, label: r.label, value: toApiNumber(r.value), formattedValue: pct ? `${toFixedString(r.value, r.decimals)}%` : fmt.format(toApiNumber(r.value)), currency: pct ? 'PCT' : ev.currency, ...(pct ? { isZeroDenominator: r.isZeroDenominator } : {}), dataState: r.dataState, metricVersion: r.metricVersion };
    }),
    dataQuality: { currency: ev.currency, recordCount: records.length, hasDuplicates: ev.hasDuplicates, duplicateIds: ev.duplicateIds }
  };
}
