/**
 * Finance calculation pipeline tests (G2-00: one production pipeline).
 *
 * The runtime pipeline is `inspectAndCalculate` (normalization checks + deterministic formulas)
 * in apps/cap/srv/lib/finance/calculation-engine.ts. The former duplicate calculators under
 * srv/finance/calculations were removed (finding F-04); their behavioural cases live here.
 *
 *  1. Revenue: Credit adds, Debit subtracts (returns).
 *  2. Expenses: Debit adds, Credit subtracts (refunds).
 *  3. Net profit handles a net loss.
 *  4. Profit margin: zero denominator is flagged, not a division error.
 *  5. Zero-vs-missing is explicit in the pipeline output.
 *  6. Mixed currencies are refused (no silent mixing); duplicates are reported.
 *  7. Golden: the pipeline reproduces the published synthetic figures exactly (empty golden diff).
 */
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { FinanceRecord } from '@sria/contracts';
import { EXPECTED_FINANCE_CALCULATIONS, SYNTHETIC_FINANCE_RECORDS } from '@sria/contracts';
import {
  inspectAndCalculate,
  calculateAllMetrics,
  calculateNetProfit,
  calculateProfitMargin,
  DataQualityError
} from '../../../apps/cap/srv/lib/finance/calculation-engine.ts';
import { normalizeAndInspectRecords, evaluateDataState } from '../../../apps/cap/srv/finance/normalization.ts';

function rec(overrides: Partial<FinanceRecord>): FinanceRecord {
  return {
    recordId: 'REC-TEST-001', companyCode: '1000', fiscalYear: 2026, fiscalPeriod: '01', postingDate: '2026-01-15',
    glAccount: '410000', accountType: 'REVENUE', amount: 100000, currency: 'USD', debitCredit: 'C',
    ...overrides
  };
}

describe('G2-00: single calculation pipeline (inspect → calculate)', () => {
  it('1. Revenue: Credit adds, Debit subtracts', () => {
    const { metrics, quality } = inspectAndCalculate([
      rec({ recordId: 'R1', amount: 150000, debitCredit: 'C' }),
      rec({ recordId: 'R2', amount: 10000, debitCredit: 'D' })
    ]);
    assert.equal(metrics.totalRevenue.value, 140000);
    assert.equal(metrics.totalRevenue.recordCount, 2);
    assert.equal(quality.revenueState, 'AVAILABLE');
  });

  it('2. Expenses: Debit adds, Credit subtracts', () => {
    const { metrics } = inspectAndCalculate([
      rec({ recordId: 'E1', accountType: 'EXPENSE', amount: 80000, debitCredit: 'D' }),
      rec({ recordId: 'E2', accountType: 'EXPENSE', amount: 5000, debitCredit: 'C' })
    ]);
    assert.equal(metrics.totalExpenses.value, 75000);
  });

  it('3. Net profit handles a net loss', () => {
    assert.equal(calculateNetProfit(50000, 80000).value, -30000);
  });

  it('4. Profit margin: zero denominator is flagged', () => {
    const m = calculateProfitMargin(-25000, 0);
    assert.equal(m.value, 0);
    assert.equal(m.isZeroDenominator, true);
    assert.equal(calculateProfitMargin(60000, 150000).value, 40);
  });

  it('5. Zero-vs-missing is explicit', () => {
    const none = inspectAndCalculate([]);
    assert.equal(none.quality.revenueState, 'MISSING_DATA');
    const zero = inspectAndCalculate([
      rec({ recordId: 'Z1', amount: 100, debitCredit: 'C' }),
      rec({ recordId: 'Z2', amount: 100, debitCredit: 'D' })
    ]);
    assert.equal(zero.quality.revenueState, 'ZERO_VALUE');
    assert.equal(evaluateDataState(5, 100), 'AVAILABLE');
  });

  it('6. Mixed currencies are refused; duplicate ids are reported', () => {
    assert.throws(
      () => inspectAndCalculate([rec({ recordId: 'A', currency: 'USD' }), rec({ recordId: 'B', currency: 'EUR' })]),
      (e: unknown) => e instanceof DataQualityError && e.code === 'MIXED_CURRENCIES'
    );
    const dup = inspectAndCalculate([rec({ recordId: 'D1', amount: 500 }), rec({ recordId: 'D1', amount: 500 })]);
    assert.equal(dup.quality.hasDuplicates, true);
    assert.deepEqual(dup.quality.duplicateIds, ['D1']);
    assert.equal(normalizeAndInspectRecords([rec({ recordId: 'X' })]).hasMixedCurrencies, false);
  });

  it('7. Golden: pipeline output is identical to the published synthetic figures', () => {
    const cases: Array<[keyof typeof EXPECTED_FINANCE_CALCULATIONS, string, string]> = [
      ['company1000_period01', '1000', '01'],
      ['company1000_period02', '1000', '02'],
      ['company2000_period01_zero_revenue', '2000', '01'],
      ['company2000_period02_net_loss', '2000', '02']
    ];
    for (const [key, company, period] of cases) {
      const viaPipeline = inspectAndCalculate(SYNTHETIC_FINANCE_RECORDS, company, period).metrics;
      const direct = calculateAllMetrics(SYNTHETIC_FINANCE_RECORDS, company, period);
      assert.deepEqual(viaPipeline, direct, `${key}: pipeline must not change any figure`);
      const exp = EXPECTED_FINANCE_CALCULATIONS[key] as Record<string, number>;
      assert.equal(viaPipeline.totalRevenue.value, exp['total_revenue']);
      assert.equal(viaPipeline.totalExpenses.value, exp['total_expenses']);
      assert.equal(viaPipeline.netProfit.value, exp['net_profit']);
      assert.equal(viaPipeline.profitMargin.value, exp['profit_margin']);
    }
  });
});
