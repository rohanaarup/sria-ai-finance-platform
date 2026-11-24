/**
 * Finance Calculations & Normalization Unit Tests
 * Phase 8 — Deterministic Finance Processing & DashboardSpec Compiler
 *
 * Verifies:
 *  1. Revenue calculation: Credit adds, Debit subtracts (returns).
 *  2. Expenses calculation: Debit adds, Credit subtracts (refunds).
 *  3. Net Profit: Revenue - Expenses (handles positive profit, break-even, net loss).
 *  4. Profit Margin: (Profit / Revenue) * 100 with zero denominator protection.
 *  5. Data availability states: AVAILABLE, ZERO_VALUE, and MISSING_DATA.
 *  6. Currency inspection detects mixed currencies without implicit conversion.
 *  7. Duplicate record detector flags duplicate recordIds.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { FinanceRecord } from '@sria/contracts';
import {
  calculateRevenue,
  calculateExpenses,
  calculateNetProfit,
  calculateProfitMargin
} from '../../../apps/cap/srv/finance/calculations/index.ts';
import {
  normalizeAndInspectRecords,
  evaluateDataState
} from '../../../apps/cap/srv/finance/normalization.ts';

// ─── Test Fixture Helpers ─────────────────────────────────────────────────────

function createRecord(overrides: Partial<FinanceRecord>): FinanceRecord {
  return {
    recordId: 'REC-TEST-001',
    companyCode: '1000',
    fiscalYear: 2026,
    fiscalPeriod: '01',
    postingDate: '2026-01-15',
    glAccount: '410000',
    accountType: 'REVENUE',
    amount: 100000,
    currency: 'USD',
    debitCredit: 'C',
    ...overrides
  };
}

// ─── Test Cases ───────────────────────────────────────────────────────────────

describe('Phase 8: Finance Calculations & Normalization', () => {
  it('1. Revenue calculation: Credit adds, Debit subtracts (returns)', () => {
    const records = [
      createRecord({ recordId: 'REC-1', amount: 150000, debitCredit: 'C' }), // +150000
      createRecord({ recordId: 'REC-2', amount: 10000, debitCredit: 'D' })   // -10000
    ];
    const result = calculateRevenue(records);
    assert.equal(result.value, 140000);
    assert.equal(result.recordCount, 2);
    assert.equal(result.dataState, 'AVAILABLE');
  });

  it('2. Expenses calculation: Debit adds, Credit subtracts (refunds)', () => {
    const records = [
      createRecord({ recordId: 'REC-3', accountType: 'EXPENSE', amount: 80000, debitCredit: 'D' }), // +80000
      createRecord({ recordId: 'REC-4', accountType: 'EXPENSE', amount: 5000, debitCredit: 'C' })   // -5000
    ];
    const result = calculateExpenses(records);
    assert.equal(result.value, 75000);
    assert.equal(result.recordCount, 2);
    assert.equal(result.dataState, 'AVAILABLE');
  });

  it('3. Net Profit: correctly handles net loss (expenses > revenue)', () => {
    const profit = calculateNetProfit(50000, 80000, 'USD', true);
    assert.equal(profit.value, -30000);
    assert.ok(profit.formattedValue.includes('30,000'));
    assert.equal(profit.dataState, 'AVAILABLE');
  });

  it('4. Profit Margin: zero denominator returns 0.00% with isZeroDenominator=true', () => {
    const margin = calculateProfitMargin(-25000, 0, true);
    assert.equal(margin.value, 0.00);
    assert.equal(margin.formattedValue, '0.00%');
    assert.equal(margin.isZeroDenominator, true);
    assert.equal(margin.dataState, 'ZERO_VALUE');
  });

  it('5. Profit Margin: normal calculation (60000 / 150000 * 100 = 40.00%)', () => {
    const margin = calculateProfitMargin(60000, 150000, true);
    assert.equal(margin.value, 40.00);
    assert.equal(margin.formattedValue, '40.00%');
    assert.equal(margin.isZeroDenominator, false);
  });

  it('6. Missing data vs Zero value distinction', () => {
    // 0 records = MISSING_DATA
    assert.equal(evaluateDataState(0, 0), 'MISSING_DATA');
    // Records exist, but balance is zero = ZERO_VALUE
    assert.equal(evaluateDataState(5, 0), 'ZERO_VALUE');
    // Records exist, non-zero = AVAILABLE
    assert.equal(evaluateDataState(5, 100), 'AVAILABLE');
  });

  it('7. Currency inspection detects mixed currencies without silent conversion', () => {
    const mixedRecords = [
      createRecord({ recordId: 'REC-A', currency: 'USD' }),
      createRecord({ recordId: 'REC-B', currency: 'EUR' })
    ];
    const summary = normalizeAndInspectRecords(mixedRecords);
    assert.equal(summary.hasMixedCurrencies, true);
    assert.deepEqual(summary.currenciesFound.sort(), ['EUR', 'USD']);
  });

  it('8. Duplicate record detector flags duplicate recordIds', () => {
    const dupRecords = [
      createRecord({ recordId: 'DUP-01', amount: 500 }),
      createRecord({ recordId: 'DUP-01', amount: 500 })
    ];
    const summary = normalizeAndInspectRecords(dupRecords);
    assert.equal(summary.hasDuplicates, true);
    assert.deepEqual(summary.duplicateIds, ['DUP-01']);
  });
});
