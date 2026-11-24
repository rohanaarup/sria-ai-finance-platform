/**
 * Deterministic Expenses Calculator
 * Phase 8 — Deterministic Finance Processing & DashboardSpec Compiler
 *
 * Form: SUM(Debit - Credit) for EXPENSE account types
 * Sign Convention: Debit is positive addition; Credit is deduction (refunds)
 */

import type { FinanceRecord } from '@sria/contracts';
import { evaluateDataState } from '../normalization.ts';
import type { DataAvailabilityState } from '../normalization.ts';

export interface ExpensesCalculationOutput {
  metricId: 'total_expenses';
  label: 'Total Expenses';
  value: number;
  formattedValue: string;
  currency: string;
  recordCount: number;
  dataState: DataAvailabilityState;
}

export function calculateExpenses(
  records: FinanceRecord[],
  companyCode?: string,
  fiscalPeriod?: string
): ExpensesCalculationOutput {
  const filtered = records.filter((r) => {
    if (r.accountType !== 'EXPENSE') return false;
    if (companyCode && r.companyCode !== companyCode) return false;
    if (fiscalPeriod && r.fiscalPeriod !== fiscalPeriod) return false;
    return true;
  });

  const currency = filtered.length > 0 ? filtered[0]!.currency : 'USD';

  if (filtered.length === 0) {
    return {
      metricId: 'total_expenses',
      label: 'Total Expenses',
      value: 0,
      formattedValue: '$0.00',
      currency,
      recordCount: 0,
      dataState: evaluateDataState(0, 0)
    };
  }

  let total = 0;
  for (const rec of filtered) {
    if (rec.debitCredit === 'D') {
      total += rec.amount;
    } else {
      total -= rec.amount; // Credit reduces incurred expenses (refunds)
    }
  }

  const rounded = Math.round(total * 100) / 100;
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(rounded);

  return {
    metricId: 'total_expenses',
    label: 'Total Expenses',
    value: rounded,
    formattedValue: formatted,
    currency,
    recordCount: filtered.length,
    dataState: evaluateDataState(filtered.length, rounded)
  };
}

