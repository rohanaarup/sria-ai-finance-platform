/**
 * Synthetic finance fixtures v2 (G2-02).
 *
 * Superset of v1: every v1 record is included unchanged (company 1000/2000, FY2026, P01–P02),
 * so v1 golden figures still hold. Added, using simple hand-checkable patterns:
 *   - 1000 and 2000, FY2025 P01–P12 (USD)
 *   - 3000 "Europe" in EUR, FY2025 and FY2026 P01–P12 (24 periods, the non-USD entity)
 *   - 4000 "Defect fixture", FY2026 P01–P06: deliberate, labelled data-quality defects
 * All amounts are synthetic. Nothing here describes a real company.
 */
import type { FinanceRecord } from '../metric-result.js';
import { SYNTHETIC_FINANCE_RECORDS } from './synthetic-fixtures.js';

export const SYNTHETIC_V2_LABEL = 'SAP_SYNTHETIC_FIXTURES_V2';

const pp = (p: number) => String(p).padStart(2, '0');
const date = (y: number, p: number) => `${y}-${pp(p)}-15`;

function rec(id: string, cc: string, y: number, p: number, type: 'REVENUE' | 'EXPENSE', dc: 'D' | 'C', amount: number, currency: string, bu: string, gl: string): FinanceRecord {
  return { recordId: id, companyCode: cc, fiscalYear: y, fiscalPeriod: pp(p), postingDate: date(y, p), glAccount: gl, accountType: type, amount, currency, debitCredit: dc, businessUnit: bu };
}

