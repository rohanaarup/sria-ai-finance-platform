/**
 * DashboardSpec Compiler Unit Tests in CAP workspace
 * Phase 8 — Deterministic Finance Processing & DashboardSpec Compiler
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { DashboardSpecCompiler } from '../srv/dashboard/dashboard-spec-compiler.ts';
import { DashboardSpecSchema } from '@sria/contracts';
import type { DashboardRequest, MetricResult, ProvenanceMetadata } from '@sria/contracts';

const PROVENANCE: ProvenanceMetadata = {
  sourceType: 'mock',
  sourceSystem: 'SAP_S4HANA_DEV_SYNTHETIC',
  retrievedAt: new Date().toISOString(),
  calculationVersion: '1.0.0',
  isSynthetic: true,
  appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
};

const REQUEST: DashboardRequest = {
  version: '1.0',
  rawPrompt: 'Show revenue and net profit for company 1000 in 2026',
  metricIds: ['total_revenue', 'net_profit'],
  dimensions: ['fiscal_period'],
  filters: { companyCode: '1000', fiscalYear: 2026 },
  organizationId: 'org-test-01',
  userId: 'analyst-jane'
};

const RESULTS: MetricResult[] = [
  {
    metricId: 'total_revenue',
    label: 'Total Revenue',
    value: 150000,
    formattedValue: '$150,000.00',
    currency: 'USD',
    provenance: PROVENANCE
  },
  {
    metricId: 'net_profit',
    label: 'Net Profit',
    value: 60000,
    formattedValue: '$60,000.00',
    currency: 'USD',
    provenance: PROVENANCE
  }
];

describe('CAP Workspace: DashboardSpecCompiler', () => {
  it('Compiles and validates DashboardSpec adhering to contracts schema', () => {
    const compiler = new DashboardSpecCompiler();
    const spec = compiler.compile(REQUEST, RESULTS, PROVENANCE);

    assert.equal(spec.version, '1.0');
    assert.equal(spec.organizationId, 'org-test-01');
    assert.doesNotThrow(() => DashboardSpecSchema.parse(spec));
  });
});
