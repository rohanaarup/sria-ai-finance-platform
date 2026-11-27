# G2-00 — Baseline Hardening & Truth Reset: completion report

Date: 2026-11-27 · Branch: `master` · Repository: https://github.com/rohanaarup/sria-ai-finance-platform

## Scope delivered
| Area | Delivered |
|---|---|
| Authorization | `@requires` on every CDS service (health intentionally `any`); manager-only actions annotated; entity writes removed (`DashboardSpecs`, `DashboardShares`, `DataSourceReferences` no longer exposed; `Dashboards`/`Workspaces` read-only and tenant-filtered; admin entities read-only and tenant-filtered) |
| Identity | No default tenant, user or role anywhere; `x-tenant-id` / `x-user-id` ignored; tenant comes from the token attribute `tenantid` (declared in `xs-security.json`); a token without a tenant gets 403 |
| Dev identities | Mocked users in `apps/cap/.cdsrc.json` (`analyst`, `manager`, `admin`, `analyst_b` of another tenant, `norole`, `notenant`); password `dev`, local only; production profile switches to XSUAA |
| Configuration | `srv/lib/config/app-config.ts` (Zod): one set of env vars, validated at startup; environment tier `mock·local·pilot·production`; `/health` reads the same object and reports `environmentTier`, provider, `isSynthetic` |
| CORS | Explicit allow-list (`CORS_ALLOWED_ORIGINS`), never `*`; pilot/production default to none |
| Metric gate | `FinanceMetricRegistry.isExecutableInTier/assertExecutable`; enforced in `Planner` and in the `get_finance_metrics` tool (decision D-02 below) |
| Calculation | One production pipeline `inspectAndCalculate` (normalization checks → formulas → explicit zero-vs-missing); mixed currencies refused with 422; duplicate calculators under `srv/finance/calculations/` deleted |
| Web | Offline/synthetic fallback only when `VITE_DEMO_MODE=true` in non-production builds, with a persistent banner; 401/403 never fall back; dev proxy attaches a dev user (dev server only); environment-tier badge; honest progress copy |
| CI / tests | Root `npm test` runs workspaces **and** `tests/`; CI matrix Node 22 and 24 (TypeScript type stripping needs ≥ 22.18; the previous Node 20 entry could not run the `.ts` suites) |

## Measured test results (command: `npm test` at repo root, Node v24.18.0, 2026-11-27)
| Suite | Tests | Pass | Fail |
|---|---|---|---|
| `@sria/contracts` | 8 | 8 | 0 |
| `@sria/cap` | 153 | 153 | 0 |
| `@sria/web` | 13 | 13 | 0 |
| root `tests/` | 74 | 74 | 0 |
| **Total** | **248** | **248** | **0** |

Before G2-00 `npm test` ran 104 tests (89 cap + 7 web + 8 contracts); 75 more sat in `tests/` outside any script (finding F-05). New in G2-00: HTTP authorization matrix (51), metric gate (6), AppConfig (7), web demo-mode (6), calculation pipeline (rewritten, 7). `npm run typecheck` and `npm run build` pass.

## Acceptance criteria
| # | Criterion | Evidence |
|---|---|---|
| 1 | Every service has an authorization annotation; a test fails if one lacks it | `http-authz.test.ts` "every CDS service carries …" |
| 2 | Anonymous → 401, insufficient role → 403 over HTTP | `http-authz.test.ts` matrix: 23 endpoints × anonymous/no-role/no-tenant/analyst/manager/admin |
| 3 | No default tenant/user/role; headers ignored | grep for `local-org`, `USER_DEFAULT`, `DEFAULT_TENANT` returns nothing in `srv/`; spoofed-header test |
| 4 | Unapproved metric rejected by planner and tool | `metric-gate.test.ts` |
| 5 | One calculation pipeline with normalization checks | `calculations.test.ts` (golden figures unchanged: pipeline equals direct calculation for all four synthetic cases) |
| 6 | Browser fallback gated and bannered | web tests A–D; `DemoModeBanner` |
| 7 | Root `npm test` runs every suite; CI runs it | `package.json`, `.github/workflows/ci.yml` (CI run recorded below) |
| 8 | Env vars defined once, startup validation, `/health` truthful | `app-config.test.ts`, `/health` test |
| 9 | CORS allow-list | `app-config.test.ts`; `server.js` |
| 10 | Docs corrected, UI redesign committed or shelved | this report, `BASELINE-AUDIT.md`, decision D-01 |

## Decisions recorded
- **D-01 (UI redesign):** committed as baseline snapshot `db4280d` before any Phase 2 work.
- **D-02 (metric enablement per tier):** in `mock` and `local` (synthetic data only) metrics awaiting Finance review (`PENDING_REVIEW`) may run, REJECTED or unknown ones never; in `pilot` and `production` only `APPROVED` + enabled metrics run. All four baseline metrics remain `PENDING_REVIEW`, so a pilot tier will refuse them until Finance signs off. The owner of this decision is the Finance reviewer; revisit at G2-01.

## Not done / carried forward
- F-07 (follow-up classification duplicated client-side), F-09 (binary floats → G2-01 decimal), F-10 (circular intent evaluation → G2-04/G2-10), F-13 (unused entities) remain open by design.
- The web proxy's dev Authorization header and the live `/health` field were exercised by tests, not by a manual browser session.
- `DataSourceReferences` is no longer exposed through AdminService because it has no tenant key; revisit in G2-02/G2-03.
- CI note: the first GitHub Actions runs failed because the persistence and security suites depended on a gitignored local `sqlite.db` (and on rows left by other suites). They now deploy a fresh temp database per suite (`apps/cap/test/helpers/test-db.ts`) and create their own data. Verified locally with every `sqlite.db` removed: 248/248.
