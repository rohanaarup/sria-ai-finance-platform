/**
 * Row mapper: raw SAP journal-entry-item row → FinanceRecord (G2-03).
 *
 * Every raw row is validated with Zod BEFORE normalisation; a row that does not fit is a
 * MALFORMED error for the whole page (we never guess or drop money silently).
 *
 * CANDIDATE field names (from docs/domain/SAP-FIELD-MAPPING.md) — UNCONFIRMED until compared with
 * the real system's `$metadata`. Facts about SAP encoded here:
 *  - DebitCreditCode is 'S' (debit, German "Soll") or 'H' (credit, "Haben"); 'D'/'C' are accepted too.
 *  - Periods are 3 digits ("001"); GL accounts are zero-padded ("0000410000").
 *  - OData v2 dates arrive as "/Date(1767225600000)/"; v4 as ISO.
 *  - Whether the amount is absolute (with the indicator) or signed is a SYSTEM-SPECIFIC question
 *    (S4_AMOUNT_CONVENTION). It must be confirmed by reconciliation with Finance.
 *  - Revenue vs expense is decided by account ranges (S4_REVENUE_ACCOUNTS / S4_EXPENSE_ACCOUNTS):
 *    a customer's chart of accounts decides this, so it is configuration, not code.
 */
import { z } from 'zod';
import type { FinanceRecord } from '@sria/contracts';
import { AdapterError } from '../adapter-contract.ts';
import { Dec, dec } from '../../finance/decimal.ts';

/** Fields the adapter reads. Each must exist in the real system's metadata (checked at runtime). */
export const SELECTED_FIELDS = [
  'CompanyCode', 'FiscalYear', 'FiscalPeriod', 'PostingDate', 'GLAccount', 'AmountInCompanyCodeCurrency',
  'CompanyCodeCurrency', 'DebitCreditCode', 'AccountingDocument', 'LedgerGLLineItem', 'Ledger', 'Segment'
] as const;
export type SelectedField = (typeof SELECTED_FIELDS)[number];

const decimalString = z.union([z.string(), z.number()]).transform((v) => String(v).trim()).refine((v) => /^-?\d+(\.\d+)?$/.test(v), 'not a decimal');

export const RawJournalItemSchema = z.object({
  CompanyCode: z.string().min(1).max(10),
  FiscalYear: z.string().regex(/^\d{4}$/),
  FiscalPeriod: z.string().regex(/^\d{1,3}$/),
  PostingDate: z.string().min(1),
  GLAccount: z.string().regex(/^\d{1,10}$/),
  AmountInCompanyCodeCurrency: decimalString,
  CompanyCodeCurrency: z.string().length(3),
  DebitCreditCode: z.enum(['S', 'H', 'D', 'C']),
  AccountingDocument: z.string().min(1),
  LedgerGLLineItem: z.string().min(1),
  Ledger: z.string().min(1).default('0L'),
  Segment: z.string().max(40).optional().nullable()
}).passthrough();
export type RawJournalItem = z.infer<typeof RawJournalItemSchema>;

export interface MapperConfig {
  amountConvention: 'INDICATOR' | 'SIGNED_DEBIT_POSITIVE';
  revenueAccounts: string; // "400000-499999,800000-809999"
  expenseAccounts: string;
}

const parseRanges = (spec: string) => spec.split(',').map((r) => { const [a, b] = r.split('-').map(Number); return [a!, b!] as const; });

export function classifyAccount(glAccount: string, cfg: Pick<MapperConfig, 'revenueAccounts' | 'expenseAccounts'>): 'REVENUE' | 'EXPENSE' | 'OTHER' {
  const n = Number(glAccount);
  if (parseRanges(cfg.revenueAccounts).some(([a, b]) => n >= a && n <= b)) return 'REVENUE';
  if (parseRanges(cfg.expenseAccounts).some(([a, b]) => n >= a && n <= b)) return 'EXPENSE';
  return 'OTHER';
}

/** "/Date(1767225600000)/" or ISO → YYYY-MM-DD (UTC). */
export function parseODataDate(v: string): string {
  const ms = /^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/.exec(v);
  if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  throw new AdapterError('MALFORMED', `Unrecognised date format in a posting.`);
}

export function mapRow(raw: unknown, cfg: MapperConfig): FinanceRecord {
  const parsed = RawJournalItemSchema.safeParse(raw);
  if (!parsed.success) {
    // Names of failing fields only: never echo values (they may be financial data).
    throw new AdapterError('MALFORMED', `SAP returned a row that does not match the expected shape (fields: ${[...new Set(parsed.error.issues.map((i) => i.path.join('.') || '(row)'))].join(', ')}).`);
  }
  const r = parsed.data;
  const period = r.FiscalPeriod.padStart(3, '0').slice(-2);
  if (Number(r.FiscalPeriod) < 1 || Number(r.FiscalPeriod) > 16) throw new AdapterError('MALFORMED', 'A posting has a fiscal period outside 1–16.');

  const indicatorIsDebit = r.DebitCreditCode === 'S' || r.DebitCreditCode === 'D';
  let amount: Dec = dec(r.AmountInCompanyCodeCurrency);
  let debit = indicatorIsDebit;
  if (cfg.amountConvention === 'SIGNED_DEBIT_POSITIVE') {
    // The sign carries the direction; the indicator must agree, otherwise the convention is wrong for this system.
    const signedDebit = !amount.isNegative();
    if (signedDebit !== indicatorIsDebit && !amount.isZero()) {
      throw new AdapterError('MALFORMED', 'A posting\'s amount sign contradicts its debit/credit indicator: the amount convention (S4_AMOUNT_CONVENTION) does not match this system.');
    }
    amount = amount.abs();
    debit = indicatorIsDebit;
  } else if (amount.isNegative()) {
    throw new AdapterError('MALFORMED', 'A posting has a negative amount while the amount convention is INDICATOR (absolute amounts); check S4_AMOUNT_CONVENTION against the system.');
  }

  const gl = r.GLAccount.padStart(10, '0');
  return {
    recordId: `${r.CompanyCode}-${r.FiscalYear}-${r.Ledger}-${r.AccountingDocument}-${r.LedgerGLLineItem}`,
    companyCode: r.CompanyCode,
    fiscalYear: Number(r.FiscalYear),
    fiscalPeriod: period,
    postingDate: parseODataDate(r.PostingDate),
    glAccount: gl,
    accountType: classifyAccount(gl, cfg),
    amount: amount.toNumber(),
    currency: r.CompanyCodeCurrency,
    debitCredit: debit ? 'D' : 'C',
    ...(r.Segment ? { businessUnit: r.Segment } : {})
  };
}
