/**
 * FinancialPerformance data product (G2-02, ADR-012).
 *
 * The only way tools and service handlers obtain finance figures. In order:
 *  1. Validate the business query (Zod) and the retrieval bounds.
 *  2. Validate metrics and dimensions against the semantic layer (executable in this tier).
 *  3. Entity-level authorization (denials are audited).
 *  4. Choose the source adapter for the tenant; reuse a same-run result by query hash.
 *  5. Page through the adapter under a timeout + AbortSignal; refuse (never truncate) over-limit reads.
 *  6. Quality checks → flags; group results; one result per currency (no FX conversion exists).
 *  7. Calculate with semantic formulas (Decimal only) and attach provenance v2.
 * Records stay in memory for the duration of the call (ADR-002).
 */
import { createHash } from 'node:crypto';
import { DataProductQuerySchema } from '@sria/contracts';
import type {
  DataProductQueryInput, DataProductQuery, DataProductResult, DataProductGroup, DataProductMetric,
  QualityFlag, ProvenanceV2, FinanceRecord, AdapterCapabilities
} from '@sria/contracts';
import { FinanceRecordSchema } from '@sria/contracts';
import { loadConfig } from '../lib/config/app-config.ts';
import type { EnvironmentTier } from '../lib/config/app-config.ts';
import { getSemanticCatalog, ensureSemanticLoaded } from '../semantic/runtime.ts';
import type { SemanticCatalog } from '../semantic/catalog.ts';
import { MetricNotExecutableError } from '../semantic/catalog.ts';
import { evaluateMetrics } from '../semantic/evaluate.ts';
import { toApiNumber, toFixedString } from '../lib/finance/decimal.ts';
import { MockSourceAdapter, S4HanaSourceAdapter, AdapterError, adapterFromV1Provider } from '../lib/providers/adapter-contract.ts';
import type { FinanceSourceAdapter } from '../lib/providers/adapter-contract.ts';
import type { FinanceDataProvider } from '../lib/providers/finance-data-provider.ts';
import { permittedEntities, tenantSourceRef, ensureAccessLoaded } from './access.ts';

export type { FinanceSourceAdapter, FinanceDataProvider };
/** Anything a caller may inject as the data source (tests): a v2 adapter or a v1 provider. */
export type DataSourceOverride = FinanceSourceAdapter | FinanceDataProvider;

export type DataProductErrorCode = 'BAD_QUERY' | 'BOUNDS' | 'ACCESS_DENIED' | 'METRIC_NOT_EXECUTABLE' | 'SOURCE_UNAVAILABLE' | 'TIMEOUT' | 'TRUNCATION_REFUSED' | 'BAD_SOURCE_DATA';
const STATUS: Record<DataProductErrorCode, number> = {
  BAD_QUERY: 400, BOUNDS: 400, ACCESS_DENIED: 403, METRIC_NOT_EXECUTABLE: 422, SOURCE_UNAVAILABLE: 503, TIMEOUT: 504, TRUNCATION_REFUSED: 413, BAD_SOURCE_DATA: 502
};

export class DataProductError extends Error {
  readonly code: DataProductErrorCode;
  readonly status: number;
  constructor(code: DataProductErrorCode, message: string) {
    super(message);
    this.name = 'DataProductError';
    this.code = code;
    this.status = STATUS[code];
  }
}

export interface DataProductContext {
  tenant: string;
  userId: string;
  roles: string[];
  /** Per-run reuse keyed by query hash (in memory, never persisted). */
  runCache?: Map<string, DataProductResult>;
  signal?: AbortSignal;
}

export interface DataProductOptions {
  source?: DataSourceOverride;
  catalog?: SemanticCatalog;
  tier?: EnvironmentTier;
  bounds?: Partial<{ maxEntities: number; maxPeriods: number; maxRows: number; timeoutMs: number }>;
  /** Called on denied entity access (default: AuditEvents row when a database is connected). */
  audit?: (event: { tenant: string; userId: string; action: string; details: string }) => Promise<void> | void;
}

