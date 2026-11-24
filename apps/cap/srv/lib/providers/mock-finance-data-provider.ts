/**
 * MockFinanceDataProvider
 * Phase 5 — SAP Finance Data Access & Source Adapter
 *
 * Implements FinanceDataProvider using deterministic SYNTHETIC_FINANCE_RECORDS
 * from @sria/contracts. ALL results are tagged isSynthetic: true.
 *
 * NEVER use this provider in production against live accounting data.
 * Records are filtered in-memory; no SQL, no DB, no network.
 */

import {
  SYNTHETIC_FINANCE_RECORDS,
  SYNTHETIC_FIXTURE_LABEL
} from '@sria/contracts';
import type { FinanceRecord } from '@sria/contracts';
import type { FinanceDataProvider, FetchParams, TenantContext } from './finance-data-provider.ts';

export class MockFinanceDataProvider implements FinanceDataProvider {
  // ── Public API ──────────────────────────────────────────────────────────────

  getSourceType(): 'mock' | 's4hana' {
    return 'mock';
  }

  async isAvailable(): Promise<boolean> {
    return true; // Mock is always available — no external dependency
  }

  async fetchRecords(params: FetchParams, _ctx: TenantContext): Promise<FinanceRecord[]> {
    this._validateParams(params);

    const filtered = SYNTHETIC_FINANCE_RECORDS.filter((rec) => {
      if (rec.companyCode !== params.companyCode) return false;
      if (rec.fiscalYear !== params.fiscalYear) return false;
      if (params.fiscalPeriod !== undefined && rec.fiscalPeriod !== params.fiscalPeriod) return false;
      if (params.businessUnit !== undefined && rec.businessUnit !== params.businessUnit) return false;
      return true;
    });

    // Stamp each record with synthetic provenance metadata via the
    // isSynthetic flag on the record level.
    // The raw FinanceRecord type does not carry provenance; that lives on
    // MetricResult.  We return plain FinanceRecord[] as the contract demands.
    // Provenance is attached by the CalculationEngine when building MetricResult.

    return filtered;
  }

  // ── Provenance Helper ───────────────────────────────────────────────────────

  /**
   * Builds the provenance metadata object for a MetricResult produced from
   * this mock provider. Called by the FinanceDataService handler.
   */
  buildProvenance(params: FetchParams): {
    sourceType: 'mock';
    sourceSystem: string;
    retrievedAt: string;
    calculationVersion: string;
    appliedFilters: Record<string, unknown>;
    isSynthetic: true;
    notes: string;
  } {
    return {
      sourceType: 'mock',
      sourceSystem: `MOCK_PROVIDER_${SYNTHETIC_FIXTURE_LABEL}`,
      retrievedAt: new Date().toISOString(),
      calculationVersion: '1.0.0',
      appliedFilters: {
        companyCode: params.companyCode,
        fiscalYear: params.fiscalYear,
        ...(params.fiscalPeriod ? { fiscalPeriod: params.fiscalPeriod } : {}),
        ...(params.businessUnit ? { businessUnit: params.businessUnit } : {})
      },
      isSynthetic: true,
      notes: SYNTHETIC_FIXTURE_LABEL
    };
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _validateParams(params: FetchParams): void {
    if (!params.companyCode || params.companyCode.trim() === '') {
      throw new Error('MockFinanceDataProvider: companyCode is required');
    }
    if (!Number.isInteger(params.fiscalYear) || params.fiscalYear < 2000 || params.fiscalYear > 2100) {
      throw new Error(`MockFinanceDataProvider: fiscalYear must be an integer between 2000 and 2100, got ${params.fiscalYear}`);
    }
  }
}
