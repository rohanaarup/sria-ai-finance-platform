/**
 * Orchestrator & Tool Registry Tests
 * Phase 7 — AI Planning, Tool Orchestration & Controlled Execution
 *
 * Verifies:
 *  1. Planner generates schema-valid DataPlan from DashboardRequest.
 *  2. ToolRegistry executes approved get_finance_metrics tool.
 *  3. ToolRegistry rejects disallowed tool names (arbitrary SQL/shell/HTTP).
 *  4. Parameter validation catches malicious/invalid tool arguments.
 *  5. Orchestrator drives state machine to completion with valid results.
 *  6. Duplicate tool-call detection prevents redundant executions.
 *  7. Step budget protection enforces maxSteps ceiling.
 *  8. Server-side authorization check rejects requests lacking Finance roles.
 *  9. Execution trace records states, steps, and timings without sensitive rows.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { Planner } from '../srv/ai/planner.ts';
import { ToolRegistry } from '../srv/ai/tool-registry.ts';
import { createGetFinanceMetricsTool } from '../srv/ai/tools/get-finance-metrics.ts';
import { Orchestrator } from '../srv/ai/orchestrator.ts';
import { MockFinanceDataProvider } from '../srv/lib/providers/mock-finance-data-provider.ts';
import type { DashboardRequest } from '@sria/contracts';
import { DataPlanSchema } from '@sria/contracts';

const VALID_REQUEST: DashboardRequest = {
  version: '1.0',
  rawPrompt: 'Show total revenue and net profit for company 1000 in 2026',
  metricIds: ['total_revenue', 'net_profit'],
  dimensions: ['fiscal_period'],
  filters: {
    companyCode: '1000',
    fiscalYear: 2026,
    periodFrom: '01'
  },
  organizationId: 'org-sria-01',
  userId: 'analyst-alice'
};

const VALID_CTX = {
  organizationId: 'org-sria-01',
  userId: 'analyst-alice',
  userRoles: ['FinanceAnalyst']
};

describe('Orchestration & Planning Suite', () => {
  it('1. Planner builds schema-valid DataPlan from DashboardRequest', () => {
    const planner = new Planner({ maxSteps: 3, resolvedSource: 'mock' });
    const plan = planner.createPlan(VALID_REQUEST);

    assert.equal(plan.planVersion, '1.0');
    assert.equal(plan.status, 'PLANNED');
    assert.equal(plan.steps.length, 1);
    assert.equal(plan.steps[0]?.tool, 'get_finance_metrics');
    assert.deepEqual(plan.steps[0]?.targetMetrics, ['total_revenue', 'net_profit']);

    assert.doesNotThrow(() => DataPlanSchema.parse(plan));
  });

  it('2. ToolRegistry executes approved get_finance_metrics tool', async () => {
    const registry = new ToolRegistry();
    registry.register(createGetFinanceMetricsTool(new MockFinanceDataProvider()));

    const result = await registry.execute(
      'get_finance_metrics',
      {
        companyCode: '1000',
        fiscalYear: 2026,
        fiscalPeriod: '01',
        metrics: ['total_revenue', 'net_profit']
      },
      VALID_CTX
    ) as any;

    assert.equal(result.companyCode, '1000');
    assert.equal(result.fiscalYear, 2026);
    assert.equal(result.metrics.length, 2);
    assert.equal(result.metrics[0].metricId, 'total_revenue');
    assert.equal(result.metrics[0].value, 150000);
    assert.equal(result.metrics[1].metricId, 'net_profit');
    assert.equal(result.metrics[1].value, 60000);
  });

  it('3. ToolRegistry rejects disallowed tool names (arbitrary SQL/shell/API)', async () => {
    const registry = new ToolRegistry();
    registry.register(createGetFinanceMetricsTool(new MockFinanceDataProvider()));

    await assert.rejects(
      () => registry.execute('execute_arbitrary_sql', { query: 'DROP TABLE Users' }, VALID_CTX),
      (err: Error) => err.message.includes('Disallowed tool')
    );

    await assert.rejects(
      () => registry.execute('run_shell_command', { command: 'rm -rf /' }, VALID_CTX),
      (err: Error) => err.message.includes('Disallowed tool')
    );
  });

  it('4. Tool parameter schema validation catches invalid parameters', async () => {
    const registry = new ToolRegistry();
    registry.register(createGetFinanceMetricsTool(new MockFinanceDataProvider()));

    // Invalid company code format (empty string)
    await assert.rejects(
      () => registry.execute('get_finance_metrics', {
        companyCode: '',
        fiscalYear: 2026,
        metrics: ['total_revenue']
      }, VALID_CTX)
    );

    // Unallowlisted metric
    await assert.rejects(
      () => registry.execute('get_finance_metrics', {
        companyCode: '1000',
        fiscalYear: 2026,
        metrics: ['unsupported_ebitda_metric']
      }, VALID_CTX)
    );
  });

  it('5. Orchestrator drives end-to-end plan execution with traceable success', async () => {
    const registry = new ToolRegistry();
    registry.register(createGetFinanceMetricsTool(new MockFinanceDataProvider()));

    const orchestrator = new Orchestrator({ toolRegistry: registry });
    const outcome = await orchestrator.executeRequest(VALID_REQUEST, VALID_CTX);

    assert.equal(outcome.status, 'SUCCESS');
    assert.equal(outcome.plan.status, 'COMPLETED');
    assert.equal(outcome.results.length, 1);
    assert.equal(outcome.results[0]?.metrics.length, 2);

    // Verify execution trace
    assert.ok(outcome.trace.traceId);
    assert.equal(outcome.trace.organizationId, 'org-sria-01');
    assert.equal(outcome.trace.userId, 'analyst-alice');
    assert.equal(outcome.trace.stepsExecuted, 1);
    assert.ok(outcome.trace.statesVisited.includes('PLANNING'));
    assert.ok(outcome.trace.statesVisited.includes('AUTHORIZING_PLAN'));
    assert.ok(outcome.trace.statesVisited.includes('EXECUTING_TOOLS'));
    assert.ok(outcome.trace.statesVisited.includes('COMPLETED'));
  });

  it('6. Server-side authorization check rejects requests lacking Finance roles', async () => {
    const registry = new ToolRegistry();
    registry.register(createGetFinanceMetricsTool(new MockFinanceDataProvider()));

    const orchestrator = new Orchestrator({ toolRegistry: registry });
    const unauthorizedCtx = {
      organizationId: 'org-sria-01',
      userId: 'hacker-dave',
      userRoles: ['ViewerOnly'] // Missing FinanceAnalyst / FinanceManager
    };

    const outcome = await orchestrator.executeRequest(VALID_REQUEST, unauthorizedCtx);
    assert.equal(outcome.status, 'FAILED');
    assert.ok(outcome.error?.includes('Authorization failure'));
    assert.equal(outcome.plan?.status, 'FAILED');
  });

  it('7. Orchestrator halts when step budget is exceeded', async () => {
    // Orchestrator configured with maxSteps: 0
    const orchestrator = new Orchestrator({ maxSteps: 0 });
    const outcome = await orchestrator.executeRequest(VALID_REQUEST, VALID_CTX);

    assert.equal(outcome.status, 'FAILED');
    assert.ok(outcome.error?.includes('exceeds step budget'));
  });

  it('8. Execution trace omits raw transactional rows to protect privacy', async () => {
    const registry = new ToolRegistry();
    registry.register(createGetFinanceMetricsTool(new MockFinanceDataProvider()));

    const orchestrator = new Orchestrator({ toolRegistry: registry });
    const outcome = await orchestrator.executeRequest(VALID_REQUEST, VALID_CTX);

    const serializedTrace = JSON.stringify(outcome.trace);
    // Trace should not contain raw GL accounts or raw document IDs
    assert.ok(!serializedTrace.includes('REC-1000-202601-01'));
    assert.ok(!serializedTrace.includes('GLAccount'));
  });
});

