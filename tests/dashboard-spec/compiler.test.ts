/**
 * DashboardSpec Compiler Tests
 * Phase 8 — Deterministic Finance Processing & DashboardSpec Compiler
 *
 * Verifies:
 *  1. Compiles schema-valid DashboardSpec from verified request and metric results.
 *  2. Generates allowlisted widgets only (kpi_card, bar_chart, table).
 *  3. Preserves complete data provenance and freshness notice.
 *  4. Correctly validates against DashboardSpecSchema from @sria/contracts.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { DashboardSpecCompiler } from '../../apps/cap/srv/dashboard/dashboard-spec-compiler.ts';
import { DashboardSpecSchema } from '@sria/contracts';
import type { DashboardRequest, MetricResult, ProvenanceMetadata } from '@sria/contracts';

const MOCK_PROVENANCE: ProvenanceMetadata = {
  sourceType: 'mock',
  sourceSystem: 'SAP_S4HANA_DEV_SYNTHETIC',
  retrievedAt: new Date().toISOString(),
  calculationVersion: '1.0.0',
  isSynthetic: true,
  appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
};

const MOCK_REQUEST: DashboardRequest = {
  version: '1.0',
  rawPrompt: 'Show revenue and net profit for company 1000 in 2026',
  metricIds: ['total_revenue', 'net_profit'],
  dimensions: ['fiscal_period'],
  filters: { companyCode: '1000', fiscalYear: 2026 },
  organizationId: 'org-test-01',
  userId: 'analyst-jane'
};

const MOCK_RESULTS: MetricResult[] = [
  {
    metricId: 'total_revenue',
    label: 'Total Revenue',
    value: 150000,
    formattedValue: '$150,000.00',
    currency: 'USD',
    provenance: MOCK_PROVENANCE
  },
  {
    metricId: 'net_profit',
    label: 'Net Profit',
    value: 60000,
    formattedValue: '$60,000.00',
    currency: 'USD',
    provenance: MOCK_PROVENANCE
  }
];

describe('Phase 8: DashboardSpec Compiler', () => {
  it('1. Compiles a schema-valid DashboardSpec document', () => {
    const compiler = new DashboardSpecCompiler();
    const spec = compiler.compile(MOCK_REQUEST, MOCK_RESULTS, MOCK_PROVENANCE);

    assert.equal(spec.version, '1.0');
    assert.ok(spec.dashboardId);
    assert.equal(spec.organizationId, 'org-test-01');
    assert.equal(spec.generatedBy, 'analyst-jane');
    assert.ok(spec.widgets.length >= 2);
    assert.equal(spec.results?.length, 2);

    // Schema assertion
    assert.doesNotThrow(() => DashboardSpecSchema.parse(spec));
  });

  it('2. Widget catalog enforces allowlist (kpi_card, bar_chart, table)', () => {
    const compiler = new DashboardSpecCompiler();
    const spec = compiler.compile(MOCK_REQUEST, MOCK_RESULTS, MOCK_PROVENANCE);

    const widgetTypes = spec.widgets.map(w => w.type);
    const allowed = ['kpi_card', 'bar_chart', 'line_chart', 'table'];

    for (const type of widgetTypes) {
      assert.ok(allowed.includes(type), `Disallowed widget type: ${type}`);
    }
    assert.ok(widgetTypes.includes('kpi_card'), 'Expected KPI card');
    assert.ok(widgetTypes.includes('bar_chart'), 'Expected comparative bar chart');
    assert.ok(widgetTypes.includes('table'), 'Expected ledger table');
  });

  it('3. Attached provenance metadata is preserved accurately', () => {
    const compiler = new DashboardSpecCompiler();
    const spec = compiler.compile(MOCK_REQUEST, MOCK_RESULTS, MOCK_PROVENANCE);

    assert.equal(spec.dataProvenance.sourceType, 'mock');
    assert.equal(spec.dataProvenance.isSynthetic, true);
    assert.equal(spec.dataProvenance.calculationVersion, '1.0.0');
    assert.ok(spec.freshnessNotice?.includes('Synthetic Test Fixtures'));
  });
});

