namespace sria.finance;

using { cuid, managed } from '@sap/cds/common';

/**
 * Entity-level authorization (G2-02, decision D-17): which company codes a principal may query.
 * Source of truth is this application table for now; a token attribute may replace it later.
 * principalType USER → principalId is a user id; ROLE → principalId is a role name.
 * In pilot/production a tenant without rows has access to nothing (fail closed).
 */
entity EntityAccess : cuid, managed {
  tenantId      : String(100) not null;
  principalType : String(10) not null;   // USER | ROLE
  principalId   : String(100) not null;
  companyCode   : String(10) not null;
}
