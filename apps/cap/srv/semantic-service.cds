/**
 * SemanticService — Finance semantic layer API (G2-01).
 *
 * Read: metric catalog, term resolution, versions, lineage, dimensions, fiscal calendar.
 * Write: propose a new metric version (always tenant-scoped, PENDING_REVIEW) and approve /
 * reject it. Versions are immutable; changing a definition always creates a new version.
 * Approval requires the MetricApprover scope and a different person than the proposer.
 * The underlying entities are not exposed, so nothing can be edited in place.
 */
@path: '/api/v1/semantic'
@requires: ['FinanceAnalyst','FinanceManager','TenantAdmin','MetricApprover']
service SemanticService {

  /** JSON array of MetricCatalogEntry (packages/contracts/src/semantic.ts) */
  function getCatalog() returns LargeString;

  function resolveTerm(term : String) returns {
    status   : String;  // RESOLVED | UNSUPPORTED | UNKNOWN
    term     : String;
    metricId : String;
    message  : String;
  };

  /** Metric ids executable in the server's environment tier for the caller's tenant */
  function listExecutable() returns array of String;

  /** JSON: { definition, versions: MetricVersion[] } (all versions, newest first) */
  function getMetric(metricId : String) returns LargeString;

  /** JSON array of LineageEdge */
  function getLineage(metricId : String) returns LargeString;

  /** JSON array of dimensions with members (hierarchies via parentMemberId) */
  function getDimensions() returns LargeString;

  /** JSON fiscal calendar with periods */
  function getFiscalCalendar(calendarId : String) returns LargeString;

  @requires: ['FinanceManager','MetricApprover','TenantAdmin']
  action proposeMetricVersion(
    metricId      : String(50) not null,
    label         : String(100),
    category      : String(20),
    description   : String(1000),
    kind          : String(10) not null,   // BASE | DERIVED
    accountType   : String(20),
    signRule      : String(20),
    expression    : String(500),
    unit          : String(10) not null,   // CURRENCY | PERCENT
    decimals      : Integer,
    effectiveFrom : Date
  ) returns {
    versionId : UUID;
    metricId  : String;
    version   : Integer;
    status    : String;
    dependsOn : array of String;
  };

  @requires: 'MetricApprover'
  action approveMetricVersion(versionId : UUID not null) returns {
    versionId  : UUID;
    metricId   : String;
    version    : Integer;
    status     : String;
    approvedBy : String;
  };

  @requires: 'MetricApprover'
  action rejectMetricVersion(versionId : UUID not null, reason : String(500)) returns {
    versionId : UUID;
    status    : String;
  };
}
