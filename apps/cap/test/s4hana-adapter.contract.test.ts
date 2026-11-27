/**
 * S/4HANA adapter contract tests (G2-03), run against the LOCAL OData SIMULATOR (not SAP).
 * What these prove: query building, paging, retries, typed errors, mapping, evidence rule, audit
 * and secret hygiene behave as designed. What they cannot prove: that a real system's service,
 * fields and sign conventions match — that is verified in steps 3–6 of the runbook.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYNTHETIC_FINANCE_RECORDS_V2, AdapterCapabilitiesSchema } from '@sria/contracts';
import { AdapterError } from '../srv/lib/providers/adapter-contract.ts';
import type { AdapterQuery } from '../srv/lib/providers/adapter-contract.ts';
import { S4HanaODataAdapter } from '../srv/lib/providers/s4hana/adapter.ts';
import type { S4AdapterOptions, S4AuditEvent } from '../srv/lib/providers/s4hana/adapter.ts';
import { FetchTransport, ReplayTransport, DestinationTransport } from '../srv/lib/providers/s4hana/odata-client.ts';
import type { ODataTransport } from '../srv/lib/providers/s4hana/odata-client.ts';
import { parseMetadata, assertFieldsInMetadata, traceabilityTable } from '../srv/lib/providers/s4hana/metadata.ts';
import { mapRow, classifyAccount, parseODataDate, SELECTED_FIELDS } from '../srv/lib/providers/s4hana/mapper.ts';
import { startSimulator, expectedRecord, toSapRow, metadataXml, SIM_ENTITY, SIM_ROOT } from './helpers/odata-simulator.ts';
import { getPerformance } from '../srv/dataproduct/financial-performance.ts';
import { renderEvidence } from '../scripts/s4-discover.ts';
import { loadConfig } from '../srv/lib/config/app-config.ts';
import { runConformance } from '../../../tests/dataproduct/conformance-suite.ts';

const here = dirname(fileURLToPath(import.meta.url));
const MAPPER = { amountConvention: 'INDICATOR' as const, revenueAccounts: '400000-499999', expenseAccounts: '500000-699999' };
const ctx = { tenant: 'TENANT_A', userId: 'analyst' };
const Q: AdapterQuery = { companyCodes: ['3000'], fiscalYear: 2025, periodFrom: '01', periodTo: '12' };

const sim = await startSimulator();
const simAuth = await startSimulator({ requireAuth: true });
const simPaged = await startSimulator({ serverPageSize: 10 });
after(async () => { await sim.close(); await simAuth.close(); await simPaged.close(); });

const noSleep = async () => {};
function make(s = sim, o: Partial<S4AdapterOptions> = {}, headers: Record<string, string> = {}) {
  return new S4HanaODataAdapter({ transport: new FetchTransport(s.baseUrl, headers), serviceRoot: SIM_ROOT, entitySet: SIM_ENTITY, mapper: MAPPER, maxPageSize: 50, sleep: noSleep, ...o });
}
async function drain(a: S4HanaODataAdapter, q: AdapterQuery, pageSize = 50) {
  const out = []; let cursor: string | undefined;
  do { const p = await a.fetchPage(q, ctx, { cursor, pageSize }); out.push(...p.records); cursor = p.nextCursor; } while (cursor);
  return out;
}
const code = (e: unknown) => (e instanceof AdapterError ? e.code : 'NOT_ADAPTER_ERROR');

// ── 1. conformance suite (the acceptance gate for every adapter) ────────────────────────────
const expectedData = SYNTHETIC_FINANCE_RECORDS_V2.map(expectedRecord);
runConformance('S4HanaODataAdapter (simulator)', () => make(), expectedData, [
  { companyCodes: ['3000'], fiscalYear: 2025, periodFrom: '01', periodTo: '12' },
  { companyCodes: ['1000', '2000'], fiscalYear: 2026, periodFrom: '01', periodTo: '02' },
  { companyCodes: ['3000'], fiscalYear: 2026, periodFrom: '04', periodTo: '06', businessUnit: 'BU_ADMIN' },
  { companyCodes: ['4000', '1000'], fiscalYear: 2026, periodFrom: '02', periodTo: '05' }
]);

describe('capabilities', () => {
  it('declares a valid, honest descriptor (non-synthetic, unverified until metadata is read)', async () => {
    const a = make();
    const before = AdapterCapabilitiesSchema.parse(a.capabilities());
    assert.equal(before.isSynthetic, false);
    assert.equal(before.apiVersion, 'unverified');
    await a.isAvailable();
    assert.equal(a.capabilities().apiVersion, 'OData 1.0');
  });
});

describe('query construction is read-only, minimal and bounded', () => {
  it('sends only GETs with the approved $select, an exact $filter, $top = page size and no secrets', async () => {
    const before = sim.requests.length;
    await make().fetchPage({ companyCodes: ['1000', '2000'], fiscalYear: 2026, periodFrom: '01', periodTo: '02', businessUnit: "BU'X" }, ctx, { pageSize: 25 });
    const reqs = sim.requests.slice(before);
    assert.ok(reqs.every((r) => r.method === 'GET'));
    const data = reqs.find((r) => r.path.endsWith(SIM_ENTITY))!;
    assert.equal(data.query.$select, SELECTED_FIELDS.join(','));
    assert.equal(data.query.$top, '25');
    assert.equal(data.query.$filter, "(CompanyCode eq '1000' or CompanyCode eq '2000') and FiscalYear eq '2026' and FiscalPeriod ge '001' and FiscalPeriod le '002' and Ledger eq '0L' and Segment eq 'BU''X'");
    assert.ok(!JSON.stringify(reqs).match(/password|secret|token/i));
  });
  it('rejects injection-shaped company codes and oversize pages before any request', async () => {
    const a = make(), before = sim.requests.length;
    await assert.rejects(a.fetchPage({ ...Q, companyCodes: ["1000' or '1'='1"] }, ctx, { pageSize: 10 }), (e) => code(e) === 'BAD_QUERY');
    await assert.rejects(a.fetchPage(Q, ctx, { pageSize: 51 }), (e) => code(e) === 'BAD_QUERY');
    assert.equal(sim.requests.length, before, 'no HTTP call was made');
  });
});

describe('ledger filter (avoids double counting across ledgers)', () => {
  it('reads only the configured ledger; other ledgers in the system are excluded; null disables the filter', async () => {
    const base = SYNTHETIC_FINANCE_RECORDS_V2.filter((r) => r.companyCode === '3000' && r.fiscalYear === 2025 && r.fiscalPeriod === '01');
    const rows = [...base.map(toSapRow), ...base.map((r) => ({ ...toSapRow(r), Ledger: '2L', AccountingDocument: '9' + toSapRow(r).AccountingDocument }))];
    const s = await startSimulator({ rows });
    try {
      const q = { companyCodes: ['3000'], fiscalYear: 2025, periodFrom: '01', periodTo: '01' };
      assert.equal((await drain(make(s), q)).length, base.length, 'default 0L only');
      assert.equal((await drain(make(s, { ledger: '2L' }), q)).length, base.length);
      assert.equal((await drain(make(s, { ledger: null }), q)).length, base.length * 2, 'no filter doubles the lines');
    } finally { await s.close(); }
  });
});

describe('paging', () => {
  it('boundaries: exact multiple, one over, one under, page size 1', async () => {
    const total = expectedData.filter((r) => r.companyCode === '3000' && r.fiscalYear === 2025).length;
    for (const size of [1, total - 1, total, total + 1].filter((n) => n >= 1 && n <= 50)) {
      const got = await drain(make(), Q, size);
      assert.equal(got.length, total, `pageSize ${size}`);
      assert.equal(new Set(got.map((r) => r.recordId)).size, total, 'no duplicates');
    }
  });
  it('follows server-driven paging (__next) even when the server caps the page below $top', async () => {
    const a = make(simPaged);
    const got = await drain(a, Q, 50);
    assert.equal(got.length, expectedData.filter((r) => r.companyCode === '3000' && r.fiscalYear === 2025).length);
    assert.ok(simPaged.requests.some((r) => r.query.$skiptoken), 'a $skiptoken request was made');
  });
});

describe('typed errors and retry policy', () => {
  const warmed = async (o: Partial<S4AdapterOptions> = {}, s = sim) => { const a = make(s, o); await a.isAvailable(); return a; };
  it('401/403 → AUTH, 404 → NOT_FOUND, 400 → BAD_QUERY, 504 → TIMEOUT, 500 → SOURCE_ERROR; permanent errors are not retried', async () => {
    for (const [status, expected] of [[401, 'AUTH'], [403, 'AUTH'], [404, 'NOT_FOUND'], [400, 'BAD_QUERY']] as const) {
      const a = await warmed(); const before = sim.requests.length;
      sim.failNext(5, status);
      await assert.rejects(a.fetchPage(Q, ctx, { pageSize: 10 }), (e) => code(e) === expected, `${status}`);
      assert.equal(sim.requests.length - before, 1, `${status} must not be retried`);
      sim.failNext(0, 200);
    }
    for (const [status, expected] of [[504, 'TIMEOUT'], [500, 'SOURCE_ERROR'], [503, 'UNAVAILABLE']] as const) {
      const a = await warmed(); sim.failNext(10, status);
      await assert.rejects(a.fetchPage(Q, ctx, { pageSize: 10 }), (e) => code(e) === expected, `${status}`);
      sim.failNext(0, 200);
    }
  });
  it('transient failures are retried with exponential backoff + jitter and then succeed', async () => {
    const waits: number[] = [];
    const a = await warmed({ sleep: async (ms) => { waits.push(ms); }, random: () => 0 });
    sim.failNext(2, 503);
    const p = await a.fetchPage(Q, ctx, { pageSize: 10 });
    assert.ok(p.records.length > 0);
    assert.deepEqual(waits, [200, 400], 'base 200ms, doubling, jitter 0');
    const waits2: number[] = [];
    const b = await warmed({ sleep: async (ms) => { waits2.push(ms); }, random: () => 0.99 });
    sim.failNext(1, 503); await b.fetchPage(Q, ctx, { pageSize: 10 });
    assert.ok(waits2[0]! > 200 && waits2[0]! <= 300, `jitter adds up to 50%: ${waits2[0]}`);
  });
  it('429 honours Retry-After (capped) and surfaces THROTTLED when the retries are used up', async () => {
    const waits: number[] = [];
    const a = await warmed({ sleep: async (ms) => { waits.push(ms); }, retry: { maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 5000 } });
    sim.failNext(2, 429, { 'Retry-After': '2' });
    await a.fetchPage(Q, ctx, { pageSize: 10 });
    assert.deepEqual(waits, [2000, 2000]);
    const b = await warmed();
    sim.failNext(10, 429, { 'Retry-After': '1' });
    await assert.rejects(b.fetchPage(Q, ctx, { pageSize: 10 }), (e) => code(e) === 'THROTTLED');
    sim.failNext(0, 200);
  });
  it('malformed JSON, a wrong response shape and a bad row are MALFORMED; messages carry no values', async () => {
    for (const kind of ['json', 'shape', 'row'] as const) {
      const a = await warmed(); sim.malformedNext(kind);
      await assert.rejects(a.fetchPage(Q, ctx, { pageSize: 10 }), (e) => { assert.equal(code(e), 'MALFORMED'); assert.ok(!/twelve/.test((e as Error).message), 'no raw values in the message'); return true; });
    }
  });
  it('a circuit breaker stops calling a failing system and recovers after the open period', async () => {
    let now = 1_000_000;
    const a = await warmed({ retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 }, breaker: { failureThreshold: 2, openMs: 30_000 }, now: () => now });
    sim.failNext(10, 503);
    await assert.rejects(a.fetchPage(Q, ctx, { pageSize: 10 })); await assert.rejects(a.fetchPage(Q, ctx, { pageSize: 10 }));
    const before = sim.requests.length;
    await assert.rejects(a.fetchPage(Q, ctx, { pageSize: 10 }), (e) => code(e) === 'UNAVAILABLE' && /circuit open/.test((e as Error).message));
    assert.equal(sim.requests.length, before, 'no request while the circuit is open');
    sim.failNext(0, 200); now += 31_000;
    assert.ok((await a.fetchPage(Q, ctx, { pageSize: 10 })).records.length > 0, 'closed again');
  });
  it('a slow system yields TIMEOUT; a caller cancel yields ABORTED promptly', async () => {
    const a = await warmed({ callTimeoutMs: 80, retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 } });
    sim.setDelay(400);
    await assert.rejects(a.fetchPage(Q, ctx, { pageSize: 10 }), (e) => code(e) === 'TIMEOUT');
    const b = await warmed({ callTimeoutMs: 5000 }); const ac = new AbortController(); setTimeout(() => ac.abort(), 30);
    const t0 = Date.now();
    await assert.rejects(b.fetchPage(Q, ctx, { pageSize: 10, signal: ac.signal }), (e) => code(e) === 'ABORTED');
    assert.ok(Date.now() - t0 < 300, 'cancelled well before the slow response');
    sim.setDelay(0);
  });
  it('authentication: a missing credential is AUTH; the simulator-only dummy credential works', async () => {
    await assert.rejects(make(simAuth).fetchPage(Q, ctx, { pageSize: 10 }), (e) => code(e) === 'AUTH');
    assert.ok((await make(simAuth, {}, simAuth.authHeaders).fetchPage(Q, ctx, { pageSize: 10 })).records.length > 0);
  });
});

describe('evidence rule: only fields present in the system metadata are read', () => {
  it('refuses to query when a selected field is missing from $metadata (no data request is made)', async () => {
    const s = await startSimulator({ omitMetadataField: 'Segment' });
    try {
      await assert.rejects(make(s).fetchPage(Q, ctx, { pageSize: 10 }), (e) => code(e) === 'BAD_QUERY' && /Segment/.test((e as Error).message));
      assert.ok(!s.requests.some((r) => r.path.endsWith(SIM_ENTITY)), 'no data request');
    } finally { await s.close(); }
  });
  it('refuses an unknown entity set', async () => {
    await assert.rejects(make(sim, { entitySet: 'A_Unknown' }).fetchPage(Q, ctx, { pageSize: 10 }), (e) => code(e) === 'NOT_FOUND');
  });
  it('parses EDMX into entity sets, keys and typed properties and builds the traceability table', () => {
    const meta = parseMetadata(metadataXml());
    assert.equal(meta.version, '1.0');
    const es = assertFieldsInMetadata(meta, SIM_ENTITY, SELECTED_FIELDS);
    assert.ok(es.keys.includes('AccountingDocument'));
    const t = traceabilityTable(meta, SIM_ENTITY, [...SELECTED_FIELDS, 'NotAField']);
    assert.equal(t.find((x) => x.field === 'AmountInCompanyCodeCurrency')!.edmType, 'Edm.Decimal');
    assert.equal(t.find((x) => x.field === 'NotAField')!.inMetadata, false);
    assert.throws(() => parseMetadata('<html>not edmx</html>'), (e) => code(e) === 'MALFORMED');
  });
});

describe('real SAP Cloud SDK Destination path, against the simulator via a local `destinations` variable', () => {
  it('reads $metadata and pages through data using DestinationTransport (spaces and quotes in $filter survive)', async () => {
    const saved = process.env['destinations'];
    process.env['destinations'] = JSON.stringify([{ name: 'SIM_LOCAL', url: sim.baseUrl }]);
    try {
      const a = new S4HanaODataAdapter({ transport: new DestinationTransport('SIM_LOCAL'), serviceRoot: SIM_ROOT, entitySet: SIM_ENTITY, mapper: MAPPER, maxPageSize: 50, sleep: noSleep });
      assert.equal(await a.isAvailable(), true);
      const got = await drain(a, { companyCodes: ['3000'], fiscalYear: 2025, periodFrom: '01', periodTo: '03' }, 7);
      const want = expectedData.filter((r) => r.companyCode === '3000' && r.fiscalYear === 2025 && r.fiscalPeriod <= '03');
      assert.deepEqual(got.map((r) => JSON.stringify(r)).sort(), want.map((r) => JSON.stringify(r)).sort());
      const metaReq = sim.requests.filter((r) => r.path.endsWith('$metadata')).at(-1);
      assert.ok(metaReq, 'metadata was requested through the SDK');
    } finally { if (saved === undefined) delete process.env['destinations']; else process.env['destinations'] = saved; }
  });
  it('an unknown destination name is a configuration error (NOT_FOUND), not an outage, and is not retried', async () => {
    const saved = process.env['destinations'];
    process.env['destinations'] = JSON.stringify([{ name: 'SIM_LOCAL', url: sim.baseUrl }]);
    try {
      const a = new S4HanaODataAdapter({ transport: new DestinationTransport('NOT_THERE'), serviceRoot: SIM_ROOT, entitySet: SIM_ENTITY, mapper: MAPPER, sleep: noSleep });
      await assert.rejects(a.fetchPage(Q, ctx, { pageSize: 5 }), (e) => code(e) === 'NOT_FOUND' && /NOT_THERE/.test((e as Error).message));
    } finally { if (saved === undefined) delete process.env['destinations']; else process.env['destinations'] = saved; }
  });
});

describe('discovery evidence tool', () => {
  it('reports a complete field table for good metadata and names the missing fields for incomplete metadata', () => {
    const good = renderEvidence(parseMetadata(metadataXml()), SIM_ENTITY, 'test', '2026-01-01');
    assert.equal(good.ok, true);
    assert.match(good.md, /Every field the adapter reads is present/);
    const bad = renderEvidence(parseMetadata(metadataXml('Segment')), SIM_ENTITY, 'test', '2026-01-01');
    assert.equal(bad.ok, false);
    assert.match(bad.md, /\*\*NO\*\*/);
    assert.match(bad.md, /Missing fields \(1\): Segment/);
    const wrong = renderEvidence(parseMetadata(metadataXml()), 'A_Nope', 'test', '2026-01-01');
    assert.equal(wrong.ok, false);
    assert.match(wrong.md, /NOT found/);
  });
});

