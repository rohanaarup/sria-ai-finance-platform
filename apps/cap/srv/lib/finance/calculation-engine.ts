/**
 * CalculationEngine
 * Phase 5 — SAP Finance Data Access & Source Adapter
 *
 * All finance metric calculations are DETERMINISTIC TypeScript code.
 * The LLM never performs arithmetic on financial data.
 *
 * SIGN CONVENTIONS (UNCONFIRMED — pending Finance Reviewer approval):
 *  Revenue  : Credit ('C') entries contribute positively.
 *             Debit  ('D') entries on REVENUE accounts = returns/deductions → subtract.
 *  Expenses : Debit  ('D') entries contribute positively.
 *             Credit ('C') entries on EXPENSE accounts = refunds            → subtract.
 *
 * Zero-denominator protection:
 *  profit_margin returns 0.00 with isZeroDenominator=true when total_revenue === 0.
 *
 * All monetary values are rounded to 2 decimal places (ROUND_HALF_EVEN not available
 * in native JS; we use Math.round(x * 100) / 100 — acceptable for MVP with single
 * currency. Multi-currency requires a confirmed conversion table from Finance team).
 */

import type { FinanceRecord } from '@sria/contracts';

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface RevenueResult {
  value: number;
  currency: string;
  recordCount: number;
}

export interface ExpensesResult {
  value: number;
  currency: string;
  recordCount: number;
}

export interface NetProfitResult {
  value: number;
}

export interface ProfitMarginResult {
  value: number;        // Percentage, e.g. 40.00 means 40%
  isZeroDenominator: boolean;
}

// ─── Filter Helper ────────────────────────────────────────────────────────────

function applyFilters(
  records: FinanceRecord[],
  companyCode?: string,
  fiscalPeriod?: string
): FinanceRecord[] {
  return records.filter((r) => {
    if (companyCode !== undefined && r.companyCode !== companyCode) return false;
    if (fiscalPeriod !== undefined && r.fiscalPeriod !== fiscalPeriod) return false;
    return true;
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── Public Calculation Functions ─────────────────────────────────────────────

/**
 * calculateTotalRevenue
 *
 * Sums REVENUE account records:
 *   Credit ('C') = positive contribution
 *   Debit  ('D') = negative contribution (revenue return/deduction)
 *
 * SIGN CONVENTION: UNCONFIRMED — see docs/domain/SAP-FIELD-MAPPING.md
 *
 * @param records   - Filtered FinanceRecord[] from provider (TRANSIENT — not stored)
 * @param companyCode  - Optional additional company-code filter
 * @param fiscalPeriod - Optional additional period filter
 */
export function calculateTotalRevenue(
  records: FinanceRecord[],
  companyCode?: string,
  fiscalPeriod?: string
): RevenueResult {
  const filtered = applyFilters(records, companyCode, fiscalPeriod)
    .filter((r) => r.accountType === 'REVENUE');

  if (filtered.length === 0) {
    return { value: 0, currency: 'USD', recordCount: 0 };
  }

  const currency = filtered[0]!.currency;
  let total = 0;
  for (const rec of filtered) {
    if (rec.debitCredit === 'C') {
      total += rec.amount;
    } else {
      total -= rec.amount; // Revenue return: Debit reduces revenue
    }
  }

  return { value: round2(total), currency, recordCount: filtered.length };
}

/**
 * calculateTotalExpenses
 *
 * Sums EXPENSE account records:
 *   Debit  ('D') = positive contribution (normal expense posting)
 *   Credit ('C') = negative contribution (expense refund/reversal)
 *
 * SIGN CONVENTION: UNCONFIRMED — see docs/domain/SAP-FIELD-MAPPING.md
 *
 * @param records   - Filtered FinanceRecord[] from provider (TRANSIENT — not stored)
 * @param companyCode  - Optional additional company-code filter
 * @param fiscalPeriod - Optional additional period filter
 */
export function calculateTotalExpenses(
  records: FinanceRecord[],
  companyCode?: string,
  fiscalPeriod?: string
): ExpensesResult {
  const filtered = applyFilters(records, companyCode, fiscalPeriod)
    .filter((r) => r.accountType === 'EXPENSE');

  if (filtered.length === 0) {
    return { value: 0, currency: 'USD', recordCount: 0 };
  }

  const currency = filtered[0]!.currency;
  let total = 0;
  for (const rec of filtered) {
    if (rec.debitCredit === 'D') {
      total += rec.amount;
    } else {
      total -= rec.amount; // Expense refund: Credit reduces expenses
    }
  }

  return { value: round2(total), currency, recordCount: filtered.length };
}

/**
 * calculateNetProfit
 *
 * Net Profit = Total Revenue − Total Expenses
 * Result can be negative (operating loss).
 *
 * @param revenue  - Output of calculateTotalRevenue().value
 * @param expenses - Output of calculateTotalExpenses().value
 */
export function calculateNetProfit(revenue: number, expenses: number): NetProfitResult {
  return { value: round2(revenue - expenses) };
}

/**
 * calculateProfitMargin
 *
 * Profit Margin % = (Net Profit / Total Revenue) × 100
 *
 * Zero-denominator protection:
 *   When total_revenue === 0, returns { value: 0.00, isZeroDenominator: true }
 *   This is NOT a division error — it is a valid business state (no revenue recorded).
 *
 * @param netProfit - Output of calculateNetProfit().value
 * @param revenue   - Output of calculateTotalRevenue().value
 */
export function calculateProfitMargin(
  netProfit: number,
  revenue: number
): ProfitMarginResult {
  if (revenue === 0) {
    return { value: 0.00, isZeroDenominator: true };
  }
  return { value: round2((netProfit / revenue) * 100), isZeroDenominator: false };
}

// ─── Composite Helper ─────────────────────────────────────────────────────────

export interface AllMetricsResult {
  totalRevenue: RevenueResult;
  totalExpenses: ExpensesResult;
  netProfit: NetProfitResult;
  profitMargin: ProfitMarginResult;
}

/**
 * calculateAllMetrics
 *
 * Convenience function that computes all four approved metrics in one pass.
 * Used by the FinanceDataService handler.
 *
 * @param records      - FinanceRecord[] from the provider (TRANSIENT — not stored)
 * @param companyCode  - Optional additional company-code filter
 * @param fiscalPeriod - Optional additional period filter
 */
export function calculateAllMetrics(
  records: FinanceRecord[],
  companyCode?: string,
  fiscalPeriod?: string
): AllMetricsResult {
  const totalRevenue = calculateTotalRevenue(records, companyCode, fiscalPeriod);
  const totalExpenses = calculateTotalExpenses(records, companyCode, fiscalPeriod);
  const netProfit = calculateNetProfit(totalRevenue.value, totalExpenses.value);
  const profitMargin = calculateProfitMargin(netProfit.value, totalRevenue.value);

  return { totalRevenue, totalExpenses, netProfit, profitMargin };
}

export const CalculationEngine = {
  calculateTotalRevenue,
  calculateTotalExpenses,
  calculateNetProfit,
  calculateProfitMargin,
  calculateAllMetrics
};

