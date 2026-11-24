/**
 * Deterministic Profit & Margin Calculators
 * Phase 8 — Deterministic Finance Processing & DashboardSpec Compiler
 *
 * Net Profit   = total_revenue - total_expenses
 * Profit Margin = (net_profit / total_revenue) * 100 (zero denominator protected)
 */

import { evaluateDataState } from '../normalization.ts';
import type { DataAvailabilityState } from '../normalization.ts';

export interface ProfitCalculationOutput {
  metricId: 'net_profit';
  label: 'Net Profit';
  value: number;
  formattedValue: string;
  currency: string;
  dataState: DataAvailabilityState;
}

export interface MarginCalculationOutput {
  metricId: 'profit_margin';
  label: 'Profit Margin (%)';
  value: number;
  formattedValue: string;
  currency: 'PCT';
  isZeroDenominator: boolean;
  dataState: DataAvailabilityState;
}

export function calculateNetProfit(
  revenueValue: number,
  expensesValue: number,
  currency = 'USD',
  hasSourceRecords = true
): ProfitCalculationOutput {
  const value = Math.round((revenueValue - expensesValue) * 100) / 100;
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);

  return {
    metricId: 'net_profit',
    label: 'Net Profit',
    value,
    formattedValue: formatted,
    currency,
    dataState: evaluateDataState(hasSourceRecords ? 1 : 0, value)
  };
}

export function calculateProfitMargin(
  netProfitValue: number,
  revenueValue: number,
  hasSourceRecords = true
): MarginCalculationOutput {
  if (revenueValue === 0) {
    return {
      metricId: 'profit_margin',
      label: 'Profit Margin (%)',
      value: 0.00,
      formattedValue: '0.00%',
      currency: 'PCT',
      isZeroDenominator: true,
      dataState: evaluateDataState(hasSourceRecords ? 1 : 0, 0)
    };
  }

  const rawMargin = (netProfitValue / revenueValue) * 100;
  const rounded = Math.round(rawMargin * 100) / 100;

  return {
    metricId: 'profit_margin',
    label: 'Profit Margin (%)',
    value: rounded,
    formattedValue: `${rounded.toFixed(2)}%`,
    currency: 'PCT',
    isZeroDenominator: false,
    dataState: evaluateDataState(hasSourceRecords ? 1 : 0, rounded)
  };
}
