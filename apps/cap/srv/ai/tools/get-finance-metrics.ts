/**
 * Approved Tool: get_finance_metrics
 * Phase 7 — AI Planning, Tool Orchestration & Controlled Execution
 *
 * Typed tool backed by FinanceDataProvider and CalculationEngine.
 *
 * RULES:
 *  - Only retrieves records on-demand using server-verified tenant context.
 *  - Deterministic calculations only; no model arithmetic.
 *  - Returns normalized metrics and provenance metadata; NEVER logs raw SAP rows.
 */

import { z } from 'zod';
import { MetricIdEnum } from '@sria/contracts';
import type { ToolDefinition, ExecutionContext } from '../tool-registry.ts';
import type { FinanceDataProvider } from '../../lib/providers/finance-data-provider.ts';
import { getFinanceDataProvider } from '../../lib/providers/provider-factory.ts';
import { inspectAndCalculate } from '../../lib/finance/calculation-engine.ts';
import { dec, toApiNumber, toFixedString } from '../../lib/finance/decimal.ts';
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
}

// ─── Tool Factory ─────────────────────────────────────────────────────────────

export function createGetFinanceMetricsTool(
  customProvider?: FinanceDataProvider,
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

      const provider = customProvider ?? getFinanceDataProvider();

      // Enforce server-side tenant context (never rely on client parameters for tenant)
      const tenantCtx = {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        destinationName: ctx.destinationName
      };

      // 1. Fetch records (TRANSIENT: never persisted)
      const records = await provider.fetchRecords(
        {
          companyCode: params.companyCode,
          fiscalYear: params.fiscalYear,
          fiscalPeriod: params.fiscalPeriod
        },
        tenantCtx
      );

      // 2. Deterministic calculations (Decimal only)
      const currencyOf = (c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c });
      let metricList: ComputedMetricValue[];
      let dataQuality: ToolDataQuality;

      if (loadConfig().semanticLayer) {
        // G2-01: formulas, sign rules, rounding and versions come from the semantic layer
        const ev = evaluateMetrics(records, getSemanticCatalog(), params.metrics, {
          tier, tenant: ctx.organizationId, companyCode: params.companyCode, fiscalPeriod: params.fiscalPeriod
        });
        metricList = params.metrics.map((id) => {
          const r = ev.results.get(id)!;
          const isPct = r.unit === 'PERCENT';
          return {
            metricId: id,
            label: r.label,
            value: toApiNumber(r.value),
            formattedValue: isPct ? `${toFixedString(r.value, r.decimals)}%` : currencyOf(ev.currency).format(toApiNumber(r.value)),
            currency: isPct ? 'PCT' : ev.currency,
            ...(isPct ? { isZeroDenominator: r.isZeroDenominator } : {}),
            dataState: r.dataState,
            metricVersion: r.metricVersion
          };
        });
        dataQuality = { currency: ev.currency, recordCount: records.length, hasDuplicates: ev.hasDuplicates, duplicateIds: ev.duplicateIds };
      } else {
        // SEMANTIC_LAYER=off: legacy hard-coded formulas (rollback path)
        const { metrics: calcs, quality } = inspectAndCalculate(records, params.companyCode, params.fiscalPeriod);
        const fmt = (v: number) => currencyOf(quality.currency).format(v);
        const legacy: Record<string, ComputedMetricValue> = {
          total_revenue: { metricId: 'total_revenue', label: 'Total Revenue', value: calcs.totalRevenue.value, formattedValue: fmt(calcs.totalRevenue.value), currency: quality.currency, dataState: quality.revenueState, metricVersion: 'total_revenue@legacy' },
          total_expenses: { metricId: 'total_expenses', label: 'Total Expenses', value: calcs.totalExpenses.value, formattedValue: fmt(calcs.totalExpenses.value), currency: quality.currency, dataState: quality.expensesState, metricVersion: 'total_expenses@legacy' },
          net_profit: { metricId: 'net_profit', label: 'Net Profit', value: calcs.netProfit.value, formattedValue: fmt(calcs.netProfit.value), currency: quality.currency, metricVersion: 'net_profit@legacy' },
          profit_margin: { metricId: 'profit_margin', label: 'Profit Margin', value: calcs.profitMargin.value, formattedValue: `${toFixedString(dec(calcs.profitMargin.value), 2)}%`, currency: 'PCT', isZeroDenominator: calcs.profitMargin.isZeroDenominator, metricVersion: 'profit_margin@legacy' }
        };
        metricList = params.metrics.map((id) => legacy[id]!);
        dataQuality = { currency: quality.currency, recordCount: quality.recordCount, hasDuplicates: quality.hasDuplicates, duplicateIds: quality.duplicateIds };
      }

      return {
        companyCode: params.companyCode,
        fiscalYear: params.fiscalYear,
        ...(params.fiscalPeriod ? { fiscalPeriod: params.fiscalPeriod } : {}),
        sourceType: provider.getSourceType(),
        isSynthetic: provider.getSourceType() === 'mock',
        recordCount: records.length,
        calculatedAt: new Date().toISOString(),
        metrics: metricList,
        dataQuality
      };
    }
  };
}
