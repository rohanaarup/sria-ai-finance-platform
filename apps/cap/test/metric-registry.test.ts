import test from 'node:test';
import assert from 'node:assert/strict';
import { FinanceMetricRegistry } from '../srv/finance-metric-registry.ts';
import { BASELINE_METRIC_CATALOG } from '@sria/contracts';

test('FinanceMetricRegistry initializes with baseline candidate catalog', () => {
  const registry = new FinanceMetricRegistry();
  const all = registry.getAllMetrics();

  assert.equal(all.length, 4);
  const ids = all.map((m) => m.id);
  assert.deepEqual(ids, ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin']);

  // All candidate metrics are disabled by default
  const enabled = registry.getEnabledMetrics();
  assert.equal(enabled.length, 0);
});

test('FinanceMetricRegistry rejects unapproved or unknown metrics', () => {
  const registry = new FinanceMetricRegistry();

  // Test 1: Non-existent metric
  const unknownRes = registry.validateMetrics(['ebitda']);
  assert.equal(unknownRes.valid, false);
  assert.ok(unknownRes.errors[0].includes('not in the approved Finance Metric Registry allowlist'));

  // Test 2: Unapproved candidate metric (disabled initially)
  const candidateRes = registry.validateMetrics(['total_revenue']);
  assert.equal(candidateRes.valid, false);
  assert.ok(candidateRes.errors[0].includes('currently DISABLED'));
});

test('FinanceMetricRegistry supports reviewer approval gate', () => {
  const registry = new FinanceMetricRegistry();

  assert.equal(registry.isMetricExecutable('total_revenue'), false);

  // Reviewer approves metric definition
  const approved = registry.approveAndEnableMetric('total_revenue', 'Finance Director Jane Doe');
  assert.equal(approved, true);

  assert.equal(registry.isMetricExecutable('total_revenue'), true);

  const validation = registry.validateMetrics(['total_revenue']);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.validatedIds, ['total_revenue']);
});

test('FinanceMetricRegistry validates supported and unsupported dimensions', () => {
  const registry = new FinanceMetricRegistry();

  const validDims = registry.validateDimensions(['month', 'company_code']);
  assert.equal(validDims.valid, true);
  assert.deepEqual(validDims.validatedDimensions, ['month', 'company_code']);

  const invalidDims = registry.validateDimensions(['customer_id', 'gl_account']);
  assert.equal(invalidDims.valid, false);
  assert.equal(invalidDims.errors.length, 2);
  assert.ok(invalidDims.errors[0].includes('not supported'));
});
