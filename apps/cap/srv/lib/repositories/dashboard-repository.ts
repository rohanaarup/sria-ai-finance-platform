import cds from '@sap/cds';
import { randomUUID } from 'node:crypto';

export interface TenantContext {
  organizationId: string;
  userId: string;
  roles?: string[];
}

export interface CreateDashboardParams {
  workspaceId: string;
  title: string;
  description?: string;
  specJson: string;
  metricIds?: string;
  dimensions?: string;
  sourceType?: 'mock' | 's4hana';
}

export interface UpdateDashboardParams {
  title?: string;
  description?: string;
  specJson?: string;
}

export const ENTITY_NAMES = {
  Organizations: 'sria.finance.Organizations',
  Workspaces: 'sria.finance.Workspaces',
  Dashboards: 'sria.finance.Dashboards',
  DashboardSpecs: 'sria.finance.DashboardSpecs',
  DashboardShares: 'sria.finance.DashboardShares',
  AuditEvents: 'sria.finance.AuditEvents'
};

/**
 * Enterprise Dashboard Repository
 * Enforces server-side tenant isolation and data ownership in every query.
 */
export class DashboardRepository {
  /**
   * Save a new dashboard and its initial specification
   */
  public async createDashboard(params: CreateDashboardParams, ctx: TenantContext) {
    const db = await cds.connect.to('db');
    const dashboardId = randomUUID();
    const specId = randomUUID();

    // 1. Insert Dashboard root scoped to organization and owner
    await db.run(
      INSERT.into(ENTITY_NAMES.Dashboards).entries({
        ID: dashboardId,
        organization_ID: ctx.organizationId,
        workspace_ID: params.workspaceId,
        title: params.title,
        description: params.description || '',
        ownerId: ctx.userId,
        isArchived: 0
      })
    );

    // 2. Insert serialized DashboardSpec JSON
    await db.run(
      INSERT.into(ENTITY_NAMES.DashboardSpecs).entries({
        ID: specId,
        dashboard_ID: dashboardId,
        version: '1.0',
        specJson: params.specJson,
        metricIds: params.metricIds || '',
        dimensions: params.dimensions || '',
        sourceType: params.sourceType || 'mock',
        retrievedAt: new Date().toISOString()
      })
    );

    // 3. Log Audit Event (Non-sensitive metadata only)
    await db.run(
      INSERT.into(ENTITY_NAMES.AuditEvents).entries({
        ID: randomUUID(),
        organizationId: ctx.organizationId,
        workspaceId: params.workspaceId,
        userId: ctx.userId,
        action: 'CREATE_DASHBOARD',
        targetId: dashboardId,
        sourceSystem: params.sourceType || 'mock',
        metricVersion: '1.0',
        details: `Dashboard created: ${params.title}`
      })
    );

    return this.getDashboardById(dashboardId, ctx);
  }

  /**
   * List active dashboards for the authenticated tenant/user
   */
  public async listDashboards(ctx: TenantContext) {
    const db = await cds.connect.to('db');

    // Strict tenant isolation: WHERE organization_ID = ctx.organizationId
    return db.run(
      SELECT.from(ENTITY_NAMES.Dashboards)
        .columns('ID', 'title', 'description', 'ownerId', 'workspace_ID', 'createdAt', 'modifiedAt')
        .where({
          organization_ID: ctx.organizationId,
          isArchived: 0
        })
        .orderBy('createdAt desc')
    );
  }

  /**
   * Retrieve a specific dashboard with its latest specification
   * Throws 403/404 if accessed across tenant boundaries
   */
  public async getDashboardById(dashboardId: string, ctx: TenantContext) {
    const db = await cds.connect.to('db');

    const dashboard = await db.run(
      SELECT.one.from(ENTITY_NAMES.Dashboards).where({
        ID: dashboardId,
        organization_ID: ctx.organizationId // Server-side tenant scoping
      })
    );

    if (!dashboard) {
      return null;
    }

    const latestSpec = await db.run(
      SELECT.one.from(ENTITY_NAMES.DashboardSpecs)
        .where({ dashboard_ID: dashboardId })
        .orderBy('version desc')
    );

    const shares = await db.run(
      SELECT.from(ENTITY_NAMES.DashboardShares).where({ dashboard_ID: dashboardId })
    );

    return {
      ...dashboard,
      latestSpec,
      shares
    };
  }

