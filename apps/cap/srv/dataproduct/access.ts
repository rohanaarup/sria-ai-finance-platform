/**
 * Entity access policy and per-tenant source selection for the data product (G2-02).
 *
 * D-17: the application table EntityAccess is the source of truth for which company codes a
 * principal may query. A snapshot is loaded from the seed CSV at import and from the database
 * lazily (same pattern as the semantic runtime).
 *
 * Per-tenant source selection uses DataSourceReferences (a tenant's workspace may point to an
 * S/4HANA destination alias); otherwise the configured default source is used.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYNTHETIC_V2_ENTITIES } from '@sria/contracts';
import type { EnvironmentTier } from '../lib/config/app-config.ts';
import { parseSemicolonCsv } from '../semantic/runtime.ts';

export interface AccessRow { tenantId: string; principalType: 'USER' | 'ROLE'; principalId: string; companyCode: string }
export interface SourceRefRow { tenantId: string; alias: string; sourceType: string }

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../db/data/sria.finance-EntityAccess.csv');
let accessRows: AccessRow[] = existsSync(DATA) ? (parseSemicolonCsv(readFileSync(DATA, 'utf8')) as any) : [];
let sourceRefs: SourceRefRow[] = [];
let loadedFromDb = false;
let loading: Promise<void> | null = null;

export function setAccessRows(rows: AccessRow[]): void { accessRows = rows; }
export function setSourceRefs(rows: SourceRefRow[]): void { sourceRefs = rows; }

export async function refreshAccessFromDb(db: any): Promise<void> {
  accessRows = await db.run(SELECT.from('sria.finance.EntityAccess'));
  const refs = await db.run(
    SELECT.from('sria.finance.DataSourceReferences as d').join('sria.finance.Workspaces as w').on('d.workspace_ID = w.ID')
      .columns('w.organization_ID as tenantId', 'd.alias as alias', 'd.sourceType as sourceType')
  );
  sourceRefs = refs;
  loadedFromDb = true;
}

export async function ensureAccessLoaded(): Promise<void> {
  if (loadedFromDb) return;
  const cds = (await import('@sap/cds')).default as any;
  if (!cds.db) return;
  loading ??= refreshAccessFromDb(cds.db).catch((err: Error) => {
    console.warn('[dataproduct] using seed entity access; database load failed:', err.message);
  }).finally(() => { loading = null; });
  await loading;
}

export interface Principal { tenant: string; userId: string; roles: string[] }

/**
 * Company codes the principal may query.
 * pilot / production: only rows in EntityAccess (no rows → nothing).
 * mock / local: a tenant with no rows at all may query the synthetic fixture entities, so
 * development and older tests work; a tenant WITH rows is restricted to them.
 */
export function permittedEntities(p: Principal, tier: EnvironmentTier): Set<string> {
  const rows = accessRows.filter((r) => r.tenantId === p.tenant);
  if (!rows.length) return new Set(tier === 'mock' || tier === 'local' ? SYNTHETIC_V2_ENTITIES : []);
  return new Set(rows.filter((r) =>
    (r.principalType === 'USER' && r.principalId === p.userId) ||
    (r.principalType === 'ROLE' && p.roles.includes(r.principalId))
  ).map((r) => r.companyCode));
}

/** S/4HANA destination alias configured for the tenant, if any. */
export function tenantSourceRef(tenant: string): SourceRefRow | null {
  return sourceRefs.find((r) => r.tenantId === tenant && r.sourceType === 's4hana') ?? null;
}
