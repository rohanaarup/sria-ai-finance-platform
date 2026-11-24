namespace sria.finance;

using { cuid, managed } from '@sap/cds/common';

/**
 * Multi-tenant organization boundaries
 */
entity Organizations : cuid, managed {
  code        : String(20) not null;
  name        : String(100) not null;
  description : String(255);
}

/**
 * Workspace within an organization (logical grouping of analytical assets)
 */
entity Workspaces : cuid, managed {
  organization : Association to Organizations not null;
  code         : String(50) not null;
  name         : String(100) not null;
  description  : String(255);
}
