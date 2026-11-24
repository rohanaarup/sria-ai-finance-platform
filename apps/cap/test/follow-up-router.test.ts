/**
 * Follow-up Router & Context Management Tests
 * Phase 10 — Follow-up requests, save/reopen & dashboard lifecycle
 *
 * Verifies:
 *  1. Accurate classification of PRESENTATION_ONLY, DATA_CHANGING, REFRESH, and UNSUPPORTED.
 *  2. Presentation-only follow-ups reuse in-memory validated results (ZERO redundant SAP query).
 *  3. Data-changing follow-ups trigger fresh authorized data retrieval.
 *  4. Refresh requests re-query the provider with current filters and update timestamps.
 *  5. Malicious or predictive queries are safely blocked with UNSUPPORTED type.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { FollowUpRouter } from '../srv/ai/follow-up-router.ts';
import { Orchestrator } from '../srv/ai/orchestrator.ts';
import { MockFinanceDataProvider } from '../srv/lib/providers/mock-finance-data-provider.ts';
import { DashboardSpecCompiler } from '../srv/dashboard/dashboard-spec-compiler.ts';
import type { DashboardSpec, MetricResult } from '@sria/contracts';

const BASE_RESULTS: MetricResult[] = [
  {
    metricId: 'total_revenue',
    label: 'Total Revenue',
    value: 350000,
    formattedValue: '$350,000.00',
    currency: 'USD',
    provenance: {
      sourceType: 'mock',
      sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
      retrievedAt: '2026-01-01T00:00:00.000Z',
      calculationVersion: '1.0.0',
      isSynthetic: true,
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
    }
  },
  {
    metricId: 'total_expenses',
    label: 'Total Expenses',
    value: 230000,
    formattedValue: '$230,000.00',
    currency: 'USD',
    provenance: {
      sourceType: 'mock',
      sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
      retrievedAt: '2026-01-01T00:00:00.000Z',
      calculationVersion: '1.0.0',
      isSynthetic: true,
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
    }
  }
];

const BASE_SPEC: DashboardSpec = {
  version: '1.0',
  dashboardId: 'test-dash-01',
  title: 'Revenue & Expenses: Company 1000',
  description: 'Test dashboard',
  organizationId: 'ORG_ACME',
  createdAt: '2026-01-01T00:00:00.000Z',
  generatedBy: 'finance_analyst',
  widgets: [
    { id: 'w1', type: 'kpi_card', title: 'Total Revenue', metricIds: ['total_revenue'] },
    { id: 'w2', type: 'kpi_card', title: 'Total Expenses', metricIds: ['total_expenses'] },
    { id: 'w3', type: 'bar_chart', title: 'Comparative Aggregates', metricIds: ['total_revenue', 'total_expenses'] }
  ],
  results: BASE_RESULTS,
  dataProvenance: {
    sourceType: 'mock',
    sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
    retrievedAt: '2026-01-01T00:00:00.000Z',
    calculationVersion: '1.0.0',
    isSynthetic: true,
    appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
  }
};

const TEST_CTX = {
  organizationId: 'ORG_ACME',
  userId: 'analyst-alice',
  userRoles: ['FinanceAnalyst']
};

describe('Phase 10 — Follow-up Router Suite', () => {
  const orchestrator = new Orchestrator();
  const compiler = new DashboardSpecCompiler();
  const router = new FollowUpRouter(orchestrator, compiler);

  describe('1. Classification Rules', () => {
    it('classifies visual change as PRESENTATION_ONLY', () => {
      const c1 = router.classify('Switch to line chart');
      assert.equal(c1.type, 'PRESENTATION_ONLY');
      assert.equal(c1.extractedParameters?.preferredVisualType, 'line_chart');

      const c2 = router.classify('View as table breakdown');
      assert.equal(c2.type, 'PRESENTATION_ONLY');
      assert.equal(c2.extractedParameters?.preferredVisualType, 'table');

      const c3 = router.classify('Rename dashboard to "FY2026 Executive Overview"');
      assert.equal(c3.type, 'PRESENTATION_ONLY');
      assert.equal(c3.extractedParameters?.newTitle, 'FY2026 Executive Overview');
    });

    it('classifies data refresh requests as REFRESH', () => {
      const r1 = router.classify('refresh');
      assert.equal(r1.type, 'REFRESH');

      const r2 = router.classify('refresh data');
      assert.equal(r2.type, 'REFRESH');

      const r3 = router.classify('fetch latest');
      assert.equal(r3.type, 'REFRESH');
    });

    it('classifies additions and filter changes as DATA_CHANGING', () => {
      const d1 = router.classify('Add profit margin');
      assert.equal(d1.type, 'DATA_CHANGING');
      assert.ok(d1.extractedParameters?.addMetrics?.includes('profit_margin'));

      const d2 = router.classify('Show Company 2000 figures');
      assert.equal(d2.type, 'DATA_CHANGING');
      assert.equal(d2.extractedParameters?.newCompanyCode, '2000');
    });

    it('blocks predictive, unapproved metrics, or SQL injection queries as UNSUPPORTED', () => {
      const u1 = router.classify('Predict revenue for next quarter');
      assert.equal(u1.type, 'UNSUPPORTED');

      const u2 = router.classify('What will our stock price be next month');
      assert.equal(u2.type, 'UNSUPPORTED');

      const u3 = router.classify('DROP TABLE JournalEntries');
      assert.equal(u3.type, 'UNSUPPORTED');

      const u4 = router.classify('Show EBITDA');
      assert.equal(u4.type, 'UNSUPPORTED');
    });
  });

  describe('2. Follow-up Execution & Zero Redundant Query Enforcing', () => {
    it('executes PRESENTATION_ONLY follow-up by reusing in-memory validated results', async () => {
      const outcome = await router.executeFollowUp('Switch to line chart', BASE_SPEC, TEST_CTX);

      assert.equal(outcome.type, 'PRESENTATION_ONLY');
      assert.equal(outcome.reusedExistingData, true, 'Must reuse existing validated figures');
      assert.ok(outcome.spec);

      // Verify widget type was updated to line_chart
      const chartWidget = outcome.spec.widgets.find(w => w.id === 'w3');
      assert.equal(chartWidget?.type, 'line_chart');

      // Verify numerical figures are strictly unchanged
      assert.deepEqual(outcome.spec.results, BASE_RESULTS);
    });

    it('executes REFRESH follow-up by re-executing query and updating timestamps', async () => {
      const outcome = await router.executeFollowUp('refresh data', BASE_SPEC, TEST_CTX);

      assert.equal(outcome.type, 'REFRESH');
      assert.equal(outcome.reusedExistingData, false);
      assert.ok(outcome.spec);
      assert.notEqual(outcome.spec.dataProvenance.retrievedAt, BASE_SPEC.dataProvenance.retrievedAt);
      assert.ok(outcome.spec.results && outcome.spec.results.length >= 2);
    });

    it('executes DATA_CHANGING follow-up by retrieving new metrics and compiling updated spec', async () => {
      const outcome = await router.executeFollowUp('Add profit margin', BASE_SPEC, TEST_CTX);

      assert.equal(outcome.type, 'DATA_CHANGING');
      assert.equal(outcome.reusedExistingData, false);
      assert.ok(outcome.spec);

      // Verify profit margin is now included in the results
      const hasMargin = outcome.spec.results?.some(r => r.metricId === 'profit_margin');
      assert.equal(hasMargin, true, 'Spec must include newly requested metric');
    });

    it('safely handles UNSUPPORTED queries without modifying state', async () => {
      const outcome = await router.executeFollowUp('Predict future stock price', BASE_SPEC, TEST_CTX);

      assert.equal(outcome.type, 'UNSUPPORTED');
      assert.equal(outcome.reusedExistingData, true);
      assert.ok(outcome.message.includes('not supported'));
    });
  });
});
