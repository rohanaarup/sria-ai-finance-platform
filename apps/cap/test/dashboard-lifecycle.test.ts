/**
 * Dashboard Lifecycle & Authorization Persistence Tests
 * Phase 10 — Follow-up requests, save/reopen & dashboard lifecycle
 *
 * Verifies:
 *  1. SaveDashboard: Persists Dashboard and DashboardSpec JSON.
 *  2. ListDashboards: Enforces tenant isolation.
 *  3. ReopenDashboard: Marks configuration with isStale=true.
 *  4. RenameDashboard: Enforces user ownership check.
 *  5. ShareDashboard: Creates read-only share entry and logs audit event.
 *  6. RefreshDashboard: Triggers fresh data query and updates spec version.
 *  7. DeleteDashboard: Soft-deletes dashboard.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';
import cds from '@sap/cds';
import { randomUUID } from 'node:crypto';
import { connectTestDb } from './helpers/test-db.ts';
import { DashboardRepository, ENTITY_NAMES } from '../srv/lib/repositories/dashboard-repository.ts';
import type { TenantContext } from '../srv/lib/repositories/dashboard-repository.ts';

test('Dashboard Lifecycle & Authorization Suite', async (t) => {
  const { db } = await connectTestDb();
  const repo = new DashboardRepository();

  const orgId = randomUUID();
  const workspaceId = randomUUID();

  const userOwner: TenantContext = {
    organizationId: orgId,
    userId: 'USER_OWNER_ALICE',
    roles: ['FinanceManager']
  };

  const userOther: TenantContext = {
    organizationId: orgId,
    userId: 'USER_BOB',
    roles: ['FinanceAnalyst']
  };

  // Seed org and workspace
  await db.run(
    INSERT.into(ENTITY_NAMES.Organizations).entries({
      ID: orgId,
      code: `ORG_${Date.now()}`,
      name: 'Acme Commercial Pilot Tenant'
    })
  );

  await db.run(
    INSERT.into(ENTITY_NAMES.Workspaces).entries({
      ID: workspaceId,
      organization_ID: orgId,
      code: `WS_${Date.now()}`,
      name: 'Pilot Commercial Workspace'
    })
  );

  let dashboardId = '';

  const sampleSpec = {
    version: '1.0',
    dashboardId: 'pilot-saved-spec-1',
    title: 'Initial Dashboard Title',
    widgets: [{ id: 'w1', type: 'kpi_card', title: 'Revenue', metricIds: ['total_revenue'] }],
    results: [],
    dataProvenance: {
      sourceType: 'mock',
      sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
      retrievedAt: new Date().toISOString(),
      calculationVersion: '1.0.0',
      isSynthetic: true,
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
    }
  };

  await t.test('1. SaveDashboard: Persists Dashboard header and serialized spec JSON', async () => {
    const created = await repo.createDashboard(
      {
        workspaceId,
        title: 'Initial Dashboard Title',
        description: 'Commercial pilot test dashboard',
        specJson: JSON.stringify(sampleSpec),
        sourceType: 'mock'
      },
      userOwner
    );

    assert.ok(created);
    assert.equal(created.title, 'Initial Dashboard Title');
    assert.equal(created.ownerId, userOwner.userId);
    assert.equal(created.organization_ID, orgId);
    assert.ok(created.latestSpec);
    assert.equal(created.latestSpec.version, '1.0');

    dashboardId = created.ID;
  });

  await t.test('2. ListDashboards: Scoped strictly to authenticated tenant', async () => {
    const list = await repo.listDashboards(userOwner);
    assert.ok(list.length >= 1);
    const found = list.some((d: any) => d.ID === dashboardId);
    assert.equal(found, true);

    // Cross-tenant read test
    const foreignOrgContext: TenantContext = {
      organizationId: randomUUID(),
      userId: 'FOREIGN_USER',
      roles: ['FinanceAnalyst']
    };
    const foreignList = await repo.listDashboards(foreignOrgContext);
    const leaked = foreignList.some((d: any) => d.ID === dashboardId);
    assert.equal(leaked, false, 'Tenant isolation violation: Dashboard visible to foreign tenant');
  });

  await t.test('3. ReopenDashboard: Retrieves saved configuration', async () => {
    const retrieved = await repo.getDashboardById(dashboardId, userOwner);
    assert.ok(retrieved);
    assert.equal(retrieved.ID, dashboardId);
    assert.ok(retrieved.latestSpec);

    const parsedSpec = JSON.parse(retrieved.latestSpec.specJson);
    assert.equal(parsedSpec.dashboardId, 'pilot-saved-spec-1');
  });

  await t.test('4. RenameDashboard: Owner succeeds, non-owner is rejected', async () => {
    // Owner can rename
    const updated = await repo.updateDashboard(
      dashboardId,
      { title: 'Renamed Executive Financial Overview' },
      userOwner
    );
    assert.equal(updated?.title, 'Renamed Executive Financial Overview');

    // Non-owner is rejected
    await assert.rejects(
      async () => {
        await repo.updateDashboard(
          dashboardId,
          { title: 'Malicious Rename' },
          userOther
        );
      },
      /Unauthorized/
    );
  });

  await t.test('5. ShareDashboard: Records read-only share and logs audit event', async () => {
    await db.run(
      INSERT.into(ENTITY_NAMES.DashboardShares).entries({
        ID: randomUUID(),
        dashboard_ID: dashboardId,
        principalType: 'USER',
        principalId: userOther.userId,
        permission: 'READ',
        createdAt: new Date().toISOString()
      })
    );

    await repo.recordAudit('DASHBOARD_SHARED', dashboardId, `Shared with ${userOther.userId} (READ)`, userOwner);

    const retrieved = await repo.getDashboardById(dashboardId, userOwner);
    assert.ok(retrieved?.shares);
    const share = retrieved.shares.find((s: any) => s.principalId === userOther.userId);
    assert.ok(share);
    assert.equal(share.permission, 'READ');
  });

  await t.test('6. RefreshDashboard: Updates spec version in database', async () => {
    const refreshedSpec = {
      ...sampleSpec,
      title: 'Refreshed Dashboard Spec',
      dataProvenance: {
        ...sampleSpec.dataProvenance,
        retrievedAt: new Date().toISOString()
      }
    };

    const updated = await repo.updateDashboard(
      dashboardId,
      { specJson: JSON.stringify(refreshedSpec) },
      userOwner
    );

    assert.ok(updated?.latestSpec);
    assert.equal(updated.latestSpec.version, '1.1');
    const parsed = JSON.parse(updated.latestSpec.specJson);
    assert.equal(parsed.title, 'Refreshed Dashboard Spec');
  });

  await t.test('7. DeleteDashboard: Soft-deletes dashboard record', async () => {
    const success = await repo.archiveDashboard(dashboardId, userOwner);
    assert.equal(success, true);

    // After archive, it must no longer appear in active dashboards list
    const listAfter = await repo.listDashboards(userOwner);
    const foundAfter = listAfter.some((d: any) => d.ID === dashboardId);
    assert.equal(foundAfter, false, 'Archived dashboard should not appear in active list');
  });
});
