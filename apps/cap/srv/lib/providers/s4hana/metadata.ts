/**
 * Service metadata as evidence (G2-03, "Step 0 — discovery").
 *
 * The adapter may only read fields that exist in the real system's `$metadata`. This module
 * parses an OData v2 EDMX document into entity sets and typed properties, and checks that every
 * field the adapter selects is present — so every field is traceable to evidence, and an endpoint
 * or field outside the metadata is refused before any data is requested.
 *
 * (OData v4 `$metadata` uses a different namespace; this parser handles the v2/EDMX shape used by
 * the candidate API and tolerates both attribute orders. It is a tolerant reader, not a validator.)
 */
import { AdapterError } from '../adapter-contract.ts';

export interface EntityProperty { name: string; type: string; nullable: boolean; maxLength?: number }
export interface EntitySetInfo { name: string; entityType: string; properties: EntityProperty[]; keys: string[] }
export interface ServiceMetadata { version: string | null; entitySets: EntitySetInfo[] }

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

export function parseMetadata(xml: string): ServiceMetadata {
  if (!/<(\w+:)?Edmx\b/.test(xml)) throw new AdapterError('MALFORMED', 'The service metadata is not an EDMX document.');
  const version = /<(?:\w+:)?Edmx\b[^>]*\bVersion="([^"]+)"/.exec(xml)?.[1] ?? null;
  const types = new Map<string, { properties: EntityProperty[]; keys: string[] }>();
  for (const m of xml.matchAll(/<EntityType\b([^>]*)>([\s\S]*?)<\/EntityType>/g)) {
    const name = attr(m[1]!, 'Name'); if (!name) continue;
    const properties = [...m[2]!.matchAll(/<Property\b([^>]*?)\/?>/g)].map((p) => ({
      name: attr(p[1]!, 'Name')!, type: attr(p[1]!, 'Type') ?? 'Edm.String', nullable: attr(p[1]!, 'Nullable') !== 'false',
      ...(attr(p[1]!, 'MaxLength') ? { maxLength: Number(attr(p[1]!, 'MaxLength')) } : {})
    })).filter((p) => p.name);
    const keys = [...(/<Key>([\s\S]*?)<\/Key>/.exec(m[2]!)?.[1] ?? '').matchAll(/<PropertyRef\b([^>]*?)\/?>/g)].map((k) => attr(k[1]!, 'Name')!).filter(Boolean);
    types.set(name, { properties, keys });
  }
  const entitySets: EntitySetInfo[] = [];
  for (const m of xml.matchAll(/<EntitySet\b([^>]*?)\/?>/g)) {
    const name = attr(m[1]!, 'Name'), full = attr(m[1]!, 'EntityType');
    if (!name || !full) continue;
    const t = types.get(full.split('.').pop()!);
    if (t) entitySets.push({ name, entityType: full, properties: t.properties, keys: t.keys });
  }
  if (!entitySets.length) throw new AdapterError('MALFORMED', 'The service metadata contains no entity sets.');
  return { version, entitySets };
}

/** Throws unless the entity set exists and every field is a property of it. */
export function assertFieldsInMetadata(meta: ServiceMetadata, entitySet: string, fields: readonly string[]): EntitySetInfo {
  const es = meta.entitySets.find((e) => e.name === entitySet);
  if (!es) throw new AdapterError('NOT_FOUND', `Entity set "${entitySet}" is not in the service metadata (available: ${meta.entitySets.map((e) => e.name).join(', ') || 'none'}).`);
  const have = new Set(es.properties.map((p) => p.name));
  const missing = fields.filter((f) => !have.has(f));
  if (missing.length) throw new AdapterError('BAD_QUERY', `Field(s) not in the service metadata for ${entitySet}: ${missing.join(', ')}. The adapter only reads fields that exist in the system's own metadata.`);
  return es;
}

/** Field → type table for the evidence document (docs/sap). */
export function traceabilityTable(meta: ServiceMetadata, entitySet: string, fields: readonly string[]): Array<{ field: string; edmType: string; inMetadata: boolean }> {
  const es = meta.entitySets.find((e) => e.name === entitySet);
  return fields.map((f) => { const p = es?.properties.find((x) => x.name === f); return { field: f, edmType: p?.type ?? '—', inMetadata: !!p }; });
}