describe('S4 configuration', () => {
  it('has candidate defaults, validates ranges and the amount convention, and rejects path-like injection', () => {
    const c = loadConfig({});
    assert.equal(c.s4.serviceRoot, '/sap/opu/odata/sap/API_JOURNALENTRYITEMBASIC_SRV');
    assert.equal(c.s4.amountConvention, 'INDICATOR');
    assert.equal(c.s4.ledger, '0L');
    assert.throws(() => loadConfig({ S4_LEDGER: "0L' or '1'='1" }));
    assert.throws(() => loadConfig({ S4_AMOUNT_CONVENTION: 'MAYBE' }));
    assert.throws(() => loadConfig({ S4_REVENUE_ACCOUNTS: 'abc' }));
    assert.throws(() => loadConfig({ S4_SERVICE_ROOT: 'https://evil.example/x' }));
    assert.equal(loadConfig({ S4_REVENUE_ACCOUNTS: '400000-499999,800000-809999' }).s4.revenueAccounts, '400000-499999,800000-809999');
  });
});

describe('mapper', () => {
  const row = (o: Record<string, string> = {}) => ({ ...toSapRow(SYNTHETIC_FINANCE_RECORDS_V2[0]!), ...o });
  it('S/H and D/C indicators, 3-digit periods, padded accounts and both date formats', () => {
    const base = SYNTHETIC_FINANCE_RECORDS_V2[0]!;
    assert.equal(mapRow(row({ DebitCreditCode: 'S' }), MAPPER).debitCredit, 'D');
    assert.equal(mapRow(row({ DebitCreditCode: 'H' }), MAPPER).debitCredit, 'C');
    assert.equal(mapRow(row({ DebitCreditCode: 'C' }), MAPPER).debitCredit, 'C');
    assert.equal(mapRow(row({ FiscalPeriod: '012' }), MAPPER).fiscalPeriod, '12');
    assert.equal(mapRow(row({ GLAccount: '410000' }), MAPPER).glAccount, '0000410000');
    assert.equal(parseODataDate('/Date(1767225600000)/'), '2026-01-01');
    assert.equal(parseODataDate('2026-03-05T00:00:00'), '2026-03-05');
    assert.equal(mapRow(row(), MAPPER).postingDate, base.postingDate);
  });
  it('classifies accounts by configured ranges; others become OTHER (excluded and flagged by the data product)', () => {
    assert.equal(classifyAccount('0000410000', MAPPER), 'REVENUE');
    assert.equal(classifyAccount('0000610000', MAPPER), 'EXPENSE');
    assert.equal(classifyAccount('0000100000', MAPPER), 'OTHER');
    assert.equal(classifyAccount('0000900000', { revenueAccounts: '400000-499999,900000-909999', expenseAccounts: '500000-699999' }), 'REVENUE');
  });
  it('amount conventions: INDICATOR rejects negatives; SIGNED_DEBIT_POSITIVE requires the sign to agree with the indicator', () => {
    assert.throws(() => mapRow(row({ AmountInCompanyCodeCurrency: '-5.00' }), MAPPER), (e) => code(e) === 'MALFORMED');
    const signed = { ...MAPPER, amountConvention: 'SIGNED_DEBIT_POSITIVE' as const };
    const credit = mapRow(row({ AmountInCompanyCodeCurrency: '-5.00', DebitCreditCode: 'H' }), signed);
    assert.deepEqual([credit.amount, credit.debitCredit], [5, 'C']);
    assert.throws(() => mapRow(row({ AmountInCompanyCodeCurrency: '-5.00', DebitCreditCode: 'S' }), signed), (e) => code(e) === 'MALFORMED' && /convention/.test((e as Error).message));
  });
  it('malformed rows report field names only, never values', () => {
    try { mapRow(row({ AmountInCompanyCodeCurrency: 'SECRET-123' }), MAPPER); assert.fail('should throw'); }
    catch (e) { assert.equal(code(e), 'MALFORMED'); assert.ok(!/SECRET-123/.test((e as Error).message)); assert.match((e as Error).message, /AmountInCompanyCodeCurrency/); }
    assert.throws(() => mapRow({ CompanyCode: '1000' }, MAPPER), (e) => code(e) === 'MALFORMED');
    assert.throws(() => mapRow(row({ FiscalPeriod: '017' }), MAPPER), (e) => code(e) === 'MALFORMED');
  });
});

