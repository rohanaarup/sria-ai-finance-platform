export interface AuthenticatedUser {
  id: string;
  tenant: string;
  scopes: string[];
  roles: string[];
}

/**
 * Authentication and Scope Enforcement Guard
 * Provides server-side validation independent of client assertions.
 */
/** Reject with a proper HTTP status (req.reject throws in CAP; the fallback keeps plain-object tests working). */
function deny(req: any, code: number, message: string): never {
  if (typeof req.reject === 'function') req.reject(code, message);
  else req.error(code, message);
  throw new Error(message);
}

export class AuthGuard {
  /**
   * Resolves verified user identity from CAP / XSUAA request context
   */
  public static resolveUser(req: any): AuthenticatedUser | null {
    if (!req.user || req.user.is('anonymous')) {
      return null;
    }

    const id = req.user.id || 'anonymous';
    // Organization/Tenant identity strictly extracted from the verified token.
    // No default tenant: a token without a tenant is rejected (fail closed).
    const tenant: string = req.user.attr?.tenantid || req.user.tenant || req.tenant || '';
    const roles: string[] = [];
    const scopes: string[] = [];

    // Check standard scopes / role collections
    if (req.user.is('FinanceAnalyst') || req.user.is('SriaFinanceAnalyst')) {
      roles.push('FinanceAnalyst');
      scopes.push('FinanceAnalyst');
    }
    if (req.user.is('FinanceManager') || req.user.is('SriaFinanceManager')) {
      roles.push('FinanceManager');
      scopes.push('FinanceManager');
      // Managers inherit Analyst read permissions
      if (!roles.includes('FinanceAnalyst')) {
        roles.push('FinanceAnalyst');
        scopes.push('FinanceAnalyst');
      }
    }
    if (req.user.is('MetricApprover') || req.user.is('SriaMetricApprover')) {
      roles.push('MetricApprover');
      scopes.push('MetricApprover');
    }
    if (req.user.is('TenantAdmin') || req.user.is('SriaTenantAdministrator') || req.user.is('admin')) {
      roles.push('TenantAdmin');
      scopes.push('TenantAdmin');
    }

    return { id, tenant, scopes, roles };
  }

  /**
   * Asserts that a request is authenticated; throws 401 if anonymous
   */
  public static assertAuthenticated(req: any): AuthenticatedUser {
    const user = this.resolveUser(req);
    if (!user) {
      return deny(req, 401, 'Authentication Required: Unauthenticated requests are rejected.');
    }
    if (!user.tenant) {
      return deny(req, 403, 'Forbidden: The verified identity carries no tenant.');
    }
    return user;
  }

  /**
   * Asserts that the authenticated user possesses the required scope; throws 403 if missing
   */
  public static assertScope(req: any, requiredScope: 'FinanceAnalyst' | 'FinanceManager' | 'TenantAdmin' | 'MetricApprover'): AuthenticatedUser {
    const user = this.assertAuthenticated(req);
    if (!user.scopes.includes(requiredScope) && !user.roles.includes('TenantAdmin')) {
      return deny(req, 403, `Forbidden: Missing required scope '${requiredScope}'`);
    }
    return user;
  }

  /**
   * Verified request context for handlers: authenticates, requires the scope and
   * returns the tenant/user/roles taken ONLY from the token. Request bodies and
   * headers (x-tenant-id, x-user-id) are never trusted.
   */
  public static tenantContext(
    req: any,
    requiredScope: 'FinanceAnalyst' | 'FinanceManager' | 'TenantAdmin' | 'MetricApprover' = 'FinanceAnalyst'
  ): { organizationId: string; userId: string; roles: string[] } {
    const user = this.assertScope(req, requiredScope);
    return { organizationId: user.tenant, userId: user.id, roles: user.roles };
  }
}
