/**
 * S/4HANA OData source adapter (G2-03). READ-ONLY: it only issues GET requests.
 *
 * Behaviour:
 *  - Query: `$filter` on company codes, fiscal year and period range, `$select` limited to the
 *    approved fields, `$top` = page size, `$orderby` on the key fields for stable paging.
 *  - Evidence first: before the first data call the service `$metadata` is read once and every
 *    selected field must exist in it (metadata.ts); otherwise the adapter refuses to query.
 *  - Paging: follows server-driven paging (`__next` / `@odata.nextLink` → opaque cursor) and falls
 *    back to `$skip` offsets. Never returns more than `pageSize` records per page.
 *  - Failures are classified (errors.ts). Transient ones (timeout, throttling, 502/503/5xx) are
 *    retried with exponential backoff + jitter (honouring Retry-After); a circuit breaker stops
 *    hammering a failing system. Nothing falls back to mock data, ever.
 *  - Every call is audited: identity, tenant, entity, query hash, row count, duration, outcome — no values.
 *  - Response bodies and record values are never logged.
 */
import { createHash } from 'node:crypto';
import type { AdapterCapabilities } from '@sria/contracts';
import { AdapterError } from '../adapter-contract.ts';
import type { FinanceSourceAdapter, AdapterQuery, AdapterPage, AdapterContext } from '../adapter-contract.ts';
import type { ODataTransport } from './odata-client.ts';
import { errorFromStatus, isRetryable, ThrottledError } from './errors.ts';
import { parseMetadata, assertFieldsInMetadata } from './metadata.ts';
import type { ServiceMetadata } from './metadata.ts';
import { mapRow, SELECTED_FIELDS } from './mapper.ts';
import type { MapperConfig } from './mapper.ts';

export interface S4AuditEvent {
  tenant: string; userId: string; source: string; entity: string; queryHash: string;
  rowCount: number; durationMs: number; outcome: 'OK' | string; attempts: number;
}

export interface S4AdapterOptions {
  transport: ODataTransport;
  serviceRoot: string;
  entitySet: string;
  mapper: MapperConfig;
  /** Ledger to read (default '0L', the usual leading ledger — CANDIDATE until Finance confirms). `null` disables the filter and risks double counting across ledgers. */
  ledger?: string | null;
  maxPageSize?: number;
  /** Per-HTTP-call timeout. */
  callTimeoutMs?: number;
  retry?: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number };
  breaker?: { failureThreshold: number; openMs: number };
  audit?: (e: S4AuditEvent) => Promise<void> | void;
  /** Injected for deterministic tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  now?: () => number;
  /** How long a successful health check stays valid. */
  healthTtlMs?: number;
}

const defaultSleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new AdapterError('ABORTED', 'The request was cancelled.'));
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new AdapterError('ABORTED', 'The request was cancelled.')); }, { once: true });
});

