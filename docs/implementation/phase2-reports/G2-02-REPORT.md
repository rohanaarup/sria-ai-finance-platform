# G2-02 — Governed Finance Data Product & Provider v2: completion report

Date: 2026-11-27 · Branch: `master` · Repository: https://github.com/rohanaarup/sria-ai-finance-platform

## What was built
| Area | Delivered |
|---|---|
| Data product | `srv/dataproduct/financial-performance.ts` — `getPerformance(query, ctx)`: validates entities, periods and dimensions against the semantic layer, enforces bounds, applies entity-level authorization, reads through an adapter with timeout and AbortSignal, runs quality checks, groups results, calculates with semantic formulas (Decimal), returns provenance v2. Contract: `docs/data/DATA-PRODUCT-CONTRACT.md`. |
| Adapter contract v2 | `srv/lib/providers/adapter-contract.ts`: capability descriptor, cursor paging, AbortSignal, typed `AdapterError`. `MockSourceAdapter` (fixtures v2), `S4HanaSourceAdapter` (blocked, typed UNAVAILABLE until G2-03), shim that wraps a v1 provider. |
| Tool | `get_finance_metrics` is now a thin client of the data product; it imports no provider or adapter. `FinanceDataService` likewise. A per-run in-memory cache reuses identical queries by hash (never persisted). `DATA_PRODUCT=off` restores the legacy path. |
| Fixtures v2 | 151 records: v1 unchanged, plus 1000/2000 FY2025, entity 3000 Europe in EUR (24 periods over FY2025–26), and entity 4000 with four labelled defects (duplicate key, zero value, currency mix, missing period). Business-unit and GL-group hierarchies added to the semantic seed. Hand-verification worksheet: `docs/data/FIXTURES-V2-WORKSHEET.md`. |
| Currency policy | No conversion anywhere. Multi-currency data is reported per currency, `converted: false`, flag `CURRENCY_MIX`. A scan test forbids FX logic in the backend. |
| Authorization | `EntityAccess` table + seed (decision D-17). Denials return 403 and are audited in their own transaction (a first version lost the audit row on rollback; fixed and tested over HTTP). Unknown company codes are denied the same way, so existence does not leak. |
| Source selection | `DataSourceReferences` activated: a tenant whose workspace has an S/4HANA alias is served by that adapter. |
| Provenance v2 | source, API name/version, query hash, retrievedAt, freshness, record count, quality flags, metric versions, tier, synthetic flag, `truncated=false`, run-cache flag. Carried into dashboard specs (`dataProvenance.v2`). |
| UI | `ProvenanceBadge` (header and every widget): source, freshness, quality count, popover with all details and per-metric flags; KPI cards show "No data" for MISSING_DATA instead of 0. |
| Docs | `DATA-PRODUCT-CONTRACT.md`, updated `DATA-STORAGE-POLICY.md`, ADR-012. |

## Measured test results (`npm test` at repo root, Node v24.18.0, 2026-11-27; also with every `sqlite.db` removed)
| Suite | Tests | Pass | Fail |
|---|---|---|---|
| `@sria/contracts` | 8 | 8 | 0 |
| `@sria/cap` | 214 | 214 | 0 |
| `@sria/web` | 37 | 37 | 0 |
| root `tests/` | 85 | 85 | 0 |
| **Total** | **344** | **344** | **0** |

G2-01 ended at 299. New: data-product suite (19), adapter conformance suite (11 incl. blocked S/4 and v1 shim), HTTP data-product checks (2), provenance UI tests (13). `npm run typecheck` and `npm run build` pass.

CI note: the first push failed on Node 22 only. `AbortSignal.timeout` uses an unreferenced timer, so with nothing else keeping the process alive the event loop exited before the timeout fired. The data product now uses an explicit `AbortController` with a referenced timer, cleared when retrieval finishes. The whole suite was then run locally on Node 22.23 and Node 24.18 with no `sqlite.db` present: 344/344 on both.

## Acceptance criteria
| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Tool gets data only through the data product; import-boundary test | Met | `data-product.test.ts` "boundaries" (scans `srv/ai`, `srv/dashboard` and all top-level handlers) |
| 2 | Conformance suite passes for the mock adapter and gates future adapters | Met | `tests/dataproduct/adapter-conformance.test.ts` (`runConformance` is reusable) |
| 3 | Over-bound queries rejected or paged with explicit flags, never silently truncated | Met | bounds tests (entities, periods, rows → `TRUNCATION_REFUSED`, timeout, abort); results always have `truncated: false` |
| 4 | Every result carries provenance v2 | Met | `ProvenanceV2Schema` parse in tests; HTTP test reads `provenanceJson` |
| 5 | Multi-entity and range queries correct on fixtures (hand-verified) | Met | worksheet totals asserted exactly (e.g. 3000 FY2025 revenue 672,000.00; USD total 1,836,000.00) |
| 6 | Multi-currency reported per currency with ‘not converted’; no implicit FX | Met | per-currency groups, `converted:false`, FX scan test |
| 7 | A user can query only permitted entities; others denied and audited | Met | unit and HTTP tests (tenant B: 2000 yes, 1000 → 403 + audit row) |
| 8 | Quality checks emit flags that the UI surfaces | Met in code and tests; **not yet viewed in a browser** | defect-fixture tests; `ProvenanceBadge` |
| 9 | UI shows source, freshness and quality for every displayed result | Met in code and tests; **not yet viewed in a browser** | header and per-widget badges |

## Decisions
- **D-17 (entity-access source of truth):** the application table `EntityAccess` for now; a token attribute can replace it later. In mock/local a tenant with no rows may query the synthetic entities; a tenant with rows is restricted to them; pilot/production fail closed. *The security owner still has to confirm where permissions will be maintained for the real pilot.*
- Duplicate posting keys are flagged and included in totals (not removed), because removing rows silently would change figures; Finance decides the real rule once SAP data is available.
- A single-company tool request spanning two currencies is refused with an explanatory error; the multi-entity API reports per currency.

## Not done / carried forward
- Finance-supplied realistic edge cases for fixtures (reversals, accruals, closing-period postings) are still to be provided; current edge cases are self-authored and labelled.
- The S/4HANA adapter is a blocked stub (G2-03); the conformance suite is ready for it.
- Charts and period tiles reuse the dashboard-level provenance; per-chart provenance would need separate data-product calls per breakdown.
- UI verified by tests and build only, not in a browser. Popover keyboard focus does not move into the popover on open.
- `DataProductService` is internal (no browser-facing endpoint), as the roadmap specifies; `GetFinanceMetrics` is its HTTP surface.
