/**
 * Test database helper: every suite gets its own freshly deployed SQLite file in the OS temp
 * directory, built from the CDS model. Tests never depend on a pre-existing (gitignored)
 * sqlite.db, so they behave the same on a clean checkout and in CI (G2-00).
 */
import cds from '@sap/cds';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const capRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function options(url: string) {
  return { kind: 'sqlite', impl: '@cap-js/sqlite', credentials: { url } } as any;
}

export async function connectTestDb(): Promise<{ db: any; url: string }> {
  const url = join(mkdtempSync(join(tmpdir(), 'sria-test-')), 'test.db');
  const model = await cds.load(join(capRoot, 'db', 'schema.cds'));
  const db = await (cds.connect as any).to('db', options(url));
  await (cds as any).deploy(model).to(db);
  return { db, url };
}

/** Disconnect and reconnect to the same file: simulates a cold service restart. */
export async function reconnectTestDb(url: string): Promise<any> {
  await cds.disconnect();
  return (cds.connect as any).to('db', options(url));
}
