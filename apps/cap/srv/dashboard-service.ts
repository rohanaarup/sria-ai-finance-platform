import cds from '@sap/cds';
import { defaultDashboardRepository } from './lib/repositories/dashboard-repository.ts';
import type { TenantContext } from './lib/repositories/dashboard-repository.ts';

export default class DashboardService extends cds.ApplicationService {
  init() {
    const getContext = (req: any): TenantContext => {
      // In production, extracted from authenticated JWT/XSUAA token
      const organizationId = req.headers['x-tenant-id'] || req.user?.tenant || 'ORG_ACME_DEFAULT';
      const userId = req.user?.id || req.headers['x-user-id'] || 'USER_DEFAULT';
      const roles = req.user?.roles || ['FinanceAnalyst'];
      return { organizationId, userId, roles };
    };

    // Action: createDashboard
    this.on('createDashboard', async (req: any) => {
      const ctx = getContext(req);
      const { workspaceId, title, description, specJson, metricIds, dimensions, sourceType } = req.data;

      if (!title || !specJson) {
        return req.error(400, 'Title and specJson are required.');
      }

      return defaultDashboardRepository.createDashboard(
        { workspaceId, title, description, specJson, metricIds, dimensions, sourceType },
        ctx
      );
    });

    // Action: updateDashboard
    this.on('updateDashboard', async (req: any) => {
      const ctx = getContext(req);
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

    // Action: archiveDashboard
    this.on('archiveDashboard', async (req: any) => {
      const ctx = getContext(req);
      const { dashboardId } = req.data;

      try {
        return await defaultDashboardRepository.archiveDashboard(dashboardId, ctx);
      } catch (err: any) {
        return req.error(403, err.message);
      }
    });

    // Custom filtering for Dashboards entity read
    this.on('READ', 'Dashboards', async (req: any, next: any) => {
      const ctx = getContext(req);
      // Automatically inject tenant isolation into query
      req.query.where({ organization_ID: ctx.organizationId, isArchived: 0 });
      return next();
    });

    return super.init();
  }
}
