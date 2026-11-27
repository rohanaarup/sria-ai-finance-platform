using { sria.finance as my } from '../db/schema';

@path: '/api/v1/admin'
@requires: 'TenantAdmin'
service AdminService {
  // All admin entities are read-only here and filtered to the caller's tenant in admin-service.ts.
  // DataSourceReferences is intentionally not exposed: it carries no tenant key (revisit in G2-02/G2-03).
  @readonly entity Organizations as projection on my.Organizations;
  @readonly entity Workspaces as projection on my.Workspaces;
  @readonly entity AuditEvents as projection on my.AuditEvents;
}

