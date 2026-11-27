/**
 * DashboardLifecycleService — CDS Definition
 * Phase 10 — Follow-up requests, save/reopen & dashboard lifecycle
 *
 * Exposes lifecycle operations: Save, Rename, Delete, Share, Reopen, and Refresh.
 * All operations require server-side tenant authentication and ownership checks.
 */

using { sria.finance as my } from '../db/schema';

@path: '/api/v1/lifecycle'
@requires: ['FinanceAnalyst','FinanceManager','TenantAdmin']
service DashboardLifecycleService {
  // Tenant-filtered in dashboard-lifecycle-service.ts. DashboardSpecs is internal (no tenant key) and not exposed.
  @readonly entity Dashboards as projection on my.Dashboards;

  @requires: ['FinanceManager','TenantAdmin']
  action SaveDashboard(
    workspaceId : UUID,
    title       : String(150),
    description : String(500),
    specJson    : LargeString not null
  ) returns {
    dashboardId : UUID;
    version     : String(10);
    savedAt     : String;
    status      : String;
  };

  @requires: ['FinanceManager','TenantAdmin']
  action RenameDashboard(
    dashboardId : UUID,
    newTitle    : String(150) not null
  ) returns {
    dashboardId : UUID;
    updatedTitle: String(150);
    status      : String;
  };

  @requires: ['FinanceManager','TenantAdmin']
  action DeleteDashboard(
    dashboardId : UUID
  ) returns {
    dashboardId : UUID;
    isArchived  : Boolean;
    status      : String;
  };

  @requires: ['FinanceManager','TenantAdmin']
  action ShareDashboard(
    dashboardId     : UUID,
    sharedWithUserId: String(100) not null,
    permission      : String(20) not null // 'READ' | 'EDIT'
  ) returns {
    dashboardId     : UUID;
    sharedWithUserId: String(100);
    permission      : String(20);
    status          : String;
  };

  action ReopenDashboard(
    dashboardId : UUID
  ) returns {
    dashboardId : UUID;
    title       : String;
    specJson    : LargeString;
    isStale     : Boolean;
    lastSavedAt : String;
  };

  @requires: ['FinanceManager','TenantAdmin']
  action RefreshDashboard(
    dashboardId : UUID
  ) returns {
    dashboardId : UUID;
    refreshedSpecJson: LargeString;
    refreshedAt : String;
    isStale     : Boolean;
  };

  function ListDashboards() returns array of {
    ID          : UUID;
    title       : String;
    description : String;
    createdAt   : String;
    isStale     : Boolean;
  };
}
