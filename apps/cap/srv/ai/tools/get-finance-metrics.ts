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
import type { DataQualityReport } from '../../lib/finance/calculation-engine.ts';
import { loadConfig } from '../../lib/config/app-config.ts';
import type { EnvironmentTier } from '../../lib/config/app-config.ts';
import { defaultMetricRegistry } from '../../finance-metric-registry.ts';
import type { FinanceMetricRegistry } from '../../finance-metric-registry.ts';

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
}

export interface GetFinanceMetricsResult {
  companyCode: string;
  fiscalYear: number;
  fiscalPeriod?: string;
  sourceType: 'mock' | 's4hana';
  isSynthetic: boolean;
  recordCount: number;
  calculatedAt: string;
  metrics: ComputedMetricValue[];
  dataQuality: DataQualityReport;
}

// ─── Tool Factory ─────────────────────────────────────────────────────────────

export function createGetFinanceMetricsTool(
  customProvider?: FinanceDataProvider,
  gate?: { tier?: EnvironmentTier; registry?: FinanceMetricRegistry }
): ToolDefinition<GetFinanceMetricsParams, GetFinanceMetricsResult> {
  return {
    name: 'get_finance_metrics',
    description: 'Retrieves authorized financial records and calculates approved metrics deterministically.',
    paramSchema: GetFinanceMetricsParamsSchema,
    async execute(params: GetFinanceMetricsParams, ctx: ExecutionContext): Promise<GetFinanceMetricsResult> {
      // Approval gate (defence in depth: the planner checks too, the tool never trusts its caller)
      (gate?.registry ?? defaultMetricRegistry).assertExecutable(params.metrics, gate?.tier ?? loadConfig().tier);

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

      // 2. Deterministic calculations
      const { metrics: calcs, quality } = inspectAndCalculate(records, params.companyCode, params.fiscalPeriod);

      const currency = records.length > 0 ? records[0]!.currency : 'USD';
      const fmt = (v: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(v);

      const metricList: ComputedMetricValue[] = [];

      for (const mId of params.metrics) {
        switch (mId) {
          case 'total_revenue':
            metricList.push({
              metricId: 'total_revenue',
              label: 'Total Revenue',
              value: calcs.totalRevenue.value,
              formattedValue: fmt(calcs.totalRevenue.value),
              currency,
              dataState: quality.revenueState
            });
            break;
          case 'total_expenses':
            metricList.push({
              metricId: 'total_expenses',
              label: 'Total Expenses',
              value: calcs.totalExpenses.value,
              formattedValue: fmt(calcs.totalExpenses.value),
              currency,
              dataState: quality.expensesState
            });
            break;
          case 'net_profit':
            metricList.push({
              metricId: 'net_profit',
              label: 'Net Profit',
              value: calcs.netProfit.value,
              formattedValue: fmt(calcs.netProfit.value),
              currency
            });
            break;
          case 'profit_margin':
            metricList.push({
              metricId: 'profit_margin',
              label: 'Profit Margin',
              value: calcs.profitMargin.value,
              formattedValue: `${calcs.profitMargin.value.toFixed(2)}%`,
              currency: 'PCT',
              isZeroDenominator: calcs.profitMargin.isZeroDenominator
            });
            break;
        }
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
        dataQuality: quality
      };
    }
  };
}