const esc = (v: string) => v.replace(/'/g, "''");

export class S4HanaODataAdapter implements FinanceSourceAdapter {
  private readonly o: Required<Pick<S4AdapterOptions, 'maxPageSize' | 'callTimeoutMs' | 'retry' | 'breaker' | 'healthTtlMs'>> & S4AdapterOptions;
  private metadata: ServiceMetadata | null = null;
  private metadataLoading: Promise<ServiceMetadata> | null = null;
  private failures = 0;
  private openUntil = 0;
  private healthy: { at: number; ok: boolean } | null = null;

  constructor(options: S4AdapterOptions) {
    this.o = {
      maxPageSize: 1000, callTimeoutMs: 8000, retry: { maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 5000 },
      breaker: { failureThreshold: 5, openMs: 30_000 }, healthTtlMs: 30_000, ...options
    };
  }

  capabilities(): AdapterCapabilities {
    return {
      adapterId: 's4hana-odata', sourceType: 's4hana', sourceSystem: `SAP_S4HANA (${this.o.transport.describe()})`,
      apiName: this.o.serviceRoot.split('/').pop() ?? this.o.serviceRoot, apiVersion: this.metadata?.version ? `OData ${this.metadata.version}` : 'unverified',
      isSynthetic: false, dimensions: ['company_code', 'fiscal_period', 'business_unit'],
      pushdownFilters: ['companyCodes', 'fiscalYear', 'periodRange'], maxPageSize: this.o.maxPageSize, supportsAbort: true, freshnessTtlSeconds: 900
    };
  }

  /** Real reachability check: a cheap metadata read. Cached briefly; never throws. */
  async isAvailable(): Promise<boolean> {
    const now = (this.o.now ?? Date.now)();
    if (this.healthy && now - this.healthy.at < this.o.healthTtlMs) return this.healthy.ok;
    let ok = false;
    try {
      await this.loadMetadata(undefined, true);
      ok = true;
    } catch { ok = false; }
    this.healthy = { at: now, ok };
    return ok;
  }

  private async loadMetadata(signal?: AbortSignal, force = false): Promise<ServiceMetadata> {
    if (this.metadata && !force) return this.metadata;
    this.metadataLoading ??= (async () => {
      const res = await this.request(`${this.o.serviceRoot}/$metadata`, {}, signal, { accept: 'xml' });
      this.metadata = parseMetadata(res.text);
      return this.metadata;
    })().finally(() => { this.metadataLoading = null; });
    return this.metadataLoading;
  }

  async fetchPage(q: AdapterQuery, ctx: AdapterContext, opts: { cursor?: string; pageSize: number; signal?: AbortSignal }): Promise<AdapterPage> {
    const started = (this.o.now ?? Date.now)();
    const entity = this.o.entitySet;
    const queryHash = createHash('sha256').update(JSON.stringify({ q, cursor: opts.cursor ?? null, size: opts.pageSize })).digest('hex');
    let attempts = 0, rowCount = 0, outcome: string = 'OK';
    try {
      if (!(opts.pageSize > 0)) throw new AdapterError('BAD_QUERY', 'pageSize must be positive');
      if (opts.pageSize > this.o.maxPageSize) throw new AdapterError('BAD_QUERY', `pageSize ${opts.pageSize} exceeds the adapter maximum ${this.o.maxPageSize}`);
      if (!q.companyCodes.length) throw new AdapterError('BAD_QUERY', 'At least one company code is required');
      for (const c of q.companyCodes) if (!/^[A-Za-z0-9_]{1,10}$/.test(c)) throw new AdapterError('BAD_QUERY', 'Invalid company code.');
      if (!/^\d{2}$/.test(q.periodFrom) || !/^\d{2}$/.test(q.periodTo)) throw new AdapterError('BAD_QUERY', 'Invalid period.');
      if (opts.signal?.aborted) throw new AdapterError('ABORTED', 'The request was cancelled.');

      // Evidence: every selected field must exist in the system's own metadata
      const meta = await this.loadMetadata(opts.signal);
      assertFieldsInMetadata(meta, entity, SELECTED_FIELDS);

      const path = `${this.o.serviceRoot}/${entity}`;
      let query: Record<string, string>;
      let nextByLink = false;
      if (opts.cursor?.startsWith('t:')) {            // server-driven paging token
        nextByLink = true;
        query = { ...this.baseQuery(q, opts.pageSize), $skiptoken: opts.cursor.slice(2) };
      } else {
        const skip = opts.cursor ? Number(opts.cursor.replace(/^s:/, '')) : 0;
        if (!Number.isInteger(skip) || skip < 0 || (opts.cursor && !/^s:\d+$/.test(opts.cursor))) throw new AdapterError('BAD_QUERY', `Invalid cursor "${opts.cursor}"`);
        query = { ...this.baseQuery(q, opts.pageSize), ...(skip ? { $skip: String(skip) } : {}) };
      }

      const res = await this.request(path, query, opts.signal, {}, (n) => { attempts = n; });
      let body: any;
      try { body = JSON.parse(res.text); } catch { throw new AdapterError('MALFORMED', 'SAP returned a response that is not valid JSON.'); }
      const results: unknown = body?.d?.results ?? body?.value;
      if (!Array.isArray(results)) throw new AdapterError('MALFORMED', 'SAP returned a response without a result list.');
      if (results.length > opts.pageSize) throw new AdapterError('MALFORMED', 'SAP returned more rows than requested.');
      const records = results.map((row) => mapRow(row, this.o.mapper));
      rowCount = records.length;

      // next page: server-driven link wins; otherwise offset paging when a full page came back
      const nextLink: string | undefined = body?.d?.__next ?? body?.['@odata.nextLink'];
      let nextCursor: string | undefined;
      if (nextLink) {
        const tok = /[?&]\$skiptoken=([^&]+)/.exec(nextLink)?.[1];
        if (tok) nextCursor = `t:${decodeURIComponent(tok)}`;
        else {
          const sk = /[?&]\$skip=(\d+)/.exec(nextLink)?.[1];
          if (!sk) throw new AdapterError('MALFORMED', 'SAP returned a next-page link this adapter cannot follow.');
          nextCursor = `s:${sk}`;
        }
      } else if (!nextByLink && records.length === opts.pageSize) {
        // full page without a next link: probe with the next offset (an empty page ends the loop)
        nextCursor = `s:${(opts.cursor ? Number(opts.cursor.replace(/^s:/, '')) : 0) + records.length}`;
      }
      return nextCursor ? { records, nextCursor } : { records };
    } catch (e) {
      outcome = e instanceof AdapterError ? e.code : 'SOURCE_ERROR';
      throw e;
    } finally {
      const ev: S4AuditEvent = { tenant: ctx.tenant, userId: ctx.userId, source: this.o.transport.describe(), entity, queryHash, rowCount, durationMs: (this.o.now ?? Date.now)() - started, outcome, attempts };
      try { await this.o.audit?.(ev); } catch { /* audit failure must not mask the data result; it is logged by the audit sink itself */ }
    }
  }

  private baseQuery(q: AdapterQuery, top: number): Record<string, string> {
    const cc = q.companyCodes.map((c) => `CompanyCode eq '${esc(c)}'`);
    const filter = [
      cc.length === 1 ? cc[0]! : `(${cc.join(' or ')})`,
      `FiscalYear eq '${q.fiscalYear}'`,
      `FiscalPeriod ge '${q.periodFrom.padStart(3, '0')}'`,
      `FiscalPeriod le '${q.periodTo.padStart(3, '0')}'`,
      ...(this.o.ledger === null ? [] : [`Ledger eq '${esc(this.o.ledger ?? '0L')}'`]),
      ...(q.businessUnit ? [`Segment eq '${esc(q.businessUnit)}'`] : [])
    ].join(' and ');
    return {
      $filter: filter, $select: SELECTED_FIELDS.join(','), $top: String(top),
      $orderby: 'CompanyCode,FiscalYear,AccountingDocument,LedgerGLLineItem', $format: 'json'
    };
  }

  /** One logical GET with retry/backoff/jitter and the circuit breaker. */
  private async request(path: string, query: Record<string, string>, signal: AbortSignal | undefined, hints: { accept?: 'xml' } = {}, onAttempt?: (n: number) => void) {
    const now = this.o.now ?? Date.now;
    if (now() < this.openUntil) throw new AdapterError('UNAVAILABLE', 'SAP calls are paused after repeated failures (circuit open); try again shortly.');
    const { maxAttempts, baseDelayMs, maxDelayMs } = this.o.retry;
    const sleep = this.o.sleep ?? defaultSleep;
    const rnd = this.o.random ?? Math.random;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onAttempt?.(attempt);
      try {
        const res = await this.o.transport.get(path, query, { signal, timeoutMs: this.o.callTimeoutMs, accept: hints.accept });
        if (res.status >= 200 && res.status < 300) { this.failures = 0; return res; }
        throw errorFromStatus(res.status, res.headers['retry-after']);
      } catch (e) {
        lastError = e;
        if (e instanceof AdapterError && e.code === 'ABORTED') throw e;
        if (!(e instanceof AdapterError)) { lastError = new AdapterError('SOURCE_ERROR', 'Unexpected failure while calling SAP.'); }
        const err = lastError as AdapterError;
        if (!isRetryable(err)) {
          // permanent failures (auth, 404, 400, malformed) are not the system being down: they do not trip the breaker
          throw err;
        }
        if (attempt === maxAttempts) break;
        const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        const jitter = Math.floor(rnd() * exp * 0.5);
        const wait = err instanceof ThrottledError && err.retryAfterMs !== undefined ? Math.min(maxDelayMs, err.retryAfterMs) : exp + jitter;
        await sleep(wait, signal);
      }
    }
    this.failures += 1;
    if (this.failures >= this.o.breaker.failureThreshold) { this.openUntil = now() + this.o.breaker.openMs; this.failures = 0; }
    throw lastError;
  }
}
