/**
 * FinanceDataService Handler
 * Phase 5 — SAP Finance Data Access & Source Adapter
 *
 * Wires the ProviderFactory + CalculationEngine into CAP action/function handlers.
 *
 * DATA FLOW (TRANSIENT ONLY):
 *   Request → Provider.fetchRecords() → FinanceRecord[] (in-memory)
 *            → CalculationEngine → MetricResult[] → HTTP Response
 *
 * FinanceRecord[] is NEVER persisted, logged, or passed to an LLM.
 * All arithmetic is in CalculationEngine — the LLM never touches numbers.
 */

import cds from '@sap/cds';
import type { Request } from '@sap/cds';
import { getFinanceDataProvider } from './lib/providers/provider-factory.ts';
import { MockFinanceDataProvider } from './lib/providers/mock-finance-data-provider.ts';
import { S4HanaProviderBlockedError } from './lib/providers/s4hana-odata-provider.ts';
import {
  calculateAllMetrics
} from './lib/finance/calculation-engine.ts';

// ─── Service Registration ──────────────────────────────────────────────────────

export default class FinanceDataServiceHandler extends cds.ApplicationService {

  async init() {
    // Register handlers
    this.on('GetFinanceMetrics', this.handleGetFinanceMetrics.bind(this));
    this.on('GetProviderStatus', this.handleGetProviderStatus.bind(this));
    return super.init();
  }

  // ─── Action: GetFinanceMetrics ──────────────────────────────────────────────

  private async handleGetFinanceMetrics(req: Request) {
    const { companyCode, fiscalYear, fiscalPeriod, businessUnit } = req.data as {
      companyCode: string;
      fiscalYear: number;
      fiscalPeriod?: string;
      businessUnit?: string;
    };

    // --- Input validation ---
    if (!companyCode || companyCode.trim() === '') {
      return req.error(400, 'companyCode is required');
    }
    if (!fiscalYear || !Number.isInteger(Number(fiscalYear))) {
      return req.error(400, 'fiscalYear must be an integer');
    }

    const provider = getFinanceDataProvider();

    // Build a minimal tenant context from the request (Phase 4 auth guard sets user)
    const tenantCtx = {
      organizationId: (req.user as unknown as Record<string, string>)?.['tenant'] ?? 'local',
      userId: req.user?.id ?? 'anonymous'
    };

    let records;
    try {
      records = await provider.fetchRecords(
        {
          companyCode: companyCode.trim(),
          fiscalYear: Number(fiscalYear),
          fiscalPeriod: fiscalPeriod?.trim() || undefined,
          businessUnit: businessUnit?.trim() || undefined
        },
        tenantCtx
      );
    } catch (err) {
      if (err instanceof S4HanaProviderBlockedError) {
        return req.error(503, `Finance data provider is not yet available: ${err.message}`);
      }
      throw err;
    }

    // --- Deterministic calculation (LLM never involved) ---
    const metrics = calculateAllMetrics(records);

    // --- Build provenance ---
    const isSynthetic = provider.getSourceType() === 'mock';
    const calculatedAt = new Date().toISOString();

    // --- Currency from records (defaults to USD when no records) ---
    const currency = records.length > 0 ? (records[0]?.currency ?? 'USD') : 'USD';

    // --- Format value helper ---
    const fmt = (value: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

    const metricPayload = [
      {
        metricId: 'total_revenue',
        label: 'Total Revenue',
        value: metrics.totalRevenue.value,
        formattedValue: fmt(metrics.totalRevenue.value),
        currency,
        isZeroDenominator: false
      },
      {
        metricId: 'total_expenses',
        label: 'Total Expenses',
        value: metrics.totalExpenses.value,
        formattedValue: fmt(metrics.totalExpenses.value),
        currency,
        isZeroDenominator: false
      },
      {
        metricId: 'net_profit',
        label: 'Net Profit',
        value: metrics.netProfit.value,
        formattedValue: fmt(metrics.netProfit.value),
        currency,
        isZeroDenominator: false
      },
      {
        metricId: 'profit_margin',
        label: 'Profit Margin',
        value: metrics.profitMargin.value,
        formattedValue: `${metrics.profitMargin.value.toFixed(2)}%`,
        currency: 'PCT',
        isZeroDenominator: metrics.profitMargin.isZeroDenominator
      }
    ];

    return {
      companyCode: companyCode.trim(),
      fiscalYear: Number(fiscalYear),
      fiscalPeriod: fiscalPeriod ?? null,
      providerType: provider.getSourceType(),
      isSynthetic,
      calculatedAt,
      metrics: metricPayload
    };
  }

  // ─── Function: GetProviderStatus ────────────────────────────────────────────

  private async handleGetProviderStatus(_req: Request) {
    const provider = getFinanceDataProvider();
    const available = await provider.isAvailable();
    const sourceType = provider.getSourceType();

    return {
      providerType: sourceType,
      isAvailable: available,
      isSynthetic: sourceType === 'mock',
      statusMessage: available
        ? sourceType === 'mock'
          ? 'Mock provider active — synthetic data only. Not for production.'
          : 'S/4HANA provider active.'
        : 'Provider unavailable — S/4HANA destination not configured (BLOCKED).'
    };
  }
}

