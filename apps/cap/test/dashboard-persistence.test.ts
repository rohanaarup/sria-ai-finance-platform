import test from 'node:test';
import assert from 'node:assert/strict';
import cds from '@sap/cds';
import { randomUUID } from 'node:crypto';
import { DashboardRepository, ENTITY_NAMES } from '../srv/lib/repositories/dashboard-repository.ts';
import type { TenantContext } from '../srv/lib/repositories/dashboard-repository.ts';

test('CAP Persistence & Tenant Isolation Suite', async (t) => {
  // Connect to local SQLite DB
  const db = await cds.connect.to({ kind: 'sqlite', credentials: { url: 'sqlite.db' } });

  const repo = new DashboardRepository();

  const orgA: TenantContext = {
    organizationId: randomUUID(),
    userId: 'USER_ALICE_ORG_A',
    roles: ['FinanceManager']
  };

  const orgB: TenantContext = {
    organizationId: randomUUID(),
    userId: 'USER_CHARLIE_ORG_B',
    roles: ['FinanceAnalyst']
  };

  const workspaceIdA = randomUUID();
  const workspaceIdB = randomUUID();

  // Setup seed organizations and workspaces
  await db.run(
    INSERT.into(ENTITY_NAMES.Organizations).entries([
      { ID: orgA.organizationId, code: 'ORG_A', name: 'Acme US Corp' },
      { ID: orgB.organizationId, code: 'ORG_B', name: 'Global EU Ltd' }
    ])
  );

  await db.run(
    INSERT.into(ENTITY_NAMES.Workspaces).entries([
      { ID: workspaceIdA, organization_ID: orgA.organizationId, code: 'WS_FIN_A', name: 'Finance US' },
      { ID: workspaceIdB, organization_ID: orgB.organizationId, code: 'WS_FIN_B', name: 'Finance EU' }
    ])
  );

  let createdDashboardId = '';

  await t.test('1. Create dashboard with DashboardSpec JSON and verify storage', async () => {
    const spec = {
      version: '1.0',
      dashboardId: randomUUID(),
      title: 'Q1 Revenue Overview',
      widgets: [{ id: 'w1', type: 'kpi_card', title: 'Revenue', metricIds: ['total_revenue'] }]
    };

    const dashboard = await repo.createDashboard(
      {
        workspaceId: workspaceIdA,
        title: 'Q1 Revenue Overview',
        description: 'Quarterly financial overview for management',
        specJson: JSON.stringify(spec),
        metricIds: 'total_revenue,net_profit',
        dimensions: 'month,company_code',
        sourceType: 'mock'
      },
      orgA
    );

    assert.ok(dashboard);
    assert.equal(dashboard.title, 'Q1 Revenue Overview');
    assert.equal(dashboard.ownerId, orgA.userId);
    assert.equal(dashboard.organization_ID, orgA.organizationId);
    assert.ok(dashboard.latestSpec);
    assert.equal(dashboard.latestSpec.metricIds, 'total_revenue,net_profit');

    createdDashboardId = dashboard.ID;
  });

  await t.test('2. List dashboards scopes strictly to organization', async () => {
    const dashboardsA = await repo.listDashboards(orgA);
    assert.ok(dashboardsA.length >= 1);
    const foundInA = dashboardsA.some((d: any) => d.ID === createdDashboardId);
    assert.equal(foundInA, true);

    // Tenant Isolation Check: Org B queries its dashboards
    const dashboardsB = await repo.listDashboards(orgB);
    const leakedIntoB = dashboardsB.some((d: any) => d.ID === createdDashboardId);
    assert.equal(leakedIntoB, false, 'Tenant isolation failure: Dashboard leaked to Org B');
  });

  await t.test('3. Direct read by ID enforces tenant boundary', async () => {
    // Org A can read its own dashboard
    const readable = await repo.getDashboardById(createdDashboardId, orgA);
    assert.ok(readable);
    assert.equal(readable.ID, createdDashboardId);

    // Org B attempts to read Org A dashboard -> returns null
    const crossTenantRead = await repo.getDashboardById(createdDashboardId, orgB);
    assert.equal(crossTenantRead, null, 'Tenant boundary violated: Cross-tenant dashboard read succeeded');
  });

  await t.test('4. Update dashboard enforces ownership & creates new spec version', async () => {
    const updatedSpec = {
      version: '1.1',
      title: 'Q1 Revenue & Margin Analysis'
    };

    const updated = await repo.updateDashboard(
      createdDashboardId,
      {
        title: 'Q1 Revenue & Margin Analysis',
        specJson: JSON.stringify(updatedSpec)
      },
      orgA
    );

    assert.equal(updated.title, 'Q1 Revenue & Margin Analysis');
    assert.equal(updated.latestSpec.version, '1.1');

    // Unauthorized user in same org attempts update
    const unauthorizedUser: TenantContext = {
      organizationId: orgA.organizationId,
      userId: 'USER_INTRUDER',
      roles: ['FinanceAnalyst']
    };

    await assert.rejects(
      async () => {
        await repo.updateDashboard(
          createdDashboardId,
          { title: 'Hacked Title' },
          unauthorizedUser
        );
      },
      /Unauthorized/
    );
  });

  await t.test('5. Archive (soft delete) removes dashboard from active list', async () => {
    const archived = await repo.archiveDashboard(createdDashboardId, orgA);
    assert.equal(archived, true);

    // Verify it no longer appears in active list
    const activeDashboards = await repo.listDashboards(orgA);
    const isPresent = activeDashboards.some((d: any) => d.ID === createdDashboardId);
    assert.equal(isPresent, false, 'Archived dashboard should not appear in active listings');
  });

  await t.test('6. Audit events are recorded without storing raw financial data', async () => {
    const logs = await db.run(
      SELECT.from(ENTITY_NAMES.AuditEvents).where({ organizationId: orgA.organizationId })
    );

    assert.ok(logs.length >= 3); // CREATE, UPDATE, ARCHIVE
    const actions = logs.map((l: any) => l.action);
    assert.ok(actions.includes('CREATE_DASHBOARD'));
    assert.ok(actions.includes('UPDATE_DASHBOARD'));
    assert.ok(actions.includes('ARCHIVE_DASHBOARD'));

    // Verify no raw transactional payloads in audit details
    for (const log of logs) {
      assert.ok(!log.details.includes('FinanceRecord'));
      assert.ok(!log.details.includes('GLAccount'));
    }
  });

  await t.test('7. Persistence across simulated connection restart', async () => {
    // Disconnect and reconnect to simulate cold service restart
    await cds.disconnect();
    const freshDb = await cds.connect.to({ kind: 'sqlite', credentials: { url: 'sqlite.db' } });

    const reloaded = await freshDb.run(
      SELECT.one.from(ENTITY_NAMES.Dashboards).where({ ID: createdDashboardId })
    );

    assert.ok(reloaded);
    assert.equal(reloaded.ID, createdDashboardId);
    assert.equal(reloaded.isArchived, 1); // 1 = true in SQLite
  });
});
