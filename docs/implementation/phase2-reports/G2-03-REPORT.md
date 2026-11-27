# G2-03 — Live S/4HANA Connectivity & Reconciliation: status report

Date: 2026-11-27 · Branch: `master` · Repository: https://github.com/rohanaarup/sria-ai-finance-platform

## Status: BUILT on the developer side — NOT VERIFIED against SAP — phase OPEN
Everything a coding agent can do for this phase is done and tested **against a local simulator**. The phase cannot be accepted until real inputs exist (a SAP system, a BTP Destination, Finance reconciliation). Nothing in this report claims SAP connectivity.

## What was built
| Area | Delivered |
|---|---|
| Adapter | `apps/cap/srv/lib/providers/s4hana/adapter.ts`: read-only OData GET; `$filter`/`$select`/`$top`/`$orderby`; server-driven (`__next`) and offset paging; ledger filter; page size bound; abort support |
| Evidence rule | `metadata.ts`: parses the service `$metadata`; before any data call every field the adapter selects must exist in it, otherwise `BAD_QUERY` and no data request is made |
| Typed errors and retry | `errors.ts`: AUTH, NOT_FOUND, BAD_QUERY, THROTTLED, TIMEOUT, UNAVAILABLE, SOURCE_ERROR, MALFORMED. Only transient errors are retried (exponential backoff with jitter, honouring Retry-After) behind a circuit breaker |
| Transport | `odata-client.ts`: `DestinationTransport` (SAP Cloud SDK + BTP Destination; credentials never visible to our code), plain-HTTP transport for the simulator, replay transport |
| Mapping | `mapper.ts`: Zod validation of raw rows; SAP codes (`S`/`H`), 3-digit periods, padded accounts, `/Date()/`; amount convention, ledger and revenue/expense account ranges are configuration (`S4_*`). Errors name fields, never values; a bad row fails the page instead of dropping money |
| Data product | S/4 outage is a typed `SOURCE_UNAVAILABLE` error with the cause in brackets, never mock data; new `UNMAPPED_ACCOUNT` flag when postings fall outside the revenue/expense ranges |
| Audit and secrecy | every SAP call audited (identity, tenant, entity, query hash, row count, duration, outcome — no values, in its own transaction); secret-scan test over source, fixtures and SAP docs; log-inspection test; failing audit sink cannot break the data path |
| Tooling | `scripts/s4-discover.ts` (field evidence from real `$metadata`), `scripts/reconcile.ts` (compare our totals with a SAP report CSV, exact to the metric's decimals), `scripts/record-sap-fixtures.ts` |
| Test support | `test/helpers/odata-simulator.ts` (OData v2 look-alike with paging, auth and failure injection), `tests/fixtures/sap/` (recorded responses, labelled SIMULATED), reusable conformance suite (`tests/dataproduct/conformance-suite.ts`) |
| Dependencies | `@sap-cloud-sdk/http-client` and `connectivity` 4.10.0 (Apache-2.0); `npm audit` reports 0 vulnerabilities |
| Docs | `docs/sap/S4-CONNECTIVITY-RUNBOOK.md`, `SAP-REQUEST-LIST.md`, `RECONCILIATION-LOG.md` (empty, unsigned), `SIGN-CONVENTION-MEMO.md` (template), `FIELD-EVIDENCE.md` (placeholder), `reconciliation-report-template.csv`; updated `SAP-FIELD-MAPPING.md` and `ACCESS-CHECKLIST.md`; ADR-019 (status **Proposed**) |

## Measured test results (`npm test`, Node v24.18.0, 2026-11-27, with every `sqlite.db` removed; backend and root suites also run on Node 22.23)
| Suite | Tests | Pass | Fail |
|---|---|---|---|
| `@sria/contracts` | 8 | 8 | 0 |
| `@sria/cap` | 258 | 258 | 0 |
| `@sria/web` | 37 | 37 | 0 |
| root `tests/` | 85 | 85 | 0 |
| **Total** | **388** | **388** | **0** |

G2-02 ended at 344. New: S/4 adapter contract suite (conformance, paging boundaries, query construction, error taxonomy, retry/backoff, circuit breaker, timeout/abort, evidence rule, mapper, ledger, audit, secrecy, health, replay, discovery tool, config), reconciliation tests. One opt-in live smoke test is skipped unless `S4_LIVE_SMOKE=1`.

## Acceptance criteria
| # | Criterion | Status |
|---|---|---|
| 1 | All P0 external prerequisites answered in writing with named owners | **PENDING — needs people.** Request list ready |
| 2 | Service metadata retrieved through the Destination stored as evidence; every field traceable | **PENDING — needs a real system.** Tool and runtime rule built and tested on simulator metadata |
| 3 | Adapter passes the conformance suite on replayed sanitised real responses; live smoke passes in the pilot subaccount | **PARTIAL.** Passes on simulator and on simulated recordings; real replay and live smoke pending |
| 4 | Retrieval bounded; throttling and timeouts typed with policy-driven retries; nothing silently truncated | **Met in code and simulator tests** |
| 5 | Finance-signed reconciliation, 2 company codes × 2 periods | **PENDING — needs Finance.** Script and log ready; its ability to expose sign and ledger errors is tested |
| 6 | Sign conventions confirmed in writing; SourceMappings MAPPED with evidence | **PENDING — needs Finance.** Memo template ready; mappings stay UNCONFIRMED |
| 7 | No credential, token or Destination detail in code, logs, traces, prompts or fixtures | **Met for the code and fixtures in the repo** (secret-scan and log tests). Cannot be shown for a real Destination until one exists |
| 8 | Every SAP call audited without financial values | **Met in code and tests** |
| 9 | Health check reports true reachability; outage is a clear error, not mock data | **Met in code and simulator tests** |

## Decisions
- **ADR-019** is **Proposed**, not accepted, until verified.
- **D-05 / D-06 / D-07** (authentication model, source system, API choice) are still open; they need the SAP and security owners.
- **Ledger:** added a ledger filter (default `0L`, configurable). Without it, a system holding several ledgers would double count. Still a candidate until Finance confirms.
- **Amount convention:** `INDICATOR` assumed (absolute amount plus debit/credit code); the alternative is implemented, and a sign that contradicts the indicator is rejected. Reconciliation decides.
- **Revenue vs expense** by configurable GL account ranges instead of `GLAccountType`, because the customer's chart of accounts decides; unmapped accounts are flagged.

## What I could not and did not do
- No connection to any real SAP or BTP system; no BTP account, Destination or communication user (all need people).
- No confirmation that `API_JOURNALENTRYITEMBASIC_SRV` or any field exists in your system — all names are candidates.
- No reconciliation, no Finance sign-off, no security approval.
- The Destination path (`DestinationTransport`) is exercised only for its "destination missing" error handling, because no BTP binding exists.
- The recorded replay fixtures are **simulated**, not real recordings.

## Next (needs you): follow `docs/sap/S4-CONNECTIVITY-RUNBOOK.md`
Step 1 (BTP account) is the first thing to do; I will guide each step and check it with you.
