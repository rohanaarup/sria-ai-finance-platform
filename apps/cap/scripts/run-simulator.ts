/**
 * Runs the local OData simulator as a standalone server, for practising the connection mechanics
 * (Destination, $metadata, OData queries) without any SAP or BTP account.
 *
 * !! The simulator is NOT SAP. It serves synthetic data shaped like the candidate journal-entry API.
 *
 * Usage:   node apps/cap/scripts/run-simulator.ts [--port 4010]
 * Then, in a SECOND terminal, in your local .env file (never committed):
 *   destinations=[{"name":"SIM_LOCAL","url":"http://127.0.0.1:4010"}]
 *   FINANCE_DATA_PROVIDER=s4hana
 *   FINANCE_S4HANA_DESTINATION_NAME=SIM_LOCAL
 * and explore, for example in a browser:
 *   http://127.0.0.1:4010/sap/opu/odata/sap/API_JOURNALENTRYITEMBASIC_SRV/$metadata
 *   http://127.0.0.1:4010/sap/opu/odata/sap/API_JOURNALENTRYITEMBASIC_SRV/A_JournalEntryItemBasic?$top=3&$format=json
 */
import { createServer } from 'node:net';
import { startSimulator, SIM_ROOT, SIM_ENTITY } from '../test/helpers/odata-simulator.ts';

const args = process.argv.slice(2);
const wanted = Number(args[args.indexOf('--port') + 1]) || 4010;

// startSimulator picks a free port itself; to honour --port we probe that it is free first.
await new Promise<void>((resolve, reject) => {
  const probe = createServer().once('error', () => reject(new Error(`Port ${wanted} is busy. Choose another with --port.`))).once('listening', () => probe.close(() => resolve())).listen(wanted, '127.0.0.1');
});
const sim = await startSimulator({ port: wanted });
console.log(`OData simulator running (synthetic data, NOT SAP) at ${sim.baseUrl}`);
console.log(`  metadata: ${sim.baseUrl}${SIM_ROOT}/$metadata`);
console.log(`  data:     ${sim.baseUrl}${SIM_ROOT}/${SIM_ENTITY}?$top=3&$format=json`);
console.log('Press Ctrl+C to stop.');
process.on('SIGINT', async () => { await sim.close(); process.exit(0); });
