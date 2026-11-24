/**
 * S4HanaODataFinanceDataProvider — STUB (BLOCKED)
 * Phase 5 — SAP Finance Data Access & Source Adapter
 *
 * STATUS: BLOCKED — requires a configured BTP Destination with OAuth2 credentials
 *         pointing to a live SAP S/4HANA system before ANY methods can proceed.
 *
 * This file establishes the code boundary and type contract only.
 * - No real OData HTTP calls are made.
 * - No real endpoint URLs are referenced or hard-coded.
 * - No credentials, tokens, or secrets are stored here.
 *
 * HOW TO UNBLOCK:
 *  1. SAP BASIS team creates the S/4HANA OData service and approves access.
 *  2. BTP admin creates a Destination service instance with OAuth2 credentials.
 *  3. Finance team confirms GL account mapping, sign conventions, and fiscal calendar.
 *  4. Dev team replaces _callOData() stub with real @sap/cloud-sdk-vdm fetch.
 *  5. Human verifies successful round-trip and updates IMPLEMENTATION-STATUS.md.
 *
 * SIGN CONVENTIONS: UNCONFIRMED — do not assume Credit = Revenue Positive
 *                   until Finance Reviewer signs off. See docs/domain/SAP-FIELD-MAPPING.md.
 */

import type { FinanceDataProvider, FetchParams, TenantContext } from './finance-data-provider.ts';
import type { FinanceRecord } from '@sria/contracts';

// ─── Error Types ──────────────────────────────────────────────────────────────

export class S4HanaProviderBlockedError extends Error {
  constructor(reason: string) {
    super(`[S4HanaODataFinanceDataProvider BLOCKED] ${reason}`);
    this.name = 'S4HanaProviderBlockedError';
  }
}

// ─── BLOCKED Stub Implementation ─────────────────────────────────────────────

export class S4HanaODataFinanceDataProvider implements FinanceDataProvider {
  private readonly _destinationName: string;

  constructor(destinationName?: string) {
    if (!destinationName || destinationName.trim() === '') {
      throw new S4HanaProviderBlockedError(
        'No BTP Destination name provided. ' +
        'Create a Destination in BTP Cockpit and set FINANCE_S4HANA_DESTINATION_NAME ' +
        'in the environment before using this provider.'
      );
    }
    this._destinationName = destinationName;
    // Log at startup so logs make the blocked state obvious.
    console.warn(
      `[S4HanaODataFinanceDataProvider] Initialized with destination="${this._destinationName}" ` +
      `but all operations remain BLOCKED until live connectivity is verified.`
    );
  }

  getSourceType(): 'mock' | 's4hana' {
    return 's4hana';
  }

  /**
   * BLOCKED — returns false because we cannot verify connectivity without
   * real BTP Destination credentials. Never returns true from this stub.
   */
  async isAvailable(): Promise<boolean> {
    // TODO(Phase N): Replace with actual BTP Destination health-check using
    //               @sap-cloud-sdk/connectivity when destination is provisioned.
    return false;
  }

  /**
   * BLOCKED — throws S4HanaProviderBlockedError unconditionally.
   *
   * Future implementation notes (DO NOT implement until unblocked):
   *  - Use @sap-cloud-sdk/http-client to call the BTP Destination service.
   *  - Target entity: TBD — see docs/domain/SAP-FIELD-MAPPING.md (UNCONFIRMED).
   *  - Map OData response fields to FinanceRecord[] using the approved mapping table.
   *  - Respect sign conventions as confirmed by Finance Reviewer (UNCONFIRMED).
   *  - Apply companyCode, fiscalYear, fiscalPeriod $filter OData parameters.
   *  - Never store raw OData response rows in the application database.
   */
  async fetchRecords(_params: FetchParams, _ctx: TenantContext): Promise<FinanceRecord[]> {
    throw new S4HanaProviderBlockedError(
      'fetchRecords() is not implemented. ' +
      'Live S/4HANA OData access requires: ' +
      '(1) BTP Destination service instance with OAuth2 credentials, ' +
      '(2) Finance team field-mapping approval (see SAP-FIELD-MAPPING.md), ' +
      '(3) Sign convention confirmation from Finance Reviewer.'
    );
  }

  // ─── Private (Future) ──────────────────────────────────────────────────────

  /**
   * Placeholder for the future OData HTTP call.
   * BLOCKED — do not implement until destination and mapping are confirmed.
   * @internal
   */
  private async _callOData(
    _destinationName: string,
    _params: FetchParams
  ): Promise<never> {
    throw new S4HanaProviderBlockedError(
      '_callOData() is not implemented. ' +
      'OData entity name and field mappings are UNCONFIRMED. ' +
      'See docs/domain/SAP-FIELD-MAPPING.md for the mapping worksheet.'
    );
  }
}

