using { sria.finance as my } from '../db/schema';

@path: '/api/v1/admin'
@requires: 'TenantAdmin'
service AdminService {
  // All admin entities are read-only here and filtered to the caller's tenant in admin-service.ts.
  @readonly entity Organizations as projection on my.Organizations;
  // G2-02: per-tenant source selection; tenant-filtered through workspace.organization in admin-service.ts
  @readonly entity DataSourceReferences as projection on my.DataSourceReferences;
  @readonly entity EntityAccess as projection on my.EntityAccess;
  // G2-04: model-call log (metadata only), tenant-filtered in admin-service.ts
  @readonly entity ModelCalls as projection on my.ModelCalls;
  @readonly entity Workspaces as projection on my.Workspaces;
  @readonly entity AuditEvents as projection on my.AuditEvents;
}

