/**
 * OrchestrationService — CDS Definition
 * Phase 7 — AI Planning, Tool Orchestration & Controlled Execution
 *
 * Exposes planning and safe tool execution to the application.
 * All operations are gated by CAP authorization roles and scopes.
 */

using { sria.finance } from '../db/schema';

service OrchestrationService @(path: '/api/orchestration') {

  /**
   * PlanRequest — builds a validated DataPlan from a DashboardRequest
   */
  action PlanRequest(
    requestJson : String not null
  ) returns {
    status   : String;
    planJson : String;
    error    : String;
  };

  /**
   * ExecutePlan — executes tools specified in the DataPlan with step budget and audit trace
   */
  action ExecutePlan(
    requestJson : String not null
  ) returns {
    status      : String;
    planJson    : String;
    resultsJson : String;
    traceJson   : String;
    error       : String;
  };
}

