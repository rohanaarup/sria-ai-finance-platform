/**
 * Source adapter contract v2 (G2-02).
 *
 * Every source (synthetic fixtures, S/4HANA, later BW or non-SAP) implements this interface.
 * Only the data product calls adapters; tools and service handlers never do (import-boundary
 * test). The adapter conformance suite (tests/dataproduct/adapter-conformance.test.ts) is the
 * acceptance gate for any new adapter.
 *
 * Rules for implementers:
 *  - Honour every pushed-down filter exactly; never return records outside the query.
 *  - Page with an opaque cursor; never return more than `pageSize` records per page.
 *  - Stop promptly and throw AdapterError('ABORTED') when the AbortSignal fires.
 *  - Throw only AdapterError for expected failures (typed codes below).
 *  - Records are transient: never persist or log them (ADR-002).
 */
import type { FinanceRecord, AdapterCapabilities } from '@sria/contracts';
import { SYNTHETIC_FINANCE_RECORDS_V2 } from '@sria/contracts';
import type { FinanceDataProvider } from './finance-data-provider.ts';

export interface AdapterQuery {
  companyCodes: string[];
  fiscalYear: number;
  periodFrom: string; // '01'..'16'
  periodTo: string;
  businessUnit?: string;
}

export interface AdapterPage {
  records: FinanceRecord[];
  /** Present when more records exist. */
  nextCursor?: string;
}

export interface AdapterContext {
  tenant: string;
  userId: string;
  destinationName?: string;
}

export type AdapterErrorCode = 'UNAVAILABLE' | 'TIMEOUT' | 'ABORTED' | 'BAD_QUERY' | 'AUTH' | 'SOURCE_ERROR';

export class AdapterError extends Error {
  readonly code: AdapterErrorCode;
  constructor(code: AdapterErrorCode, message: string) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
  }
}

export interface FinanceSourceAdapter {
  capabilities(): AdapterCapabilities;
  isAvailable(): Promise<boolean>;
  fetchPage(query: AdapterQuery, ctx: AdapterContext, opts: { cursor?: string; pageSize: number; signal?: AbortSignal }): Promise<AdapterPage>;
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new AdapterError('ABORTED', 'The request was cancelled or timed out');
}

function inQuery(r: FinanceRecord, q: AdapterQuery): boolean {
  return q.companyCodes.includes(r.companyCode) && r.fiscalYear === q.fiscalYear &&
    r.fiscalPeriod >= q.periodFrom && r.fiscalPeriod <= q.periodTo &&
    (q.businessUnit === undefined || r.businessUnit === q.businessUnit);
}

function validate(q: AdapterQuery, pageSize: number, max: number) {
  if (!q.companyCodes.length) throw new AdapterError('BAD_QUERY', 'At least one company code is required');
  if (!(pageSize > 0)) throw new AdapterError('BAD_QUERY', 'pageSize must be positive');
  if (pageSize > max) throw new AdapterError('BAD_QUERY', `pageSize ${pageSize} exceeds the adapter maximum ${max}`);
}

/** Pages over an in-memory record list (synthetic sources). Cursor = offset. */
function pageOver(all: readonly FinanceRecord[], q: AdapterQuery, opts: { cursor?: string; pageSize: number }): AdapterPage {
  const matching = all.filter((r) => inQuery(r, q));
  const offset = opts.cursor ? Number(opts.cursor) : 0;
  if (!Number.isInteger(offset) || offset < 0) throw new AdapterError('BAD_QUERY', `Invalid cursor "${opts.cursor}"`);
  const records = matching.slice(offset, offset + opts.pageSize).map((r) => ({ ...r }));
  const next = offset + opts.pageSize;
  return next < matching.length ? { records, nextCursor: String(next) } : { records };
}

