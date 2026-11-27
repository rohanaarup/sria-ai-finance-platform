/**
 * AiService — CDS Definition
 * Phase 6 — AI Request Understanding & Clarification Engine
 *
 * Exposes AI intent understanding capabilities to the React frontend.
 * Protected by XSUAA role templates / scopes.
 */

using { sria.finance } from '../db/schema';

service AiService @(path: '/api/ai', requires: ['FinanceAnalyst','FinanceManager','TenantAdmin']) {

  /**
   * UnderstandRequest — interprets natural language prompt into structured intent
   * Returns: status, resolved request payload (if valid), clarification questions (if ambiguous),
   * or rejection reason (if unsupported).
   */
  action UnderstandRequest(
    prompt : String not null
  ) returns {
    status            : String;   // 'RESOLVED' | 'CLARIFICATION_REQUIRED' | 'REJECTED'
    resolvedRequest   : String;   // Serialized DashboardRequest JSON (if RESOLVED)
    clarificationJson : String;   // Serialized ClarificationQuestion[] JSON (if CLARIFICATION_REQUIRED)
    rejectionReason   : String;   // Human-readable reason (if REJECTED)
    supportedMetrics  : array of String;
  };
}