function generate(): FinanceRecord[] {
  const out: FinanceRecord[] = [];
  // 1000 FY2025 (USD): revenue 100,000 + 2,000·p credit; expenses 60,000 + 1,000·p debit
  for (let p = 1; p <= 12; p++) {
    out.push(rec(`V2-1000-2025-${pp(p)}-R1`, '1000', 2025, p, 'REVENUE', 'C', 100000 + 2000 * p, 'USD', 'BU_COMMERCIAL', '410000'));
    out.push(rec(`V2-1000-2025-${pp(p)}-E1`, '1000', 2025, p, 'EXPENSE', 'D', 60000 + 1000 * p, 'USD', 'BU_OPERATIONS', '610000'));
  }
  // 2000 FY2025 (USD): revenue 40,000 credit; expenses 45,000 debit (a loss every month)
  for (let p = 1; p <= 12; p++) {
    out.push(rec(`V2-2000-2025-${pp(p)}-R1`, '2000', 2025, p, 'REVENUE', 'C', 40000, 'USD', 'BU_MARKETING', '410000'));
    out.push(rec(`V2-2000-2025-${pp(p)}-E1`, '2000', 2025, p, 'EXPENSE', 'D', 45000, 'USD', 'BU_ADMIN', '620000'));
  }
  // 3000 Europe (EUR), FY2025 and FY2026:
  //   revenue 50,000 + 1,000·p (+2,000 in 2026) credit; a 1,500 return (debit) in P03, P06, P09, P12
  //   expenses 30,000 + 500·p debit and 4,000 debit (admin); a 250.50 refund (credit) in P06
  for (const y of [2025, 2026]) {
    for (let p = 1; p <= 12; p++) {
      out.push(rec(`V2-3000-${y}-${pp(p)}-R1`, '3000', y, p, 'REVENUE', 'C', 50000 + 1000 * p + (y === 2026 ? 2000 : 0), 'EUR', 'BU_COMMERCIAL', '410000'));
      if (p % 3 === 0) out.push(rec(`V2-3000-${y}-${pp(p)}-R2`, '3000', y, p, 'REVENUE', 'D', 1500, 'EUR', 'BU_COMMERCIAL', '410000'));
      out.push(rec(`V2-3000-${y}-${pp(p)}-E1`, '3000', y, p, 'EXPENSE', 'D', 30000 + 500 * p, 'EUR', 'BU_OPERATIONS', '610000'));
      out.push(rec(`V2-3000-${y}-${pp(p)}-E2`, '3000', y, p, 'EXPENSE', 'D', 4000, 'EUR', 'BU_ADMIN', '620000'));
      if (p === 6) out.push(rec(`V2-3000-${y}-${pp(p)}-E3`, '3000', y, p, 'EXPENSE', 'C', 250.5, 'EUR', 'BU_ADMIN', '620000'));
    }
  }
  // 4000 Defect fixture (USD), FY2026 — every defect is deliberate and labelled:
  out.push(rec('V2-4000-2026-01-R1', '4000', 2026, 1, 'REVENUE', 'C', 10000, 'USD', 'BU_COMMERCIAL', '410000'));
  out.push(rec('V2-4000-2026-01-E1', '4000', 2026, 1, 'EXPENSE', 'D', 7000, 'USD', 'BU_OPERATIONS', '610000'));
  // DEFECT P02: duplicate posting key (the same record twice)
  out.push(rec('V2-4000-2026-02-R1', '4000', 2026, 2, 'REVENUE', 'C', 10000, 'USD', 'BU_COMMERCIAL', '410000'));
  out.push(rec('V2-4000-2026-02-R1', '4000', 2026, 2, 'REVENUE', 'C', 10000, 'USD', 'BU_COMMERCIAL', '410000'));
  // DEFECT P03: revenue postings net to exactly zero (zero value, not missing)
  out.push(rec('V2-4000-2026-03-R1', '4000', 2026, 3, 'REVENUE', 'C', 5000, 'USD', 'BU_COMMERCIAL', '410000'));
  out.push(rec('V2-4000-2026-03-R2', '4000', 2026, 3, 'REVENUE', 'D', 5000, 'USD', 'BU_COMMERCIAL', '410000'));
  out.push(rec('V2-4000-2026-03-E1', '4000', 2026, 3, 'EXPENSE', 'D', 1000, 'USD', 'BU_OPERATIONS', '610000'));
  // DEFECT P04: a second currency (GBP) inside a USD entity
  out.push(rec('V2-4000-2026-04-R1', '4000', 2026, 4, 'REVENUE', 'C', 8000, 'USD', 'BU_COMMERCIAL', '410000'));
  out.push(rec('V2-4000-2026-04-R2', '4000', 2026, 4, 'REVENUE', 'C', 2000, 'GBP', 'BU_COMMERCIAL', '410000'));
  // DEFECT P05: missing period (no postings at all)
  out.push(rec('V2-4000-2026-06-R1', '4000', 2026, 6, 'REVENUE', 'C', 9000, 'USD', 'BU_COMMERCIAL', '410000'));
  out.push(rec('V2-4000-2026-06-E1', '4000', 2026, 6, 'EXPENSE', 'D', 6000, 'USD', 'BU_OPERATIONS', '610000'));
  return out;
}

export const SYNTHETIC_FINANCE_RECORDS_V2: readonly FinanceRecord[] = Object.freeze([...SYNTHETIC_FINANCE_RECORDS, ...generate()]);

/** Company codes present in the synthetic fixtures (used by mock-tier defaults). */
export const SYNTHETIC_V2_ENTITIES = ['1000', '2000', '3000', '4000'] as const;

/** Labelled defects in entity 4000, FY2026 (for quality-flag tests and the worksheet). */
export const SYNTHETIC_V2_DEFECTS = [
  { companyCode: '4000', fiscalYear: 2026, fiscalPeriod: '02', defect: 'DUPLICATE_POSTING_KEY', detail: 'V2-4000-2026-02-R1 appears twice' },
  { companyCode: '4000', fiscalYear: 2026, fiscalPeriod: '03', defect: 'ZERO_VALUE', detail: 'revenue 5,000 C and 5,000 D net to 0' },
  { companyCode: '4000', fiscalYear: 2026, fiscalPeriod: '04', defect: 'CURRENCY_MIX', detail: '8,000 USD and 2,000 GBP revenue' },
  { companyCode: '4000', fiscalYear: 2026, fiscalPeriod: '05', defect: 'MISSING_PERIOD', detail: 'no postings' }
] as const;
