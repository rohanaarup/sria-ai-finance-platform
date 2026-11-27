using { sria.finance as my } from '../db/schema';

@path: '/api/v1/dashboards'
@requires: ['FinanceAnalyst','FinanceManager','TenantAdmin']
service DashboardService {
  // Reads are tenant-filtered in dashboard-service.ts; every write goes through the actions below.
  // DashboardSpecs and DashboardShares are internal and not exposed (no tenant key on the entity).
  @readonly entity Workspaces as projection on my.Workspaces;
  @readonly entity Dashboards as projection on my.Dashboards;

  @requires: ['FinanceManager','TenantAdmin']
  action createDashboard(
    workspaceId  : UUID,
    title        : String(150),
    description  : String(500),
    specJson     : LargeString,
    metricIds    : String(255),
    dimensions   : String(255),
    sourceType   : String(20)
  ) returns Dashboards;

  @requires: ['FinanceManager','TenantAdmin']
  action updateDashboard(
    dashboardId  : UUID,
    title        : String(150),
    description  : String(500),
    specJson     : LargeString
  ) returns Dashboards;

  @requires: ['FinanceManager','TenantAdmin']
  action archiveDashboard(
    dashboardId  : UUID
  ) returns Boolean;

  @requires: ['FinanceManager','TenantAdmin']
  action shareDashboard(
    dashboardId  : UUID,
    principalType: String(20),
    principalId  : String(100),
    permission   : String(20)
  ) returns Boolean;
}

