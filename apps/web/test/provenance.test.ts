/**
 * Governed finance data product (G2-02) frontend tests: provenance v2 threading,
 * demo-mode provenance and the pure presentation helpers behind ProvenanceBadge.
 */

import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';

process.env.NODE_ENV = 'test';

import {
  ApiClient,
  DEMO_QUERY_HASH,
  buildDemoProvenanceV2,
  buildSpecDataProvenance,
  parseExecutePlanResults,
} from '../src/services/api-client.ts';
import {
  NO_DATA_TEXT,
  displayMetricValue,
  flagScope,
  flagsForMetrics,
  formatClock,
  freshnessText,
  metricDataState,
  metricVersionOf,
  shortHash,
  sourceLabel,
  summarizeSeverity,
} from '../src/components/dashboard/provenance-format.ts';
import { DashboardSpecSchema, MetricResultSchema, ProvenanceV2Schema } from '@sria/contracts';
import type { DashboardRequest, MetricResult, ProvenanceV2, QualityFlag } from '@sria/contracts';

const HASH = 'a'.repeat(56) + '0123abcd';
const RETRIEVED = '2026-11-27T12:03:00.000Z';

const v2Fixture = (overrides: Partial<ProvenanceV2> = {}): ProvenanceV2 => ({
  provenanceVersion: '2',
  sourceType: 'mock',
  sourceSystem: 'MOCK_FIXTURES',
  apiName: 'API_JOURNALENTRYITEMBASIC_SRV',
  apiVersion: '1',
  queryHash: HASH,
  retrievedAt: RETRIEVED,
  freshness: { ttlSeconds: 300, ageSeconds: 12, stale: false },
  recordCount: 42,
  qualityFlags: [
    { code: 'SYNTHETIC_DATA', severity: 'info', message: 'Synthetic fixtures' },
    { code: 'ZERO_DENOMINATOR', severity: 'warning', message: 'Revenue is zero', companyCode: '2000', metricId: 'profit_margin' },
    { code: 'MISSING_PERIOD', severity: 'warning', message: 'No postings in P03', companyCode: '1000', fiscalPeriod: '03' },
    { code: 'ZERO_VALUE', severity: 'info', message: 'Expenses are zero', metricId: 'total_expenses' },
  ],
  metricVersions: { total_revenue: 'total_revenue@v1', profit_margin: 'profit_margin@v2' },
  environmentTier: 'mock',
  isSynthetic: true,
  truncated: false,
  reusedFromRunCache: false,
  ...overrides,
});

const request: DashboardRequest = {
  version: '1.0',
  rawPrompt: 'Show revenue and margin for company 1000',
  metricIds: ['total_revenue', 'total_expenses', 'profit_margin'],
  dimensions: ['fiscal_period'],
  filters: { companyCode: '1000', fiscalYear: 2026 },
  organizationId: 'ORG_TEST',
  userId: 'test_user',
};

const toolMetric = (metricId: string, value: number, extra: Record<string, unknown> = {}) => ({
  metricId,
  label: metricId,
  value,
  formattedValue: metricId === 'profit_margin' ? `${value.toFixed(2)}%` : `$${value.toFixed(2)}`,
  currency: metricId === 'profit_margin' ? 'PCT' : 'USD',
  ...extra,
});

