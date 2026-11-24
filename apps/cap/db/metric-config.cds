namespace sria.finance;

using { cuid, managed } from '@sap/cds/common';
using { sria.finance.Workspaces } from './tenant';

/**
 * Versioned metric governance configurations in application database
 */
entity MetricConfigurations : cuid, managed {
  metricId            : String(50) not null;
  label               : String(100) not null;
  category            : String(20) not null; // REVENUE, EXPENSE, PROFIT, RATIO
  formulaOrAggregation: String(500) not null;
  supportedDimensions : String(255) not null;
  approvalStatus      : String(20) default 'PENDING_REVIEW';
  sourceMappingStatus : String(20) default 'UNCONFIRMED';
  owner               : String(100) not null;
  enabled             : Boolean default false;
  version             : Integer default 1;
}

/**
 * Reference to S/4HANA destination configured in BTP Destination Service
 * CRITICAL SECURITY RULE: Stores destination technical alias only!
 * NEVER stores passwords, client secrets, bearer tokens, or sensitive credentials.
 */
entity DataSourceReferences : cuid, managed {
  workspace      : Association to Workspaces not null;
  alias          : String(100) not null; // BTP Destination name e.g. S4HANA_FINANCE_API
  sourceType     : String(20) default 's4hana'; // 's4hana' | 'mock'
  systemId       : String(50);
  client         : String(10);
  description    : String(255);
}

/**
 * Auditing trail for data access & dashboard operations
 * Strictly minimized: logs who, action, timestamp, metric version.
 * Raw financial row extracts and confidential accounting figures are NEVER logged.
 */
entity AuditEvents : cuid, managed {
  organizationId : String(100) not null;
  workspaceId    : String(100) not null;
  userId         : String(100) not null;
  action         : String(50) not null; // 'CREATE_DASHBOARD' | 'FETCH_METRICS' | 'REFRESH'
  targetId       : String(100);
  sourceSystem   : String(100);
  metricVersion  : String(50);
  details        : String(1000);
}

