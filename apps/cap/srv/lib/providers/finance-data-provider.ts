/**
 * FinanceDataProvider Interface
 * Phase 5 — SAP Finance Data Access & Source Adapter
 *
 * This contract defines how the CAP orchestration layer retrieves normalized
 * FinanceRecord arrays. All implementations must be transient: records are
 * never persisted to the application database, logged, or cached.
 *
 * CRITICAL RULES:
 *  - LLM never touches raw SAP data or calculation logic.
 *  - FinanceRecord[] is in-memory only — no persistence, no logging.
 *  - All implementations must set provenance (isSynthetic, sourceType).
 *  - Sign conventions remain UNCONFIRMED until Finance Reviewer approves.
 */

import type { FinanceRecord } from '@sria/contracts';

// ─── Fetch Parameters ────────────────────────────────────────────────────────

/**
 * Parameters passed to every FinanceDataProvider.fetchRecords() call.
 * Values are validated before the provider is invoked; the provider must
 * not perform additional business-logic filtering beyond what is specified here.
 */
export interface FetchParams {
  /** SAP Company Code (e.g. '1000'). Required. */
  companyCode: string;
  /** Fiscal year (e.g. 2026). Required. */
  fiscalYear: number;
  /** Fiscal period string (e.g. '01', '02'). Optional — omit to fetch all periods. */
  fiscalPeriod?: string;
  /** Optional business unit filter. */
  businessUnit?: string;
  /** ISO 4217 currency code the caller expects. Optional — provider returns source currency when omitted. */
  currency?: string;
}

// ─── Tenant Context ───────────────────────────────────────────────────────────

/**
 * Minimal tenant context required for every provider call.
 * Used for audit trails and destination resolution.
 * Never contains SAP credentials or OAuth tokens.
 */
export interface TenantContext {
  /** Organization/workspace identifier from the application DB. */
  organizationId: string;
  /** User identifier making the request. */
  userId: string;
  /** Destination reference name (not the actual credentials). */
  destinationName?: string;
}

// ─── Provider Interface ───────────────────────────────────────────────────────

/**
 * FinanceDataProvider
 * Abstraction that the CAP orchestration layer uses to retrieve normalized
 * FinanceRecord arrays from a data source (mock or S/4HANA OData).
 *
 * Implementations:
 *  - MockFinanceDataProvider  — deterministic synthetic data, always available.
 *  - S4HanaODataFinanceDataProvider — BLOCKED until destination credentials exist.
 */
export interface FinanceDataProvider {
  /**
   * Fetch normalized FinanceRecord[] for the given parameters.
   * Returns an empty array when no matching records exist — never throws for
   * an empty result set.
   * Records are TRANSIENT — caller must not persist or log them.
   */
  fetchRecords(params: FetchParams, ctx: TenantContext): Promise<FinanceRecord[]>;

  /**
   * Returns the source type identifier used in provenance metadata.
   */
  getSourceType(): 'mock' | 's4hana';

  /**
   * Health-check: returns true when the underlying data source can be reached.
   * MockFinanceDataProvider always returns true.
   * S4HanaODataFinanceDataProvider returns false when destination is unavailable.
   */
  isAvailable(): Promise<boolean>;
}

