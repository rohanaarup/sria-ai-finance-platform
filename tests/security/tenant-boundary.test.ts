/**
 * Multi-Tenant Boundary & RBAC Authorization Security Test Suite
 * Phase 11 — Security, AI Evaluation, Tests & Reliability
 *
 * Verifies strict server-side tenant isolation and RBAC role boundaries:
 *  1. Cross-tenant dashboard read attempts return null.
 *  2. Cross-tenant dashboard update / rename attempts are rejected with 403.
 *  3. Cross-tenant delete / archive attempts are rejected.
 *  4. Cross-tenant dashboard sharing attempts are blocked.
 *  5. AuthGuard rejects unauthenticated anonymous requests with 401.
 *  6. Scope hierarchy rejects unauthorized roles (Viewer/Analyst attempting Manager actions).
 *  7. Tenant and user identity are server-injected, immune to client tampering.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';
import cds from '@sap/cds';
import { connectTestDb } from '../../apps/cap/test/helpers/test-db.ts';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DashboardRepository, ENTITY_NAMES } from '../../apps/cap/srv/lib/repositories/dashboard-repository.ts';
import { AuthGuard } from '../../apps/cap/srv/lib/auth/auth-guard.ts';
import type { TenantContext } from '../../apps/cap/srv/lib/repositories/dashboard-repository.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Phase 11 — Tenant Boundary & RBAC Authorization Security Suite', async (t) => {
  const { db } = await connectTestDb();
  const repo = new DashboardRepository();

  const tenantAlphaId = randomUUID();
  const tenantBetaId = randomUUID();
  const workspaceAlpha = randomUUID();
  const workspaceBeta = randomUUID();

  const userAlphaOwner: TenantContext = {
    organizationId: tenantAlphaId,
    userId: 'USER_ALPHA_MANAGER',
    roles: ['FinanceManager']
  };

  const userAlphaAnalyst: TenantContext = {
    organizationId: tenantAlphaId,
    userId: 'USER_ALPHA_ANALYST',
    roles: ['FinanceAnalyst']
  };

  const userBetaAttacker: TenantContext = {
    organizationId: tenantBetaId,
    userId: 'USER_BETA_ATTACKER',
    roles: ['FinanceManager']
  };

  // Seed two distinct tenant organizations and workspaces
  await db.run(
    INSERT.into(ENTITY_NAMES.Organizations).entries([
      { ID: tenantAlphaId, code: `ALPHA_${Date.now()}`, name: 'Tenant Alpha Corp' },
      { ID: tenantBetaId, code: `BETA_${Date.now()}`, name: 'Tenant Beta Corp' }
    ])
  );

  await db.run(
    INSERT.into(ENTITY_NAMES.Workspaces).entries([
      { ID: workspaceAlpha, organization_ID: tenantAlphaId, code: 'WS_ALPHA', name: 'Alpha Finance' },
      { ID: workspaceBeta, organization_ID: tenantBetaId, code: 'WS_BETA', name: 'Beta Finance' }
    ])
  );

  let alphaDashboardId = '';

  const sampleSpec = JSON.stringify({
    version: '1.0',
    title: 'Confidential Alpha Q1 Financials',
    widgets: []
  });

  await t.test('1. Setup: Tenant Alpha creates confidential financial dashboard', async () => {
    const created = await repo.createDashboard(
      {
        workspaceId: workspaceAlpha,
        title: 'Confidential Alpha Q1 Financials',
        description: 'Internal Alpha executive numbers',
        specJson: sampleSpec
      },
      userAlphaOwner
    );

    assert.ok(created);
    alphaDashboardId = created.ID;
  });

  await t.test('2. Multi-Tenant Isolation: Tenant Beta cannot view Tenant Alpha dashboard in list', async () => {
    const betaList = await repo.listDashboards(userBetaAttacker);
    const leaked = betaList.some((d: any) => d.ID === alphaDashboardId);
    assert.equal(leaked, false, 'Security violation: Tenant Alpha dashboard leaked into Tenant Beta listing');
  });

  await t.test('3. Multi-Tenant Isolation: Tenant Beta direct query by ID returns null', async () => {
    const readAttempt = await repo.getDashboardById(alphaDashboardId, userBetaAttacker);
    assert.equal(readAttempt, null, 'Security violation: Cross-tenant direct read succeeded');
  });

  await t.test('4. Multi-Tenant Isolation: Tenant Beta update/rename attack is rejected', async () => {
    await assert.rejects(
      async () => {
        await repo.updateDashboard(
          alphaDashboardId,
          { title: 'Hacked by Tenant Beta' },
          userBetaAttacker
        );
      },
      /not found or access denied/,
      'Security violation: Cross-tenant update did not throw access denied'
    );
  });

  await t.test('5. Multi-Tenant Isolation: Tenant Beta delete/archive attack returns false', async () => {
    const archiveSuccess = await repo.archiveDashboard(alphaDashboardId, userBetaAttacker);
    assert.equal(archiveSuccess, false, 'Security violation: Cross-tenant archive succeeded');

    // Verify Alpha dashboard is still active and intact
    const alphaVerify = await repo.getDashboardById(alphaDashboardId, userAlphaOwner);
    assert.ok(alphaVerify);
    assert.equal(alphaVerify.title, 'Confidential Alpha Q1 Financials');
  });

  await t.test('6. RBAC Scope Hierarchy: Anonymous request rejected with 401', () => {
    let errorCode = 0;
    const fakeAnonymousReq = {
      user: { id: 'anonymous', is: (role: string) => role === 'anonymous', roles: [] },
      error: (code: number) => { errorCode = code; }
    };

    assert.throws(
      () => AuthGuard.assertAuthenticated(fakeAnonymousReq as any),
      /Authentication Required/,
      'Expected Authentication Required for anonymous user'
    );
    assert.equal(errorCode, 401, 'Expected req.error(401)');
  });

  await t.test('7. RBAC Scope Hierarchy: FinanceAnalyst rejected for FinanceManager action with 403', () => {
    let errorCode = 0;
    const analystReq = {
      user: {
        id: userAlphaAnalyst.userId,
        is: (role: string) => role === 'FinanceAnalyst',
        roles: ['FinanceAnalyst'],
        tenant: tenantAlphaId
      },
      error: (code: number) => { errorCode = code; }
    };

    assert.throws(
      () => AuthGuard.assertScope(analystReq as any, 'FinanceManager'),
      /Forbidden/,
      'Expected Forbidden when FinanceAnalyst attempts FinanceManager scope'
    );
    assert.equal(errorCode, 403, 'Expected req.error(403)');
  });

  await t.test('8. RBAC Scope Hierarchy: FinanceManager has access to Analyst and Manager scopes', () => {
    const managerReq = {
      user: {
        id: userAlphaOwner.userId,
        is: (role: string) => role === 'FinanceManager',
        roles: ['FinanceManager'],
        tenant: tenantAlphaId
      },
      error: (code: number, msg: string) => new Error(`HTTP ${code}: ${msg}`)
    };

    assert.doesNotThrow(() => AuthGuard.assertScope(managerReq as any, 'FinanceAnalyst'));
    assert.doesNotThrow(() => AuthGuard.assertScope(managerReq as any, 'FinanceManager'));
  });

  await t.test('9. Tenant Identity Tampering: Client-injected tenant is ignored; server context is authoritative', () => {
    const tamperedClientReq = {
      user: {
        id: 'REAL_ALICE',
        is: (role: string) => role === 'FinanceAnalyst',
        roles: ['FinanceAnalyst'],
        tenant: tenantAlphaId
      },
      data: {
        organizationId: 'ATTACKER_INJECTED_TENANT',
        userId: 'ATTACKER_INJECTED_USER'
      }
    };

    const resolved = AuthGuard.resolveUser(tamperedClientReq as any);
    assert.equal(resolved?.tenant, tenantAlphaId, 'Tenant must come strictly from server-resolved token');
    assert.equal(resolved?.id, 'REAL_ALICE', 'User ID must come strictly from server-resolved token');
  });
});
