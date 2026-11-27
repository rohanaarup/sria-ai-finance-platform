# G2-01 — Finance Semantic Layer v2: completion report

Date: 2026-11-27 · Branch: `master` · Repository: https://github.com/rohanaarup/sria-ai-finance-platform

## What was built
| Area | Delivered |
|---|---|
| Semantic model | `apps/cap/db/semantic.cds`: MetricDefinitions, immutable MetricVersions (status, kind, sign rule / expression, unit, decimals, effectiveFrom, proposedBy/approvedBy), MetricDependencies (DAG), Dimensions + DimensionMembers (parent links), FiscalCalendars + FiscalPeriods (K4: 12 + 4 special, 2025–2026), GlossaryTerms (aliases + known-unsupported terms), SourceMappings (lineage). Seed CSVs reproduce the four existing metrics unchanged. `MetricConfigurations` removed (F-13). |
| Formulas | `srv/semantic/formula.ts`: a small expression language parsed into a tree (never executed as code); cycle detection. |
| Decimal arithmetic | `srv/lib/finance/decimal.ts` (decimal.js, ROUND_HALF_UP). Legacy engine converted too, so no money arithmetic on binary floats remains (F-09). |
| Calculation | `srv/semantic/evaluate.ts` computes metrics from semantic formulas and sign rules; every result records `metricVersion` (e.g. `total_revenue@v1`) and a data state. Used by the `get_finance_metrics` tool and FinanceDataService. `SEMANTIC_LAYER=off` restores the legacy path. |
| Gate | One `MetricGate`: planner, tool and intent allowlist ask the semantic catalog whether a metric is executable in the tier, including its dependencies. |
| Agent grounding | Intent service scans the request against the glossary **before** any model call; known-unsupported terms (EBITDA, churn, …) are refused without a model call; if no known term appears, a model-chosen metric becomes a clarification; the system prompt lists the governed metrics and aliases. |
| API | `SemanticService` (`/api/v1/semantic`): getCatalog, resolveTerm, listExecutable, getMetric (all versions), getLineage, getDimensions, getFiscalCalendar; proposeMetricVersion (FinanceManager / MetricApprover / TenantAdmin, always tenant-scoped, PENDING_REVIEW, DAG-checked) and approve/reject (MetricApprover, four-eyes, audited). |
| Security | New `MetricApprover` scope, role template and role collection in `xs-security.json`; mocked users `approver`, `approver2`, `approver_b`. |
| UI | Metric catalog & glossary drawer (definition, owner, version, status, executable, aliases, lineage); opened from the top bar, sidebar and command palette. |
| Docs | `docs/domain/FINANCE-METRICS.md` and `CALCULATION-RULES.md` are now generated from the semantic model (`npm run docs:semantic --workspace=apps/cap`; a test fails on drift). ADR-011 and ADR-013 added to `docs/architecture/DECISIONS.md`. |

## Measured test results (`npm test` at repo root, Node v24.18.0, 2026-11-27)
| Suite | Tests | Pass | Fail |
|---|---|---|---|
| `@sria/contracts` | 8 | 8 | 0 |
| `@sria/cap` | 193 | 193 | 0 |
| `@sria/web` | 24 | 24 | 0 |
| root `tests/` | 74 | 74 | 0 |
| **Total** | **299** | **299** | **0** |

G2-00 ended at 248. New: semantic unit suite (28), SemanticService HTTP suite (8), three semantic endpoints in the authorization matrix (6), catalog UI tests (11). `npm run typecheck` and `npm run build` pass.

## Acceptance criteria
| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Four metrics reproduced to 2 dp on every synthetic fixture | Met | `semantic.test.ts` §1 (4 fixtures × 4 metrics, also equal to legacy engine) |
| 2 | Decimal end to end; a test forbids float money operations | Met | `decimal.ts`; §3 property test (200 random trials vs integer cents) and source-scan rule |
| 3 | Only APPROVED, effective versions execute; PENDING rejected by planner, tools and intent | **Met for pilot/production; deliberate exception in mock/local** | §5; see decision D-02 below |
| 4 | Dependencies stored as a DAG; cyclic definition rejected at write time | Met | §4 and HTTP test (400 "cycle") |
| 5 | New definition = new version; old versions readable; results record version | Met | §5, HTTP "changing a definition…", `metricVersion` in results |
| 6 | Glossary resolves deterministically before any model call; unknown → clarification | Met | §6, §8 (spy model never called for EBITDA) |
| 7 | Lineage with mapping status; nothing MAPPED without evidence | Met | §7 (S/4HANA fields UNCONFIRMED; synthetic source MAPPED by construction with evidence) |
| 8 | Catalog UI shows definition, owner, version, status, lineage | Met in code and tests; **not yet viewed in a browser** | `MetricCatalog.tsx`, `semantic.test.ts` (web) |
| 9 | Org-specific rows tenant-scoped; cross-tenant read test | Met | HTTP "org-specific metrics are tenant-scoped" |

## Decisions
- **D-02 (kept from G2-00):** in mock/local, PENDING_REVIEW versions run so the app works on synthetic data before Finance sign-off; pilot/production need APPROVED + effective versions (and approved dependencies). This is a deliberate, documented deviation from criterion 3's wording.
- **D-03:** decimal.js rather than integer minor units (ADR-013).
- **D-04 (roles):** MetricApprover scope; proposers (FinanceManager, MetricApprover, TenantAdmin) cannot approve their own versions. *The named people for owner and approver are still to be nominated by Finance.*
- Approving a GLOBAL version is allowed to any MetricApprover (dedicated tenant-mode deployment); tenant versions only within the same tenant.

## Not done / carried forward
- Finance sign-off of the four definitions and nomination of owners/approvers (manual, D-02/D-04). The real fiscal year variant comes from SAP in G2-03.
- Tenant-specific *new* metric ids can be defined, approved and listed, but running them through the dashboard pipeline needs `MetricIdEnum` widened (G2-06, tool platform).
- Catalog drawer verified by tests and build only, not by a manual browser session.