const isAdapter = (s: DataSourceOverride): s is FinanceSourceAdapter => typeof (s as FinanceSourceAdapter).fetchPage === 'function';

/** The adapter that serves a tenant: injected override, the tenant's DataSourceReference, or the configured default. */
export function resolveAdapter(tenant: string, override?: DataSourceOverride): FinanceSourceAdapter {
  if (override) return isAdapter(override) ? override : adapterFromV1Provider(override);
  const ref = tenantSourceRef(tenant);
  if (ref) return new S4HanaSourceAdapter(ref.alias);
  const cfg = loadConfig();
  return cfg.financeProvider === 's4hana' ? new S4HanaSourceAdapter(cfg.s4DestinationName) : new MockSourceAdapter();
}

export function queryHash(q: DataProductQuery, tenant: string, adapterId: string): string {
  const canonical = JSON.stringify({
    tenant, source: adapterId, entities: [...q.entities].sort(), fiscalYear: q.fiscalYear, periodFrom: q.periodFrom,
    periodTo: q.periodTo, metrics: [...q.metrics].sort(), groupBy: q.groupBy, businessUnit: q.businessUnit ?? null
  });
  return createHash('sha256').update(canonical).digest('hex');
}

async function defaultAudit(e: { tenant: string; userId: string; action: string; details: string }) {
  const cds = (await import('@sap/cds')).default as any;
  if (!cds.db) return;
  // Own transaction: the denied request is rolled back, but its audit record must survive.
  await cds.db.tx({ user: new cds.User.Privileged() }, (tx: any) => tx.run(INSERT.into('sria.finance.AuditEvents').entries({
    organizationId: e.tenant, workspaceId: 'DATA_PRODUCT', userId: e.userId, action: e.action, sourceSystem: 'DATA_PRODUCT', details: e.details.slice(0, 1000)
  })));
}

const periodsBetween = (from: string, to: string) => {
  const out: string[] = [];
  for (let p = Number(from); p <= Number(to); p++) out.push(String(p).padStart(2, '0'));
  return out;
};

