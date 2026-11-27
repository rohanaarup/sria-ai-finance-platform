import cds from '@sap/cds';
import { defaultDashboardRepository } from './lib/repositories/dashboard-repository.ts';
import type { TenantContext } from './lib/repositories/dashboard-repository.ts';
import { AuthGuard } from './lib/auth/auth-guard.ts';

export default class DashboardService extends cds.ApplicationService {
  init() {
    // Tenant, user and roles come only from the verified token (x-tenant-id / x-user-id headers are ignored).
    const getContext = (req: any, scope: 'FinanceAnalyst' | 'FinanceManager' = 'FinanceAnalyst'): TenantContext =>
      AuthGuard.tenantContext(req, scope);

    // Action: createDashboard (Requires FinanceManager scope)
    this.on('createDashboard', async (req: any) => {
      const ctx = getContext(req, 'FinanceManager');
      const { workspaceId, title, description, specJson, metricIds, dimensions, sourceType } = req.data;

      if (!title || !specJson) {
        return req.error(400, 'Title and specJson are required.');
      }

      return defaultDashboardRepository.createDashboard(
        { workspaceId, title, description, specJson, metricIds, dimensions, sourceType },
        ctx
      );
    });

    // Action: updateDashboard (Requires FinanceManager scope)
    this.on('updateDashboard', async (req: any) => {
      const ctx = getContext(req, 'FinanceManager');
      const { dashboardId, title, description, specJson } = req.data;

      try {
        return await defaultDashboardRepository.updateDashboard(
          dashboardId,
          { title, description, specJson },
          ctx
        );
      } catch (err: any) {
        return req.error(403, err.message);
      }
    });

    // Action: archiveDashboard (Requires FinanceManager scope)
    this.on('archiveDashboard', async (req: any) => {
      const ctx = getContext(req, 'FinanceManager');
      const { dashboardId } = req.data;

      try {
        return await defaultDashboardRepository.archiveDashboard(dashboardId, ctx);
      } catch (err: any) {
        return req.error(403, err.message);
      }
    });

    // Workspaces are tenant-scoped too
    this.on('READ', 'Workspaces', async (req: any, next: any) => {
      const ctx = getContext(req, 'FinanceAnalyst');
      req.query.where({ organization_ID: ctx.organizationId });
      return next();
    });

    // Custom filtering for Dashboards entity read (Requires FinanceAnalyst scope)
    this.on('READ', 'Dashboards', async (req: any, next: any) => {
      const ctx = getContext(req, 'FinanceAnalyst');
      // Automatically inject tenant isolation into query
      req.query.where({ organization_ID: ctx.organizationId, isArchived: 0 });
      return next();
    });

    return super.init();
  }
}
