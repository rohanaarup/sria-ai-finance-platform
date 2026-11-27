/**
 * Metric approval gate (G2-00, decision D-02).
 * Planner and tool must refuse a metric that is not executable in the active environment tier.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BASELINE_METRIC_CATALOG } from '@sria/contracts';
import type { DashboardRequest, MetricDefinition, MetricId } from '@sria/contracts';
import { FinanceMetricRegistry, MetricNotExecutableError } from '../srv/finance-metric-registry.ts';
import { Planner } from '../srv/ai/planner.ts';
import { createGetFinanceMetricsTool } from '../srv/ai/tools/get-finance-metrics.ts';
import { MockFinanceDataProvider } from '../srv/lib/providers/mock-finance-data-provider.ts';

function catalog(overrides: Partial<Record<MetricId, Partial<MetricDefinition>>> = {}) {
  const c = structuredClone(BASELINE_METRIC_CATALOG) as Record<MetricId, MetricDefinition>;
  for (const [id, o] of Object.entries(overrides)) Object.assign(c[id as MetricId], o);
  return c;
}
const request = (metricIds: MetricId[]): DashboardRequest => ({
  requestId: '11111111-1111-4111-8111-111111111111', organizationId: 'TENANT_A', userId: 'u',
  metricIds, dimensions: ['fiscal_period'], filters: { companyCode: '1000', fiscalYear: 2026 }
} as unknown as DashboardRequest);
const ctx = { organizationId: 'TENANT_A', userId: 'u', userRoles: ['FinanceAnalyst'] };

describe('metric approval gate', () => {
  it('baseline catalog is entirely unapproved (the situation the gate must handle)', () => {
    assert.ok(Object.values(BASELINE_METRIC_CATALOG).every((m) => !m.enabled && m.approvalStatus === 'PENDING_REVIEW'));
  });

  it('pilot and production tiers reject metrics that are not APPROVED and enabled', () => {
    const reg = new FinanceMetricRegistry(catalog());
    assert.equal(reg.isExecutableInTier('total_revenue', 'pilot'), false);
    assert.equal(reg.isExecutableInTier('total_revenue', 'production'), false);
    assert.throws(() => reg.assertExecutable(['total_revenue'], 'pilot'), MetricNotExecutableError);
  });

  it('mock and local tiers allow PENDING_REVIEW metrics but never REJECTED or unknown ones', () => {
    const reg = new FinanceMetricRegistry(catalog({ net_profit: { approvalStatus: 'REJECTED' } }));
    assert.equal(reg.isExecutableInTier('total_revenue', 'local'), true);
    assert.equal(reg.isExecutableInTier('total_revenue', 'mock'), true);
    assert.equal(reg.isExecutableInTier('net_profit', 'local'), false);
    assert.equal(reg.isExecutableInTier('unknown_metric' as MetricId, 'local'), false);
  });

  it('planner rejects a rejected metric in local and every unapproved metric in pilot', () => {
    const reg = new FinanceMetricRegistry(catalog({ net_profit: { approvalStatus: 'REJECTED' } }));
    assert.throws(() => new Planner({ tier: 'local', registry: reg }).createPlan(request(['net_profit'])), MetricNotExecutableError);
    assert.throws(() => new Planner({ tier: 'pilot', registry: reg }).createPlan(request(['total_revenue'])), MetricNotExecutableError);
    assert.ok(new Planner({ tier: 'local', registry: reg }).createPlan(request(['total_revenue'])));
  });

  it('planner accepts a metric once Finance approves and enables it in a pilot tier', () => {
    const reg = new FinanceMetricRegistry(catalog());
    reg.approveAndEnableMetric('total_revenue', 'Finance Reviewer');
    assert.ok(new Planner({ tier: 'pilot', registry: reg }).createPlan(request(['total_revenue'])));
    assert.throws(() => new Planner({ tier: 'pilot', registry: reg }).createPlan(request(['net_profit'])), MetricNotExecutableError);
  });

  it('the tool enforces the gate itself, even if the planner is bypassed', async () => {
    const reg = new FinanceMetricRegistry(catalog({ net_profit: { approvalStatus: 'REJECTED' } }));
    const tool = createGetFinanceMetricsTool(new MockFinanceDataProvider(), { tier: 'local', registry: reg });
    await assert.rejects(tool.execute({ companyCode: '1000', fiscalYear: 2026, metrics: ['net_profit'] } as any, ctx), MetricNotExecutableError);
    const ok = await tool.execute({ companyCode: '1000', fiscalYear: 2026, metrics: ['total_revenue'] } as any, ctx);
    assert.equal(ok.isSynthetic, true);
    const pilot = createGetFinanceMetricsTool(new MockFinanceDataProvider(), { tier: 'pilot', registry: reg });
    await assert.rejects(pilot.execute({ companyCode: '1000', fiscalYear: 2026, metrics: ['total_revenue'] } as any, ctx), MetricNotExecutableError);
  });
});
