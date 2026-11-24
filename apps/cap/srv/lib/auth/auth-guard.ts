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
export class AuthGuard {
  /**
   * Resolves verified user identity from CAP / XSUAA request context
   */
  public static resolveUser(req: any): AuthenticatedUser | null {
    if (!req.user || req.user.is('anonymous')) {
      return null;
    }

    const id = req.user.id || 'anonymous';
    // Organization/Tenant identity strictly extracted from token
    const tenant = req.user.tenant || req.user.attr?.tenantid || 'DEFAULT_TENANT';
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
      req.error(401, 'Authentication Required: Unauthenticated requests are rejected.');
      throw new Error('Authentication Required');
    }
    return user;
  }

  /**
   * Asserts that the authenticated user possesses the required scope; throws 403 if missing
   */
  public static assertScope(req: any, requiredScope: 'FinanceAnalyst' | 'FinanceManager' | 'TenantAdmin'): AuthenticatedUser {
    const user = this.assertAuthenticated(req);
    if (!user.scopes.includes(requiredScope) && !user.roles.includes('TenantAdmin')) {
      req.error(403, `Forbidden: Operation requires '${requiredScope}' permission.`);
      throw new Error(`Forbidden: Missing required scope '${requiredScope}'`);
    }
    return user;
  }
}
