/**
 * OData transports for the S/4HANA adapter (G2-03).
 *
 * A transport only moves bytes: `get(path, query)` → status, headers, text. It knows nothing about
 * finance. Three implementations:
 *  - DestinationTransport: production. Resolves a BTP Destination by name through the SAP Cloud SDK
 *    (credentials, token exchange and the Cloud Connector path are handled by the platform; this
 *    code never sees a password or token).
 *  - FetchTransport: plain HTTP to a base URL. Used against the local OData simulator in tests.
 *  - ReplayTransport: serves recorded (sanitised) responses from fixture files.
 */
import { AdapterError } from '../adapter-contract.ts';

export interface ODataResponse { status: number; headers: Record<string, string>; text: string }

export interface ODataTransport {
  get(path: string, query: Record<string, string>, opts: { signal?: AbortSignal; timeoutMs?: number; accept?: 'xml' | 'json' }): Promise<ODataResponse>;
  describe(): string; // safe label for logs/audit (destination alias or "simulator"); never a URL with credentials
}

function qs(query: Record<string, string>): string {
  const parts = Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%24/g, '$')}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Plain HTTP (simulator / local sandbox). Never use against a real system with credentials. */
export class FetchTransport implements ODataTransport {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  constructor(baseUrl: string, headers: Record<string, string> = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.headers = headers;
  }
  describe() { return 'http-transport'; }
  async get(path: string, query: Record<string, string>, opts: { signal?: AbortSignal; timeoutMs?: number; accept?: 'xml' | 'json' }): Promise<ODataResponse> {
    const ctl = new AbortController();
    const timer = opts.timeoutMs ? setTimeout(() => ctl.abort(new AdapterError('TIMEOUT', 'SAP did not answer in time.')), opts.timeoutMs) : undefined;
    const signal = opts.signal ? AbortSignal.any([opts.signal, ctl.signal]) : ctl.signal;
    try {
      const res = await fetch(`${this.baseUrl}${path}${qs(query)}`, { headers: { Accept: opts.accept === 'xml' ? 'application/xml' : 'application/json', ...this.headers }, signal });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      return { status: res.status, headers, text: await res.text() };
    } catch (e) {
      if (opts.signal?.aborted) throw new AdapterError('ABORTED', 'The request was cancelled.');
      if (ctl.signal.aborted) throw new AdapterError('TIMEOUT', 'SAP did not answer in time.');
      throw new AdapterError('UNAVAILABLE', `Could not reach the SAP service (${(e as Error).name}).`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

/**
 * Production transport: SAP Cloud SDK + BTP Destination.
 * The Destination (URL, authentication type, optional Cloud Connector proxy) is configured in
 * BTP by an administrator. Locally the SDK can also read a `destinations` environment variable;
 * keep that value out of the repository.
 */
export class DestinationTransport implements ODataTransport {
  private readonly destinationName: string;
  private readonly jwt?: string;
  constructor(destinationName: string, opts: { jwt?: string } = {}) {
    if (!/^[A-Za-z0-9_.\-]{1,100}$/.test(destinationName)) throw new AdapterError('BAD_QUERY', 'Invalid destination name.');
    this.destinationName = destinationName;
    this.jwt = opts.jwt;
  }
  describe() { return `destination:${this.destinationName}`; }
  async get(path: string, query: Record<string, string>, opts: { signal?: AbortSignal; timeoutMs?: number; accept?: 'xml' | 'json' }): Promise<ODataResponse> {
    if (opts.signal?.aborted) throw new AdapterError('ABORTED', 'The request was cancelled.');
    let executeHttpRequest: any;
    try {
      ({ executeHttpRequest } = await import('@sap-cloud-sdk/http-client'));
    } catch {
      throw new AdapterError('UNAVAILABLE', 'The SAP Cloud SDK is not installed.');
    }
    try {
      const call = executeHttpRequest(
        { destinationName: this.destinationName, ...(this.jwt ? { jwt: this.jwt } : {}) },
        { method: 'GET', url: path, params: query, headers: { Accept: opts.accept === 'xml' ? 'application/xml' : 'application/json' }, timeout: opts.timeoutMs },
        { fetchCsrfToken: false }
      );
      // The SDK does not take an AbortSignal for the whole call; race it so cancellation is prompt.
      const res: any = await new Promise((resolve, reject) => {
        opts.signal?.addEventListener('abort', () => reject(new AdapterError('ABORTED', 'The request was cancelled.')), { once: true });
        call.then(resolve, reject);
      });
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers ?? {})) headers[k.toLowerCase()] = String(v);
      return { status: res.status, headers, text: typeof res.data === 'string' ? res.data : JSON.stringify(res.data) };
    } catch (e: any) {
      if (e instanceof AdapterError) throw e;
      const status: number | undefined = e?.response?.status;
      if (status) {
        const h: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.response.headers ?? {})) h[k.toLowerCase()] = String(v);
        return { status, headers: h, text: typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data ?? '') };
      }
      const msg = `${e?.message ?? ''} ${e?.cause?.message ?? ''}`;
      // A destination that cannot be loaded is a configuration problem, not an outage: retrying cannot fix it.
      if (/destination/i.test(msg) && /(failed to load|not find|could not|unable|retrieve|not found)/i.test(msg)) {
        throw new AdapterError('NOT_FOUND', `Destination "${this.destinationName}" could not be resolved. Check it exists in the subaccount and that this app is bound to the Destination service (see docs/sap/S4-CONNECTIVITY-RUNBOOK.md).`);
      }
      if (/timeout|ETIMEDOUT|ECONNABORTED/i.test(msg)) throw new AdapterError('TIMEOUT', 'SAP did not answer in time.');
      throw new AdapterError('UNAVAILABLE', 'Could not reach the SAP system through the Destination.');
    }
  }
}

/** Serves recorded responses: key = `${path}?${sorted query}` → {status, headers, text}. */
export class ReplayTransport implements ODataTransport {
  private readonly recorded: Record<string, ODataResponse>;
  constructor(recorded: Record<string, ODataResponse>) { this.recorded = recorded; }
  describe() { return 'replay'; }
  static keyOf(path: string, query: Record<string, string>) {
    return `${path}?${Object.keys(query).sort().map((k) => `${k}=${query[k]}`).join('&')}`;
  }
  async get(path: string, query: Record<string, string>): Promise<ODataResponse> {
    const hit = this.recorded[ReplayTransport.keyOf(path, query)];
    if (!hit) throw new AdapterError('NOT_FOUND', `No recorded response for ${ReplayTransport.keyOf(path, query)}`);
    return hit;
  }
}
