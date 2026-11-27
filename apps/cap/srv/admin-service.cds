using { sria.finance as my } from '../db/schema';

@path: '/api/v1/admin'
@requires: 'TenantAdmin'
service AdminService {
  // All admin entities are read-only here and filtered to the caller's tenant in admin-service.ts.
  @readonly entity Organizations as projection on my.Organizations;
  // G2-02: per-tenant source selection; tenant-filtered through workspace.organization in admin-service.ts
  @readonly entity DataSourceReferences as projection on my.DataSourceReferences;
  @readonly entity EntityAccess as projection on my.EntityAccess;
  @readonly entity Workspaces as projection on my.Workspaces;
  @readonly entity AuditEvents as projection on my.AuditEvents;
}

