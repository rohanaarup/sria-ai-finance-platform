/**
 * Semantic runtime: holds the current SemanticCatalog snapshot for the process (G2-01).
 *
 * At import, the snapshot is built from the seed CSV files in db/data (the same files CAP
 * deploys into the database), so tools and tests work without I/O. Once the server is up,
 * `refreshFromDb()` replaces it with the database content, and the SemanticService calls it
 * again after every approved change.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SemanticCatalog } from './catalog.ts';
import type { SemanticRows } from './catalog.ts';

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../db/data');
const NUMERIC = new Set(['version', 'decimals', 'periodsPerYear', 'specialPeriods', 'startMonth', 'fiscalYear']);
const BOOLEAN = new Set(['isSpecial']);

export function parseSemicolonCsv(text: string): Record<string, unknown>[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
  const header = lines.shift()!.split(';');
  return lines.map((line) => {
    const cells = line.split(';');
    const row: Record<string, unknown> = {};
    header.forEach((h, i) => {
      const raw = cells[i] ?? '';
      row[h] = raw === '' ? null : NUMERIC.has(h) ? Number(raw) : BOOLEAN.has(h) ? raw === 'true' : raw;
    });
    return row;
  });
}

function readSeed(name: string): any[] {
  const p = join(DATA_DIR, `sria.finance-${name}.csv`);
  return existsSync(p) ? parseSemicolonCsv(readFileSync(p, 'utf8')) : [];
}

export function loadSeedRows(): SemanticRows {
  return {
    definitions: readSeed('MetricDefinitions'), versions: readSeed('MetricVersions'), dependencies: readSeed('MetricDependencies'),
    glossary: readSeed('GlossaryTerms'), mappings: readSeed('SourceMappings'), dimensions: readSeed('Dimensions'),
    members: readSeed('DimensionMembers'), calendars: readSeed('FiscalCalendars'), periods: readSeed('FiscalPeriods')
  };
}

let current = new SemanticCatalog(loadSeedRows());

export function getSemanticCatalog(): SemanticCatalog {
  return current;
}

/** @internal tests and the SemanticService */
export function setSemanticCatalog(c: SemanticCatalog): void {
  current = c;
}

const E = 'sria.finance.';
export async function loadRowsFromDb(db: any): Promise<SemanticRows> {
  const all = (n: string) => db.run(SELECT.from(E + n));
  const [definitions, versions, dependencies, glossary, mappings, dimensions, members, calendars, periods] = await Promise.all(
    ['MetricDefinitions', 'MetricVersions', 'MetricDependencies', 'GlossaryTerms', 'SourceMappings', 'Dimensions', 'DimensionMembers', 'FiscalCalendars', 'FiscalPeriods'].map(all)
  );
  return { definitions, versions, dependencies, glossary, mappings, dimensions, members, calendars, periods };
}

export async function refreshFromDb(db: any): Promise<SemanticCatalog> {
  current = new SemanticCatalog(await loadRowsFromDb(db));
  loadedFromDb = true;
  return current;
}

let loadedFromDb = false;
let loading: Promise<void> | null = null;

/**
 * Load the semantic layer from the connected database once per process (lazily, on the first
 * request that needs it). Until then — and if the database has no semantic tables — the seed
 * snapshot is used. Request handlers call this before consulting the catalog.
 */
export async function ensureSemanticLoaded(): Promise<void> {
  if (loadedFromDb) return;
  const cds = (await import('@sap/cds')).default as any;
  if (!cds.db) return;
  loading ??= refreshFromDb(cds.db).then(() => undefined).catch((err: Error) => {
    console.warn('[semantic] using seed data; database load failed:', err.message);
  }).finally(() => { loading = null; });
  await loading;
}
