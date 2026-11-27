/**
 * Local OData v2 simulator of the CANDIDATE S/4HANA journal-entry-item service (G2-03).
 *
 * !! This is NOT SAP. It reproduces the *shape* the adapter expects (EDMX metadata, `/Date()/`
 * timestamps, 3-digit periods, S/H indicators, server-driven paging, error statuses) from the
 * synthetic fixtures, so the adapter's query building, paging, retry, error taxonomy and mapping
 * can be tested without a real system. Passing against this simulator proves nothing about a real
 * SAP system until the adapter is checked against that system's own `$metadata` (G2-03 steps 3–6).
 *
 * Authentication check: a dummy Basic credential (SIM_USER) stands in for the technical user so
 * the 401 path can be tested. It is a fake; never reuse it anywhere.
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createHash } from 'node:crypto';
import type { FinanceRecord } from '@sria/contracts';
import { SYNTHETIC_FINANCE_RECORDS_V2 } from '@sria/contracts';

export const SIM_ROOT = '/sap/opu/odata/sap/API_JOURNALENTRYITEMBASIC_SRV';
export const SIM_ENTITY = 'A_JournalEntryItemBasic';
export const SIM_AUTH = 'Basic ' + Buffer.from('SIM_USER:not-a-real-secret').toString('base64');

const digits = (s: string, n: number) => BigInt('0x' + createHash('sha256').update(s).digest('hex').slice(0, 12)).toString().slice(0, n).padStart(n, '0');

/** The document number the simulator derives from a fixture record id (same id → same document: duplicates stay duplicates). */
export const docOf = (r: FinanceRecord) => digits(r.recordId, 10);

export function toSapRow(r: FinanceRecord): Record<string, string> {
  return {
    CompanyCode: r.companyCode, FiscalYear: String(r.fiscalYear), FiscalPeriod: r.fiscalPeriod.padStart(3, '0'),
    PostingDate: `/Date(${Date.parse(r.postingDate + 'T00:00:00Z')})/`, GLAccount: r.glAccount.padStart(10, '0'),
    AmountInCompanyCodeCurrency: r.amount.toFixed(2), CompanyCodeCurrency: r.currency, DebitCreditCode: r.debitCredit === 'D' ? 'S' : 'H',
    AccountingDocument: docOf(r), LedgerGLLineItem: '000001', Ledger: '0L', ...(r.businessUnit ? { Segment: r.businessUnit } : {})
  };
}

/** What the adapter must return for a fixture record (record id scheme and padded account). */
export function expectedRecord(r: FinanceRecord): FinanceRecord {
  return { ...r, recordId: `${r.companyCode}-${r.fiscalYear}-0L-${docOf(r)}-000001`, glAccount: r.glAccount.padStart(10, '0') };
}

const FIELDS: Array<[string, string]> = [
  ['CompanyCode', 'Edm.String'], ['FiscalYear', 'Edm.String'], ['FiscalPeriod', 'Edm.String'], ['PostingDate', 'Edm.DateTime'],
  ['GLAccount', 'Edm.String'], ['AmountInCompanyCodeCurrency', 'Edm.Decimal'], ['CompanyCodeCurrency', 'Edm.String'],
  ['DebitCreditCode', 'Edm.String'], ['AccountingDocument', 'Edm.String'], ['LedgerGLLineItem', 'Edm.String'], ['Ledger', 'Edm.String'],
  ['Segment', 'Edm.String'], ['CostCenter', 'Edm.String'], ['ProfitCenter', 'Edm.String']
];

