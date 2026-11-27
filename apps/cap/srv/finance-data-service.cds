/**
 * FinanceDataService — CDS Service Definition
 * Phase 5 — SAP Finance Data Access & Source Adapter
 *
 * Exposes a narrow, typed set of operations that the future AI orchestrator
 * can call. The service does NOT expose raw S/4HANA data — it returns only
 * calculated metric results.
 *
 * Authorization: inherits the same XSUAA scopes defined in xs-security.json.
 * Direct model-to-service connections are prohibited by architecture decision ADR-006.
 */

using { sria.finance } from '../db/schema';

service FinanceDataService @(path: '/api/finance', requires: ['FinanceAnalyst','FinanceManager','TenantAdmin']) {

  /**
   * GetFinanceMetrics — primary action for the AI tool-calling layer.
   *
   * Input:  companyCode, fiscalYear, fiscalPeriod (optional), businessUnit (optional)
   * Output: JSON payload containing MetricResult[] and provenance metadata.
   *
   * The action never returns raw SAP journal entries, GL balances or invoice rows.
   */
  action GetFinanceMetrics(
    companyCode  : String not null,
    fiscalYear   : Integer not null,
    fiscalPeriod : String,
    businessUnit : String
  ) returns {
    companyCode    : String;
    fiscalYear     : Integer;
    fiscalPeriod   : String;
    providerType   : String;
    isSynthetic    : Boolean;
    calculatedAt   : String;
    metrics        : array of {
      metricId       : String;
      label          : String;
      value          : Decimal(18,2);
      formattedValue : String;
      currency       : String;
      isZeroDenominator : Boolean;
      metricVersion  : String;   // semantic version used, e.g. total_revenue@v1 (G2-01)
      dataState      : String;   // AVAILABLE | ZERO_VALUE | MISSING_DATA
    };
  };

  /**
   * ProviderStatus — health-check for the active finance data provider.
   * Used by health monitoring and the admin service.
   */
  function GetProviderStatus() returns {
    providerType   : String;
    isAvailable    : Boolean;
    isSynthetic    : Boolean;
    statusMessage  : String;
  };
}

