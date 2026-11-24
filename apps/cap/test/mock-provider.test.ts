/**
 * mock-provider.test.ts
 * Phase 5 — Tests for MockFinanceDataProvider and ProviderFactory
 *
 * Verifies:
 *  1. Provider returns synthetic records tagged with isSynthetic: true in provenance
 *  2. Calculation results match EXPECTED_FINANCE_CALCULATIONS golden fixtures
 *  3. Zero-revenue protection (isZeroDenominator)
 *  4. Negative net profit (operating loss)
 *  5. ProviderFactory defaults to 'mock' when env var is absent
 *  6. ProviderFactory returns S4Hana provider throws when env var is 's4hana' (BLOCKED)
 *  7. Provider returns empty array for non-existent company code
 *  8. Provider throws for invalid companyCode (empty string)
 */

import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';
import { EXPECTED_FINANCE_CALCULATIONS, SYNTHETIC_FIXTURE_LABEL } from '@sria/contracts';
import { MockFinanceDataProvider } from '../srv/lib/providers/mock-finance-data-provider.ts';
import { S4HanaProviderBlockedError } from '../srv/lib/providers/s4hana-odata-provider.ts';
import { getFinanceDataProvider, resetProviderSingleton } from '../srv/lib/providers/provider-factory.ts';
import {
  calculateTotalRevenue,
  calculateTotalExpenses,
  calculateNetProfit,
  calculateProfitMargin,
  calculateAllMetrics
} from '../srv/lib/finance/calculation-engine.ts';

const MOCK_TENANT_CTX = { organizationId: 'org-test', userId: 'user-test' };

