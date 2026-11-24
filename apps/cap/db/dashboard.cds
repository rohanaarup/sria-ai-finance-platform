namespace sria.finance;

using { cuid, managed } from '@sap/cds/common';
using { sria.finance.Workspaces, sria.finance.Organizations } from './tenant';

/**
 * Dashboard root metadata entity
 */
entity Dashboards : cuid, managed {
  workspace    : Association to Workspaces not null;
  organization : Association to Organizations not null;
  title        : String(150) not null;
  description  : String(500);
  ownerId      : String(100) not null; // Authenticated user ID
  isArchived   : Boolean default false;
  latestSpec   : Composition of one DashboardSpecs on latestSpec.dashboard = $self;
  shares       : Composition of many DashboardShares on shares.dashboard = $self;
}

/**
 * Persisted Dashboard Specification (JSON payload)
 * Stores ONLY layout, widget configuration, and provenance.
 * NEVER stores raw financial transactions or ERP transaction lines.
 */
entity DashboardSpecs : cuid, managed {
  dashboard    : Association to Dashboards not null;
  version      : String(10) default '1.0';
  specJson     : LargeString not null; // Serialized DashboardSpec JSON
  metricIds    : String(255);          // comma-separated for indexing
  dimensions   : String(255);
  sourceType   : String(20) default 'mock'; // 'mock' | 's4hana'
  retrievedAt  : Timestamp;
}

/**
 * Access control and sharing permissions for dashboards
 */
entity DashboardShares : cuid, managed {
  dashboard    : Association to Dashboards not null;
  principalType: String(20) not null; // 'USER' | 'ROLE'
  principalId  : String(100) not null; // user ID or role collection
  permission   : String(20) default 'READ'; // 'READ' | 'WRITE'
}

