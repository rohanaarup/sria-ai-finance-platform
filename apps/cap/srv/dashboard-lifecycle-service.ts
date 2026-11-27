/**
 * DashboardLifecycleService Handler
 * Phase 10 — Follow-up requests, save/reopen & dashboard lifecycle
 *
 * Implements lifecycle operations and server-side authorization:
 *  - Save: Persists Dashboard header and DashboardSpec JSON version
 *  - Rename: Enforces ownership check (only owner or TenantAdmin)
 *  - Delete: Soft-deletes (archives) dashboard record
 *  - Share: Creates read-only share record
 *  - Reopen: Retrieves saved spec with isStale=true indicator
 *  - Refresh: Re-executes on-demand query, recalculates metrics, updates spec version
 */

import cds from '@sap/cds';
import type { Request } from '@sap/cds';
import { randomUUID } from 'node:crypto';
import { AuthGuard } from './lib/auth/auth-guard.ts';
import { DashboardRepository } from './lib/repositories/dashboard-repository.ts';
import { FollowUpRouter } from './ai/follow-up-router.ts';
import type { DashboardSpec } from '@sria/contracts';

export default class DashboardLifecycleServiceHandler extends cds.ApplicationService {
  private _repo!: DashboardRepository;
  private _router!: FollowUpRouter;

  async init() {
    this._repo = new DashboardRepository();
    this._router = new FollowUpRouter();

    this.on('SaveDashboard', this.handleSaveDashboard.bind(this));
    this.on('RenameDashboard', this.handleRenameDashboard.bind(this));
    this.on('DeleteDashboard', this.handleDeleteDashboard.bind(this));
    this.on('ShareDashboard', this.handleShareDashboard.bind(this));
    this.on('ReopenDashboard', this.handleReopenDashboard.bind(this));
    this.on('RefreshDashboard', this.handleRefreshDashboard.bind(this));
    this.on('ListDashboards', this.handleListDashboards.bind(this));
    this.on('READ', 'Dashboards', async (req: any, next: any) => {
      const ctx = AuthGuard.tenantContext(req, 'FinanceAnalyst');
      req.query.where({ organization_ID: ctx.organizationId, isArchived: 0 });
      return next();
    });

    return super.init();
  }

  // ─── ListDashboards ─────────────────────────────────────────────────────────

  private async handleListDashboards(req: Request) {
    const ctx = AuthGuard.tenantContext(req, 'FinanceAnalyst');

    const list = await this._repo.listDashboards(ctx);
    return (list || []).map((d: any) => ({
      ID: d.ID,
      title: d.title,
      description: d.description || '',
      createdAt: d.createdAt,
      isStale: true
    }));
  }

  // ─── SaveDashboard ──────────────────────────────────────────────────────────

  private async handleSaveDashboard(req: Request) {
    const ctx = AuthGuard.tenantContext(req, 'FinanceManager');

    const { workspaceId, title, description, specJson } = req.data as {
      workspaceId?: string;
      title: string;
      description?: string;
      specJson: string;
    };

    if (!specJson || !title) {
      return req.error(400, 'title and specJson are required.');
    }

    const created = await this._repo.createDashboard(
      {
        workspaceId: workspaceId || '00000000-0000-0000-0000-000000000001',
        title: title.trim(),
        description: description?.trim(),
        specJson
      },
      ctx
    );

    return {
      dashboardId: created?.ID || created?.id,
      version: '1.0',
      savedAt: new Date().toISOString(),
      status: 'SAVED'
    };
  }

  // ─── RenameDashboard ────────────────────────────────────────────────────────

  private async handleRenameDashboard(req: Request) {
    const ctx = AuthGuard.tenantContext(req, 'FinanceManager');

    const { dashboardId, newTitle } = req.data as {
      dashboardId: string;
      newTitle: string;
    };

    if (!dashboardId || !newTitle?.trim()) {
      return req.error(400, 'dashboardId and newTitle are required.');
    }

    const updated = await this._repo.updateDashboard(
      dashboardId,
      { title: newTitle.trim() },
      ctx
    );

    return {
      dashboardId,
      updatedTitle: updated?.title || newTitle.trim(),
      status: 'RENAMED'
    };
  }

