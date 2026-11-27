/**
 * Factory for the production S/4HANA adapter (G2-03): Destination transport, config-driven mapping,
 * and an audit sink that writes metadata only (never financial values) in its own transaction.
 */
import { loadConfig } from '../../config/app-config.ts';
import { S4HanaODataAdapter } from './adapter.ts';
import type { S4AuditEvent } from './adapter.ts';
import { DestinationTransport } from './odata-client.ts';

export { S4HanaODataAdapter } from './adapter.ts';
export * from './errors.ts';
export * from './metadata.ts';
export * from './mapper.ts';
export * from './odata-client.ts';

export async function auditS4Call(e: S4AuditEvent): Promise<void> {
  const cds = (await import('@sap/cds')).default as any;
  if (!cds.db) return;
  const details = `entity=${e.entity} source=${e.source} queryHash=${e.queryHash} rows=${e.rowCount} ms=${e.durationMs} attempts=${e.attempts} outcome=${e.outcome}`;
  await cds.db.tx({ user: new cds.User.Privileged() }, (tx: any) => tx.run(INSERT.into('sria.finance.AuditEvents').entries({
    organizationId: e.tenant, workspaceId: 'S4HANA', userId: e.userId, action: 'S4_FETCH', sourceSystem: 'S4HANA', metricVersion: null, details
  })));
}

const cache = new Map<string, S4HanaODataAdapter>();

/** One adapter per destination alias, so metadata, health and breaker state are shared. */
export function createS4Adapter(destinationName: string): S4HanaODataAdapter {
  const hit = cache.get(destinationName);
  if (hit) return hit;
  const cfg = loadConfig();
  const adapter = new S4HanaODataAdapter({
    transport: new DestinationTransport(destinationName),
    serviceRoot: cfg.s4.serviceRoot,
    entitySet: cfg.s4.entitySet,
    ledger: cfg.s4.ledger,
    mapper: { amountConvention: cfg.s4.amountConvention, revenueAccounts: cfg.s4.revenueAccounts, expenseAccounts: cfg.s4.expenseAccounts },
    audit: auditS4Call
  });
  cache.set(destinationName, adapter);
  return adapter;
}

/** @internal tests */
export function resetS4AdapterCache(): void { cache.clear(); }