export async function getPerformance(input: DataProductQueryInput, ctx: DataProductContext, opts: DataProductOptions = {}): Promise<DataProductResult> {
  const cfg = loadConfig();
  const tier = opts.tier ?? cfg.tier;
  const bounds = { ...cfg.bounds, ...opts.bounds };
  if (!opts.catalog) await ensureSemanticLoaded();
  await ensureAccessLoaded();
  const catalog = opts.catalog ?? getSemanticCatalog();

  // 1. query shape and bounds
  const parsed = DataProductQuerySchema.safeParse(input);
  if (!parsed.success) throw new DataProductError('BAD_QUERY', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const q = parsed.data;
  const entities = [...new Set(q.entities)];
  if (entities.length > bounds.maxEntities) throw new DataProductError('BOUNDS', `At most ${bounds.maxEntities} company codes per query (got ${entities.length}).`);
  const periods = periodsBetween(q.periodFrom, q.periodTo);
  if (periods.length > bounds.maxPeriods) throw new DataProductError('BOUNDS', `At most ${bounds.maxPeriods} periods per query (got ${periods.length}).`);
  if (q.metrics.length > 20) throw new DataProductError('BOUNDS', 'At most 20 metrics per query.');

  // 2. semantic validation
  try {
    catalog.assertExecutable(q.metrics, tier, ctx.tenant);
  } catch (e) {
    if (e instanceof MetricNotExecutableError) throw new DataProductError('METRIC_NOT_EXECUTABLE', e.message);
    throw e;
  }
  const knownDims = new Set(catalog.dimensions(ctx.tenant).map((d) => d.dimensionId));
  const badDims = q.groupBy.filter((d) => !knownDims.has(d));
  if (badDims.length) throw new DataProductError('BAD_QUERY', `Unknown dimension(s): ${badDims.join(', ')}`);
  const knownEntities = new Set(catalog.dimensions(ctx.tenant).find((d) => d.dimensionId === 'company_code')?.members.map((m) => m.memberId) ?? []);
  const unknown = entities.filter((e) => knownEntities.size && !knownEntities.has(e));

  // 3. entity-level authorization (unknown entities are treated like forbidden ones: no existence leak)
  const allowed = permittedEntities({ tenant: ctx.tenant, userId: ctx.userId, roles: ctx.roles }, tier);
  const denied = entities.filter((e) => !allowed.has(e) || unknown.includes(e));
  if (denied.length) {
    await (opts.audit ?? defaultAudit)({ tenant: ctx.tenant, userId: ctx.userId, action: 'ENTITY_ACCESS_DENIED', details: `company codes: ${denied.join(', ')}` });
    throw new DataProductError('ACCESS_DENIED', `Not permitted to query company code(s): ${denied.join(', ')}`);
  }

  // 4. source and run cache
  const adapter = resolveAdapter(ctx.tenant, opts.source);
  const caps: AdapterCapabilities = adapter.capabilities();
  const hash = queryHash({ ...q, entities }, ctx.tenant, caps.adapterId);
  const cached = ctx.runCache?.get(hash);
  if (cached) {
    const age = Math.max(0, Math.round((Date.now() - Date.parse(cached.provenance.retrievedAt)) / 1000));
    return { ...cached, provenance: { ...cached.provenance, reusedFromRunCache: true, freshness: { ...cached.provenance.freshness, ageSeconds: age, stale: age > cached.provenance.freshness.ttlSeconds } } };
  }

  // 5. paged, bounded, cancellable retrieval
  const timeout = AbortSignal.timeout(bounds.timeoutMs);
  const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;
  const records: FinanceRecord[] = [];
  const retrievedAt = new Date().toISOString();
  try {
    let cursor: string | undefined;
    do {
      if (signal.aborted) throw new AdapterError(timeout.aborted ? 'TIMEOUT' : 'ABORTED', 'Retrieval stopped');
      const page = await adapter.fetchPage(
        { companyCodes: entities, fiscalYear: q.fiscalYear, periodFrom: q.periodFrom, periodTo: q.periodTo, businessUnit: q.businessUnit },
        { tenant: ctx.tenant, userId: ctx.userId },
        { cursor, pageSize: caps.maxPageSize, signal }
      );
      records.push(...page.records);
      if (records.length > bounds.maxRows) {
        throw new DataProductError('TRUNCATION_REFUSED', `The query would read more than ${bounds.maxRows} source rows; narrow the company codes or periods. Partial results are never returned.`);
      }
      cursor = page.nextCursor;
    } while (cursor);
  } catch (e) {
    if (e instanceof DataProductError) throw e;
    if (e instanceof AdapterError) {
      if (e.code === 'TIMEOUT' || (e.code === 'ABORTED' && timeout.aborted)) throw new DataProductError('TIMEOUT', `The source did not answer within ${bounds.timeoutMs} ms.`);
      if (e.code === 'ABORTED') throw e;
      if (e.code === 'BAD_QUERY') throw new DataProductError('BAD_QUERY', e.message);
      throw new DataProductError('SOURCE_UNAVAILABLE', e.message);
    }
    throw e;
  }

  // Source data must match the contract and the query exactly (defence against adapter bugs)
  for (const r of records) {
    if (!FinanceRecordSchema.safeParse(r).success) throw new DataProductError('BAD_SOURCE_DATA', `Source returned a malformed record (${(r as any)?.recordId ?? 'no id'}).`);
    if (!entities.includes(r.companyCode) || r.fiscalYear !== q.fiscalYear || r.fiscalPeriod < q.periodFrom || r.fiscalPeriod > q.periodTo) {
      throw new DataProductError('BAD_SOURCE_DATA', `Source returned a record outside the query (${r.recordId}).`);
    }
  }

  // 6. quality checks
  const flags: QualityFlag[] = [];
  if (caps.isSynthetic) flags.push({ code: 'SYNTHETIC_DATA', severity: 'info', message: 'Results come from synthetic test fixtures, not from SAP.' });
  for (const cc of entities) {
    const mine = records.filter((r) => r.companyCode === cc);
    const regular = periods.filter((p) => p <= '12');
    for (const p of regular) {
      if (!mine.some((r) => r.fiscalPeriod === p)) flags.push({ code: 'MISSING_PERIOD', severity: 'warning', message: `No postings for company ${cc} in period ${p}.`, companyCode: cc, fiscalPeriod: p });
    }
    const seen = new Map<string, number>();
    for (const r of mine) seen.set(r.recordId, (seen.get(r.recordId) ?? 0) + 1);
    for (const [id, n] of seen) if (n > 1) {
      const per = mine.find((r) => r.recordId === id)!.fiscalPeriod;
      flags.push({ code: 'DUPLICATE_POSTING_KEY', severity: 'warning', message: `Posting key ${id} appears ${n} times in company ${cc}; totals include every occurrence.`, companyCode: cc, fiscalPeriod: per });
    }
    const cur = [...new Set(mine.map((r) => r.currency))];
    if (cur.length > 1) flags.push({ code: 'CURRENCY_MIX', severity: 'warning', message: `Company ${cc} has postings in ${cur.join(', ')}; results are reported per currency and not converted.`, companyCode: cc });
  }
  const currencies = [...new Set(records.map((r) => r.currency))].sort();
  if (currencies.length > 1 && !flags.some((f) => f.code === 'CURRENCY_MIX')) {
    flags.push({ code: 'CURRENCY_MIX', severity: 'info', message: `Results span ${currencies.join(', ')}; each currency is reported separately and not converted.` });
  }

  // 7. grouping, per-currency calculation
  const metricVersions: Record<string, string> = {};
  const calc = (rows: FinanceRecord[], scope: { companyCode?: string; fiscalPeriod?: string }): DataProductMetric[] => {
    const ev = evaluateMetrics(rows, catalog, q.metrics, { tier, tenant: ctx.tenant });
    return q.metrics.map((id) => {
      const r = ev.results.get(id)!;
      metricVersions[id] = r.metricVersion;
      if (r.isZeroDenominator) flags.push({ code: 'ZERO_DENOMINATOR', severity: 'info', message: `${r.label}: denominator is zero; reported as 0.`, metricId: id, ...scope });
      if (r.dataState === 'ZERO_VALUE') flags.push({ code: 'ZERO_VALUE', severity: 'info', message: `${r.label} has postings that net to exactly zero.`, metricId: id, ...scope });
      if (r.dataState === 'MISSING_DATA') flags.push({ code: 'MISSING_DATA', severity: 'warning', message: `${r.label}: no source records.`, metricId: id, ...scope });
      return {
        metricId: id, label: r.label, value: toApiNumber(r.value), valueText: toFixedString(r.value, r.decimals), unit: r.unit,
        decimals: r.decimals, metricVersion: r.metricVersion, dataState: r.dataState, isZeroDenominator: r.isZeroDenominator
      };
    });
  };

  const keyOf = (r: FinanceRecord) => ({
    ...(q.groupBy.includes('company_code') ? { companyCode: r.companyCode } : {}),
    ...(q.groupBy.includes('fiscal_period') ? { fiscalPeriod: r.fiscalPeriod } : {}),
    ...(q.groupBy.includes('business_unit') ? { businessUnit: r.businessUnit ?? 'UNASSIGNED' } : {})
  });
  const buckets = new Map<string, { key: DataProductGroup['key']; currency: string; rows: FinanceRecord[] }>();
  for (const r of records) {
    const key = keyOf(r);
    const id = JSON.stringify([key, r.currency]);
    if (!buckets.has(id)) buckets.set(id, { key, currency: r.currency, rows: [] });
    buckets.get(id)!.rows.push(r);
  }
  // Requested entities without any records still appear (as MISSING_DATA) so "no data" is visible.
  if (q.groupBy.length === 1 && q.groupBy[0] === 'company_code') {
    for (const cc of entities) if (![...buckets.values()].some((b) => b.key.companyCode === cc)) buckets.set(`empty-${cc}`, { key: { companyCode: cc }, currency: 'XXX', rows: [] });
  }
  const groups: DataProductGroup[] = [...buckets.values()]
    .sort((a, b) => JSON.stringify([a.key, a.currency]).localeCompare(JSON.stringify([b.key, b.currency])))
    .map((b) => ({ key: b.key, currency: b.currency, recordCount: b.rows.length, metrics: calc(b.rows, { companyCode: b.key.companyCode, fiscalPeriod: b.key.fiscalPeriod }) }));
  const totalsByCurrency = currencies.map((c) => {
    const rows = records.filter((r) => r.currency === c);
    return { currency: c, recordCount: rows.length, metrics: calc(rows, {}) };
  });

  const provenance: ProvenanceV2 = {
    provenanceVersion: '2', sourceType: caps.sourceType, sourceSystem: caps.sourceSystem, apiName: caps.apiName, apiVersion: caps.apiVersion,
    queryHash: hash, retrievedAt, freshness: { ttlSeconds: caps.freshnessTtlSeconds, ageSeconds: 0, stale: false },
    recordCount: records.length, qualityFlags: dedupeFlags(flags), metricVersions, environmentTier: tier, isSynthetic: caps.isSynthetic,
    truncated: false, reusedFromRunCache: false
  };
  const result: DataProductResult = {
    query: { entities, fiscalYear: q.fiscalYear, periodFrom: q.periodFrom, periodTo: q.periodTo, metrics: q.metrics, groupBy: q.groupBy, ...(q.businessUnit ? { businessUnit: q.businessUnit } : {}) },
    groups, totalsByCurrency, currencies, converted: false, provenance
  };
  ctx.runCache?.set(hash, result);
  return result;
}

function dedupeFlags(flags: QualityFlag[]): QualityFlag[] {
  const seen = new Set<string>();
  return flags.filter((f) => { const k = JSON.stringify(f); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Source status for the caller's tenant (replaces direct provider access in handlers). */
export async function sourceStatus(tenant: string, override?: DataSourceOverride) {
  await ensureAccessLoaded();
  const a = resolveAdapter(tenant, override);
  const caps = a.capabilities();
  return { sourceType: caps.sourceType, sourceSystem: caps.sourceSystem, isSynthetic: caps.isSynthetic, isAvailable: await a.isAvailable(), apiName: caps.apiName };
}

/** Legacy path for DATA_PRODUCT=off (rollback only): plain record fetch through the adapter, no bounds or flags. */
export async function legacyFetchRecords(q: { companyCode: string; fiscalYear: number; fiscalPeriod?: string }, ctx: { tenant: string; userId: string }, override?: DataSourceOverride): Promise<{ records: FinanceRecord[]; caps: AdapterCapabilities }> {
  const a = resolveAdapter(ctx.tenant, override);
  const records: FinanceRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await a.fetchPage(
      { companyCodes: [q.companyCode], fiscalYear: q.fiscalYear, periodFrom: q.fiscalPeriod ?? '01', periodTo: q.fiscalPeriod ?? '16' },
      { tenant: ctx.tenant, userId: ctx.userId }, { cursor, pageSize: a.capabilities().maxPageSize }
    );
    records.push(...page.records);
    cursor = page.nextCursor;
  } while (cursor);
  return { records, caps: a.capabilities() };
}