/** Synthetic fixtures v2 — always available, flagged synthetic. */
export class MockSourceAdapter implements FinanceSourceAdapter {
  private readonly records: readonly FinanceRecord[];
  private readonly maxPage: number;
  constructor(records: readonly FinanceRecord[] = SYNTHETIC_FINANCE_RECORDS_V2, maxPageSize = 500) {
    this.records = records;
    this.maxPage = maxPageSize;
  }
  capabilities(): AdapterCapabilities {
    return {
      adapterId: 'mock-fixtures-v2', sourceType: 'mock', sourceSystem: 'SAP_SYNTHETIC_FIXTURES_V2', apiName: 'in-memory fixtures',
      apiVersion: '2', isSynthetic: true, dimensions: ['company_code', 'fiscal_period', 'business_unit'],
      pushdownFilters: ['companyCodes', 'fiscalYear', 'periodRange', 'businessUnit'], maxPageSize: this.maxPage,
      supportsAbort: true, freshnessTtlSeconds: 3600
    };
  }
  async isAvailable() { return true; }
  async fetchPage(q: AdapterQuery, _ctx: AdapterContext, opts: { cursor?: string; pageSize: number; signal?: AbortSignal }): Promise<AdapterPage> {
    checkAbort(opts.signal);
    validate(q, opts.pageSize, this.maxPage);
    await Promise.resolve(); // yield, so cancellation between pages is observable
    checkAbort(opts.signal);
    return pageOver(this.records, q, opts);
  }
}

/**
 * S/4HANA adapter — BLOCKED until G2-03 (no confirmed service, destination or credentials).
 * Declares its intended capabilities; every fetch fails with a typed UNAVAILABLE error.
 */
export class S4HanaSourceAdapter implements FinanceSourceAdapter {
  private readonly destination?: string;
  constructor(destinationName?: string) { this.destination = destinationName; }
  capabilities(): AdapterCapabilities {
    return {
      adapterId: 's4hana-odata', sourceType: 's4hana', sourceSystem: 'SAP_S4HANA', apiName: 'journal entry item API (candidate, unconfirmed)',
      apiVersion: 'unconfirmed', isSynthetic: false, dimensions: ['company_code', 'fiscal_period'],
      pushdownFilters: ['companyCodes', 'fiscalYear', 'periodRange'], maxPageSize: 5000, supportsAbort: true, freshnessTtlSeconds: 900
    };
  }
  async isAvailable() { return false; }
  async fetchPage(): Promise<AdapterPage> {
    throw new AdapterError('UNAVAILABLE', `S/4HANA source is not connected yet (destination "${this.destination ?? 'not set'}"); live connectivity is phase G2-03.`);
  }
}

/** Wraps a v1 FinanceDataProvider (single company per call, no paging) as a v2 adapter. */
export function adapterFromV1Provider(provider: FinanceDataProvider): FinanceSourceAdapter {
  const synthetic = provider.getSourceType() === 'mock';
  return {
    capabilities: () => ({
      adapterId: `v1-${provider.getSourceType()}`, sourceType: provider.getSourceType(), sourceSystem: synthetic ? 'SAP_SYNTHETIC_FIXTURES_V1' : 'SAP_S4HANA',
      apiName: 'FinanceDataProvider v1', apiVersion: '1', isSynthetic: synthetic, dimensions: ['company_code', 'fiscal_period', 'business_unit'],
      pushdownFilters: ['companyCodes', 'fiscalYear'], maxPageSize: 100000, supportsAbort: false, freshnessTtlSeconds: 3600
    }),
    isAvailable: () => provider.isAvailable(),
    async fetchPage(q, ctx, opts) {
      checkAbort(opts.signal);
      const all: FinanceRecord[] = [];
      for (const cc of q.companyCodes) {
        all.push(...await provider.fetchRecords({ companyCode: cc, fiscalYear: q.fiscalYear }, { organizationId: ctx.tenant, userId: ctx.userId }));
      }
      return pageOver(all, q, opts);
    }
  };
}
