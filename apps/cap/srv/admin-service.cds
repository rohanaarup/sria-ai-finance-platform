using { sria.finance as my } from '../db/schema';

@path: '/api/v1/admin'
service AdminService {
  entity Organizations as projection on my.Organizations;
  entity Workspaces as projection on my.Workspaces;
  entity DataSourceReferences as projection on my.DataSourceReferences;
  @readonly entity AuditEvents as projection on my.AuditEvents;
}

