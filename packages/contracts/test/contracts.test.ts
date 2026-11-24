import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DashboardRequestSchema,
  ClarificationQuestionSchema,
  DataPlanSchema,
  DashboardSpecSchema,
  MetricDefinitionSchema,
  BASELINE_METRIC_CATALOG,
  SYNTHETIC_FINANCE_RECORDS,
  EXPECTED_FINANCE_CALCULATIONS
} from '../dist/index.js';

test('DashboardRequestSchema validates correct request', () => {
  const validRequest = {
    version: '1.0',
    rawPrompt: 'Show me total revenue and net profit by month for company code 1000',
    metricIds: ['total_revenue', 'net_profit'],
    dimensions: ['month', 'company_code'],
    filters: {
      companyCode: '1000',
      fiscalYear: 2026,
      periodFrom: '01',
      periodTo: '12'
    },
    organizationId: 'ORG_ACME_CORP',
    userId: 'USER_FIN_ANALYST_01'
  };

  const result = DashboardRequestSchema.safeParse(validRequest);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.metricIds.length, 2);
    assert.equal(result.data.filters?.companyCode, '1000');
  }
});

test('DashboardRequestSchema rejects unallowlisted metrics (hallucination guard)', () => {
  const invalidRequest = {
    rawPrompt: 'Give me EBITDA and free cash flow',
    metricIds: ['ebitda', 'free_cash_flow'], // Disallowed!
    organizationId: 'ORG_01',
    userId: 'USER_01'
  };

  const result = DashboardRequestSchema.safeParse(invalidRequest);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.length > 0);
    assert.ok(result.error.issues.some((i) => i.path.includes('metricIds')));
  }
});

test('DashboardRequestSchema rejects unsupported dimensions', () => {
  const invalidRequest = {
    rawPrompt: 'Revenue by vendor',
    metricIds: ['total_revenue'],
    dimensions: ['vendor_tax_id'], // Disallowed!
    organizationId: 'ORG_01',
    userId: 'USER_01'
  };

  const result = DashboardRequestSchema.safeParse(invalidRequest);
  assert.equal(result.success, false);
});

test('ClarificationQuestionSchema validates ambiguity questions', () => {
  const question = {
    questionId: 'CLARIFY-001',
    parameterName: 'companyCode',
    prompt: 'Multiple company codes exist (1000, 2000). Which entity would you like to inspect?',
    reason: 'Company code was omitted from natural language request',
    options: ['1000 (US Commercial)', '2000 (EU Commercial)'],
    suggestedDefault: '1000'
  };

  const result = ClarificationQuestionSchema.safeParse(question);
  assert.equal(result.success, true);
});

test('DataPlanSchema validates bounded execution plan', () => {
  const plan = {
    planVersion: '1.0',
    planId: '123e4567-e89b-12d3-a456-426614174000',
    requestId: 'REQ-001',
    organizationId: 'ORG_01',
    userId: 'USER_01',
    status: 'VALIDATED',
    steps: [
      {
        stepNumber: 1,
        action: 'fetch_records',
        tool: 'get_finance_metrics',
        targetMetrics: ['total_revenue', 'total_expenses'],
        dimensions: ['month'],
        sourceType: 'mock',
        filters: { companyCode: '1000' }
      }
    ],
    createdAt: new Date().toISOString(),
    resolvedSource: 'mock'
  };

  const result = DataPlanSchema.safeParse(plan);
  assert.equal(result.success, true);
});

test('DashboardSpecSchema validates complete compiled specification', () => {
  const spec = {
    version: '1.0',
    dashboardId: '550e8400-e29b-41d4-a716-446655440000',
    title: 'Financial Performance Overview - 2026',
    organizationId: 'ORG_01',
    createdAt: new Date().toISOString(),
    generatedBy: 'Sria AI Orchestrator v1.0',
    widgets: [
      {
        id: 'WIDGET-01',
        type: 'kpi_card',
        title: 'Total Revenue YTD',
        metricIds: ['total_revenue'],
        options: { colorScheme: 'terracotta', decimalPlaces: 2 }
      },
      {
        id: 'WIDGET-02',
        type: 'line_chart',
        title: 'Revenue vs Expenses by Month',
        metricIds: ['total_revenue', 'total_expenses'],
        dimension: 'month'
      }
    ],
    dataProvenance: {
      sourceType: 'mock',
      sourceSystem: 'Sria Synthetic Finance Engine',
      retrievedAt: new Date().toISOString(),
      calculationVersion: 'calc-v1.0-deterministic',
      isSynthetic: true
    }
  };

  const result = DashboardSpecSchema.safeParse(spec);
  assert.equal(result.success, true);
});

test('Baseline Metric Definitions adhere to contract schema and initial approval rules', () => {
  const metrics = Object.values(BASELINE_METRIC_CATALOG);
  assert.equal(metrics.length, 4);

  for (const m of metrics) {
    const parseRes = MetricDefinitionSchema.safeParse(m);
    assert.equal(parseRes.success, true);
    // Hard Rule: Enabled must be false until formal Finance signoff
    assert.equal(m.enabled, false);
    assert.equal(m.approvalStatus, 'PENDING_REVIEW');
    assert.equal(m.sourceMappingStatus, 'UNCONFIRMED');
  }
});

test('Deterministic synthetic fixtures match expected calculations', () => {
  assert.ok(SYNTHETIC_FINANCE_RECORDS.length > 0);

  // Filter Company Code 1000, Period 01
  const c1000p01 = SYNTHETIC_FINANCE_RECORDS.filter(
    (r) => r.companyCode === '1000' && r.fiscalPeriod === '01'
  );

  let rev = 0;
  let exp = 0;
  for (const row of c1000p01) {
    if (row.accountType === 'REVENUE') {
      rev += (row.debitCredit === 'C' ? row.amount : -row.amount);
    } else if (row.accountType === 'EXPENSE') {
      exp += (row.debitCredit === 'D' ? row.amount : -row.amount);
    }
  }

  const netProfit = rev - exp;
  const margin = (netProfit / rev) * 100;

  assert.equal(rev, EXPECTED_FINANCE_CALCULATIONS.company1000_period01.total_revenue);
  assert.equal(exp, EXPECTED_FINANCE_CALCULATIONS.company1000_period01.total_expenses);
  assert.equal(netProfit, EXPECTED_FINANCE_CALCULATIONS.company1000_period01.net_profit);
  assert.equal(margin, EXPECTED_FINANCE_CALCULATIONS.company1000_period01.profit_margin);
});
