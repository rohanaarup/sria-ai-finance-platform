/**
 * G2-02 FinancialPerformance data product.
 * Bounds and refusal (never silent truncation), timeouts and cancellation, provenance v2,
 * hand-verified multi-entity and period-range totals, per-currency reporting (no FX),
 * quality flags on the labelled defect fixtures, entity-level authorization with audit,
 * per-tenant source selection, and the import boundary (no tool/handler imports a provider).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProvenanceV2Schema, DataProductResultSchema, SYNTHETIC_FINANCE_RECORDS_V2 } from '@sria/contracts';
import type { DataProductResult } from '@sria/contracts';
import { getPerformance, DataProductError } from '../srv/dataproduct/financial-performance.ts';
import { setSourceRefs } from '../srv/dataproduct/access.ts';
import { MockSourceAdapter } from '../srv/lib/providers/adapter-contract.ts';
import type { FinanceSourceAdapter } from '../srv/lib/providers/adapter-contract.ts';

const here = dirname(fileURLToPath(import.meta.url));
const ALL = ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'];
const analystA = { tenant: 'TENANT_A', userId: 'analyst', roles: ['FinanceAnalyst'] };
const analystB = { tenant: 'TENANT_B', userId: 'analyst_b', roles: ['FinanceAnalyst'] };
const val = (r: DataProductResult, cc: string, id: string, cur?: string) =>
  r.groups.find((g) => g.key.companyCode === cc && (!cur || g.currency === cur))!.metrics.find((m) => m.metricId === id)!;
const codes = (r: DataProductResult) => r.provenance.qualityFlags.map((f) => f.code);

describe('bounds: rejected, never silently truncated', () => {
  it('too many entities or periods are rejected', async () => {
    await assert.rejects(getPerformance({ entities: ['1000', '2000', '3000'], fiscalYear: 2025, metrics: ['total_revenue'] }, analystA, { bounds: { maxEntities: 2 } }), (e: any) => e instanceof DataProductError && e.code === 'BOUNDS');
    await assert.rejects(getPerformance({ entities: ['3000'], fiscalYear: 2025, periodFrom: '01', periodTo: '06', metrics: ['total_revenue'] }, analystA, { bounds: { maxPeriods: 3 } }), (e: any) => e.code === 'BOUNDS');
  });
  it('a read beyond the row limit is refused with TRUNCATION_REFUSED (no partial result)', async () => {
    await assert.rejects(getPerformance({ entities: ['3000'], fiscalYear: 2025, metrics: ['total_revenue'] }, analystA, { bounds: { maxRows: 10 } }), (e: any) => e.code === 'TRUNCATION_REFUSED' && e.status === 413);
  });
  it('malformed queries are BAD_QUERY', async () => {
    await assert.rejects(getPerformance({ entities: ['3000'], fiscalYear: 2025, periodFrom: '09', periodTo: '03', metrics: ['total_revenue'] } as any, analystA), (e: any) => e.code === 'BAD_QUERY');
    await assert.rejects(getPerformance({ entities: ['3000'], fiscalYear: 2025, metrics: ['total_revenue'], groupBy: ['region'] } as any, analystA), (e: any) => e.code === 'BAD_QUERY');
  });
  it('a slow source times out; a caller cancel aborts', async () => {
    const slow: FinanceSourceAdapter = {
      capabilities: () => new MockSourceAdapter().capabilities(), isAvailable: async () => true,
      fetchPage: (_q, _c, o) => new Promise((_res, rej) => o.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    };
    await assert.rejects(getPerformance({ entities: ['3000'], fiscalYear: 2025, metrics: ['total_revenue'] }, analystA, { source: slow, bounds: { timeoutMs: 150 } }), (e: any) => e.code === 'TIMEOUT' || /abort/i.test(e.message));
  });
});

describe('provenance v2', () => {
  it('every result carries complete provenance; the query hash is stable and query-specific', async () => {
    const q = { entities: ['1000'], fiscalYear: 2026, periodFrom: '01', periodTo: '02', metrics: ALL };
    const r1 = await getPerformance(q, analystA);
    DataProductResultSchema.parse(r1);
    const p = ProvenanceV2Schema.parse(r1.provenance);
    assert.equal(p.isSynthetic, true);
    assert.equal(p.environmentTier, 'local');
    assert.equal(p.metricVersions.total_revenue, 'total_revenue@v1');
    assert.ok(p.recordCount > 0);
    assert.equal(p.truncated, false);
    assert.ok(codes(r1).includes('SYNTHETIC_DATA'));
    const r2 = await getPerformance(q, analystA);
    assert.equal(r2.provenance.queryHash, p.queryHash);
    const r3 = await getPerformance({ ...q, periodTo: '01' }, analystA);
    assert.notEqual(r3.provenance.queryHash, p.queryHash);
  });
  it('a repeated query within one run is reused from the run cache and says so', async () => {
    const runCache = new Map();
    const q = { entities: ['2000'], fiscalYear: 2026, metrics: ['total_revenue'] };
    const first = await getPerformance(q, { ...analystA, runCache });
    const again = await getPerformance(q, { ...analystA, runCache });
    assert.equal(first.provenance.reusedFromRunCache, false);
    assert.equal(again.provenance.reusedFromRunCache, true);
    assert.equal(val(again, '2000', 'total_revenue').value, val(first, '2000', 'total_revenue').value);
  });
});

describe('hand-verified totals (see docs/data/FIXTURES-V2-WORKSHEET.md)', () => {
  it('3000 Europe FY2025 P01–P12 (EUR)', async () => {
    const r = await getPerformance({ entities: ['3000'], fiscalYear: 2025, metrics: ALL }, analystA);
    assert.equal(r.groups.length, 1);
    assert.equal(r.groups[0]!.currency, 'EUR');
    assert.equal(val(r, '3000', 'total_revenue').valueText, '672000.00');
    assert.equal(val(r, '3000', 'total_expenses').valueText, '446749.50');
    assert.equal(val(r, '3000', 'net_profit').valueText, '225250.50');
    assert.equal(val(r, '3000', 'profit_margin').valueText, '33.52');
  });
  it('3000 FY2026 period range P01–P03', async () => {
    const r = await getPerformance({ entities: ['3000'], fiscalYear: 2026, periodFrom: '01', periodTo: '03', metrics: ['total_revenue', 'total_expenses'] }, analystA);
    assert.equal(val(r, '3000', 'total_revenue').valueText, '160500.00');
    assert.equal(val(r, '3000', 'total_expenses').valueText, '105000.00');
  });
  it('multi-entity 1000 + 2000 + 3000 FY2025: per-entity aggregates, per-currency totals, nothing converted', async () => {
    const r = await getPerformance({ entities: ['1000', '2000', '3000'], fiscalYear: 2025, metrics: ALL }, analystA);
    assert.equal(val(r, '1000', 'total_revenue').valueText, '1356000.00');
    assert.equal(val(r, '1000', 'total_expenses').valueText, '798000.00');
    assert.equal(val(r, '1000', 'profit_margin').valueText, '41.15');
    assert.equal(val(r, '2000', 'net_profit').valueText, '-60000.00');
    assert.deepEqual(r.currencies, ['EUR', 'USD']);
    assert.equal(r.converted, false);
    const usd = r.totalsByCurrency.find((t) => t.currency === 'USD')!, eur = r.totalsByCurrency.find((t) => t.currency === 'EUR')!;
    assert.equal(usd.metrics.find((m) => m.metricId === 'total_revenue')!.valueText, '1836000.00'); // 1,356,000 + 480,000
    assert.equal(eur.metrics.find((m) => m.metricId === 'total_revenue')!.valueText, '672000.00');
    assert.ok(r.provenance.qualityFlags.some((f) => f.code === 'CURRENCY_MIX' && /not converted/.test(f.message)));
  });
  it('grouping by fiscal period gives one row per period', async () => {
    const r = await getPerformance({ entities: ['3000'], fiscalYear: 2025, periodFrom: '05', periodTo: '06', metrics: ['total_revenue'], groupBy: ['fiscal_period'] }, analystA);
    assert.deepEqual(r.groups.map((g) => [g.key.fiscalPeriod, g.metrics[0]!.valueText]), [['05', '55000.00'], ['06', '54500.00']]);
  });
});

describe('quality flags on the labelled defect entity 4000 (FY2026 P01–P06)', () => {
  it('missing period, duplicate posting key, zero value and currency mix are all flagged', async () => {
    const r = await getPerformance({ entities: ['4000'], fiscalYear: 2026, periodFrom: '01', periodTo: '06', metrics: ['total_revenue'], groupBy: ['company_code', 'fiscal_period'] }, analystA);
    const f = r.provenance.qualityFlags;
    assert.ok(f.some((x) => x.code === 'MISSING_PERIOD' && x.fiscalPeriod === '05'));
    assert.ok(f.some((x) => x.code === 'DUPLICATE_POSTING_KEY' && x.fiscalPeriod === '02'));
    assert.ok(f.some((x) => x.code === 'ZERO_VALUE' && x.fiscalPeriod === '03' && x.metricId === 'total_revenue'));
    assert.ok(f.some((x) => x.code === 'CURRENCY_MIX' && x.companyCode === '4000'));
    const p04 = r.groups.filter((g) => g.key.fiscalPeriod === '04').map((g) => [g.currency, g.metrics[0]!.valueText]).sort();
    assert.deepEqual(p04, [['GBP', '2000.00'], ['USD', '8000.00']], 'reported per currency, not converted');
  });
  it('an entity with no records at all is shown as MISSING_DATA, not 0', async () => {
    const r = await getPerformance({ entities: ['4000'], fiscalYear: 2025, metrics: ['total_revenue'] }, analystA);
    assert.equal(val(r, '4000', 'total_revenue').dataState, 'MISSING_DATA');
    assert.ok(codes(r).includes('MISSING_DATA'));
  });
});

describe('entity-level authorization', () => {
  it('tenant B may query 2000 but not 1000; the denial is audited', async () => {
    const audits: any[] = [];
    const audit = (e: any) => { audits.push(e); };
    assert.ok(await getPerformance({ entities: ['2000'], fiscalYear: 2026, metrics: ['total_revenue'] }, analystB, { audit }));
    await assert.rejects(getPerformance({ entities: ['2000', '1000'], fiscalYear: 2026, metrics: ['total_revenue'] }, analystB, { audit }), (e: any) => e.code === 'ACCESS_DENIED' && e.status === 403 && /1000/.test(e.message));
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'ENTITY_ACCESS_DENIED');
  });
  it('unknown company codes are denied like forbidden ones (no existence leak)', async () => {
    await assert.rejects(getPerformance({ entities: ['9999'], fiscalYear: 2026, metrics: ['total_revenue'] }, analystA, { audit: () => {} }), (e: any) => e.code === 'ACCESS_DENIED');
  });
  it('pilot/production: a tenant without access rows gets nothing; mock/local: synthetic entities only', async () => {
    const stranger = { tenant: 'TENANT_UNCONFIGURED', userId: 'x', roles: ['FinanceAnalyst'] };
    await assert.rejects(getPerformance({ entities: ['1000'], fiscalYear: 2026, metrics: ['total_revenue'] }, stranger, { tier: 'pilot', audit: () => {}, catalog: approvedCatalog() }), (e: any) => e.code === 'ACCESS_DENIED');
    assert.ok(await getPerformance({ entities: ['1000'], fiscalYear: 2026, metrics: ['total_revenue'] }, stranger, { tier: 'local' }));
  });
});

describe('per-tenant source selection (DataSourceReferences)', () => {
  it('a tenant whose workspace points at an S/4HANA destination is served by that adapter', async () => {
    setSourceRefs([{ tenantId: 'TENANT_A', alias: 'S4_FINANCE_DEST', sourceType: 's4hana' }]);
    try {
      await assert.rejects(getPerformance({ entities: ['1000'], fiscalYear: 2026, metrics: ['total_revenue'] }, analystA), (e: any) => e.code === 'SOURCE_UNAVAILABLE' && /S4_FINANCE_DEST/.test(e.message));
      assert.ok(await getPerformance({ entities: ['2000'], fiscalYear: 2026, metrics: ['total_revenue'] }, analystB), 'other tenants unaffected');
    } finally { setSourceRefs([]); }
  });
});

describe('boundaries', () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  it('no tool, service handler, AI or dashboard module imports a provider or adapter directly', () => {
    const srv = resolve(here, '../srv');
    const files = [...walk(join(srv, 'ai')), ...walk(join(srv, 'dashboard')), ...readdirSync(srv).filter((f) => /\.(ts|js)$/.test(f)).map((f) => join(srv, f))];
    assert.ok(files.length > 10);
    for (const f of files) {
      const imports = [...readFileSync(f, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      const bad = imports.filter((i) => /lib\/providers\//.test(i));
      assert.deepEqual(bad, [], `${f.slice(srv.length)} imports ${bad.join(', ')}`);
    }
  });
  it('no implicit FX conversion exists anywhere in the backend', () => {
    const srv = resolve(here, '../srv');
    for (const f of walk(srv).filter((p) => p.endsWith('.ts'))) {
      const code = readFileSync(f, 'utf8');
      assert.ok(!/exchange_?rate|fxRate|convertCurrency|conversionRate/i.test(code), `${f} contains currency-conversion logic`);
    }
  });
  it('fixtures v2 keep every v1 record unchanged', async () => {
    const { SYNTHETIC_FINANCE_RECORDS } = await import('@sria/contracts');
    for (const r of SYNTHETIC_FINANCE_RECORDS) assert.ok(SYNTHETIC_FINANCE_RECORDS_V2.some((x) => JSON.stringify(x) === JSON.stringify(r)));
  });
});

// helper: a catalog where all metrics are APPROVED, so a pilot-tier query reaches the access check
import { SemanticCatalog } from '../srv/semantic/catalog.ts';
import { loadSeedRows } from '../srv/semantic/runtime.ts';
function approvedCatalog() {
  const rows = structuredClone(loadSeedRows());
  for (const v of rows.versions) v.status = 'APPROVED';
  return new SemanticCatalog(rows);
}
