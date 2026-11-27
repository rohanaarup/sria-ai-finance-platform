namespace sria.finance;

using { cuid, managed } from '@sap/cds/common';

/**
 * Finance semantic layer (G2-01, ADR-011).
 *
 * Business meaning is data: metric definitions, immutable versions with an approval status,
 * formula dependencies (a DAG), dimensions and hierarchies, fiscal calendars, a glossary with
 * aliases, and lineage to source fields. tenantId 'GLOBAL' = global definition shipped with the
 * product; any other value = an organisation-specific row visible only to that tenant.
 */

entity MetricDefinitions : managed {
  key metricId : String(50);
  key tenantId : String(100) default 'GLOBAL';
  label        : String(100) not null;
  category     : String(20) not null;   // REVENUE | EXPENSE | PROFIT | RATIO
  description  : String(1000) not null;
  owner        : String(100) not null;
}

/** Immutable once written. Only `status`, `approvedBy`, `approvedAt` change, through the approval workflow. */
entity MetricVersions : cuid, managed {
  metricId      : String(50) not null;
  tenantId      : String(100) default 'GLOBAL';
  version       : Integer not null;
  status        : String(20) not null;  // DRAFT | PENDING_REVIEW | APPROVED | REJECTED | RETIRED
  kind          : String(10) not null;  // BASE | DERIVED
  accountType   : String(20);           // BASE: account type to aggregate
  signRule      : String(20);           // BASE: CREDIT_POSITIVE | DEBIT_POSITIVE
  expression    : String(500);          // DERIVED: formula over metric ids
  unit          : String(10) not null;  // CURRENCY | PERCENT
  decimals      : Integer not null default 2;
  effectiveFrom : Date not null;
  proposedBy    : String(100);
  approvedBy    : String(100);
  approvedAt    : Timestamp;
  dependencies  : Composition of many MetricDependencies on dependencies.version = $self;
}

entity MetricDependencies : cuid {
  version   : Association to MetricVersions not null;
  dependsOn : String(50) not null;
}

entity Dimensions {
  key dimensionId : String(50);
  label           : String(100) not null;
  description     : String(500);
}

/** Members with parent links form hierarchies (e.g. company code → region). */
entity DimensionMembers : cuid {
  dimension      : Association to Dimensions not null;
  memberId       : String(50) not null;
  label          : String(100) not null;
  parentMemberId : String(50);
  tenantId       : String(100) default 'GLOBAL';
}

entity FiscalCalendars {
  key calendarId : String(10);
  description    : String(255) not null;
  periodsPerYear : Integer not null;
  specialPeriods : Integer not null default 0;
  startMonth     : Integer not null default 1;
}

entity FiscalPeriods : cuid {
  calendar   : Association to FiscalCalendars not null;
  fiscalYear : Integer not null;
  period     : String(3) not null;
  startDate  : Date not null;
  endDate    : Date not null;
  isSpecial  : Boolean default false;
}

/** status RESOLVES: the term means metricId. UNSUPPORTED: a known finance term we do not offer. */
entity GlossaryTerms : cuid {
  term     : String(100) not null;  // lower case
  metricId : String(50);
  status   : String(20) not null;   // RESOLVES | UNSUPPORTED
  tenantId : String(100) default 'GLOBAL';
  note     : String(255);
}

/** Lineage: which source field feeds a BASE metric. MAPPED requires recorded evidence. */
entity SourceMappings : cuid {
  metricId      : String(50) not null;
  tenantId      : String(100) default 'GLOBAL';
  sourceSystem  : String(50) not null;
  entitySet     : String(100) not null;
  field         : String(100) not null;
  mappingStatus : String(20) not null; // MAPPED | UNCONFIRMED | BLOCKED
  evidence      : String(500);
}
