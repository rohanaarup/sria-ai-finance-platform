# Phase 05 Report — SAP Finance Data Access & Source Adapter

**Phase Weight:** 11%  
**Cumulative on Completion:** 48%  
**Date:** 2026-11-24  
**Status:** ✅ COMPLETE (local/mock) | 🔴 BLOCKED (live S/4HANA)

---

## Objective

Implement the `FinanceDataProvider` abstraction layer, the deterministic `CalculationEngine`, and the CAP `FinanceDataService` that exposes typed metric results to the future AI orchestration layer. No LLM was integrated. No live SAP connection was made.

---

## Files Created

### Provider Layer

| File | Purpose |
|------|---------|
| `apps/cap/srv/lib/providers/finance-data-provider.ts` | `FinanceDataProvider` interface + `FetchParams` + `TenantContext` types |
| `apps/cap/srv/lib/providers/mock-finance-data-provider.ts` | `MockFinanceDataProvider` — deterministic SYNTHETIC data, `isSynthetic: true` |
| `apps/cap/srv/lib/providers/s4hana-odata-provider.ts` | `S4HanaODataFinanceDataProvider` — BLOCKED stub, throws `S4HanaProviderBlockedError` |
| `apps/cap/srv/lib/providers/provider-factory.ts` | Singleton factory reading `FINANCE_DATA_PROVIDER` env var |

### Calculation Engine

| File | Purpose |
|------|---------|
| `apps/cap/srv/lib/finance/calculation-engine.ts` | Deterministic: `calculateTotalRevenue`, `calculateTotalExpenses`, `calculateNetProfit`, `calculateProfitMargin`, `calculateAllMetrics` |

### CAP Service

| File | Purpose |
|------|---------|
| `apps/cap/srv/finance-data-service.cds` | CDS service definition: `GetFinanceMetrics` action + `GetProviderStatus` function |
| `apps/cap/srv/finance-data-service.ts` | CAP handler wiring provider factory + calculation engine |

### Tests

| File | Tests |
|------|-------|
| `apps/cap/test/mock-provider.test.ts` | 13 tests: provider, factory, golden fixtures, edge cases |
| `apps/cap/test/calculation-engine.test.ts` | 20 tests: all 4 formulas, sign conventions, zero denominator, company isolation |

---

## Test Results

```
ℹ tests 56
ℹ pass  56
ℹ fail   0
```

All 56 tests passing across auth, persistence, health, metric registry, mock provider, and calculation engine suites.

---

## Architecture Decisions Implemented

### Data Flow (Strictly Transient)

```
Request
  → ProviderFactory.getFinanceDataProvider()
  → provider.fetchRecords(FetchParams, TenantContext)  ← TRANSIENT: never persisted
  → FinanceRecord[] (in-memory only)
  → CalculationEngine.calculateAllMetrics()
  → MetricResult[] (typed, structured)
  → HTTP Response
```

**FinanceRecord[] is never:**
- Stored in the application database
- Logged to any log file
- Passed to an LLM
- Cached

### Sign Conventions — UNCONFIRMED

| Account Type | Debit ('D') | Credit ('C') |
|---|---|---|
| REVENUE | Reduces revenue (return/deduction) | Adds to revenue |
| EXPENSE | Adds to expense (normal posting) | Reduces expense (refund) |

> [!WARNING]
> These sign conventions are UNCONFIRMED. They match common SAP S/4HANA GL conventions but must be formally approved by the Finance Reviewer before production use. See `docs/domain/SAP-FIELD-MAPPING.md`.

### Zero-Denominator Protection

`calculateProfitMargin()` returns `{ value: 0.00, isZeroDenominator: true }` when `total_revenue === 0`. This is a valid business state (no revenue recorded in the period), not a division error.

---

## Provider Switching

| Env Var | Provider | Status |
|---------|---------|--------|
| `FINANCE_DATA_PROVIDER=mock` (default) | `MockFinanceDataProvider` | ✅ Fully operational |
| `FINANCE_DATA_PROVIDER=s4hana` | `S4HanaODataFinanceDataProvider` | 🔴 BLOCKED |

```bash
# Local development (default)
FINANCE_DATA_PROVIDER=mock

# Future production (requires unblocking)
FINANCE_DATA_PROVIDER=s4hana
FINANCE_S4HANA_DESTINATION_NAME=<BTP-destination-name>
```

---

## S/4HANA Provider — BLOCKED Items

The `S4HanaODataFinanceDataProvider` is a stub only. It throws `S4HanaProviderBlockedError` on every call. To unblock:

1. **SAP BASIS**: Create and expose the GL OData service (entity name: TBD — see `SAP-FIELD-MAPPING.md`)
2. **BTP Admin**: Create a Destination service instance with OAuth2 credentials
3. **Finance Reviewer**: Approve GL account mapping, sign conventions, fiscal calendar
4. **Dev**: Replace `_callOData()` stub with `@sap-cloud-sdk/http-client` calls
5. **QA**: Verify round-trip with a sandboxed S/4HANA system

---

## Calculation Engine — All 4 Approved Metrics

| Metric | Formula | Edge Case |
|--------|---------|-----------|
| `total_revenue` | Σ(REVENUE C records) − Σ(REVENUE D records) | Empty → 0 |
| `total_expenses` | Σ(EXPENSE D records) − Σ(EXPENSE C records) | Empty → 0 |
| `net_profit` | total_revenue − total_expenses | Negative = loss |
| `profit_margin` | (net_profit / total_revenue) × 100 | revenue=0 → `isZeroDenominator: true` |

---

## Verification Commands Run

```powershell
npm run typecheck --workspace=apps/cap   # ✅ 0 errors
npm test --workspace=apps/cap            # ✅ 56/56 pass
npm test --workspace=packages/contracts  # ✅ 8/8 pass
npm run build --workspace=apps/cap       # ✅ Clean build
```

---

## Human Actions Required

| Action | Owner | Priority |
|--------|-------|---------|
| Approve sign conventions in `SAP-FIELD-MAPPING.md` | Finance Reviewer | Required before Phase N (live data) |
| Create BTP Destination with OAuth2 | BTP Admin | Required before S/4HANA unblock |
| Confirm SAP GL OData entity name | SAP BASIS | Required before S/4HANA unblock |
| Confirm fiscal calendar (Jan–Dec vs. SAP periods) | Finance Reviewer | Required before S/4HANA unblock |

---

## What Does NOT Exist in This Phase

- ❌ No LLM integration (Phase 6)
- ❌ No real OData HTTP calls
- ❌ No BTP Destination credentials
- ❌ No raw financial data stored in the application DB
- ❌ No predictive analytics, caching, or ETL

---

## Cumulative Progress After Phase 05

**48% / 100%**

