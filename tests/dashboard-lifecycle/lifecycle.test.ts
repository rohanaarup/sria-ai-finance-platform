/**
 * Integration Test: Dashboard Lifecycle & Follow-up Verification
 * Phase 10 — Follow-up requests, save/reopen & dashboard lifecycle
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { FollowUpRouter } from '../../apps/cap/srv/ai/follow-up-router.ts';
import { Orchestrator } from '../../apps/cap/srv/ai/orchestrator.ts';
import { MockFinanceDataProvider } from '../../apps/cap/srv/lib/providers/mock-finance-data-provider.ts';
import { DashboardSpecCompiler } from '../../apps/cap/srv/dashboard/dashboard-spec-compiler.ts';
import type { DashboardSpec, MetricResult } from '../../packages/contracts/dist/index.js';

const SAMPLE_RESULTS: MetricResult[] = [
  {
    metricId: 'total_revenue',
    label: 'Total Revenue',
    value: 350000,
    formattedValue: '$350,000.00',
    currency: 'USD',
    provenance: {
      sourceType: 'mock',
      sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
      retrievedAt: new Date().toISOString(),
      calculationVersion: '1.0.0',
      isSynthetic: true,
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
    }
  }
];

const SAMPLE_SPEC: DashboardSpec = {
  version: '1.0',
  dashboardId: 'integration-spec-01',
  title: 'Company 1000 Performance',
  description: 'Integration test spec',
  organizationId: 'ORG_ACME_PILOT',
  createdAt: new Date().toISOString(),
  generatedBy: 'finance_analyst',
  widgets: [
    { id: 'w1', type: 'bar_chart', title: 'Revenue Overview', metricIds: ['total_revenue'] }
  ],
  results: SAMPLE_RESULTS,
  dataProvenance: {
    sourceType: 'mock',
    sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
    retrievedAt: new Date().toISOString(),
    calculationVersion: '1.0.0',
    isSynthetic: true,
    appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
  }
};

describe('Phase 10 — End-to-End Follow-up & Lifecycle Integration Suite', () => {
  const orchestrator = new Orchestrator();
  const compiler = new DashboardSpecCompiler();
  const router = new FollowUpRouter(orchestrator, compiler);

  const ctx = {
    organizationId: 'ORG_ACME_PILOT',
    userId: 'USER_CONTROLLER',
    userRoles: ['FinanceManager']
  };

  it('1. Presentation follow-up modifies visual configuration with zero redundant retrieval', async () => {
    const outcome = await router.executeFollowUp('Switch to line chart', SAMPLE_SPEC, ctx);
    assert.equal(outcome.type, 'PRESENTATION_ONLY');
    assert.equal(outcome.reusedExistingData, true);
    assert.equal(outcome.spec?.widgets[0]?.type, 'line_chart');
    assert.deepEqual(outcome.spec?.results, SAMPLE_RESULTS);
  });

  it('2. Refresh follow-up calls backend data provider and issues new timestamp', async () => {
    const outcome = await router.executeFollowUp('refresh data', SAMPLE_SPEC, ctx);
    assert.equal(outcome.type, 'REFRESH');
    assert.equal(outcome.reusedExistingData, false);
    assert.ok(outcome.spec?.dataProvenance.retrievedAt);
  });

  it('3. Data-changing follow-up retrieves added metrics deterministically', async () => {
    const outcome = await router.executeFollowUp('Add total expenses and profit margin', SAMPLE_SPEC, ctx);
    assert.equal(outcome.type, 'DATA_CHANGING');
    assert.equal(outcome.reusedExistingData, false);
    assert.ok(outcome.spec);
    const metricIds = (outcome.spec.results || []).map(r => r.metricId);
    assert.ok(metricIds.includes('total_revenue'));
    assert.ok(metricIds.includes('total_expenses'));
  });

  it('4. Unsupported query does not alter current spec', async () => {
    const outcome = await router.executeFollowUp('Forecast next year revenue', SAMPLE_SPEC, ctx);
    assert.equal(outcome.type, 'UNSUPPORTED');
    assert.equal(outcome.reusedExistingData, true);
    assert.equal(outcome.spec, undefined);
  });
});