describe('provenance-format helpers', () => {
  const flags = v2Fixture().qualityFlags;

  it('flagsForMetrics keeps global flags plus flags for the widget metrics', () => {
    const forMargin = flagsForMetrics(flags, ['profit_margin']);
    assert.deepEqual(forMargin.map((f) => f.code), ['SYNTHETIC_DATA', 'ZERO_DENOMINATOR', 'MISSING_PERIOD']);
    const forRevenue = flagsForMetrics(flags, ['total_revenue']);
    assert.deepEqual(forRevenue.map((f) => f.code), ['SYNTHETIC_DATA', 'MISSING_PERIOD']);
    assert.equal(flagsForMetrics(flags).length, 4, 'header (no metric scope) shows every flag');
    assert.deepEqual(flagsForMetrics(undefined, ['total_revenue']), []);
  });

  it('summarizeSeverity counts warnings; info-only flags stay neutral', () => {
    const all = summarizeSeverity(flags);
    assert.equal(all.warnings, 2);
    assert.equal(all.infos, 2);
    assert.equal(all.tone, 'warning');
    assert.equal(all.label, '2 warnings');

    const infoOnly = summarizeSeverity(flags.filter((f) => f.severity === 'info'));
    assert.equal(infoOnly.warnings, 0);
    assert.equal(infoOnly.tone, 'neutral');
    assert.equal(infoOnly.label, '2 notes');

    const one = summarizeSeverity([flags[1]!]);
    assert.equal(one.label, '1 warning');

    const none = summarizeSeverity([]);
    assert.equal(none.tone, 'positive');
    assert.equal(none.label, 'No issues');
  });

  it('freshnessText reports retrieval time and fresh/stale', () => {
    const d = new Date(RETRIEVED);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    assert.equal(formatClock(RETRIEVED), hhmm);
    assert.equal(freshnessText(v2Fixture()), `retrieved ${hhmm} · fresh`);
    assert.equal(
      freshnessText(v2Fixture({ freshness: { ttlSeconds: 300, ageSeconds: 900, stale: true } })),
      `retrieved ${hhmm} · stale`
    );
    assert.equal(formatClock('not-a-date'), '—');
  });

  it('shortHash keeps the first 8 and last 4 characters', () => {
    assert.equal(shortHash(HASH), 'aaaaaaaa…abcd');
    assert.equal(shortHash('abc'), 'abc');
    assert.equal(shortHash(''), '—');
  });

  it('sourceLabel and flagScope', () => {
    assert.equal(sourceLabel({ sourceType: 's4hana', isSynthetic: false }), 'Live SAP');
    assert.equal(sourceLabel({ sourceType: 's4hana', isSynthetic: false, v2: v2Fixture() }), 'Synthetic');
    assert.equal(
      sourceLabel({ sourceType: 'mock', isSynthetic: true, v2: v2Fixture({ sourceType: 's4hana', isSynthetic: false }) }),
      'Live SAP'
    );
    assert.equal(flagScope(flags[1]!), 'Company 2000 · profit_margin');
    assert.equal(flagScope(flags[2]!), 'Company 1000 · P03');
    assert.equal(flagScope(flags[0]!), 'All results');
  });

  it('MISSING_DATA renders as "No data", never 0', () => {
    const missingFlag: QualityFlag = { code: 'MISSING_DATA', severity: 'warning', message: 'none', metricId: 'total_revenue' };
    const metric: MetricResult = {
      metricId: 'total_revenue',
      label: 'Total Revenue',
      value: 0,
      formattedValue: '$0.00',
      currency: 'USD',
      provenance: {
        sourceType: 'mock',
        sourceSystem: 'X',
        retrievedAt: RETRIEVED,
        calculationVersion: '1.0.0',
        isSynthetic: true,
        v2: v2Fixture({ qualityFlags: [missingFlag] }),
      },
    };
    assert.equal(metricDataState(metric), 'MISSING_DATA');
    assert.equal(displayMetricValue(metric), NO_DATA_TEXT);
    assert.equal(NO_DATA_TEXT, 'No data');

    // A flag for another metric does not affect this one; v1-only results show their value.
    const other = { ...metric, metricId: 'total_expenses' as const };
    assert.equal(metricDataState(other), 'AVAILABLE');
    assert.equal(displayMetricValue(other), '$0.00');
    const v1Only = { ...metric, provenance: { ...metric.provenance, v2: undefined } };
    assert.equal(displayMetricValue(v1Only), '$0.00');
    assert.equal(displayMetricValue({ ...v1Only, isZeroDenominator: true }, 'N/A (Zero Revenue)'), 'N/A (Zero Revenue)');
  });
});

