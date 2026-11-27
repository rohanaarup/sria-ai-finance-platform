import cds from '@sap/cds';
import { AuthGuard } from './lib/auth/auth-guard.ts';

/**
 * AdminService — tenant & workspace administration (read-only in G2-00).
 * Every read is restricted to the caller's own tenant, taken from the verified token.
 */
export default class AdminService extends cds.ApplicationService {
  init() {
    const filters: Record<string, (tenant: string) => Record<string, string>> = {
      Organizations: (t) => ({ ID: t }),
      Workspaces: (t) => ({ organization_ID: t }),
      AuditEvents: (t) => ({ organizationId: t }),
      EntityAccess: (t) => ({ tenantId: t }),
      ModelCalls: (t) => ({ tenantId: t }),
      DataSourceReferences: (t) => ({ 'workspace.organization_ID': t })
    };
    for (const [entity, where] of Object.entries(filters)) {
      this.on('READ', entity, async (req: any, next: any) => {
        const ctx = AuthGuard.tenantContext(req, 'TenantAdmin');
        req.query.where(where(ctx.organizationId));
        return next();
      });
    }
    return super.init();
  }
}