describe('MockFinanceDataProvider', () => {
  let provider: MockFinanceDataProvider;

  before(() => {
    provider = new MockFinanceDataProvider();
  });

  it('getSourceType() returns "mock"', () => {
    assert.equal(provider.getSourceType(), 'mock');
  });

  it('isAvailable() resolves to true', async () => {
    const result = await provider.isAvailable();
    assert.equal(result, true);
  });

  it('fetchRecords returns records for company 1000, period 01', async () => {
    const records = await provider.fetchRecords(
      { companyCode: '1000', fiscalYear: 2026, fiscalPeriod: '01' },
      MOCK_TENANT_CTX
    );
    assert.ok(records.length > 0, 'Expected at least one record');
    for (const rec of records) {
      assert.equal(rec.companyCode, '1000');
      assert.equal(rec.fiscalPeriod, '01');
    }
  });

  it('fetchRecords returns empty array for non-existent company code', async () => {
    const records = await provider.fetchRecords(
      { companyCode: 'XXXX', fiscalYear: 2026 },
      MOCK_TENANT_CTX
    );
    assert.equal(records.length, 0);
  });

  it('fetchRecords throws for empty companyCode', async () => {
    await assert.rejects(
      () => provider.fetchRecords({ companyCode: '', fiscalYear: 2026 }, MOCK_TENANT_CTX),
      (err: Error) => err.message.includes('companyCode is required')
    );
  });

  it('provenance helper marks isSynthetic: true and contains SYNTHETIC_FIXTURE_LABEL', () => {
    const prov = provider.buildProvenance({ companyCode: '1000', fiscalYear: 2026 });
    assert.equal(prov.isSynthetic, true);
    assert.equal(prov.sourceType, 'mock');
    assert.ok(prov.notes.includes(SYNTHETIC_FIXTURE_LABEL));
  });

  it('calculations match golden fixture: company 1000, period 01', async () => {
    const records = await provider.fetchRecords(
      { companyCode: '1000', fiscalYear: 2026 },
      MOCK_TENANT_CTX
    );
    const expected = EXPECTED_FINANCE_CALCULATIONS.company1000_period01;
    const result = calculateAllMetrics(records, '1000', '01');

    assert.equal(result.totalRevenue.value, expected.total_revenue,
      `Revenue: got ${result.totalRevenue.value}, expected ${expected.total_revenue}`);
    assert.equal(result.totalExpenses.value, expected.total_expenses,
      `Expenses: got ${result.totalExpenses.value}, expected ${expected.total_expenses}`);
    assert.equal(result.netProfit.value, expected.net_profit,
      `Net Profit: got ${result.netProfit.value}, expected ${expected.net_profit}`);
    assert.equal(result.profitMargin.value, expected.profit_margin,
      `Profit Margin: got ${result.profitMargin.value}, expected ${expected.profit_margin}`);
  });

  it('calculations match golden fixture: company 1000, period 02', async () => {
    const records = await provider.fetchRecords(
      { companyCode: '1000', fiscalYear: 2026 },
      MOCK_TENANT_CTX
    );
    const expected = EXPECTED_FINANCE_CALCULATIONS.company1000_period02;
    const result = calculateAllMetrics(records, '1000', '02');

    assert.equal(result.totalRevenue.value, expected.total_revenue);
    assert.equal(result.totalExpenses.value, expected.total_expenses);
    assert.equal(result.netProfit.value, expected.net_profit);
    assert.equal(result.profitMargin.value, expected.profit_margin);
  });

  it('zero-revenue: isZeroDenominator=true for company 2000, period 01', async () => {
    const records = await provider.fetchRecords(
      { companyCode: '2000', fiscalYear: 2026 },
      MOCK_TENANT_CTX
    );
    const expected = EXPECTED_FINANCE_CALCULATIONS.company2000_period01_zero_revenue;
    const result = calculateAllMetrics(records, '2000', '01');

    assert.equal(result.totalRevenue.value, expected.total_revenue);
    assert.equal(result.totalExpenses.value, expected.total_expenses);
    assert.equal(result.netProfit.value, expected.net_profit);
    assert.equal(result.profitMargin.value, expected.profit_margin);
    assert.equal(result.profitMargin.isZeroDenominator, true,
      'Expected isZeroDenominator=true for zero revenue case');
  });

  it('negative net profit (operating loss): company 2000, period 02', async () => {
    const records = await provider.fetchRecords(
      { companyCode: '2000', fiscalYear: 2026 },
      MOCK_TENANT_CTX
    );
    const expected = EXPECTED_FINANCE_CALCULATIONS.company2000_period02_net_loss;
    const result = calculateAllMetrics(records, '2000', '02');

    assert.equal(result.netProfit.value, expected.net_profit,
      `Expected net loss ${expected.net_profit}, got ${result.netProfit.value}`);
    assert.ok(result.netProfit.value < 0, 'Net profit should be negative (loss)');
    assert.equal(result.profitMargin.value, expected.profit_margin);
    assert.equal(result.profitMargin.isZeroDenominator, false);
  });
});

describe('ProviderFactory', () => {
  before(() => { resetProviderSingleton(); });
  after(() => { resetProviderSingleton(); });

  it('defaults to mock provider when env var is absent', () => {
    const original = process.env['FINANCE_DATA_PROVIDER'];
    delete process.env['FINANCE_DATA_PROVIDER'];
    resetProviderSingleton();
    const provider = getFinanceDataProvider();
    assert.equal(provider.getSourceType(), 'mock');
    if (original !== undefined) process.env['FINANCE_DATA_PROVIDER'] = original;
    resetProviderSingleton();
  });

  it('returns mock provider when overrideType=mock', () => {
    resetProviderSingleton();
    const provider = getFinanceDataProvider('mock');
    assert.equal(provider.getSourceType(), 'mock');
    resetProviderSingleton();
  });

  it('throws S4HanaProviderBlockedError when overrideType=s4hana and no destination', () => {
    resetProviderSingleton();
    const original = process.env['FINANCE_S4HANA_DESTINATION_NAME'];
    delete process.env['FINANCE_S4HANA_DESTINATION_NAME'];

    assert.throws(
      () => getFinanceDataProvider('s4hana'),
      (err: Error) => err instanceof S4HanaProviderBlockedError
    );

    if (original !== undefined) process.env['FINANCE_S4HANA_DESTINATION_NAME'] = original;
    resetProviderSingleton();
  });
});
