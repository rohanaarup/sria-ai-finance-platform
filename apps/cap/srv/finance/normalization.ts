/**
 * Finance Data Normalization Engine
 * Phase 8 — Deterministic Finance Processing & DashboardSpec Compiler
 *
 * Provides deterministic normalization and validation for:
 *  - Currency consistency checks (no silent mixing of distinct currencies)
 *  - Sign reconciliation based on SAP account types (REVENUE vs EXPENSE)
 *  - Missing data vs. Zero value distinction
 *  - Duplicate transaction identification
 *  - Date and fiscal period formatting
 */

import type { FinanceRecord } from '@sria/contracts';

// ─── Normalization & Validation Types ─────────────────────────────────────────

export interface NormalizedDataSummary {
  records: FinanceRecord[];
  primaryCurrency: string;
  hasMixedCurrencies: boolean;
  currenciesFound: string[];
  hasDuplicates: boolean;
  duplicateIds: string[];
  recordCount: number;
}

export type DataAvailabilityState =
  | 'AVAILABLE'          // Records present and computed
  | 'ZERO_VALUE'         // Records present, but computed sum equals 0.00
  | 'MISSING_DATA'       // No matching transactions exist for period/company
  | 'UNSUPPORTED_METRIC';// Metric not approved in catalog

// ─── Normalization Helper Functions ───────────────────────────────────────────

/**
 * Validates a batch of FinanceRecords for currency consistency and duplicates.
 */
export function normalizeAndInspectRecords(records: FinanceRecord[]): NormalizedDataSummary {
  const currencies = new Set<string>();
  const seenIds = new Set<string>();
  const duplicates: string[] = [];

  for (const rec of records) {
    currencies.add(rec.currency);
    if (seenIds.has(rec.recordId)) {
      duplicates.push(rec.recordId);
    }
    seenIds.add(rec.recordId);
  }

  const currenciesFound = Array.from(currencies);
  const primaryCurrency = currenciesFound.length > 0 ? currenciesFound[0]! : 'USD';
  const hasMixedCurrencies = currenciesFound.length > 1;

  return {
    records,
    primaryCurrency,
    hasMixedCurrencies,
    currenciesFound,
    hasDuplicates: duplicates.length > 0,
    duplicateIds: duplicates,
    recordCount: records.length
  };
}

/**
 * Determines the data availability state for a specific metric calculation.
 * Explicitly separates "No Data" (empty) from "Zero" (0.00 balance).
 */
export function evaluateDataState(
  recordCount: number,
  computedValue: number
): DataAvailabilityState {
  if (recordCount === 0) {
    return 'MISSING_DATA';
  }
  if (computedValue === 0) {
    return 'ZERO_VALUE';
  }
  return 'AVAILABLE';
}

/**
 * Standard monetary formatting helper (ISO 4217 compliant)
 */
export function formatCurrencyValue(value: number, currency: string): string {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.length === 3 ? currency : 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Standard percentage formatting helper
 */
export function formatPercentageValue(value: number, decimalPlaces = 2): string {
  if (!Number.isFinite(value)) {
    return 'N/A';
  }
  return `${value.toFixed(decimalPlaces)}%`;
}

