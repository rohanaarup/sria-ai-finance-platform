using { sria.finance as my } from '../db/schema';

@path: '/api/v1/dashboards'
service DashboardService {
  @readonly entity Workspaces as projection on my.Workspaces;
  entity Dashboards as projection on my.Dashboards;
  entity DashboardSpecs as projection on my.DashboardSpecs;
  entity DashboardShares as projection on my.DashboardShares;

  action createDashboard(
    workspaceId  : UUID,
    title        : String(150),
    description  : String(500),
    specJson     : LargeString,
    metricIds    : String(255),
    dimensions   : String(255),
    sourceType   : String(20)
  ) returns Dashboards;

  action updateDashboard(
    dashboardId  : UUID,
    title        : String(150),
    description  : String(500),
    specJson     : LargeString
  ) returns Dashboards;

  action archiveDashboard(
    dashboardId  : UUID
  ) returns Boolean;

  action shareDashboard(
    dashboardId  : UUID,
    principalType: String(20),
    principalId  : String(100),
    permission   : String(20)
  ) returns DashboardShares;
}