describe('audit and secrecy', () => {
  it('every call is audited with identity, tenant, entity, query hash, row count, duration — and no values', async () => {
    const events: S4AuditEvent[] = [];
    const a = make(sim, { audit: (e) => { events.push(e); } });
    await drain(a, { ...Q, companyCodes: ['3000'], periodFrom: '01', periodTo: '03' }, 20);
    assert.ok(events.length >= 1);
    for (const e of events) {
      assert.deepEqual(Object.keys(e).sort(), ['attempts', 'durationMs', 'entity', 'outcome', 'queryHash', 'rowCount', 'source', 'tenant', 'userId']);
      assert.match(e.queryHash, /^[a-f0-9]{64}$/);
      assert.equal(e.tenant, 'TENANT_A');
    }
    assert.equal(events.reduce((n, e) => n + e.rowCount, 0), expectedData.filter((r) => r.companyCode === '3000' && r.fiscalYear === 2025 && r.fiscalPeriod <= '03').length);
    const failing = make(sim, { audit: (e) => { events.push(e); } }); await failing.isAvailable(); sim.failNext(1, 401);
    await assert.rejects(failing.fetchPage(Q, ctx, { pageSize: 5 }));
    assert.equal(events.at(-1)!.outcome, 'AUTH');
    const text = JSON.stringify(events);
    for (const r of expectedData.filter((x) => x.companyCode === '3000').slice(0, 20)) assert.ok(!text.includes(String(r.amount.toFixed(2))) || String(r.amount).length < 4, 'no amounts in audit events');
  });
  it('a failing audit sink never breaks the data path', async () => {
    const a = make(sim, { audit: () => { throw new Error('audit store down'); } });
    assert.ok((await a.fetchPage(Q, ctx, { pageSize: 5 })).records.length > 0);
  });
  it('logs contain no credentials and no record values', async () => {
    const lines: string[] = []; const orig = { log: console.log, warn: console.warn, error: console.error };
    for (const k of ['log', 'warn', 'error'] as const) console[k] = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
    try {
      await drain(make(simAuth, {}, simAuth.authHeaders), Q, 20);
      await make(simAuth).fetchPage(Q, ctx, { pageSize: 5 }).catch(() => {});
      sim.malformedNext('row'); await make().fetchPage(Q, ctx, { pageSize: 5 }).catch(() => {});
    } finally { Object.assign(console, orig); }
    const out = lines.join('\n');
    assert.ok(!/SIM_USER|not-a-real-secret|Basic /.test(out));
    assert.ok(!/AmountInCompanyCodeCurrency|twelve|\d{4,}\.\d{2}/.test(out));
  });
  it('secret scan: no tokens, keys or credential-bearing URLs in source, fixtures or SAP docs', () => {
    const roots = [resolve(here, '../srv'), resolve(here, '../../../tests/fixtures/sap'), resolve(here, '../../../docs/sap')];
    const walk = (d: string): string[] => !existsSync(d) ? [] : readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const bad = [/Bearer\s+[A-Za-z0-9._\-]{20,}/, /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\./, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /https?:\/\/[^/\s:@]+:[^@\s/]+@/, /client_?secret["']?\s*[:=]\s*["'][^"']{6,}/i, /AKIA[0-9A-Z]{16}/];
    let scanned = 0;
    for (const f of roots.flatMap(walk).filter((p) => /\.(ts|js|json|md|yaml|yml)$/.test(p))) {
      scanned++; const text = readFileSync(f, 'utf8');
      for (const re of bad) assert.ok(!re.test(text), `${f} matches ${re}`);
    }
    assert.ok(scanned > 10);
  });
});

