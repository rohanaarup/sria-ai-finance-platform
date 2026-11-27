/**
 * FinanceDataService handler.
 *
 * G2-02: obtains figures only through the FinancialPerformance data product (bounds, entity
 * access, quality flags, per-currency results, provenance v2). It never touches a provider or
 * adapter directly (import-boundary test). Records stay in memory; nothing is persisted.
 */
import cds from '@sap/cds';
import type { Request } from '@sap/cds';
import { AuthGuard } from './lib/auth/auth-guard.ts';
import { loadConfig } from './lib/config/app-config.ts';
import { getSemanticCatalog, ensureSemanticLoaded } from './semantic/runtime.ts';
import { getPerformance, sourceStatus, DataProductError } from './dataproduct/financial-performance.ts';

export default class FinanceDataServiceHandler extends cds.ApplicationService {
  async init() {
    this.on('GetFinanceMetrics', this.handleGetFinanceMetrics.bind(this));
    this.on('GetProviderStatus', this.handleGetProviderStatus.bind(this));
    return super.init();
  }

  private async handleGetFinanceMetrics(req: Request) {
    const verified = AuthGuard.tenantContext(req, 'FinanceAnalyst');
    const { companyCode, fiscalYear, fiscalPeriod, businessUnit } = req.data as {
      companyCode: string; fiscalYear: number; fiscalPeriod?: string; businessUnit?: string;
    };
    if (!companyCode || companyCode.trim() === '') return req.error(400, 'companyCode is required');
    if (!fiscalYear || !Number.isInteger(Number(fiscalYear))) return req.error(400, 'fiscalYear must be an integer');

    await ensureSemanticLoaded();
    const cfg = loadConfig();
    const metrics = getSemanticCatalog().listExecutable(cfg.tier, verified.organizationId);
    const period = fiscalPeriod?.trim() ? fiscalPeriod.trim().slice(-2) : undefined;

    if (!metrics.length) {
      return { companyCode: companyCode.trim(), fiscalYear: Number(fiscalYear), fiscalPeriod: fiscalPeriod ?? null, providerType: null, isSynthetic: cfg.isSynthetic, calculatedAt: new Date().toISOString(), metrics: [], provenanceJson: null };
    }

    let result;
    try {
      result = await getPerformance(
        { entities: [companyCode.trim()], fiscalYear: Number(fiscalYear), periodFrom: period ?? '01', periodTo: period ?? '16', metrics, groupBy: ['company_code'], ...(businessUnit?.trim() ? { businessUnit: businessUnit.trim() } : {}) },
        { tenant: verified.organizationId, userId: verified.userId, roles: verified.roles }
      );
    } catch (err) {
      if (err instanceof DataProductError) return req.error(err.status, err.message);
      throw err;
    }

    // One entry per metric and currency: multi-currency data is reported per currency, never converted.
    const payload = result.groups.flatMap((g) => g.metrics.map((m) => {
      const pct = m.unit === 'PERCENT';
      const currency = g.currency === 'XXX' ? 'USD' : g.currency;
      return {
        metricId: m.metricId, label: m.label, value: m.value,
        formattedValue: pct ? `${m.valueText}%` : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(m.value),
        currency: pct ? 'PCT' : currency, isZeroDenominator: m.isZeroDenominator, metricVersion: m.metricVersion, dataState: m.dataState
      };
    }));

    return {
      companyCode: companyCode.trim(),
      fiscalYear: Number(fiscalYear),
      fiscalPeriod: fiscalPeriod ?? null,
      providerType: result.provenance.sourceType,
      isSynthetic: result.provenance.isSynthetic,
      calculatedAt: result.provenance.retrievedAt,
      metrics: payload,
      provenanceJson: JSON.stringify(result.provenance)
    };
  }

  private async handleGetProviderStatus(req: Request) {
    const verified = AuthGuard.tenantContext(req, 'FinanceAnalyst');
    const s = await sourceStatus(verified.organizationId);
    return {
      providerType: s.sourceType,
      isAvailable: s.isAvailable,
      isSynthetic: s.isSynthetic,
      statusMessage: s.isAvailable
        ? s.isSynthetic ? 'Synthetic fixtures active — not for production.' : `${s.sourceSystem} active.`
        : `${s.sourceSystem} is not connected yet (live connectivity is phase G2-03).`
    };
  }
}
