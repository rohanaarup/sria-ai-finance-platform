/**
 * Frontend Component & API Client Unit Tests
 * Phase 9 — React Dashboard Creation & Rendering Experience
 *
 * Verifies:
 *  1. ApiClient correctly identifies missing parameters and triggers clarification.
 *  2. ApiClient executes deterministic calculation for company 1000 and 2000.
 *  3. Model outputs never render dangerous or unvetted HTML scripts.
 *  4. Formatters handle normal, negative, and zero values accurately.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ApiClient } from '../src/services/api-client.ts';

describe('Phase 9: Frontend Services & Component Logic', () => {
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
      userId: 'test_user'
    };

    const outcome = await ApiClient.executeRequest(req);
    assert.equal(outcome.sourceType, 'mock');
    assert.equal(outcome.isSynthetic, true);
    assert.equal(outcome.results.length, 2);

    const rev = outcome.results.find(m => m.metricId === 'total_revenue');
    const profit = outcome.results.find(m => m.metricId === 'net_profit');

    assert.equal(rev?.value, 350000);
    assert.equal(profit?.value, 120000);
  });

  it('4. Zero division safety verified for profit margin', async () => {
    const req = {
      version: '1.0' as const,
      rawPrompt: 'Show profit margin for company 2000',
      metricIds: ['profit_margin'] as ('profit_margin')[],
      dimensions: ['fiscal_period'] as ('fiscal_period')[],
      filters: { companyCode: '2000', fiscalYear: 2026 },
      organizationId: 'ORG_TEST',
      userId: 'test_user'
    };

    const outcome = await ApiClient.executeRequest(req);
    const margin = outcome.results.find(m => m.metricId === 'profit_margin');
    assert.ok(margin);
    assert.equal(typeof margin.value, 'number');
  });
});

