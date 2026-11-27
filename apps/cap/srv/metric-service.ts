import cds from '@sap/cds';
import { AuthGuard } from './lib/auth/auth-guard.ts';
import { loadConfig } from './lib/config/app-config.ts';
import { getSemanticCatalog, ensureSemanticLoaded } from './semantic/runtime.ts';

/**
 * MetricCatalogService (compatibility endpoint used by the web client).
 * G2-01: answers from the semantic layer. `enabled` = executable in the current tier for the
 * caller's tenant; `approvalStatus` = status of the latest version.
 */
export default class MetricCatalogService extends cds.ApplicationService {
  init() {
    this.before('*', () => ensureSemanticLoaded());
    this.on('getApprovedMetrics', (req: any) => {
      const ctx = AuthGuard.tenantContext(req, 'FinanceAnalyst');
      const tier = loadConfig().tier;
      const catalog = getSemanticCatalog();
      const dims = catalog.dimensions(ctx.organizationId).map((d) => d.dimensionId).join(', ');
      return catalog.catalogEntries(tier, ctx.organizationId).map((e) => ({
        metricId: e.metricId,
        label: e.label,
        category: e.category,
        formulaOrAggregation: e.latestVersion.kind === 'DERIVED'
          ? e.latestVersion.expression
          : `Signed sum of ${e.latestVersion.accountType} accounts (${e.latestVersion.signRule})`,
        supportedDimensions: dims,
        enabled: e.executable,
        approvalStatus: e.latestVersion.status
      }));
    });
    return super.init();
  }
}
