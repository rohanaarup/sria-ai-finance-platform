/**
 * calculation-engine.test.ts
 * Phase 5 — Tests for the deterministic CalculationEngine
 *
 * Verifies:
 *  1. All 4 metric formulas with explicit inputs
 *  2. Revenue sign conventions (Credit positive, Debit reduces)
 *  3. Expenses sign conventions (Debit positive, Credit reduces)
 *  4. Zero denominator protection for profit margin
 *  5. Negative net profit (operating loss) → negative profit margin
 *  6. Empty records → all zeros, no crash
 *  7. Round-trip with full SYNTHETIC_FINANCE_RECORDS matches golden fixtures
 *  8. companyCode/fiscalPeriod filter isolation
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { FinanceRecord } from '@sria/contracts';
import { EXPECTED_FINANCE_CALCULATIONS, SYNTHETIC_FINANCE_RECORDS } from '@sria/contracts';
import {
  calculateTotalRevenue,
  calculateTotalExpenses,
  calculateNetProfit,
  calculateProfitMargin,
  calculateAllMetrics
} from '../srv/lib/finance/calculation-engine.ts';

// ─── Minimal fixture builders ─────────────────────────────────────────────────

function makeRevRecord(amount: number, debitCredit: 'D' | 'C'): FinanceRecord {
  return {
    recordId: `TEST-REV-${debitCredit}-${amount}`,
    companyCode: '9999',
    fiscalYear: 2026,
    fiscalPeriod: '01',
    postingDate: '2026-01-01',
    glAccount: '410000',
    accountType: 'REVENUE',
    amount,
    currency: 'USD',
    debitCredit
  };
}

function makeExpRecord(amount: number, debitCredit: 'D' | 'C'): FinanceRecord {
  return {
    recordId: `TEST-EXP-${debitCredit}-${amount}`,
    companyCode: '9999',
    fiscalYear: 2026,
    fiscalPeriod: '01',
    postingDate: '2026-01-01',
    glAccount: '510000',
    accountType: 'EXPENSE',
    amount,
    currency: 'USD',
    debitCredit
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CalculationEngine — calculateTotalRevenue', () => {
  it('Credit adds to revenue, Debit subtracts from revenue', () => {
    const records = [
      makeRevRecord(100000, 'C'), // +100000
      makeRevRecord(10000, 'D')   // -10000
    ];
    const result = calculateTotalRevenue(records);
    assert.equal(result.value, 90000);
    assert.equal(result.recordCount, 2);
  });

  it('Only Credit entries: sum all', () => {
    const records = [makeRevRecord(50000, 'C'), makeRevRecord(75000, 'C')];
    const result = calculateTotalRevenue(records);
    assert.equal(result.value, 125000);
  });

  it('Only Debit entries: result is negative (all returns)', () => {
    const records = [makeRevRecord(20000, 'D')];
    const result = calculateTotalRevenue(records);
    assert.equal(result.value, -20000);
  });

  it('Empty records: returns 0, recordCount 0', () => {
    const result = calculateTotalRevenue([]);
    assert.equal(result.value, 0);
    assert.equal(result.recordCount, 0);
  });

  it('Ignores EXPENSE records', () => {
    const records = [makeRevRecord(50000, 'C'), makeExpRecord(99999, 'D')];
    const result = calculateTotalRevenue(records);
    assert.equal(result.value, 50000);
    assert.equal(result.recordCount, 1);
  });

  it('Rounds to 2 decimal places', () => {
    const records = [makeRevRecord(100.005, 'C')];
    const result = calculateTotalRevenue(records);
    // Math.round(100.005 * 100) / 100 = 100.01
    assert.equal(result.value, 100.01);
  });
});

describe('CalculationEngine — calculateTotalExpenses', () => {
  it('Debit adds to expenses, Credit subtracts from expenses (refund)', () => {
    const records = [
      makeExpRecord(60000, 'D'), // +60000
      makeExpRecord(5000, 'C')   // -5000  (refund)
    ];
    const result = calculateTotalExpenses(records);
    assert.equal(result.value, 55000);
  });

  it('Empty records: returns 0', () => {
    const result = calculateTotalExpenses([]);
    assert.equal(result.value, 0);
    assert.equal(result.recordCount, 0);
  });

  it('Ignores REVENUE records', () => {
    const records = [makeExpRecord(30000, 'D'), makeRevRecord(99999, 'C')];
    const result = calculateTotalExpenses(records);
    assert.equal(result.value, 30000);
    assert.equal(result.recordCount, 1);
  });
});

describe('CalculationEngine — calculateNetProfit', () => {
  it('Profit: revenue > expenses', () => {
    const result = calculateNetProfit(150000, 90000);
    assert.equal(result.value, 60000);
  });

  it('Break-even: revenue === expenses', () => {
    const result = calculateNetProfit(100000, 100000);
    assert.equal(result.value, 0);
  });

  it('Loss: expenses > revenue', () => {
    const result = calculateNetProfit(50000, 75000);
    assert.equal(result.value, -25000);
  });

  it('Zero inputs: returns 0', () => {
    const result = calculateNetProfit(0, 0);
    assert.equal(result.value, 0);
  });
});

describe('CalculationEngine — calculateProfitMargin', () => {
  it('40% margin: 60000 / 150000 * 100', () => {
    const result = calculateProfitMargin(60000, 150000);
    assert.equal(result.value, 40.00);
    assert.equal(result.isZeroDenominator, false);
  });

  it('30% margin: 60000 / 200000 * 100', () => {
    const result = calculateProfitMargin(60000, 200000);
    assert.equal(result.value, 30.00);
  });

  it('Negative margin (operating loss): -25000 / 50000 * 100 = -50%', () => {
    const result = calculateProfitMargin(-25000, 50000);
    assert.equal(result.value, -50.00);
    assert.equal(result.isZeroDenominator, false);
  });

  it('Zero denominator: returns 0.00 with isZeroDenominator=true', () => {
    const result = calculateProfitMargin(-25000, 0);
    assert.equal(result.value, 0.00);
    assert.equal(result.isZeroDenominator, true);
  });

  it('Zero denominator with zero net profit: returns 0.00 with isZeroDenominator=true', () => {
    const result = calculateProfitMargin(0, 0);
    assert.equal(result.value, 0.00);
    assert.equal(result.isZeroDenominator, true);
  });
});

describe('CalculationEngine — calculateAllMetrics with SYNTHETIC_FINANCE_RECORDS', () => {
  it('golden fixture: company 1000, period 01', () => {
    const expected = EXPECTED_FINANCE_CALCULATIONS.company1000_period01;
    const result = calculateAllMetrics(SYNTHETIC_FINANCE_RECORDS, '1000', '01');
    assert.equal(result.totalRevenue.value, expected.total_revenue);
    assert.equal(result.totalExpenses.value, expected.total_expenses);
    assert.equal(result.netProfit.value, expected.net_profit);
    assert.equal(result.profitMargin.value, expected.profit_margin);
    assert.equal(result.profitMargin.isZeroDenominator, false);
  });

  it('golden fixture: company 1000, period 02', () => {
    const expected = EXPECTED_FINANCE_CALCULATIONS.company1000_period02;
    const result = calculateAllMetrics(SYNTHETIC_FINANCE_RECORDS, '1000', '02');
    assert.equal(result.totalRevenue.value, expected.total_revenue);
    assert.equal(result.totalExpenses.value, expected.total_expenses);
    assert.equal(result.netProfit.value, expected.net_profit);
    assert.equal(result.profitMargin.value, expected.profit_margin);
  });

  it('golden fixture: company 2000, period 01 (zero revenue → isZeroDenominator)', () => {
    const expected = EXPECTED_FINANCE_CALCULATIONS.company2000_period01_zero_revenue;
    const result = calculateAllMetrics(SYNTHETIC_FINANCE_RECORDS, '2000', '01');
    assert.equal(result.totalRevenue.value, expected.total_revenue);
    assert.equal(result.totalExpenses.value, expected.total_expenses);
    assert.equal(result.netProfit.value, expected.net_profit);
    assert.equal(result.profitMargin.value, expected.profit_margin);
    assert.equal(result.profitMargin.isZeroDenominator, true);
  });

  it('golden fixture: company 2000, period 02 (operating loss → negative margin)', () => {
    const expected = EXPECTED_FINANCE_CALCULATIONS.company2000_period02_net_loss;
    const result = calculateAllMetrics(SYNTHETIC_FINANCE_RECORDS, '2000', '02');
    assert.equal(result.totalRevenue.value, expected.total_revenue);
    assert.equal(result.totalExpenses.value, expected.total_expenses);
    assert.equal(result.netProfit.value, expected.net_profit);
    assert.equal(result.profitMargin.value, expected.profit_margin);
    assert.equal(result.profitMargin.isZeroDenominator, false);
  });

  it('companyCode isolation: company 1000 results not affected by company 2000 records', () => {
    const result1000 = calculateAllMetrics(SYNTHETIC_FINANCE_RECORDS, '1000', '01');
    const result2000 = calculateAllMetrics(SYNTHETIC_FINANCE_RECORDS, '2000', '01');
    // Company 2000 period 01 has zero revenue; must not bleed into 1000
    assert.ok(result1000.totalRevenue.value > 0, 'Company 1000 should have positive revenue');
    assert.equal(result2000.totalRevenue.value, 0, 'Company 2000 period 01 has no revenue');
  });

  it('no filters: sums all records across all companies and periods', () => {
    const result = calculateAllMetrics(SYNTHETIC_FINANCE_RECORDS);
    // Should include all records — revenue: 160000-10000+200000+50000=400000
    // expenses: 60000+30000+80000+60000+25000+75000=330000
    assert.equal(result.totalRevenue.value, 400000);
    assert.equal(result.totalExpenses.value, 330000);
    assert.equal(result.netProfit.value, 70000);
  });
});
