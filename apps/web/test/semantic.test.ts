/**
 * Semantic layer (G2-01) frontend tests: metric catalog client + presentation helpers.
 */

import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';

import { ApiClient, ApiAuthError, ApiUnavailableError } from '../src/services/api-client.ts';
import {
  NO_APPROVED_VERSION_TEXT,
  describeActiveVersion,
  describeFormula,
  filterCatalog,
  formatStatus,
  hasPendingChange,
  mappingStatusTone,
  versionStatusTone,
} from '../src/components/semantic/catalog-format.ts';
import { MetricCatalogEntrySchema } from '@sria/contracts';
import type { MetricCatalogEntry, MetricVersion } from '@sria/contracts';

const baseVersion: MetricVersion = {
  id: 'v-rev-1',
  metricId: 'total_revenue',
  version: 1,
  status: 'APPROVED',
  kind: 'BASE',
  accountType: 'REVENUE',
  signRule: 'CREDIT_POSITIVE',
  expression: null,
  unit: 'CURRENCY',
  decimals: 2,
  effectiveFrom: '2026-01-01T00:00:00.000Z',
  proposedBy: 'analyst',
  approvedBy: 'controller',
  approvedAt: '2026-01-02T10:00:00.000Z',
  dependsOn: [],
};

const derivedPending: MetricVersion = {
  ...baseVersion,
  id: 'v-np-1',
  metricId: 'net_profit',
  status: 'PENDING_REVIEW',
  kind: 'DERIVED',
  accountType: null,
  signRule: null,
  expression: 'total_revenue - total_expenses',
  approvedBy: null,
  approvedAt: null,
  dependsOn: ['total_revenue', 'total_expenses'],
};

const sampleCatalog: MetricCatalogEntry[] = [
  {
    metricId: 'total_revenue',
    label: 'Total Revenue',
    category: 'REVENUE',
    description: 'Recognized revenue.',
    owner: 'Finance Controller',
    tenantId: null,
    activeVersion: baseVersion,
    latestVersion: baseVersion,
    executable: true,
    aliases: ['sales', 'turnover'],
    lineage: [
      {
        metricId: 'total_revenue',
        sourceSystem: 'S4HANA',
        entitySet: 'I_JournalEntryItemBasic',
        field: 'AmountInCompanyCodeCurrency',
        mappingStatus: 'MAPPED',
        evidence: '$metadata check',
      },
    ],
  },
  {
    metricId: 'net_profit',
    label: 'Net Profit',
    category: 'PROFIT',
    description: 'Revenue minus expenses.',
    owner: 'Finance Controller',
    tenantId: 'ORG_ACME_PILOT',
    activeVersion: null,
    latestVersion: derivedPending,
    executable: false,
    aliases: ['bottom line'],
    lineage: [],
  },
];

const realFetch = globalThis.fetch;
const realEnv = process.env.NODE_ENV;

/** Exercise the real network path (not the test short-circuit) with a stubbed fetch. */
function stubFetch(impl: (url: string) => Promise<Response>, demo: boolean) {
  process.env.NODE_ENV = 'development';
  ApiClient.setDemoMode(demo);
  globalThis.fetch = (async (url: any) => impl(String(url))) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env.NODE_ENV = realEnv;
  ApiClient.setDemoMode(null);
});

