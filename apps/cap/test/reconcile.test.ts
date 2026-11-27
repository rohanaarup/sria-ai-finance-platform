/**
 * Reconciliation script tests (G2-03). The "SAP report" here is computed independently from the
 * synthetic fixtures in integer cents (no shared code with the platform's decimal pipeline), then
 * compared through the data product — via the mock source and via the S/4 adapter + simulator.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYNTHETIC_FINANCE_RECORDS_V2 } from '@sria/contracts';
import type { FinanceRecord } from '@sria/contracts';
import { getPerformance } from '../srv/dataproduct/financial-performance.ts';
import { reconcile, parseReportCsv, renderLog } from '../scripts/reconcile.ts';
import type { ReportRow } from '../scripts/reconcile.ts';
import { S4HanaODataAdapter } from '../srv/lib/providers/s4hana/adapter.ts';
import { FetchTransport } from '../srv/lib/providers/s4hana/odata-client.ts';
import { startSimulator, SIM_ROOT, SIM_ENTITY } from './helpers/odata-simulator.ts';

const here = dirname(fileURLToPath(import.meta.url));
const ctx = { tenant: 'TENANT_A', userId: 'reconciliation', roles: ['FinanceAnalyst'] };
const cents = (r: FinanceRecord) => BigInt(Math.round(r.amount * 100));
const fmt = (c: bigint) => `${c < 0n ? '-' : ''}${(c < 0n ? -c : c) / 100n}.${String((c < 0n ? -c : c) % 100n).padStart(2, '0')}`;

/** Independent "SAP report": revenue = credits − debits, expenses = debits − credits, per company and period. */
function independentReport(company: string, year: number, periods: string[]): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const p of periods) {
    const rs = SYNTHETIC_FINANCE_RECORDS_V2.filter((r) => r.companyCode === company && r.fiscalYear === year && r.fiscalPeriod === p);
    const cur = rs[0]!.currency;
    const rev = rs.filter((r) => r.accountType === 'REVENUE').reduce((a, r) => a + (r.debitCredit === 'C' ? cents(r) : -cents(r)), 0n);
    const exp = rs.filter((r) => r.accountType === 'EXPENSE').reduce((a, r) => a + (r.debitCredit === 'D' ? cents(r) : -cents(r)), 0n);
    const base = { companyCode: company, fiscalYear: year, fiscalPeriod: p, currency: cur };
    rows.push({ ...base, metricId: 'total_revenue', sapValue: fmt(rev) }, { ...base, metricId: 'total_expenses', sapValue: fmt(exp) }, { ...base, metricId: 'net_profit', sapValue: fmt(rev - exp) });
  }
  return rows;
}

const mockQuery = (q: any) => getPerformance(q, ctx, { audit: () => {} });
const sim = await startSimulator();
after(() => sim.close());
const s4Source = new S4HanaODataAdapter({ transport: new FetchTransport(sim.baseUrl), serviceRoot: SIM_ROOT, entitySet: SIM_ENTITY, maxPageSize: 100, sleep: async () => {},
  mapper: { amountConvention: 'INDICATOR', revenueAccounts: '400000-499999', expenseAccounts: '500000-699999' } });
const s4Query = (q: any) => getPerformance(q, ctx, { source: s4Source, audit: () => {} });

describe('reconciliation', () => {
  const report = [...independentReport('3000', 2025, ['01', '02', '03', '06']), ...independentReport('1000', 2026, ['01', '02']), ...independentReport('2000', 2026, ['01', '02'])];

  it('every figure matches the independent report, via the mock source and via the S/4 adapter', async () => {
    for (const q of [mockQuery, s4Query]) {
      const res = await reconcile(report, q);
      assert.equal(res.length, report.length);
      assert.deepEqual(res.filter((r) => r.status !== 'MATCH'), []);
    }
  });

  it('a deliberate 0.01 discrepancy, a currency mix-up, a missing company and an unknown metric are all caught', async () => {
    const bad = report.map((r) => ({ ...r }));
    bad[0] = { ...bad[0]!, sapValue: fmtPlus(bad[0]!.sapValue, '0.01') };
    bad[3] = { ...bad[3]!, currency: 'USD' };
    bad.push({ companyCode: '3000', fiscalYear: 2024, fiscalPeriod: '01', metricId: 'total_revenue', currency: 'EUR', sapValue: '1.00' });
    bad.push({ companyCode: '3000', fiscalYear: 2025, fiscalPeriod: '01', metricId: 'ebitda', currency: 'EUR', sapValue: '1.00' });
    const res = await reconcile(bad, mockQuery);
    assert.equal(res[0]!.status, 'MISMATCH');
    assert.equal(res[0]!.difference, '-0.01');
    assert.equal(res[3]!.status, 'CURRENCY_MISMATCH');
    assert.equal(res.at(-2)!.status, 'MISSING_IN_PLATFORM', 'a period with no platform data is reported, never matched');
    assert.match(res.at(-2)!.note!, /no records/);
    assert.equal(res.at(-1)!.status, 'MISSING_IN_PLATFORM', 'a metric the platform does not offer is reported');
    assert.match(res.at(-1)!.note!, /ebitda/);
    const log = renderLog(res, { date: '2026-01-01', source: 'test' });
    assert.match(log, /MISMATCH/);
    assert.match(log, /Open discrepancies must be explained/);
  });

  it('a wrong sign convention is detectable: flipping revenue and expense credit/debit in the source breaks the match', async () => {
    const flipped = SYNTHETIC_FINANCE_RECORDS_V2.map((r) => ({ ...r, debitCredit: r.debitCredit === 'D' ? 'C' as const : 'D' as const }));
    const { toSapRow } = await import('./helpers/odata-simulator.ts');
    const s = await startSimulator({ rows: flipped.map(toSapRow) });
    try {
      const a = new S4HanaODataAdapter({ transport: new FetchTransport(s.baseUrl), serviceRoot: SIM_ROOT, entitySet: SIM_ENTITY, maxPageSize: 100, sleep: async () => {},
        mapper: { amountConvention: 'INDICATOR', revenueAccounts: '400000-499999', expenseAccounts: '500000-699999' } });
      const res = await reconcile(independentReport('3000', 2025, ['01']), (q) => getPerformance(q, ctx, { source: a, audit: () => {} }));
      assert.ok(res.some((r) => r.status === 'MISMATCH'), 'reconciliation exposes the sign problem');
    } finally { await s.close(); }
  });

  it('parses the CSV format and rejects malformed input with helpful messages', () => {
    const tpl = parseReportCsv(readFileSync(resolve(here, '../../../docs/sap/reconciliation-report-template.csv'), 'utf8'));
    assert.equal(tpl.length, 2);
    assert.throws(() => parseReportCsv('a;b\n1;2'), /header must be/);
    assert.throws(() => parseReportCsv('companyCode;fiscalYear;fiscalPeriod;metricId;currency;sapValue\n3000;2025;01;total_revenue;EUR;1,234.50'), /plain decimal/);
    assert.throws(() => parseReportCsv('companyCode;fiscalYear;fiscalPeriod;metricId;currency;sapValue\n3000;25;01;total_revenue;EUR;1.00'), /invalid fiscal/);
  });
});

function fmtPlus(v: string, add: string) { return (Math.round((Number(v) + Number(add)) * 100) / 100).toFixed(2); }
