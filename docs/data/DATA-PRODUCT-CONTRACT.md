# FinancialPerformance data product — contract (G2-02, ADR-012)

Code: `apps/cap/srv/dataproduct/financial-performance.ts`. Schemas: `packages/contracts/src/data-product.ts`.

## Principle
Tools and handlers ask for **business concepts** (company codes, fiscal year, period range, metrics, grouping). They never name tables, fields or OData services and never import a provider or adapter (an import-boundary test enforces this). SAP specifics live only in adapters (G2-03).

## Query (`DataProductQuery`)
| Field | Meaning | Limit |
|---|---|---|
| `entities` | company codes | ≤ `DP_MAX_ENTITIES` (default 10) |
| `fiscalYear` | integer 2000–2100 | |
| `periodFrom` / `periodTo` | `01`–`16` | ≤ `DP_MAX_PERIODS` (16) periods; from ≤ to |
| `metrics` | semantic metric ids | ≤ 20; must be executable for the tier and tenant |
| `groupBy` | `company_code`, `fiscal_period`, `business_unit` | must exist in the semantic layer |
| `businessUnit` | optional filter | |

Over-limit queries are **rejected** (HTTP 400/413), never silently truncated. A read of more than `DP_MAX_ROWS` (50,000) source rows fails with `TRUNCATION_REFUSED`; a source slower than `DP_TIMEOUT_MS` (10 s) fails with `TIMEOUT`; the caller's AbortSignal stops retrieval.

## Order of work
1. Validate shape and bounds → 2. semantic validation (metrics executable, dimensions known) → 3. entity-level authorization → 4. choose adapter (injected, tenant's `DataSourceReferences` S/4HANA alias, or configured default) and reuse a same-run result by query hash → 5. page through the adapter → 6. quality checks → 7. group, calculate (Decimal, semantic formulas), attach provenance v2.

## Entity-level authorization (decision D-17)
Table `EntityAccess` (tenant, USER|ROLE, principal, company code) is the source of truth. pilot/production: a tenant without rows may query nothing. mock/local: a tenant without rows may query the synthetic fixture entities; a tenant with rows is restricted to them. Denials (including unknown company codes, so existence does not leak) return 403 and write an `ENTITY_ACCESS_DENIED` audit event in its own transaction.

## Currency policy
No FX conversion exists anywhere. Records in several currencies produce one group **per currency** plus `totalsByCurrency`; `converted` is always `false`; a `CURRENCY_MIX` flag says "not converted". A single-company tool request that spans currencies is refused with an explanatory error rather than summed.

## Provenance v2
`sourceType`, `sourceSystem`, `apiName`/`apiVersion`, `queryHash` (sha256 of tenant, source, sorted entities, year, periods, sorted metrics, grouping, business unit), `retrievedAt`, `freshness {ttlSeconds, ageSeconds, stale}`, `recordCount`, `qualityFlags`, `metricVersions`, `environmentTier`, `isSynthetic`, `truncated` (always false), `reusedFromRunCache`.

## Quality flags
`SYNTHETIC_DATA` (info) · `MISSING_PERIOD` · `MISSING_DATA` · `ZERO_VALUE` (info) · `CURRENCY_MIX` · `DUPLICATE_POSTING_KEY` · `ZERO_DENOMINATOR` (info). Duplicates are reported, not removed: totals include every occurrence, and the flag says so.

## Adapter contract v2
`capabilities()` (adapter id, source type/system, API name/version, synthetic flag, dimensions, pushdown filters, max page size, abort support, freshness TTL), `isAvailable()`, `fetchPage(query, ctx, {cursor, pageSize, signal})` with typed `AdapterError` codes `UNAVAILABLE | TIMEOUT | ABORTED | BAD_QUERY | AUTH | SOURCE_ERROR`. **Acceptance gate for every adapter:** `tests/dataproduct/adapter-conformance.test.ts` (`runConformance`).

## Rollback
`DATA_PRODUCT=off` makes the tool use the legacy fetch path (no bounds or flags) until parity is proven. Schema changes are additive.