describe('ApiClient.getMetricCatalog', () => {
  it('a. parses the OData { value: "<JSON>" } envelope and validates entries', async () => {
    let calledUrl = '';
    stubFetch(async (url) => {
      calledUrl = url;
      return new Response(JSON.stringify({ value: JSON.stringify(sampleCatalog) }), { status: 200 });
    }, false);
    const out = await ApiClient.getMetricCatalog();
    assert.ok(calledUrl.endsWith('/api/v1/semantic/getCatalog()'));
    assert.equal(out.length, 2);
    assert.deepEqual(out, sampleCatalog);
    assert.equal(out[1]?.activeVersion, null);
  });

  it('b. malformed payloads throw ApiUnavailableError (demo off)', async () => {
    const bad = [
      { value: 'not json {' },
      { value: JSON.stringify([{ metricId: 'x' }]) },
      { value: JSON.stringify([{ ...sampleCatalog[0], latestVersion: { ...baseVersion, status: 'LIVE' } }]) },
      { somethingElse: true },
    ];
    for (const body of bad) {
      stubFetch(async () => new Response(JSON.stringify(body), { status: 200 }), false);
      await assert.rejects(() => ApiClient.getMetricCatalog(), ApiUnavailableError);
    }
  });

  it('c. demo OFF + failing fetch throws ApiUnavailableError (no fallback data)', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    }, false);
    await assert.rejects(() => ApiClient.getMetricCatalog(), ApiUnavailableError);

    stubFetch(async () => new Response('', { status: 503 }), false);
    await assert.rejects(
      () => ApiClient.getMetricCatalog(),
      (e: any) => e instanceof ApiUnavailableError && e.status === 503
    );
  });

  it('c2. 401/403 throw ApiAuthError in both demo modes', async () => {
    for (const demo of [false, true]) {
      for (const status of [401, 403]) {
        stubFetch(async () => new Response('', { status }), demo);
        await assert.rejects(
          () => ApiClient.getMetricCatalog(),
          (e: any) => e instanceof ApiAuthError && e.status === status
        );
      }
    }
  });

  it('d. demo ON + failing fetch returns 4 contract-valid fallback entries', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    }, true);
    const out = await ApiClient.getMetricCatalog();
    assert.equal(out.length, 4);
    MetricCatalogEntrySchema.array().parse(out);
    assert.deepEqual(
      out.map((e) => e.metricId).sort(),
      ['net_profit', 'profit_margin', 'total_expenses', 'total_revenue']
    );
    for (const e of out) {
      assert.equal(e.activeVersion, null);
      assert.equal(e.latestVersion.status, 'PENDING_REVIEW');
      assert.equal(e.latestVersion.version, 1);
      assert.equal(e.executable, true);
      assert.deepEqual(e.aliases, []);
      assert.equal(e.lineage[0]?.mappingStatus, 'UNCONFIRMED');
    }
    const rev = out.find((e) => e.metricId === 'total_revenue')!;
    assert.equal(rev.latestVersion.kind, 'BASE');
    assert.equal(rev.lineage[0]?.field, 'AmountInCompanyCodeCurrency');
    const margin = out.find((e) => e.metricId === 'profit_margin')!;
    assert.equal(margin.latestVersion.kind, 'DERIVED');
    assert.equal(margin.latestVersion.unit, 'PERCENT');
  });
});

describe('Metric catalog presentation helpers', () => {
  it('maps version status to badge tones', () => {
    assert.equal(versionStatusTone('APPROVED'), 'positive');
    assert.equal(versionStatusTone('PENDING_REVIEW'), 'warning');
    assert.equal(versionStatusTone('REJECTED'), 'negative');
    assert.equal(versionStatusTone('DRAFT'), 'info');
    assert.equal(versionStatusTone('RETIRED'), 'neutral');
  });

  it('maps lineage mapping status to badge tones', () => {
    assert.equal(mappingStatusTone('MAPPED'), 'positive');
    assert.equal(mappingStatusTone('UNCONFIRMED'), 'warning');
    assert.equal(mappingStatusTone('BLOCKED'), 'negative');
  });

  it('formats enum statuses for display', () => {
    assert.equal(formatStatus('PENDING_REVIEW'), 'Pending review');
    assert.equal(formatStatus('APPROVED'), 'Approved');
  });

  it('describes BASE and DERIVED formulas', () => {
    assert.equal(
      describeFormula(baseVersion),
      'Signed sum of REVENUE accounts, credit-positive (credits add, debits subtract)'
    );
    assert.equal(
      describeFormula({ ...baseVersion, accountType: 'EXPENSE', signRule: 'DEBIT_POSITIVE' }),
      'Signed sum of EXPENSE accounts, debit-positive (debits add, credits subtract)'
    );
    assert.equal(describeFormula(derivedPending), 'total_revenue - total_expenses');
    assert.equal(describeFormula({ ...derivedPending, expression: null }), 'No expression defined');
  });

  it('describes the governing version or the lack of one', () => {
    assert.equal(
      describeActiveVersion(sampleCatalog[0]!),
      'Version 1 (Approved) — effective from 2026-01-01 — approved by controller'
    );
    assert.equal(describeActiveVersion(sampleCatalog[1]!), NO_APPROVED_VERSION_TEXT);
    assert.equal(hasPendingChange(sampleCatalog[0]!), false);
    assert.equal(hasPendingChange(sampleCatalog[1]!), true);
    assert.equal(
      hasPendingChange({ ...sampleCatalog[0]!, latestVersion: { ...baseVersion, id: 'v-rev-2', version: 2 } }),
      true
    );
  });

  it('filters by label, metricId and alias (case-insensitive)', () => {
    assert.equal(filterCatalog(sampleCatalog, '').length, 2);
    assert.deepEqual(filterCatalog(sampleCatalog, 'TURNOVER').map((e) => e.metricId), ['total_revenue']);
    assert.deepEqual(filterCatalog(sampleCatalog, 'bottom').map((e) => e.metricId), ['net_profit']);
    assert.deepEqual(filterCatalog(sampleCatalog, 'net_pro').map((e) => e.metricId), ['net_profit']);
    assert.deepEqual(filterCatalog(sampleCatalog, ' revenue ').map((e) => e.metricId), ['total_revenue']);
    assert.equal(filterCatalog(sampleCatalog, 'ebitda').length, 0);
  });
});
