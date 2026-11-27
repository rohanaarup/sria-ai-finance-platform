/**
 * G2-04 frontend tests: AgentGoal display helpers, understand/health parsing, demo-mode goal.
 */
import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';

import { AgentGoalSchema } from '@sria/contracts';
import type { AgentGoal } from '@sria/contracts';
import { ApiClient, parseAgentGoal, parseAiEngine } from '../src/services/api-client.ts';
import {
  aiBadgeText, assumptionList, formatPeriod, goalTone, missingList, modeLabel, modeTone, taskLabel, understoodItems,
} from '../src/components/ai/goal-format.ts';

const goal = (over: Partial<AgentGoal> = {}): AgentGoal => ({
  goalVersion: '1',
  taskType: 'create_dashboard',
  entities: ['1000'],
  period: { fiscalYear: 2026, periodFrom: null, periodTo: null },
  comparisonPeriod: null,
  metrics: ['total_revenue'],
  dimensions: [],
  constraints: [],
  assumptions: [],
  missingInformation: [],
  rationale: 'Revenue for company 1000.',
  unsupportedReason: null,
  ...over,
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  ApiClient.setDemoMode(null);
  process.env.NODE_ENV = 'test';
});

const stubFetch = (handler: (url: string) => unknown) => {
  globalThis.fetch = (async (input: any) => {
    const body = handler(String(input));
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
};

/** The client skips the network under NODE_ENV=test + demo mode only; clear it for network-path tests. */
const networkPath = () => { ApiClient.setDemoMode(false); delete process.env.NODE_ENV; };

describe('goal-format', () => {
  it('labels every task type', () => {
    assert.equal(taskLabel('create_dashboard'), 'Create a dashboard');
    assert.equal(taskLabel('compare'), 'Compare');
    assert.equal(taskLabel('explain_metric'), 'Explain a metric');
    assert.equal(taskLabel('answer_question'), 'Answer a question');
    assert.equal(taskLabel('analyze_variance'), 'Analyze a variance');
    assert.equal(taskLabel('modify_dashboard'), 'Modify the dashboard');
    assert.equal(taskLabel('unsupported'), 'Not supported');
  });

  it('formats periods including nulls', () => {
    assert.equal(formatPeriod({ fiscalYear: 2026, periodFrom: null, periodTo: null }), 'whole fiscal year 2026');
    assert.equal(formatPeriod({ fiscalYear: 2026, periodFrom: '01', periodTo: '03' }), 'periods 01 to 03, fiscal year 2026');
    assert.equal(formatPeriod({ fiscalYear: 2026, periodFrom: '02', periodTo: '02' }), 'period 02, fiscal year 2026');
    assert.equal(formatPeriod({ fiscalYear: null, periodFrom: null, periodTo: null }), 'Period not specified');
  });

  it('lists understood items', () => {
    const items = understoodItems(goal({
      entities: ['1000', '2000'], dimensions: ['fiscal_period'],
      constraints: [{ kind: 'top_n', description: 'Top 3' }],
    }));
    const text = items.map((i) => `${i.label}=${i.value}`).join('|');
    assert.match(text, /Companies=Company 1000, Company 2000/);
    assert.match(text, /Period=whole fiscal year 2026/);
    assert.match(text, /Total revenue \(total_revenue\)/);
    assert.match(text, /fiscal period/);
    assert.match(text, /Constraint=Top 3/);
  });

  it('handles assumptions, missing info and tones', () => {
    const g = goal({
      assumptions: ['Fiscal year 2026'],
      missingInformation: [{ parameter: 'companyCode', question: 'Which company?', options: ['1000', '2000'] }],
    });
    assert.deepEqual(assumptionList(g), ['Fiscal year 2026']);
    assert.deepEqual(missingList(g), [{ parameter: 'companyCode', question: 'Which company?', options: ['1000', '2000'] }]);
    assert.equal(goalTone(g), 'needs-answer');
    assert.equal(goalTone(goal()), 'ok');
    const u = goal({ taskType: 'unsupported', entities: [], metrics: [], unsupportedReason: 'No forecasting.' });
    assert.equal(goalTone(u), 'unsupported');
  });

  it('labels AI modes', () => {
    assert.match(modeLabel('mock'), /Test double/);
    assert.equal(modeLabel('replay'), 'Replay of recorded answers');
    assert.equal(modeLabel('live'), 'Live model');
    assert.equal(modeTone('mock'), 'warning');
    assert.equal(modeTone('live'), 'positive');
    assert.equal(aiBadgeText(undefined), 'AI: unknown');
    assert.equal(aiBadgeText({ provider: 'p', mode: 'live', model: 'm1' }), 'AI: p / m1 (live)');
  });
});

describe('understand response parsing', () => {
  const resolved = JSON.stringify({
    version: '1.0', rawPrompt: 'x', metricIds: ['total_revenue'], dimensions: [],
    filters: { companyCode: '1000', fiscalYear: 2026 }, organizationId: 'o', userId: 'u',
  });

  it('keeps a valid agentGoalJson and mode fields', async () => {
    networkPath();
    stubFetch(() => ({ status: 'RESOLVED', resolvedRequest: resolved, agentGoalJson: JSON.stringify(goal()), aiMode: 'replay', modelId: 'rec-1' }));
    const r = await ApiClient.understandPrompt('revenue 1000');
    assert.equal(r.agentGoal?.taskType, 'create_dashboard');
    assert.equal(r.aiMode, 'replay');
    assert.equal(r.modelId, 'rec-1');
  });

  it('drops an invalid agentGoalJson without throwing', async () => {
    networkPath();
    stubFetch(() => ({ status: 'RESOLVED', resolvedRequest: resolved, agentGoalJson: '{"taskType":"nope"}' }));
    const warn = console.warn;
    console.warn = () => {};
    try {
      const r = await ApiClient.understandPrompt('revenue 1000');
      assert.equal(r.status, 'RESOLVED');
      assert.equal(r.agentGoal, undefined);
      assert.equal(parseAgentGoal('not json'), undefined);
      assert.equal(parseAgentGoal(null), undefined);
    } finally {
      console.warn = warn;
    }
  });

  it('older responses without new fields still work', async () => {
    networkPath();
    stubFetch(() => ({ status: 'RESOLVED', resolvedRequest: resolved }));
    const r = await ApiClient.understandPrompt('revenue 1000');
    assert.equal(r.status, 'RESOLVED');
    assert.equal(r.agentGoal, undefined);
    assert.equal(r.aiMode, undefined);
  });
});

describe('health aiEngine', () => {
  it('parses aiEngine and falls back to unknown', () => {
    assert.deepEqual(
      parseAiEngine({ status: 'UP', provider: 'anthropic', mode: 'live', model: 'm', approved: true }),
      { provider: 'anthropic', mode: 'live', model: 'm', approved: true }
    );
    assert.equal(parseAiEngine(undefined).mode, 'unknown');
    assert.equal(parseAiEngine({ mode: 'weird' }).mode, 'unknown');
  });

  it('getSystemStatus reads components.aiEngine and defaults when unreachable', async () => {
    networkPath();
    stubFetch((url) =>
      url.endsWith('/health')
        ? { service: 's', components: { aiEngine: { provider: 'mock', mode: 'mock', model: null, approved: false } } }
        : {}
    );
    const s = await ApiClient.getSystemStatus();
    assert.equal(s.aiEngine?.mode, 'mock');
    globalThis.fetch = (async () => { throw new Error('down'); }) as typeof fetch;
    const d = await ApiClient.getSystemStatus();
    assert.equal(d.aiEngine?.mode, 'unknown');
  });
});

describe('demo-mode goal', () => {
  it('builds valid goals for resolved, clarification and rejected results', async () => {
    ApiClient.setDemoMode(true);
    for (const prompt of ['Show revenue for company 1000 FY 2026', 'show revenue', 'forecast EBITDA']) {
      const r = await ApiClient.understandPrompt(prompt);
      assert.equal(r.aiMode, 'mock');
      assert.ok(r.agentGoal, prompt);
      assert.equal(AgentGoalSchema.safeParse(r.agentGoal).success, true);
    }
    const r1 = await ApiClient.understandPrompt('Show revenue for company 1000 FY 2026');
    assert.deepEqual(r1.agentGoal?.entities, ['1000']);
    assert.equal((await ApiClient.understandPrompt('show revenue')).agentGoal?.missingInformation.length, 1);
    assert.equal((await ApiClient.understandPrompt('forecast EBITDA')).agentGoal?.taskType, 'unsupported');
  });
});
