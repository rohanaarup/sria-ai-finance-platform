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
import { AuthGuard } from './lib/auth/auth-guard.ts';
import { getFinanceDataProvider } from './lib/providers/provider-factory.ts';
import { MockFinanceDataProvider } from './lib/providers/mock-finance-data-provider.ts';
import { S4HanaProviderBlockedError } from './lib/providers/s4hana-odata-provider.ts';
import {
  inspectAndCalculate,
  DataQualityError
} from './lib/finance/calculation-engine.ts';
import { loadConfig } from './lib/config/app-config.ts';
import { dec, toApiNumber, toFixedString } from './lib/finance/decimal.ts';
import { evaluateMetrics } from './semantic/evaluate.ts';
import { getSemanticCatalog, ensureSemanticLoaded } from './semantic/runtime.ts';

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
    AuthGuard.tenantContext(req, 'FinanceAnalyst');
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

    // Tenant context comes only from the verified token (fail closed).
    const verified = AuthGuard.tenantContext(req, 'FinanceAnalyst');
    const tenantCtx = { organizationId: verified.organizationId, userId: verified.userId };

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
    await ensureSemanticLoaded();
    // --- Deterministic, Decimal-only calculation (LLM never involved) ---
    const isSynthetic = provider.getSourceType() === 'mock';
    const calculatedAt = new Date().toISOString();
    const cfg = loadConfig();
    let metricPayload;
    try {
      if (cfg.semanticLayer) {
        // G2-01: every metric that is executable in this tier for this tenant, computed from semantic formulas
        const catalog = getSemanticCatalog();
        const ids = catalog.listExecutable(cfg.tier, verified.organizationId);
        const ev = evaluateMetrics(records, catalog, ids, { tier: cfg.tier, tenant: verified.organizationId });
        const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: ev.currency });
        metricPayload = ids.map((id) => {
          const r = ev.results.get(id)!;
          const pct = r.unit === 'PERCENT';
          return {
            metricId: id, label: r.label, value: toApiNumber(r.value),
            formattedValue: pct ? `${toFixedString(r.value, r.decimals)}%` : fmt.format(toApiNumber(r.value)),
            currency: pct ? 'PCT' : ev.currency, isZeroDenominator: r.isZeroDenominator,
            metricVersion: r.metricVersion, dataState: r.dataState
          };
        });
      } else {
        const { metrics, quality } = inspectAndCalculate(records);
        const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: quality.currency });
        metricPayload = [
          { metricId: 'total_revenue', label: 'Total Revenue', value: metrics.totalRevenue.value, formattedValue: fmt.format(metrics.totalRevenue.value), currency: quality.currency, isZeroDenominator: false, metricVersion: 'total_revenue@legacy', dataState: quality.revenueState },
          { metricId: 'total_expenses', label: 'Total Expenses', value: metrics.totalExpenses.value, formattedValue: fmt.format(metrics.totalExpenses.value), currency: quality.currency, isZeroDenominator: false, metricVersion: 'total_expenses@legacy', dataState: quality.expensesState },
          { metricId: 'net_profit', label: 'Net Profit', value: metrics.netProfit.value, formattedValue: fmt.format(metrics.netProfit.value), currency: quality.currency, isZeroDenominator: false, metricVersion: 'net_profit@legacy', dataState: null },
          { metricId: 'profit_margin', label: 'Profit Margin', value: metrics.profitMargin.value, formattedValue: `${toFixedString(dec(metrics.profitMargin.value), 2)}%`, currency: 'PCT', isZeroDenominator: metrics.profitMargin.isZeroDenominator, metricVersion: 'profit_margin@legacy', dataState: null }
        ];
      }
    } catch (err) {
      if (err instanceof DataQualityError) return req.error(422, err.message);
      throw err;
    }

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

  private async handleGetProviderStatus(req: Request) {
    AuthGuard.tenantContext(req, 'FinanceAnalyst');
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

