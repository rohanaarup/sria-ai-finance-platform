/**
 * Records adapter ↔ service traffic into tests/fixtures/sap/recorded-responses.json for replay tests.
 *
 * TODAY the recording is made against the local OData SIMULATOR (synthetic data) and is labelled
 * SIMULATED. When a real system is connected (G2-03 steps 3-5), re-run this against the real
 * Destination with sanitised data, review the file for personal or confidential content, and
 * replace the committed recording. Run: node apps/cap/scripts/record-sap-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S4HanaODataAdapter } from '../srv/lib/providers/s4hana/adapter.ts';
import { FetchTransport, ReplayTransport } from '../srv/lib/providers/s4hana/odata-client.ts';
import type { ODataTransport, ODataResponse } from '../srv/lib/providers/s4hana/odata-client.ts';
import { startSimulator, SIM_ROOT, SIM_ENTITY } from '../test/helpers/odata-simulator.ts';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../tests/fixtures/sap/recorded-responses.json');
const query = { companyCodes: ['3000'], fiscalYear: 2025, periodFrom: '01', periodTo: '02' };
const pageSize = 4;

const sim = await startSimulator();
const responses: Record<string, ODataResponse> = {};
const inner = new FetchTransport(sim.baseUrl);
const recording: ODataTransport = {
  describe: () => 'recording',
  async get(path, q, opts) { const r = await inner.get(path, q, opts); responses[ReplayTransport.keyOf(path, q)] = { status: r.status, headers: { 'content-type': r.headers['content-type'] ?? '' }, text: r.text }; return r; }
};
const adapter = new S4HanaODataAdapter({
  transport: recording, serviceRoot: SIM_ROOT, entitySet: SIM_ENTITY, maxPageSize: 50,
  mapper: { amountConvention: 'INDICATOR', revenueAccounts: '400000-499999', expenseAccounts: '500000-699999' }
});
let cursor: string | undefined;
do { const p = await adapter.fetchPage(query, { tenant: 'T', userId: 'u' }, { cursor, pageSize }); cursor = p.nextCursor; } while (cursor);
await sim.close();

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({
  _note: 'SIMULATED: recorded from the local OData simulator with synthetic data (not from SAP). Replace with a sanitised recording from the real system once connected.',
  query, pageSize, responses
}, null, 2) + '\n');
console.log('wrote', out, Object.keys(responses).length, 'responses');