describe('provenance v2 threading from ExecutePlan', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    ApiClient.setDemoMode(null);
  });

  const stubExecutePlan = (toolResults: unknown[]) => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: 'SUCCESS', resultsJson: JSON.stringify(toolResults) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
  };

  it('attaches tool-result provenance v2 to the outcome, every metric and the spec', async () => {
    ApiClient.setDemoMode(false);
    stubExecutePlan([
      {
        sourceType: 'mock',
        isSynthetic: true,
        calculatedAt: RETRIEVED,
        provenance: v2Fixture(),
        metrics: [
          toolMetric('total_revenue', 350000, { metricVersion: 'total_revenue@v1', dataState: 'AVAILABLE' }),
          toolMetric('total_expenses', 0, { metricVersion: 'total_expenses@v1', dataState: 'MISSING_DATA' }),
          toolMetric('profit_margin', 0, { metricVersion: 'profit_margin@v2', dataState: 'AVAILABLE', isZeroDenominator: true }),
        ],
      },
    ]);

    const outcome = await ApiClient.executeRequest(request);
    assert.ok(outcome.provenanceV2, 'v2 present on the outcome');
    assert.equal(outcome.provenanceV2.queryHash, HASH);
    assert.equal(outcome.provenanceV2.metricVersions['total_expenses'], 'total_expenses@v1');
    assert.equal(outcome.results.length, 3);
    for (const r of outcome.results) {
      assert.equal(r.provenance.v2?.queryHash, HASH);
      MetricResultSchema.parse(r);
    }

    const expenses = outcome.results.find((r) => r.metricId === 'total_expenses')!;
    assert.equal(metricDataState(expenses), 'MISSING_DATA');
    assert.equal(displayMetricValue(expenses), 'No data');
    assert.equal(metricVersionOf(expenses), 'total_expenses@v1');
    const revenue = outcome.results.find((r) => r.metricId === 'total_revenue')!;
    assert.equal(metricDataState(revenue), 'AVAILABLE');
    assert.equal(displayMetricValue(revenue), '$350000.00');

    const dataProvenance = buildSpecDataProvenance(outcome, request.filters as Record<string, unknown>);
    assert.equal(dataProvenance.v2?.queryHash, HASH);
    assert.equal(dataProvenance.retrievedAt, RETRIEVED);
    const spec = DashboardSpecSchema.parse({
      version: '1.0',
      dashboardId: '00000000-0000-4000-8000-000000000123',
      title: 'Test',
      organizationId: 'ORG_TEST',
      createdAt: RETRIEVED,
      generatedBy: 'test_user',
      widgets: [{ id: 'w1', type: 'kpi_card', title: 'Revenue', metricIds: ['total_revenue'] }],
      results: outcome.results,
      dataProvenance,
    });
    assert.equal(spec.dataProvenance.v2?.provenanceVersion, '2');
    // Header badge scope (all flags) includes the synthesized MISSING_DATA flag for expenses.
    assert.ok(spec.dataProvenance.v2?.qualityFlags.some((f) => f.code === 'MISSING_DATA' && f.metricId === 'total_expenses'));
  });

  it('older results without provenance v2 still render (v1 only)', () => {
    const outcome = parseExecutePlanResults(
      JSON.stringify([{ sourceType: 'mock', isSynthetic: true, metrics: [toolMetric('total_revenue', 100)] }]),
      request
    );
    assert.equal(outcome.provenanceV2, undefined);
    assert.equal(outcome.results[0]?.provenance.v2, undefined);
    assert.equal(buildSpecDataProvenance(outcome).v2, undefined);
    assert.equal(displayMetricValue(outcome.results[0]!), '$100.00');
  });

  it('invalid provenance v2 degrades to v1 instead of failing', () => {
    const outcome = parseExecutePlanResults(
      JSON.stringify([{ provenance: { provenanceVersion: '2', queryHash: 'nope' }, metrics: [toolMetric('total_revenue', 1)] }]),
      request
    );
    assert.equal(outcome.provenanceV2, undefined);
    assert.equal(outcome.results.length, 1);
  });

  it('does not duplicate a MISSING_DATA flag the backend already sent', () => {
    const backendFlag: QualityFlag = { code: 'MISSING_DATA', severity: 'warning', message: 'backend', metricId: 'total_revenue' };
    const outcome = parseExecutePlanResults(
      JSON.stringify([
        {
          provenance: v2Fixture({ qualityFlags: [backendFlag] }),
          metrics: [toolMetric('total_revenue', 0, { dataState: 'MISSING_DATA' })],
        },
      ]),
      request
    );
    assert.equal(outcome.provenanceV2?.qualityFlags.filter((f) => f.code === 'MISSING_DATA').length, 1);
  });
});

describe('demo-mode provenance v2', () => {
  afterEach(() => ApiClient.setDemoMode(null));

  it('local synthetic execution carries a valid BROWSER_DEMO provenance v2', async () => {
    ApiClient.setDemoMode(true);
    const outcome = await ApiClient.executeRequest(request);
    const v2 = ProvenanceV2Schema.parse(outcome.provenanceV2);
    assert.equal(v2.sourceType, 'mock');
    assert.equal(v2.sourceSystem, 'BROWSER_DEMO');
    assert.equal(v2.apiName, 'local-demo');
    assert.equal(v2.apiVersion, '0');
    assert.equal(v2.queryHash, DEMO_QUERY_HASH);
    assert.equal(v2.queryHash, '0'.repeat(64));
    assert.deepEqual(v2.freshness, { ttlSeconds: 0, ageSeconds: 0, stale: false });
    assert.equal(v2.environmentTier, 'mock');
    assert.equal(v2.isSynthetic, true);
    assert.equal(v2.truncated, false);
    assert.equal(v2.reusedFromRunCache, false);
    assert.ok(v2.recordCount > 0);
    assert.deepEqual(v2.qualityFlags[0], {
      code: 'SYNTHETIC_DATA',
      severity: 'info',
      message: 'Demo mode: synthetic data computed in the browser',
    });
    assert.deepEqual(v2.metricVersions, {
      total_revenue: 'total_revenue@demo',
      total_expenses: 'total_expenses@demo',
      profit_margin: 'profit_margin@demo',
    });
    for (const r of outcome.results) {
      assert.equal(r.provenance.v2?.sourceSystem, 'BROWSER_DEMO');
      MetricResultSchema.parse(r);
    }
    assert.equal(buildSpecDataProvenance(outcome).v2?.sourceSystem, 'BROWSER_DEMO');
  });

  it('demo scope without postings flags MISSING_DATA and shows "No data"', async () => {
    ApiClient.setDemoMode(true);
    const outcome = await ApiClient.executeRequest({ ...request, filters: { companyCode: '1000', fiscalYear: 2019 } });
    ProvenanceV2Schema.parse(outcome.provenanceV2);
    assert.equal(outcome.provenanceV2?.recordCount, 0);
    for (const r of outcome.results) {
      assert.equal(metricDataState(r), 'MISSING_DATA');
      assert.equal(displayMetricValue(r), 'No data');
    }
  });

  it('buildDemoProvenanceV2 validates against the contract', () => {
    const v2 = buildDemoProvenanceV2(['net_profit'], { recordCount: 3 });
    assert.equal(ProvenanceV2Schema.safeParse(v2).success, true);
    assert.equal(v2.metricVersions['net_profit'], 'net_profit@demo');
  });
});
