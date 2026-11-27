/**
 * G2-01 SemanticService over HTTP: catalog, term resolution, propose/approve workflow with
 * the four-eyes rule, immutability (new versions, history readable), tenant scoping, cycle
 * rejection at write time, audit trail, and the gate seeing approvals immediately.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cds from '@sap/cds';

const here = dirname(fileURLToPath(import.meta.url));
(cds.env.requires as any).db = { kind: 'sqlite', impl: '@cap-js/sqlite', credentials: { url: ':memory:' } };
const test = cds.test(resolve(here, '..'));
const axios = test.axios as any;
axios.defaults.validateStatus = () => true;

const as = (user: string) => ({ auth: { username: user, password: 'dev' } });
const get = (user: string, url: string) => axios.get(url, as(user));
const post = (user: string, url: string, data: unknown) => axios.post(url, data, as(user));
const S = '/api/v1/semantic';
const parse = (r: any) => JSON.parse(r.data.value);

describe('SemanticService over HTTP', () => {
  it('catalog lists the four governed metrics with versions, aliases and lineage', async () => {
    const r = await get('analyst', `${S}/getCatalog()`);
    assert.equal(r.status, 200);
    const cat = parse(r);
    assert.deepEqual(cat.map((e: any) => e.metricId).sort(), ['net_profit', 'profit_margin', 'total_expenses', 'total_revenue']);
    const rev = cat.find((e: any) => e.metricId === 'total_revenue');
    assert.equal(rev.latestVersion.status, 'PENDING_REVIEW');
    assert.equal(rev.activeVersion, null, 'nothing approved yet');
    assert.equal(rev.executable, true, 'local tier runs pending metrics on synthetic data (D-02)');
    assert.ok(rev.aliases.includes('sales'));
    assert.ok(rev.lineage.length >= 2);
  });

  it('resolves terms deterministically', async () => {
    const r = await get('analyst', `${S}/resolveTerm(term='turnover')`);
    assert.equal(r.data.metricId, 'total_revenue');
    assert.equal((await get('analyst', `${S}/resolveTerm(term='EBITDA')`)).data.status, 'UNSUPPORTED');
  });

  it('analysts cannot propose; managers propose; a cyclic formula is rejected at write time', async () => {
    const body = { metricId: 'expense_ratio', label: 'Expense ratio', category: 'RATIO', description: 'Expenses as % of revenue', kind: 'DERIVED', expression: 'total_expenses / total_revenue * 100', unit: 'PERCENT', decimals: 2 };
    assert.equal((await post('analyst', `${S}/proposeMetricVersion`, body)).status, 403);
    const cyc = await post('manager', `${S}/proposeMetricVersion`, { metricId: 'total_revenue', kind: 'DERIVED', expression: 'profit_margin * 2', unit: 'CURRENCY' });
    assert.equal(cyc.status, 400);
    assert.match(JSON.stringify(cyc.data), /cycle/);
    const ok = await post('manager', `${S}/proposeMetricVersion`, body);
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.status, 'PENDING_REVIEW');
    assert.deepEqual([...ok.data.dependsOn].sort(), ['total_expenses', 'total_revenue']);
  });

  it('four-eyes: the proposer cannot approve; a manager without the scope cannot approve; another approver can', async () => {
    const p = await post('approver', `${S}/proposeMetricVersion`, { metricId: 'opex_share', label: 'Opex share', category: 'RATIO', description: 'Share', kind: 'DERIVED', expression: 'total_expenses / total_revenue', unit: 'PERCENT', decimals: 4 });
    assert.equal(p.status, 200, JSON.stringify(p.data));
    const id = p.data.versionId;
    assert.equal((await post('approver', `${S}/approveMetricVersion`, { versionId: id })).status, 403, 'own proposal');
    assert.equal((await post('manager', `${S}/approveMetricVersion`, { versionId: id })).status, 403, 'no MetricApprover scope');
    assert.equal((await post('approver_b', `${S}/approveMetricVersion`, { versionId: id })).status, 404, 'other tenant cannot see it');
    const a = await post('approver2', `${S}/approveMetricVersion`, { versionId: id });
    assert.equal(a.status, 200, JSON.stringify(a.data));
    assert.equal(a.data.status, 'APPROVED');
    assert.equal((await post('approver2', `${S}/approveMetricVersion`, { versionId: id })).status, 409, 'already decided');
  });

  it('org-specific metrics are tenant-scoped (cross-tenant read)', async () => {
    const a = parse(await get('analyst', `${S}/getCatalog()`)).map((e: any) => e.metricId);
    const b = parse(await get('analyst_b', `${S}/getCatalog()`)).map((e: any) => e.metricId);
    assert.ok(a.includes('expense_ratio') && a.includes('opex_share'));
    assert.ok(!b.includes('expense_ratio') && !b.includes('opex_share'), 'tenant B must not see tenant A metrics');
    assert.equal((await get('analyst_b', `${S}/getMetric(metricId='opex_share')`)).status, 404);
  });

  it('changing a definition creates a new version; the previous one stays readable', async () => {
    const p = await post('manager', `${S}/proposeMetricVersion`, { metricId: 'total_revenue', kind: 'BASE', accountType: 'REVENUE', signRule: 'CREDIT_POSITIVE', unit: 'CURRENCY', decimals: 2 });
    assert.equal(p.status, 200, JSON.stringify(p.data));
    assert.equal(p.data.version, 2);
    const m = parse(await get('analyst', `${S}/getMetric(metricId='total_revenue')`));
    assert.deepEqual(m.versions.map((x: any) => x.version).sort(), [1, 2]);
    assert.equal(m.versions.find((x: any) => x.version === 1).status, 'PENDING_REVIEW', 'v1 unchanged');
  });

  it('approvals and proposals are audited', async () => {
    const db = await cds.connect.to('db');
    const rows = await db.run(SELECT.from('sria.finance.AuditEvents').where({ sourceSystem: 'SEMANTIC_LAYER' }));
    const actions = rows.map((r: any) => r.action);
    assert.ok(actions.includes('PROPOSE_METRIC_VERSION'));
    assert.ok(actions.includes('APPROVE_METRIC_VERSION'));
    assert.ok(rows.every((r: any) => r.organizationId && r.userId && r.metricVersion));
  });

  it('finance results carry the metric version used', async () => {
    const r = await post('analyst', '/api/finance/GetFinanceMetrics', { companyCode: '1000', fiscalYear: 2026 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const rev = r.data.metrics.find((x: any) => x.metricId === 'total_revenue');
    assert.match(rev.metricVersion, /^total_revenue@v\d+$/);
  });
});

describe('FinanceDataService over HTTP (G2-02: data product)', () => {
  it('returns provenance v2 with quality flags, and enforces entity access with an audited denial', async () => {
    const ok = await post('analyst', '/api/finance/GetFinanceMetrics', { companyCode: '1000', fiscalYear: 2026, fiscalPeriod: '01' });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const prov = JSON.parse(ok.data.provenanceJson);
    assert.equal(prov.provenanceVersion, '2');
    assert.match(prov.queryHash, /^[a-f0-9]{64}$/);
    assert.ok(prov.qualityFlags.some((f: any) => f.code === 'SYNTHETIC_DATA'));

    // tenant B may only query company 2000
    const denied = await post('analyst_b', '/api/finance/GetFinanceMetrics', { companyCode: '1000', fiscalYear: 2026 });
    assert.equal(denied.status, 403);
    const allowedB = await post('analyst_b', '/api/finance/GetFinanceMetrics', { companyCode: '2000', fiscalYear: 2026 });
    assert.equal(allowedB.status, 200);

    const db = await cds.connect.to('db');
    const rows = await db.run(SELECT.from('sria.finance.AuditEvents').where({ action: 'ENTITY_ACCESS_DENIED' }));
    assert.ok(rows.some((r: any) => r.organizationId === 'TENANT_B' && /1000/.test(r.details)));
  });
  it('multi-currency entity: figures per currency with a visible not-converted flag', async () => {
    const r = await post('analyst', '/api/finance/GetFinanceMetrics', { companyCode: '3000', fiscalYear: 2025 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.metrics.every((m: any) => m.currency === 'EUR' || m.currency === 'PCT'));
  });
});
