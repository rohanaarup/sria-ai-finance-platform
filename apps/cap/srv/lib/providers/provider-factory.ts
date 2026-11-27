/**
 * ProviderFactory
 * Phase 5 — SAP Finance Data Access & Source Adapter
 *
 * Reads FINANCE_DATA_PROVIDER from the environment and returns the correct
 * FinanceDataProvider singleton.
 *
 *  FINANCE_DATA_PROVIDER=mock    → MockFinanceDataProvider (default)
 *  FINANCE_DATA_PROVIDER=s4hana  → S4HanaODataFinanceDataProvider (BLOCKED)
 *
 * The factory is called once at application startup and the singleton is
 * reused for the lifetime of the process.
 */

import type { FinanceDataProvider } from './finance-data-provider.ts';
import { MockFinanceDataProvider } from './mock-finance-data-provider.ts';
import { S4HanaODataFinanceDataProvider } from './s4hana-odata-provider.ts';
import { loadConfig } from '../config/app-config.ts';

export type ProviderType = 'mock' | 's4hana';

// Singleton holder
let _instance: FinanceDataProvider | null = null;

/**
 * Returns the FinanceDataProvider singleton based on FINANCE_DATA_PROVIDER env var.
 * Defaults to 'mock' when the variable is absent or unrecognized.
 *
 * @param overrideType - Optional explicit type (used in tests to avoid env pollution).
 */
export function getFinanceDataProvider(overrideType?: ProviderType): FinanceDataProvider {
  if (_instance !== null && overrideType === undefined) {
    return _instance;
  }

  const type: string = overrideType ?? loadConfig().financeProvider;

  switch (type) {
    case 's4hana': {
      const destinationName = process.env['FINANCE_S4HANA_DESTINATION_NAME'];
      console.log(`[ProviderFactory] Creating S4HanaODataFinanceDataProvider (BLOCKED) with destination="${destinationName ?? 'NOT_SET'}"`);
      _instance = new S4HanaODataFinanceDataProvider(destinationName);
      break;
    }
    case 'mock':
    default: {
      if (type !== 'mock') {
        console.warn(`[ProviderFactory] Unknown FINANCE_DATA_PROVIDER="${type}", falling back to 'mock'.`);
      }
      console.log('[ProviderFactory] Creating MockFinanceDataProvider (synthetic data, local dev only).');
      _instance = new MockFinanceDataProvider();
      break;
    }
  }

  return _instance;
}

/**
 * Resets the singleton. ONLY call this in tests to avoid state leakage.
 * @internal
 */
export function resetProviderSingleton(): void {
  _instance = null;
}

