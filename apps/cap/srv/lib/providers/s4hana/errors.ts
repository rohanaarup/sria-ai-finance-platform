/**
 * Typed error taxonomy for the S/4HANA adapter (G2-03).
 *
 * Why this matters for agents: a classified error (auth vs throttled vs timeout vs malformed)
 * lets the runtime decide whether to retry, replan or tell the user. A generic "failed" cannot.
 * Messages never include credentials, destination secrets or financial values.
 */
import { AdapterError } from '../adapter-contract.ts';
import type { AdapterErrorCode } from '../adapter-contract.ts';

/** Whether a retry can help. */
export const RETRYABLE: Record<AdapterErrorCode, boolean> = {
  UNAVAILABLE: true, TIMEOUT: true, THROTTLED: true, SOURCE_ERROR: true,
  ABORTED: false, BAD_QUERY: false, AUTH: false, NOT_FOUND: false, MALFORMED: false
};

export function isRetryable(e: unknown): boolean {
  return e instanceof AdapterError && RETRYABLE[e.code];
}

export class ThrottledError extends AdapterError {
  readonly retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super('THROTTLED', message);
    this.retryAfterMs = retryAfterMs;
  }
}

/** Map an HTTP status from the OData service to a typed adapter error. */
export function errorFromStatus(status: number, retryAfterHeader?: string | null): AdapterError {
  if (status === 401 || status === 403) return new AdapterError('AUTH', `SAP rejected the connection's credentials or authorization (HTTP ${status}). Check the communication user, its role and the Destination.`);
  if (status === 404) return new AdapterError('NOT_FOUND', 'The SAP service or entity set was not found (HTTP 404). Check the service is activated and the path is correct.');
  if (status === 400) return new AdapterError('BAD_QUERY', 'SAP rejected the query as malformed (HTTP 400). A field or filter may not exist in this system.');
  if (status === 408 || status === 504) return new AdapterError('TIMEOUT', `SAP did not answer in time (HTTP ${status}).`);
  if (status === 429) {
    const secs = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    return new ThrottledError('SAP is throttling requests (HTTP 429).', Number.isFinite(secs) ? Math.min(secs, 60) * 1000 : undefined);
  }
  if (status === 502 || status === 503) return new AdapterError('UNAVAILABLE', `SAP is temporarily unavailable (HTTP ${status}).`);
  if (status >= 500) return new AdapterError('SOURCE_ERROR', `SAP reported an internal error (HTTP ${status}).`);
  return new AdapterError('SOURCE_ERROR', `Unexpected response from SAP (HTTP ${status}).`);
}
