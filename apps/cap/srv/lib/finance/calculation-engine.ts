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
 * All arithmetic uses Decimal (decimal.js, see decimal.ts / ADR-013); values are rounded
 * once to 2 decimal places with ROUND_HALF_UP. Multi-currency requires a confirmed
 * conversion table from the Finance team and is refused until then.
 *
 * G2-01: this is the legacy path used only when SEMANTIC_LAYER=off; the default path is
 * srv/semantic/evaluate.ts, which reads formulas from the semantic layer.
 */

import type { FinanceRecord } from '@sria/contracts';
import { Dec, ZERO, dec, roundTo, toApiNumber } from './decimal.ts';
import { normalizeAndInspectRecords, evaluateDataState } from '../../finance/normalization.ts';
import type { DataAvailabilityState } from '../../finance/normalization.ts';

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

/** Round a decimal to 2 places (ROUND_HALF_UP) and cross the API boundary as a number. */
function round2(value: Dec): number {
  return toApiNumber(roundTo(value, 2));
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
  let total: Dec = ZERO;
  for (const rec of filtered) {
    // Credit adds; Debit (revenue return) reduces revenue. Decimal arithmetic only.
    total = rec.debitCredit === 'C' ? total.plus(dec(rec.amount)) : total.minus(dec(rec.amount));
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
  let total: Dec = ZERO;
  for (const rec of filtered) {
    // Debit adds; Credit (refund/reversal) reduces expenses. Decimal arithmetic only.
    total = rec.debitCredit === 'D' ? total.plus(dec(rec.amount)) : total.minus(dec(rec.amount));
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
  return { value: round2(dec(revenue).minus(dec(expenses))) };
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
  const rev = dec(revenue);
  if (rev.isZero()) {
    return { value: 0, isZeroDenominator: true };
  }
  return { value: round2(dec(netProfit).dividedBy(rev).times(100)), isZeroDenominator: false };
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

// ─── The single production pipeline: inspect → calculate ─────────────────────

export class DataQualityError extends Error {
  readonly code: 'MIXED_CURRENCIES';
  constructor(code: 'MIXED_CURRENCIES', message: string) {
    super(message);
    this.name = 'DataQualityError';
    this.code = code;
  }
}

export interface DataQualityReport {
  currency: string;
  recordCount: number;
  hasDuplicates: boolean;
  duplicateIds: string[];
  revenueState: DataAvailabilityState;
  expensesState: DataAvailabilityState;
}

/**
 * inspectAndCalculate — THE runtime calculation pipeline (G2-00, finding F-04).
 *
 * 1. Normalization checks on the records in scope: currencies must not be mixed
 *    (there is no confirmed conversion table, so mixing is refused, never silently summed);
 *    duplicate recordIds are reported.
 * 2. Deterministic formulas (same functions as above).
 * 3. Zero-vs-missing is made explicit per metric, so "no data" is never shown as 0.00.
 *
 * Every production caller (FinanceDataService, get_finance_metrics tool) uses this function.
 */
export function inspectAndCalculate(
  records: FinanceRecord[],
  companyCode?: string,
  fiscalPeriod?: string
): { metrics: AllMetricsResult; quality: DataQualityReport } {
  const inScope = applyFilters(records, companyCode, fiscalPeriod);
  const summary = normalizeAndInspectRecords(inScope);
  if (summary.hasMixedCurrencies) {
    throw new DataQualityError(
      'MIXED_CURRENCIES',
      `Records contain more than one currency (${summary.currenciesFound.join(', ')}); no conversion table is configured, so the figures are not calculated.`
    );
  }
  const metrics = calculateAllMetrics(records, companyCode, fiscalPeriod);
  return {
    metrics,
    quality: {
      currency: summary.primaryCurrency,
      recordCount: summary.recordCount,
      hasDuplicates: summary.hasDuplicates,
      duplicateIds: summary.duplicateIds,
      revenueState: evaluateDataState(metrics.totalRevenue.recordCount, metrics.totalRevenue.value),
      expensesState: evaluateDataState(metrics.totalExpenses.recordCount, metrics.totalExpenses.value)
    }
  };
}

export const CalculationEngine = {
  inspectAndCalculate,
  calculateTotalRevenue,
  calculateTotalExpenses,
  calculateNetProfit,
  calculateProfitMargin,
  calculateAllMetrics
};