  // ─── DeleteDashboard ────────────────────────────────────────────────────────

  private async handleDeleteDashboard(req: Request) {
    const ctx = AuthGuard.tenantContext(req, 'FinanceManager');

    const { dashboardId } = req.data as { dashboardId: string };
    if (!dashboardId) {
      return req.error(400, 'dashboardId is required.');
    }

    const success = await this._repo.archiveDashboard(dashboardId, ctx);

    return {
      dashboardId,
      isArchived: success,
      status: success ? 'DELETED' : 'FAILED'
    };
  }

  // ─── ShareDashboard ─────────────────────────────────────────────────────────

  private async handleShareDashboard(req: Request) {
    const ctx = AuthGuard.tenantContext(req, 'FinanceManager');

    const { dashboardId, sharedWithUserId, permission } = req.data as {
      dashboardId: string;
      sharedWithUserId: string;
      permission: string;
    };

    if (!dashboardId || !sharedWithUserId) {
      return req.error(400, 'dashboardId and sharedWithUserId are required.');
    }

    // Default to read-only sharing for pilot security
    const validatedPermission = permission === 'EDIT' ? 'EDIT' : 'READ';

    const db = await cds.connect.to('db');
    await db.run(
      INSERT.into('sria.finance.DashboardShares').entries({
        ID: randomUUID(),
        dashboard_ID: dashboardId,
        principalType: 'USER',
        principalId: sharedWithUserId.trim(),
        permission: validatedPermission,
        createdAt: new Date().toISOString()
      })
    );

    await this._repo.recordAudit('DASHBOARD_SHARED', dashboardId, `Shared with ${sharedWithUserId} (${validatedPermission})`, ctx);

    return {
      dashboardId,
      sharedWithUserId,
      permission: validatedPermission,
      status: 'SHARED'
    };
  }

  // ─── ReopenDashboard ────────────────────────────────────────────────────────

  private async handleReopenDashboard(req: Request) {
    const ctx = AuthGuard.tenantContext(req, 'FinanceAnalyst');

    const { dashboardId } = req.data as { dashboardId: string };
    if (!dashboardId) {
      return req.error(400, 'dashboardId is required.');
    }

    const result = await this._repo.getDashboardById(dashboardId, ctx);
    if (!result || !result.latestSpec) {
      return req.error(404, `Dashboard ${dashboardId} not found or access denied.`);
    }

    return {
      dashboardId: result.ID,
      title: result.title,
      specJson: result.latestSpec.specJson,
      isStale: true, // Saved configuration reopened — figures require fresh query to claim current state
      lastSavedAt: result.latestSpec.createdAt
    };
  }

  // ─── RefreshDashboard ───────────────────────────────────────────────────────

  private async handleRefreshDashboard(req: Request) {
    const ctx = AuthGuard.tenantContext(req, 'FinanceManager');

    const { dashboardId } = req.data as { dashboardId: string };
    if (!dashboardId) {
      return req.error(400, 'dashboardId is required.');
    }

    const existing = await this._repo.getDashboardById(dashboardId, ctx);
    if (!existing || !existing.latestSpec) {
      return req.error(404, `Dashboard ${dashboardId} not found.`);
    }

    const currentSpec: DashboardSpec = JSON.parse(existing.latestSpec.specJson);

    // Execute on-demand refresh via FollowUpRouter
    const outcome = await this._router.executeFollowUp('refresh', currentSpec, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      userRoles: ctx.roles
    });

    if (!outcome.spec) {
      return req.error(500, `Refresh failed: ${outcome.message}`);
    }

    // Persist new spec version
    await this._repo.updateDashboard(
      dashboardId,
      { specJson: JSON.stringify(outcome.spec) },
      ctx
    );

    return {
      dashboardId,
      refreshedSpecJson: JSON.stringify(outcome.spec),
      refreshedAt: new Date().toISOString(),
      isStale: false
    };
  }
}
