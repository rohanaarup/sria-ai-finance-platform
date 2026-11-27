/**
 * Reusable adapter conformance suite (G2-02). Import `runConformance` from a test file to hold an
 * adapter to the contract. Not a test file itself (no `.test.` in the name).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AdapterCapabilitiesSchema, FinanceRecordSchema } from '@sria/contracts';
import type { FinanceRecord } from '@sria/contracts';
import { AdapterError } from '../../apps/cap/srv/lib/providers/adapter-contract.ts';
import type { FinanceSourceAdapter, AdapterQuery } from '../../apps/cap/srv/lib/providers/adapter-contract.ts';

const ctx = { tenant: 'T', userId: 'u' };

async function readAll(a: FinanceSourceAdapter, q: AdapterQuery, pageSize: number) {
  const out: FinanceRecord[] = [];
  let cursor: string | undefined, pages = 0;
  do {
    const p = await a.fetchPage(q, ctx, { cursor, pageSize });
    assert.ok(p.records.length <= pageSize, 'page larger than pageSize');
    out.push(...p.records);
    cursor = p.nextCursor;
    assert.ok(++pages < 10_000, 'paging does not terminate');
  } while (cursor);
  return out;
}

const brute = (data: readonly FinanceRecord[], q: AdapterQuery) => data.filter((r) =>
  q.companyCodes.includes(r.companyCode) && r.fiscalYear === q.fiscalYear && r.fiscalPeriod >= q.periodFrom && r.fiscalPeriod <= q.periodTo &&
  (q.businessUnit === undefined || r.businessUnit === q.businessUnit));
const sig = (rs: FinanceRecord[]) => rs.map((r) => JSON.stringify(r)).sort();

/** The reusable suite. `data` is what the adapter is known to contain (for brute-force comparison). */
export function runConformance(name: string, make: () => FinanceSourceAdapter, data: readonly FinanceRecord[], queries: AdapterQuery[]) {
  describe(`adapter conformance: ${name}`, () => {
    it('publishes a valid capability descriptor', () => {
      const caps = AdapterCapabilitiesSchema.parse(make().capabilities());
      assert.ok(caps.maxPageSize > 0);
    });
    for (const q of queries) {
      it(`honours filters exactly: ${JSON.stringify(q)}`, async () => {
        const a = make();
        const got = await readAll(a, q, Math.min(7, a.capabilities().maxPageSize));
        assert.deepEqual(sig(got), sig(brute(data, q)));
        for (const r of got) assert.ok(FinanceRecordSchema.safeParse(r).success, `invalid record ${r.recordId}`);
      });
    }
    it('pages without gaps or duplicates for any page size', async () => {
      const a = make(), q = queries[0]!;
      const expected = sig(brute(data, q));
      for (const size of [1, 3, a.capabilities().maxPageSize]) assert.deepEqual(sig(await readAll(a, q, size)), expected, `pageSize ${size}`);
    });
    it('returns an empty page (not an error) when nothing matches', async () => {
      const p = await make().fetchPage({ companyCodes: ['ZZZZ'], fiscalYear: 2026, periodFrom: '01', periodTo: '12' }, ctx, { pageSize: 10 });
      assert.deepEqual(p.records, []);
      assert.equal(p.nextCursor, undefined);
    });
    it('rejects an invalid cursor and an over-size page with typed BAD_QUERY errors', async () => {
      const a = make(), q = queries[0]!;
      await assert.rejects(a.fetchPage(q, ctx, { cursor: 'not-a-cursor', pageSize: 5 }), (e: unknown) => e instanceof AdapterError && e.code === 'BAD_QUERY');
      await assert.rejects(a.fetchPage(q, ctx, { pageSize: a.capabilities().maxPageSize + 1 }), (e: unknown) => e instanceof AdapterError && e.code === 'BAD_QUERY');
    });
    it('stops with a typed ABORTED error when cancelled', async () => {
      const ac = new AbortController(); ac.abort();
      await assert.rejects(make().fetchPage(queries[0]!, ctx, { pageSize: 5, signal: ac.signal }), (e: unknown) => e instanceof AdapterError && e.code === 'ABORTED');
    });
  });
}

