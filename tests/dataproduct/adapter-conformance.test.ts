/**
 * Adapter conformance: mock adapter, blocked stub and v1 shim (G2-02). The reusable suite lives in
 * conformance-suite.ts; the S/4HANA adapter runs it in apps/cap/test/s4hana-adapter.contract.test.ts.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AdapterCapabilitiesSchema, SYNTHETIC_FINANCE_RECORDS_V2 } from '@sria/contracts';
import { MockSourceAdapter, S4HanaSourceAdapter, AdapterError, adapterFromV1Provider } from '../../apps/cap/srv/lib/providers/adapter-contract.ts';
import type { AdapterQuery } from '../../apps/cap/srv/lib/providers/adapter-contract.ts';
import { MockFinanceDataProvider } from '../../apps/cap/srv/lib/providers/mock-finance-data-provider.ts';
import { runConformance } from './conformance-suite.ts';

const ctx = { tenant: 'T', userId: 'u' };
const QUERIES: AdapterQuery[] = [
  { companyCodes: ['3000'], fiscalYear: 2025, periodFrom: '01', periodTo: '12' },
  { companyCodes: ['1000', '2000'], fiscalYear: 2026, periodFrom: '01', periodTo: '02' },
  { companyCodes: ['3000'], fiscalYear: 2026, periodFrom: '04', periodTo: '06', businessUnit: 'BU_ADMIN' },
  { companyCodes: ['4000', '1000'], fiscalYear: 2026, periodFrom: '02', periodTo: '05' }
];

runConformance('MockSourceAdapter (fixtures v2)', () => new MockSourceAdapter(SYNTHETIC_FINANCE_RECORDS_V2, 50), SYNTHETIC_FINANCE_RECORDS_V2, QUERIES);

describe('adapter conformance: blocked S/4HANA adapter', () => {
  it('declares capabilities and fails every fetch with a typed UNAVAILABLE error until G2-03', async () => {
    const a = new S4HanaSourceAdapter('S4_DEST');
    AdapterCapabilitiesSchema.parse(a.capabilities());
    assert.equal(await a.isAvailable(), false);
    await assert.rejects(a.fetchPage(QUERIES[0]!, ctx, { pageSize: 10 }), (e: unknown) => e instanceof AdapterError && e.code === 'UNAVAILABLE');
  });
});

describe('v1 provider shim', () => {
  it('a wrapped v1 provider returns only in-query records', async () => {
    const a = adapterFromV1Provider(new MockFinanceDataProvider());
    const p = await a.fetchPage({ companyCodes: ['1000'], fiscalYear: 2026, periodFrom: '01', periodTo: '01' }, ctx, { pageSize: 100 });
    assert.ok(p.records.length > 0 && p.records.every((r) => r.companyCode === '1000' && r.fiscalPeriod === '01'));
  });
});