describe('health check reports true reachability', () => {
  it('true against a reachable service; false (never throws) against an unreachable one; cached briefly', async () => {
    assert.equal(await make().isAvailable(), true);
    const dead: ODataTransport = { describe: () => 'dead', get: async () => { throw new AdapterError('UNAVAILABLE', 'no route'); } };
    let now = 0;
    const a = new S4HanaODataAdapter({ transport: dead, serviceRoot: SIM_ROOT, entitySet: SIM_ENTITY, mapper: MAPPER, sleep: noSleep, retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 }, now: () => now, healthTtlMs: 1000 });
    assert.equal(await a.isAvailable(), false);
    now += 500; assert.equal(await a.isAvailable(), false, 'cached');
  });
});

describe('through the data product: outage is a clear error, never mock data; results match the synthetic source', () => {
  const asSource = (s = sim, h: Record<string, string> = {}) => make(s, {}, h);
  it('reconciliation by construction: totals via the S/4 adapter equal the totals computed from the fixtures', async () => {
    const q = { entities: ['1000', '2000', '3000'], fiscalYear: 2025, metrics: ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'] };
    const ctx2 = { tenant: 'TENANT_A', userId: 'analyst', roles: ['FinanceAnalyst'] };
    const viaS4 = await getPerformance(q, ctx2, { source: asSource(), audit: () => {} });
    const viaMock = await getPerformance(q, ctx2, { audit: () => {} });
    const pick = (r: typeof viaS4) => r.groups.map((g) => [g.key.companyCode, g.currency, ...g.metrics.map((m) => m.valueText)]);
    assert.deepEqual(pick(viaS4), pick(viaMock));
    assert.equal(viaS4.provenance.isSynthetic, false);
    assert.equal(viaS4.provenance.sourceType, 's4hana');
    assert.match(viaS4.provenance.apiName, /API_JOURNALENTRYITEMBASIC_SRV/);
  });
  it('an unreachable SAP system surfaces as SOURCE_UNAVAILABLE with the typed cause, not as mock data', async () => {
    const s = await startSimulator(); const a = asSource(s); await s.close();
    await assert.rejects(getPerformance({ entities: ['1000'], fiscalYear: 2026, metrics: ['total_revenue'] }, { tenant: 'TENANT_A', userId: 'a', roles: ['FinanceAnalyst'] }, { source: a, audit: () => {} }),
      (e: any) => e.code === 'SOURCE_UNAVAILABLE' && /\[UNAVAILABLE\]/.test(e.message));
  });
  it('an authorization failure is reported as [AUTH]; unmapped accounts are flagged, not silently dropped', async () => {
    await assert.rejects(getPerformance({ entities: ['1000'], fiscalYear: 2026, metrics: ['total_revenue'] }, { tenant: 'TENANT_A', userId: 'a', roles: ['FinanceAnalyst'] }, { source: asSource(simAuth), audit: () => {} }),
      (e: any) => e.code === 'SOURCE_UNAVAILABLE' && /\[AUTH\]/.test(e.message));
    const rows = [{ ...toSapRow(SYNTHETIC_FINANCE_RECORDS_V2[0]!), GLAccount: '0000100000' }, toSapRow(SYNTHETIC_FINANCE_RECORDS_V2[0]!)];
    const s = await startSimulator({ rows });
    try {
      const r = await getPerformance({ entities: ['1000'], fiscalYear: 2026, periodFrom: '01', periodTo: '01', metrics: ['total_revenue'] }, { tenant: 'TENANT_A', userId: 'a', roles: ['FinanceAnalyst'] }, { source: asSource(s), audit: () => {} });
      assert.ok(r.provenance.qualityFlags.some((f) => f.code === 'UNMAPPED_ACCOUNT'));
    } finally { await s.close(); }
  });
});

describe('replayed recorded responses (tests/fixtures/sap)', () => {
  it('the adapter reproduces the recorded query results exactly from replayed responses', async () => {
    const file = resolve(here, '../../../tests/fixtures/sap/recorded-responses.json');
    const recorded = JSON.parse(readFileSync(file, 'utf8'));
    assert.match(recorded._note, /SIMULATED/);
    const a = new S4HanaODataAdapter({ transport: new ReplayTransport(recorded.responses), serviceRoot: SIM_ROOT, entitySet: SIM_ENTITY, mapper: MAPPER, maxPageSize: 50, sleep: noSleep });
    const q = recorded.query as AdapterQuery;
    const got = await drain(a, q, recorded.pageSize);
    const want = expectedData.filter((r) => q.companyCodes.includes(r.companyCode) && r.fiscalYear === q.fiscalYear && r.fiscalPeriod >= q.periodFrom && r.fiscalPeriod <= q.periodTo);
    assert.deepEqual(got.map((r) => JSON.stringify(r)).sort(), want.map((r) => JSON.stringify(r)).sort());
  });
});

describe('opt-in live smoke test (pilot only)', { skip: process.env['S4_LIVE_SMOKE'] !== '1' }, () => {
  it('reachable through the real Destination and returns a validated page', async () => {
    const { createS4Adapter } = await import('../srv/lib/providers/s4hana/index.ts');
    const dest = process.env['S4_LIVE_DESTINATION'], cc = process.env['S4_LIVE_COMPANY_CODE'], year = Number(process.env['S4_LIVE_FISCAL_YEAR']);
    assert.ok(dest && cc && year, 'set S4_LIVE_DESTINATION, S4_LIVE_COMPANY_CODE and S4_LIVE_FISCAL_YEAR');
    const a = createS4Adapter(dest!);
    assert.equal(await a.isAvailable(), true);
    const p = await a.fetchPage({ companyCodes: [cc!], fiscalYear: year, periodFrom: '01', periodTo: '01' }, ctx, { pageSize: 5 });
    assert.ok(p.records.length <= 5);
  });
});
