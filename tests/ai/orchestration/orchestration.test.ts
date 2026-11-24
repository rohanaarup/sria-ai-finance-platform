/**
 * End-to-End Orchestration Integration Suite
 * Phase 7 — AI Planning, Tool Orchestration & Controlled Execution
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { Orchestrator } from '../../../apps/cap/srv/ai/orchestrator.ts';
import { ToolRegistry } from '../../../apps/cap/srv/ai/tool-registry.ts';
import { createGetFinanceMetricsTool } from '../../../apps/cap/srv/ai/tools/get-finance-metrics.ts';
import { MockFinanceDataProvider } from '../../../apps/cap/srv/lib/providers/mock-finance-data-provider.ts';
import type { DashboardRequest } from '@sria/contracts';

describe('AI Planning & Orchestration Integration', () => {
  const registry = new ToolRegistry();
  registry.register(createGetFinanceMetricsTool(new MockFinanceDataProvider()));
  const orchestrator = new Orchestrator({ toolRegistry: registry });

  const ctx = {
    organizationId: 'org-test',
    userId: 'finance-manager-jane',
    userRoles: ['FinanceManager']
  };

  it('Executes multi-metric planning and tool execution for period 02', async () => {
    const request: DashboardRequest = {
      version: '1.0',
      rawPrompt: 'Show revenue, expenses and margin for 1000 in 2026 period 02',
      metricIds: ['total_revenue', 'total_expenses', 'profit_margin'],
      dimensions: ['fiscal_period'],
      filters: {
        companyCode: '1000',
        fiscalYear: 2026,
        periodFrom: '02'
      },
      organizationId: 'org-test',
      userId: 'finance-manager-jane'
    };

    const outcome = await orchestrator.executeRequest(request, ctx);

    assert.equal(outcome.status, 'SUCCESS');
    assert.equal(outcome.plan.status, 'COMPLETED');
    const metricResults = outcome.results[0]!.metrics;

    const rev = metricResults.find(m => m.metricId === 'total_revenue');
    const exp = metricResults.find(m => m.metricId === 'total_expenses');
    const margin = metricResults.find(m => m.metricId === 'profit_margin');

    assert.equal(rev?.value, 200000);
    assert.equal(exp?.value, 140000);
    assert.equal(margin?.value, 30);
  });
});
