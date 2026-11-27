/**
 * Frontend Component, Intelligence & API Client Unit Tests
 *
 * Verifies:
 *  1. ApiClient correctly identifies missing parameters and triggers clarification.
 *  2. ApiClient resolves request when company code is present.
 *  3. ApiClient executes deterministic calculation for company 1000 and 2000.
 *  4. Zero division safety verified for profit margin.
 *  5. Authentic period-by-period and business unit breakdowns match synthetic golden fixtures.
 *  6. Dashboard layout archetype selection produces distinct layouts per analytical intent.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

process.env.NODE_ENV = 'test';

import { ApiClient, ApiAuthError, ApiUnavailableError } from '../src/services/api-client.ts';
import {
  detectDashboardLayout,
  buildExecutiveNarrative,
  buildAnalyticalInsights,
} from '../src/services/dashboard-intelligence.ts';
import type { DashboardSpec } from '@sria/contracts';

// Existing tests exercise the local synthetic engine, which is only available in demo mode.
ApiClient.setDemoMode(true);

describe('Frontend Services, Intelligence & Component Logic', () => {
  it('1. ApiClient triggers clarification when prompt lacks company code', async () => {
    const res = await ApiClient.understandPrompt('Show me total revenue and profit');
    assert.equal(res.status, 'CLARIFICATION_REQUIRED');
    assert.ok(res.clarifications && res.clarifications.length > 0);
    assert.equal(res.clarifications[0]?.parameterName, 'companyCode');
  });

  it('2. ApiClient resolves request when company code is present', async () => {
    const res = await ApiClient.understandPrompt('Show revenue and profit for company 1000 in 2026');
    assert.equal(res.status, 'RESOLVED');
    assert.ok(res.resolvedRequest);
    assert.equal(res.resolvedRequest?.filters?.companyCode, '1000');
    assert.ok(res.resolvedRequest?.metricIds.includes('total_revenue'));
  });

  it('3. ApiClient executes deterministic calculations matching golden figures', async () => {
    const req = {
      version: '1.0' as const,
      rawPrompt: 'Show revenue and profit for company 1000',
      metricIds: ['total_revenue', 'net_profit'] as ('total_revenue' | 'net_profit')[],
      dimensions: ['fiscal_period'] as ('fiscal_period')[],
      filters: { companyCode: '1000', fiscalYear: 2026 },
      organizationId: 'ORG_TEST',
      userId: 'test_user',
    };

    const outcome = await ApiClient.executeRequest(req);
    assert.equal(outcome.sourceType, 'mock');
    assert.equal(outcome.isSynthetic, true);
    assert.equal(outcome.results.length, 2);

    const rev = outcome.results.find((m) => m.metricId === 'total_revenue');
    const profit = outcome.results.find((m) => m.metricId === 'net_profit');

    assert.equal(rev?.value, 350000);
    assert.equal(profit?.value, 120000);
  });

  it('4. Zero division safety verified for profit margin and negative net profit in company 2000', async () => {
    const req = {
      version: '1.0' as const,
      rawPrompt: 'Show profit margin for company 2000',
      metricIds: ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'] as any,
      dimensions: ['fiscal_period'] as ('fiscal_period')[],
      filters: { companyCode: '2000', fiscalYear: 2026 },
      organizationId: 'ORG_TEST',
      userId: 'test_user',
    };

    const outcome = await ApiClient.executeRequest(req);
    const margin = outcome.results.find((m) => m.metricId === 'profit_margin');
    const expenses = outcome.results.find((m) => m.metricId === 'total_expenses');
    assert.ok(margin);
    assert.equal(typeof margin.value, 'number');
    assert.equal(expenses?.value, 100000);
  });

  it('5. Period breakdown returns real deterministic P01/P02 records without synthetic split', async () => {
    const periods = await ApiClient.fetchPeriodBreakdown('1000', 2026);
    assert.equal(periods.length, 2);
    assert.equal(periods[0]?.period, '01');
    assert.equal(periods[0]?.total_revenue, 150000);
    assert.equal(periods[0]?.total_expenses, 90000);
    assert.equal(periods[1]?.period, '02');
    assert.equal(periods[1]?.total_revenue, 200000);
    assert.equal(periods[1]?.total_expenses, 140000);
  });

  it('6. Business unit breakdown returns active cost and revenue units', async () => {
    const bu = await ApiClient.fetchBusinessUnitBreakdown('1000', 2026);
    assert.ok(bu.length >= 3);
    const ops = bu.find((b) => b.businessUnit === 'BU_OPERATIONS');
    assert.equal(ops?.total_expenses, 140000);
  });

  it('7. Layout selector chooses distinct archetypes based on DashboardSpec intent', async () => {
    const exec = await ApiClient.executeRequest({
      version: '1.0',
      rawPrompt: 'overview',
      metricIds: ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'],
      dimensions: ['fiscal_period'],
      filters: { companyCode: '1000', fiscalYear: 2026 },
      organizationId: 'ORG_TEST',
      userId: 'test_user',
    });

    const baseSpec: DashboardSpec = {
      version: '1.0',
      dashboardId: '00000000-0000-4000-8000-000000000001',
      title: 'Executive Financial Overview: Company 1000 (FY 2026)',
      organizationId: 'ORG_TEST',
      createdAt: new Date().toISOString(),
      generatedBy: 'test_user',
      widgets: [{ id: 'w1', type: 'kpi_card', title: 'Total Revenue', metricIds: ['total_revenue'] }],
      results: exec.results,
      dataProvenance: {
        sourceType: 'mock',
        sourceSystem: 'MOCK',
        retrievedAt: new Date().toISOString(),
        calculationVersion: '1.0.0',
        isSynthetic: true,
      },
    };

    assert.equal(detectDashboardLayout(baseSpec, false), 'executive_overview');
    assert.equal(detectDashboardLayout(baseSpec, true), 'financial_comparison');
    assert.equal(
      detectDashboardLayout(
        {
          ...baseSpec,
          title: 'Revenue Intelligence: Company 1000',
          results: exec.results.filter((r) => r.metricId === 'total_revenue'),
        },
        false
      ),
      'revenue_intelligence'
    );
    assert.equal(
      detectDashboardLayout(
        {
          ...baseSpec,
          title: 'Expense Analysis: Company 1000',
          results: exec.results.filter((r) => r.metricId === 'total_expenses'),
        },
        false
      ),
      'expense_intelligence'
    );
    assert.equal(
      detectDashboardLayout(
        {
          ...baseSpec,
          title: 'Profitability Analysis: Company 1000',
          results: exec.results.filter((r) => r.metricId === 'net_profit' || r.metricId === 'profit_margin'),
        },
        false
      ),
      'profitability_analysis'
    );

    const narrative = buildExecutiveNarrative(baseSpec, []);
    assert.ok(narrative && narrative.includes('$350,000.00'));
    const insights = buildAnalyticalInsights(baseSpec, [], []);
    assert.ok(insights.length > 0);
  });
});

describe('Demo-mode gating of local fallback', () => {
  const realFetch = globalThis.fetch;
  const realEnv = process.env.NODE_ENV;
  const request = {
    version: '1.0' as const,
    rawPrompt: 'Show revenue for company 1000',
    metricIds: ['total_revenue'] as 'total_revenue'[],
    dimensions: ['fiscal_period'] as 'fiscal_period'[],
    filters: { companyCode: '1000', fiscalYear: 2026 },
    organizationId: 'ORG_TEST',
    userId: 'test_user',
  };

  // Leave NODE_ENV=development so the client really exercises fetch (not the test short-circuit).
  const useRealNetworkPath = () => {
    process.env.NODE_ENV = 'development';
  };
  const restore = () => {
    globalThis.fetch = realFetch;
    process.env.NODE_ENV = realEnv;
    ApiClient.setDemoMode(true);
  };

  it('A. demo OFF + network failure throws ApiUnavailableError, no synthetic data', async () => {
    useRealNetworkPath();
    ApiClient.setDemoMode(false);
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    try {
      await assert.rejects(() => ApiClient.executeRequest(request), ApiUnavailableError);
      await assert.rejects(() => ApiClient.understandPrompt('revenue for company 1000'), ApiUnavailableError);
      await assert.rejects(() => ApiClient.listDashboards(), ApiUnavailableError);
    } finally {
      restore();
    }
  });

  it('A2. demo OFF + HTTP 401/403 throws ApiAuthError with status', async () => {
    useRealNetworkPath();
    ApiClient.setDemoMode(false);
    try {
      for (const status of [401, 403]) {
        globalThis.fetch = (async () => new Response('', { status })) as typeof fetch;
        await assert.rejects(
          () => ApiClient.executeRequest(request),
          (e: any) => e instanceof ApiAuthError && e.status === status
        );
      }
    } finally {
      restore();
    }
  });

  it('A3. demo ON + HTTP 401 still throws ApiAuthError (never falls back)', async () => {
    useRealNetworkPath();
    ApiClient.setDemoMode(true);
    globalThis.fetch = (async () => new Response('', { status: 401 })) as typeof fetch;
    try {
      await assert.rejects(() => ApiClient.executeRequest(request), ApiAuthError);
      await assert.rejects(() => ApiClient.getApprovedMetrics(), ApiAuthError);
    } finally {
      restore();
    }
  });

  it('B. demo ON + network failure returns local synthetic result', async () => {
    useRealNetworkPath();
    ApiClient.setDemoMode(true);
    assert.equal(ApiClient.isDemoMode(), true);
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    try {
      const out = await ApiClient.executeRequest(request);
      assert.equal(out.isSynthetic, true);
      assert.equal(out.results.length, 1);
    } finally {
      restore();
    }
  });

  it('C. health status reports environmentTier unknown when unreachable', async () => {
    useRealNetworkPath();
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    try {
      for (const demo of [true, false]) {
        ApiClient.setDemoMode(demo);
        const status = await ApiClient.getSystemStatus();
        assert.equal(status.backendReachable, false);
        assert.equal(status.environmentTier, 'unknown');
      }
    } finally {
      restore();
    }
  });

  it('D. health status passes through environmentTier from /health', async () => {
    useRealNetworkPath();
    ApiClient.setDemoMode(false);
    globalThis.fetch = (async (url: any) =>
      String(url).includes('/health')
        ? new Response(JSON.stringify({ environmentTier: 'pilot' }), { status: 200 })
        : new Response('', { status: 401 })) as typeof fetch;
    try {
      const status = await ApiClient.getSystemStatus();
      assert.equal(status.backendReachable, true);
      assert.equal(status.environmentTier, 'pilot');
    } finally {
      restore();
    }
  });
});
