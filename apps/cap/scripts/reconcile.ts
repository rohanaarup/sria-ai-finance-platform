/**
 * Reconciliation: compare the data product's output with figures exported from standard SAP reports.
 * Finance runs the SAP report, exports the totals to CSV, and this script compares them with what
 * the platform computes — to currency precision (the metric's decimals), exactly, no tolerance.
 *
 * CSV (semicolon separated, header required):
 *   companyCode;fiscalYear;fiscalPeriod;metricId;currency;sapValue
 *   3000;2025;01;total_revenue;EUR;51000.00
 * `sapValue` is the amount Finance reads from the SAP report for that company, period and metric
 * (revenue and expenses as positive numbers; net_profit and profit_margin as the report shows them).
 *
 * Usage:  node apps/cap/scripts/reconcile.ts <report.csv> --tenant TENANT_A [--user NAME] [--out result.md]
 * Exit code 0 = every row matches, 1 = at least one discrepancy or missing figure.
 * The discrepancy log (docs/sap/RECONCILIATION-LOG.md) is where results are recorded and signed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DataProductResult, DataProductQueryInput } from '@sria/contracts';
import { dec, roundTo } from '../srv/lib/finance/decimal.ts';

export interface ReportRow { companyCode: string; fiscalYear: number; fiscalPeriod: string; metricId: string; currency: string; sapValue: string }
export type ReconStatus = 'MATCH' | 'MISMATCH' | 'MISSING_IN_PLATFORM' | 'CURRENCY_MISMATCH' | 'ERROR';
export interface ReconRow extends ReportRow { status: ReconStatus; platformValue?: string; difference?: string; note?: string }

export function parseReportCsv(text: string): ReportRow[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const header = lines.shift()?.split(';').map((h) => h.trim());
  const want = ['companyCode', 'fiscalYear', 'fiscalPeriod', 'metricId', 'currency', 'sapValue'];
  if (!header || want.some((w, i) => header[i] !== w)) throw new Error(`CSV header must be: ${want.join(';')}`);
  return lines.map((l, n) => {
    const c = l.split(';').map((x) => x.trim());
    if (c.length !== 6) throw new Error(`Line ${n + 2}: expected 6 columns`);
    if (!/^-?\d+(\.\d+)?$/.test(c[5]!)) throw new Error(`Line ${n + 2}: sapValue "${c[5]}" is not a plain decimal (use a dot, no thousands separators)`);
    if (!/^\d{4}$/.test(c[1]!) || !/^(0[1-9]|1[0-6])$/.test(c[2]!)) throw new Error(`Line ${n + 2}: invalid fiscal year or period`);
    return { companyCode: c[0]!, fiscalYear: Number(c[1]), fiscalPeriod: c[2]!, metricId: c[3]!, currency: c[4]!, sapValue: c[5]! };
  });
}

export type QueryFn = (q: DataProductQueryInput) => Promise<DataProductResult>;

export async function reconcile(rows: ReportRow[], query: QueryFn): Promise<ReconRow[]> {
  const out: ReconRow[] = [];
  const cache = new Map<string, DataProductResult | Error>();
  for (const r of rows) {
    const key = `${r.companyCode}|${r.fiscalYear}|${r.fiscalPeriod}`;
    if (!cache.has(key)) {
      try {
        cache.set(key, await query({ entities: [r.companyCode], fiscalYear: r.fiscalYear, periodFrom: r.fiscalPeriod, periodTo: r.fiscalPeriod, metrics: ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'], groupBy: ['company_code'] }));
      } catch (e) { cache.set(key, e as Error); }
    }
    const res = cache.get(key)!;
    if (res instanceof Error) { out.push({ ...r, status: 'ERROR', note: res.message }); continue; }
    const groups = res.groups.filter((g) => g.key.companyCode === r.companyCode && g.recordCount > 0);
    const group = groups.find((g) => g.currency === r.currency);
    if (!group) {
      out.push({ ...r, status: groups.length ? 'CURRENCY_MISMATCH' : 'MISSING_IN_PLATFORM', note: groups.length ? `platform currency: ${groups.map((g) => g.currency).join(', ')}` : 'no records in the platform for this company and period' });
      continue;
    }
    const m = group.metrics.find((x) => x.metricId === r.metricId);
    if (!m) { out.push({ ...r, status: 'MISSING_IN_PLATFORM', note: `metric ${r.metricId} not available` }); continue; }
    const sap = roundTo(dec(r.sapValue), m.decimals), plat = roundTo(dec(m.valueText), m.decimals);
    const diff = plat.minus(sap);
    out.push({ ...r, platformValue: plat.toFixed(m.decimals), difference: diff.toFixed(m.decimals), status: diff.isZero() ? 'MATCH' : 'MISMATCH' });
  }
  return out;
}

export function renderLog(results: ReconRow[], meta: { date: string; source: string }): string {
  const bad = results.filter((r) => r.status !== 'MATCH');
  let md = `## Reconciliation run ${meta.date}\n\nSource: ${meta.source}\n\nRows: ${results.length} · matched: ${results.length - bad.length} · discrepancies: ${bad.length}\n\n`;
  md += '| Company | Year | Period | Metric | Currency | SAP report | Platform | Difference | Status | Note |\n|---|---|---|---|---|---|---|---|---|---|\n';
  for (const r of results) md += `| ${r.companyCode} | ${r.fiscalYear} | ${r.fiscalPeriod} | ${r.metricId} | ${r.currency} | ${r.sapValue} | ${r.platformValue ?? '—'} | ${r.difference ?? '—'} | ${r.status} | ${(r.note ?? '').replace(/\|/g, '/')} |\n`;
  md += bad.length
    ? '\n**Open discrepancies must be explained and closed (or the metric stays disabled in the pilot tier) before sign-off.**\n'
    : '\nAll rows match to currency precision. Awaiting Finance sign-off.\n';
  return md;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
  const file = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
  if (!file || !opt('tenant')) { console.error('Usage: node apps/cap/scripts/reconcile.ts <report.csv> --tenant <TENANT> [--user NAME] [--out file.md]'); process.exit(2); }
  const { getPerformance } = await import('../srv/dataproduct/financial-performance.ts');
  const { loadConfig } = await import('../srv/lib/config/app-config.ts');
  const ctx = { tenant: opt('tenant')!, userId: opt('user') ?? 'reconciliation', roles: ['FinanceAnalyst'] };
  const results = await reconcile(parseReportCsv(readFileSync(resolve(file), 'utf8')), (q) => getPerformance(q, ctx));
  const md = renderLog(results, { date: new Date().toISOString().slice(0, 10), source: `provider=${loadConfig().financeProvider}, tier=${loadConfig().tier}` });
  if (opt('out')) writeFileSync(resolve(opt('out')!), md); else console.log(md);
  process.exit(results.every((r) => r.status === 'MATCH') ? 0 : 1);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