export function metadataXml(omitField?: string): string {
  const props = FIELDS.filter(([n]) => n !== omitField).map(([n, t]) => `<Property Name="${n}" Type="${t}" Nullable="true"/>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"><edmx:DataServices><Schema Namespace="SIM" xmlns="http://schemas.microsoft.com/ado/2008/09/edm"><EntityType Name="${SIM_ENTITY}Type"><Key><PropertyRef Name="CompanyCode"/><PropertyRef Name="AccountingDocument"/><PropertyRef Name="LedgerGLLineItem"/></Key>${props}</EntityType><EntityContainer Name="SIM_Entities"><EntitySet Name="${SIM_ENTITY}" EntityType="SIM.${SIM_ENTITY}Type"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
}

// ── tiny $filter evaluator: and / or / parentheses, eq ge le on string fields ──
type Pred = (row: Record<string, string>) => boolean;
function parseFilter(src: string): Pred {
  const toks = [...src.matchAll(/\(|\)|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_]*/g)].map((m) => m[0]);
  let i = 0;
  const peek = () => toks[i];
  const or = (): Pred => { let l = and(); while (peek() === 'or') { i++; const r = and(); const a = l; l = (row) => a(row) || r(row); } return l; };
  const and = (): Pred => { let l = cmp(); while (peek() === 'and') { i++; const r = cmp(); const a = l; l = (row) => a(row) && r(row); } return l; };
  const cmp = (): Pred => {
    if (peek() === '(') { i++; const p = or(); if (toks[i++] !== ')') throw new Error('missing )'); return p; }
    const field = toks[i++]!, op = toks[i++]!, lit = toks[i++]!;
    if (!['eq', 'ge', 'le'].includes(op) || !lit?.startsWith("'")) throw new Error('bad comparison');
    const v = lit.slice(1, -1).replace(/''/g, "'");
    return (row) => { const x = row[field] ?? ''; return op === 'eq' ? x === v : op === 'ge' ? x >= v : x <= v; };
  };
  const p = or();
  if (i !== toks.length) throw new Error('trailing tokens');
  return p;
}

export interface SimOptions {
  rows?: Array<Record<string, string>>;
  /** Server-driven paging: never return more than this many rows, and emit __next. */
  serverPageSize?: number;
  requireAuth?: boolean;
  omitMetadataField?: string;
}
export interface SimRequest { method: string; path: string; query: Record<string, string>; authorized: boolean }

export interface Simulator {
  baseUrl: string;
  requests: SimRequest[];
  authHeaders: Record<string, string>;
  failNext(n: number, status: number, headers?: Record<string, string>): void;
  malformedNext(kind: 'json' | 'shape' | 'row'): void;
  setDelay(ms: number): void;
  close(): Promise<void>;
}

export async function startSimulator(opts: SimOptions = {}): Promise<Simulator> {
  const rows = opts.rows ?? SYNTHETIC_FINANCE_RECORDS_V2.map(toSapRow);
  const requests: SimRequest[] = [];
  let failures: Array<{ status: number; headers: Record<string, string> }> = [];
  let malformed: 'json' | 'shape' | 'row' | null = null;
  let delay = 0;

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });
    const authorized = !opts.requireAuth || req.headers.authorization === SIM_AUTH;
    requests.push({ method: req.method ?? '', path: url.pathname, query, authorized });
    const send = (status: number, body: string, headers: Record<string, string> = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(body); };

    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (req.method !== 'GET') return send(405, '{}');
    if (!authorized) return send(401, '{"error":"unauthorized"}');
    const f = failures.shift();
    if (f) return send(f.status, '{"error":"injected"}', f.headers);

    if (url.pathname === `${SIM_ROOT}/$metadata`) { res.writeHead(200, { 'Content-Type': 'application/xml' }); return res.end(metadataXml(opts.omitMetadataField)); }
    if (url.pathname !== `${SIM_ROOT}/${SIM_ENTITY}`) return send(404, '{"error":"not found"}');

    let pred: Pred = () => true;
    try { if (query.$filter) pred = parseFilter(query.$filter); } catch { return send(400, '{"error":"bad $filter"}'); }
    const select = query.$select ? query.$select.split(',') : null;
    if (select) {
      const known = new Set(FIELDS.map(([n]) => n).filter((n) => n !== opts.omitMetadataField));
      if (select.some((s) => !known.has(s))) return send(400, '{"error":"unknown $select field"}');
    }
    const key = (r: Record<string, string>) => [r.CompanyCode, r.FiscalYear, r.AccountingDocument, r.LedgerGLLineItem].join('|');
    const all = rows.filter(pred).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
    const top = query.$top ? Number(query.$top) : all.length;
    const offset = query.$skiptoken ? Number(Buffer.from(query.$skiptoken, 'base64url').toString()) : query.$skip ? Number(query.$skip) : 0;
    const size = Math.min(top, opts.serverPageSize ?? top);
    let page = all.slice(offset, offset + size).map((r) => (select ? Object.fromEntries(select.filter((s) => s in r).map((s) => [s, r[s]!])) : r));
    const d: Record<string, unknown> = { results: page };
    if (opts.serverPageSize && offset + size < all.length && size < top) {
      d.__next = `${url.origin}${url.pathname}?$skiptoken=${Buffer.from(String(offset + size)).toString('base64url')}`;
    }
    if (malformed) {
      const m = malformed; malformed = null;
      if (m === 'json') return send(200, '{"d": {"results": [');
      if (m === 'shape') return send(200, JSON.stringify({ d: { nothing: true } }));
      if (m === 'row') { d.results = page.map((r, i) => (i === 0 ? { ...r, AmountInCompanyCodeCurrency: 'twelve' } : r)); }
    }
    return send(200, JSON.stringify({ d }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    authHeaders: { Authorization: SIM_AUTH },
    failNext: (n, status, headers = {}) => { failures = Array.from({ length: n }, () => ({ status, headers })); },
    malformedNext: (k) => { malformed = k; },
    setDelay: (ms) => { delay = ms; },
    close: () => new Promise<void>((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); })
  };
}