  /**
   * Update an existing dashboard
   */
  public async updateDashboard(dashboardId: string, params: UpdateDashboardParams, ctx: TenantContext) {
    const db = await cds.connect.to('db');

    const existing = await this.getDashboardById(dashboardId, ctx);
    if (!existing) {
      throw new Error(`Dashboard '${dashboardId}' not found or access denied.`);
    }

    // Authorization: only owner can edit (or user with write share)
    if (existing.ownerId !== ctx.userId) {
      throw new Error(`Unauthorized: User '${ctx.userId}' is not the owner of dashboard '${dashboardId}'.`);
    }

    // Update metadata
    await db.run(
      UPDATE(ENTITY_NAMES.Dashboards)
        .set({
          title: params.title || existing.title,
          description: params.description !== undefined ? params.description : existing.description
        })
        .where({ ID: dashboardId, organization_ID: ctx.organizationId })
    );

    // If new specJson is provided, save a new spec version
    if (params.specJson) {
      await db.run(
        INSERT.into(ENTITY_NAMES.DashboardSpecs).entries({
          ID: randomUUID(),
          dashboard_ID: dashboardId,
          version: '1.1',
          specJson: params.specJson,
          retrievedAt: new Date().toISOString()
        })
      );
    }

    await db.run(
      INSERT.into(ENTITY_NAMES.AuditEvents).entries({
        ID: randomUUID(),
        organizationId: ctx.organizationId,
        workspaceId: existing.workspace_ID,
        userId: ctx.userId,
        action: 'UPDATE_DASHBOARD',
        targetId: dashboardId,
        sourceSystem: 'sria-app',
        metricVersion: '1.1',
        details: `Dashboard updated: ${dashboardId}`
      })
    );

    return this.getDashboardById(dashboardId, ctx);
  }

  /**
   * Soft-delete / Archive a dashboard
   */
  public async archiveDashboard(dashboardId: string, ctx: TenantContext): Promise<boolean> {
    const db = await cds.connect.to('db');

    const existing = await this.getDashboardById(dashboardId, ctx);
    if (!existing) {
      return false;
    }

    if (existing.ownerId !== ctx.userId) {
      throw new Error(`Unauthorized: Cannot archive dashboard owned by '${existing.ownerId}'.`);
    }

    await db.run(
      UPDATE(ENTITY_NAMES.Dashboards)
        .set({ isArchived: 1 })
        .where({ ID: dashboardId, organization_ID: ctx.organizationId })
    );

    await db.run(
      INSERT.into(ENTITY_NAMES.AuditEvents).entries({
        ID: randomUUID(),
        organizationId: ctx.organizationId,
        workspaceId: existing.workspace_ID,
        userId: ctx.userId,
        action: 'ARCHIVE_DASHBOARD',
        targetId: dashboardId,
        sourceSystem: 'sria-app',
        details: `Dashboard archived: ${dashboardId}`
      })
    );

    return true;
  }

  /**
   * Record a non-sensitive audit event
   */
  public async recordAudit(
    action: string,
    targetId: string,
    details: string,
    ctx: TenantContext,
    sourceSystem = 'sria-app',
    metricVersion = '1.0'
  ) {
    const db = await cds.connect.to('db');
    await db.run(
      INSERT.into(ENTITY_NAMES.AuditEvents).entries({
        ID: randomUUID(),
        organizationId: ctx.organizationId,
        workspaceId: '00000000-0000-0000-0000-000000000001',
        userId: ctx.userId,
        action,
        targetId,
        sourceSystem,
        metricVersion,
        details
      })
    );
  }
}

export const defaultDashboardRepository = new DashboardRepository();
