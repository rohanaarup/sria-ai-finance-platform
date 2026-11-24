import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthGuard } from '../srv/lib/auth/auth-guard.ts';

// Helper to simulate a CAP Request object
function createMockReq(options: {
  id?: string;
  tenant?: string;
  isAnonymous?: boolean;
  roles?: string[];
}) {
  const errors: { code: number; message: string }[] = [];
  const roles = options.roles || [];

  return {
    user: {
      id: options.id || 'test-user',
      tenant: options.tenant || 'ORG_ACME_TEST',
      is: (role: string) => {
        if (options.isAnonymous) return role === 'anonymous';
        if (role === 'anonymous') return false;
        return roles.includes(role);
      }
    },
    error: (code: number, message: string) => {
      errors.push({ code, message });
    },
    getErrors: () => errors
  };
}

test('AuthGuard Security & Role Enforcement Suite', async (t) => {
  await t.test('1. Reject unauthenticated anonymous requests with 401', () => {
    const anonReq = createMockReq({ isAnonymous: true });

    assert.throws(
      () => {
        AuthGuard.assertAuthenticated(anonReq);
      },
      /Authentication Required/
    );

    const errors = anonReq.getErrors();
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 401);
  });

  await t.test('2. Successfully resolve authenticated user context and tenant', () => {
    const validReq = createMockReq({
      id: 'USER_ALICE',
      tenant: 'ORG_NORTH_AMERICA',
      roles: ['FinanceAnalyst']
    });

    const user = AuthGuard.resolveUser(validReq);
    assert.ok(user);
    assert.equal(user.id, 'USER_ALICE');
    assert.equal(user.tenant, 'ORG_NORTH_AMERICA');
    assert.deepEqual(user.roles, ['FinanceAnalyst']);
    assert.deepEqual(user.scopes, ['FinanceAnalyst']);
  });

  await t.test('3. Enforce scope hierarchy: Reject FinanceAnalyst attempting FinanceManager action with 403', () => {
    const analystReq = createMockReq({
      id: 'USER_ANALYST_BOB',
      tenant: 'ORG_NORTH_AMERICA',
      roles: ['FinanceAnalyst']
    });

    // Analysts can access analyst operations
    const analystCheck = AuthGuard.assertScope(analystReq, 'FinanceAnalyst');
    assert.ok(analystCheck);

    // Analysts are blocked from Manager operations
    assert.throws(
      () => {
        AuthGuard.assertScope(analystReq, 'FinanceManager');
      },
      /Forbidden: Missing required scope 'FinanceManager'/
    );

    const errors = analystReq.getErrors();
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, 403);
  });

  await t.test('4. FinanceManager possesses both Manager and Analyst permissions', () => {
    const managerReq = createMockReq({
      id: 'USER_MGR_CAROL',
      tenant: 'ORG_NORTH_AMERICA',
      roles: ['FinanceManager']
    });

    const user = AuthGuard.resolveUser(managerReq);
    assert.ok(user);
    assert.ok(user.roles.includes('FinanceManager'));
    assert.ok(user.roles.includes('FinanceAnalyst'));

    // Both assertions succeed
    assert.doesNotThrow(() => AuthGuard.assertScope(managerReq, 'FinanceAnalyst'));
    assert.doesNotThrow(() => AuthGuard.assertScope(managerReq, 'FinanceManager'));
  });

  await t.test('5. TenantAdmin has unrestricted management authorization', () => {
    const adminReq = createMockReq({
      id: 'USER_ADMIN_DAVE',
      tenant: 'ORG_NORTH_AMERICA',
      roles: ['TenantAdmin']
    });

    assert.doesNotThrow(() => AuthGuard.assertScope(adminReq, 'TenantAdmin'));
    // Admin inherits permission across scopes
    assert.doesNotThrow(() => AuthGuard.assertScope(adminReq, 'FinanceManager'));
    assert.doesNotThrow(() => AuthGuard.assertScope(adminReq, 'FinanceAnalyst'));
  });
});

