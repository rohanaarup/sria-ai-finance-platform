/**
 * Deterministic Revenue Calculator
 * Phase 8 — Deterministic Finance Processing & DashboardSpec Compiler
 *
 * Form: SUM(Credit - Debit) for REVENUE account types
 * Sign Convention: Credit is positive addition; Debit is deduction (returns)
 */

import type { FinanceRecord } from '@sria/contracts';
import { evaluateDataState } from '../normalization.ts';
import type { DataAvailabilityState } from '../normalization.ts';

export interface RevenueCalculationOutput {
  metricId: 'total_revenue';
  label: 'Total Revenue';
  value: number;
  formattedValue: string;
  currency: string;
  recordCount: number;
  dataState: DataAvailabilityState;
}

export function calculateRevenue(
  records: FinanceRecord[],
  companyCode?: string,
  fiscalPeriod?: string
): RevenueCalculationOutput {
  const filtered = records.filter((r) => {
    if (r.accountType !== 'REVENUE') return false;
    if (companyCode && r.companyCode !== companyCode) return false;
    if (fiscalPeriod && r.fiscalPeriod !== fiscalPeriod) return false;
    return true;
  });

  const currency = filtered.length > 0 ? filtered[0]!.currency : 'USD';

  if (filtered.length === 0) {
    return {
      metricId: 'total_revenue',
      label: 'Total Revenue',
      value: 0,
      formattedValue: '$0.00',
      currency,
      recordCount: 0,
      dataState: evaluateDataState(0, 0)
    };
  }

  let total = 0;
  for (const rec of filtered) {
    if (rec.debitCredit === 'C') {
      total += rec.amount;
    } else {
      total -= rec.amount; // Debit reduces recognized revenue
    }
  }

  const rounded = Math.round(total * 100) / 100;
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(rounded);

  return {
    metricId: 'total_revenue',
    label: 'Total Revenue',
    value: rounded,
    formattedValue: formatted,
    currency,
    recordCount: filtered.length,
    dataState: evaluateDataState(filtered.length, rounded)
  };
}

