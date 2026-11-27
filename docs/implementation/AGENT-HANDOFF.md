# Agent handoff — guiding the owner through G2-03 (S/4HANA connectivity)

Written 2026-11-27 for the next AI agent (Antigravity). Read this file first, then `docs/sap/S4-CONNECTIVITY-RUNBOOK.md`.

## 1. Who you are helping and what they want
The owner is a solo developer building the **Sria Info Tech AI Finance Platform** (SAP + agentic AI, "AGENT SRIA"). They have **no SAP or BTP knowledge** and want to **learn by doing** while integrating. Your job in this phase is **teacher and co-pilot**, not autopilot: the owner performs the SAP/BTP steps, you explain each concept in plain words, check their results, and run or fix the code with them.

Repository (public): https://github.com/rohanaarup/sria-ai-finance-platform (branch `master`). CI: GitHub Actions on Node 22 and 24, currently green.

## 2. What has been done
| Phase | State |
|---|---|
| G2-00 Baseline hardening | Done and verified: fail-closed auth on every service, validated config, CORS allow-list, env tiers (mock/local/pilot/production), tests in CI |
| G2-01 Semantic layer | Done and verified: versioned metrics, formula DAG, glossary, decimal arithmetic, approval workflow, catalog UI |
| G2-02 Data product | Done and verified: FinancialPerformance data product, adapter contract v2, fixtures v2, entity-level access, provenance v2 |
| G2-03 S/4HANA connectivity | **Code built and tested against a simulator. NOT verified against any real SAP system. Phase OPEN.** |
| G2-04 … G2-11 | Not started (AI gateway, agent runtime, tools, memory, policy/approvals, workspace, quality gate, pilot). They do **not** depend on SAP |

Last measured: **388 tests, all passing** (contracts 8, backend 258, web 37, root tests 85); typecheck and build clean. Reports: `docs/implementation/phase2-reports/G2-00…G2-03-REPORT.md`. The full roadmap is `docs/architecture/SRIA-PHASE-2-ARCHITECTURE-AND-IMPLEMENTATION-ROADMAP.html`.

### What exists for G2-03 (all in the repo)
- Adapter: `apps/cap/srv/lib/providers/s4hana/` — read-only OData GET, `$metadata` evidence rule (refuses to query if a field is not in the system's metadata), typed errors, retry with backoff and jitter, circuit breaker, audit without values, Destination access via SAP Cloud SDK.
- Tools: `apps/cap/scripts/s4-discover.ts` (checks a downloaded `$metadata` against the fields we read), `reconcile.ts` (compares our totals with a SAP report CSV), `record-sap-fixtures.ts`.
- Simulator and fixtures: `apps/cap/test/helpers/odata-simulator.ts`, `tests/fixtures/sap/` (recordings are SIMULATED).
- Settings (all CANDIDATES): `.env.example` → `S4_SERVICE_ROOT`, `S4_ENTITY_SET`, `S4_LEDGER`, `S4_AMOUNT_CONVENTION`, `S4_REVENUE_ACCOUNTS`, `S4_EXPENSE_ACCOUNTS`, plus `FINANCE_DATA_PROVIDER`, `FINANCE_S4HANA_DESTINATION_NAME`, `APP_ENV_TIER`.
- Docs: `docs/sap/` — runbook, request list, reconciliation log (empty/unsigned), sign-convention memo (template), field-evidence placeholder, CSV template.

## 3. What must still be done (needs the owner or other people)
Nothing below can be completed by an AI agent alone.
1. A BTP account (a free trial is fine), subaccount with Cloud Foundry, space. *(runbook step 1)*
2. A data source decision: a real S/4HANA system, or an SAP API sandbox for learning; cloud vs on-premise. *(step 2; decisions D-06, D-07)*
3. A BTP **Destination** to that system, created in the BTP cockpit. *(step 3)*
4. The service's `$metadata` saved as a file and checked with `s4-discover.ts`; `docs/sap/FIELD-EVIDENCE.md` generated; every field must say "yes". *(step 4)*
5. Run the adapter for real (`FINANCE_DATA_PROVIDER=s4hana`), the opt-in live smoke test, and re-record the replay fixtures from the real system **after sanitising**. *(step 5)*
6. Finance reconciliation: a SAP report export for 2 company codes × 2 periods, `reconcile.ts` run, `RECONCILIATION-LOG.md` and `SIGN-CONVENTION-MEMO.md` signed by Finance. Then source mappings become MAPPED with evidence and ADR-019 changes from Proposed to Accepted. *(step 6)*
7. Security owner approval of the read-only role and network path; decisions D-05 (authentication model), D-17 (who maintains entity permissions), D-04 (metric owner/approver).

If the owner has **no SAP system**, steps 3–6 wait. They can still do steps 1 and the learning exercises in the runbook's "While you wait" section, then move on to G2-04.

## 4. How to guide the owner (rules)
- **One step at a time.** State: what we are doing, why, what the owner does, what to send back, how we confirm. Do not move on until the check passes.
- **Teach the concepts in plain words first** (BTP, subaccount, Destination, Cloud Connector, OData, `$metadata`, communication user, ledger, debit/credit, reconciliation). Use the glossary in `docs/sap/SAP-REQUEST-LIST.md` and the roadmap section 25 learning map as a base.
- **Never ask for or accept secrets** (passwords, tokens, keys, client secrets, Destination JSON). The owner types credentials only into SAP/BTP screens. If something sensitive is pasted, tell them to rotate it.
- **The repository is public.** Before anything is committed: no company names, hosts, user IDs, document numbers or real figures. Sanitise fixtures and evidence files.
- **Do not invent SAP facts.** SAP screens and names change. Ask the owner what they actually see. Every SAP name in the code is a candidate until the real `$metadata` confirms it.
- **Read-only always.** Nothing is ever written to SAP.
- **An SAP outage must never fall back to mock data** (the adapter already guarantees this; keep it so).
- **Evidence over assumption:** if `s4-discover.ts` shows a missing field, stop and decide with the SAP admin (D-07) instead of working around it.
- If a reconciliation row does not match, use the table in the runbook (step 6) to find the setting to change (amount convention, ledger, account ranges, currency) and ask Finance, instead of editing numbers.

## 5. Useful commands (run from the repo root)
```
npm test                                   # all suites (388 expected today)
npm run typecheck && npm run build
node apps/cap/scripts/s4-discover.ts --file metadata.xml --out docs/sap/FIELD-EVIDENCE.md
node apps/cap/scripts/reconcile.ts report.csv --tenant TENANT_A --out result.md
node apps/cap/scripts/record-sap-fixtures.ts      # records adapter traffic (sanitise before commit)
S4_LIVE_SMOKE=1 S4_LIVE_DESTINATION=<name> S4_LIVE_COMPANY_CODE=<code> S4_LIVE_FISCAL_YEAR=<year> npm run test:root
```
Local dev users (password `dev`, local only): `analyst`, `manager`, `admin`, `analyst_b` (other tenant), `approver`, `approver2`.

## 6. Technical gotchas learned (save time)
- Backend TypeScript runs through Node's **strip-only** mode: no constructor parameter properties, enums or `namespace`. Import paths include `.ts`.
- Node **≥ 22.18** is required (Node 20 cannot run the `.ts` tests). Always test on 22 and 24.
- Do not use `AbortSignal.timeout` for operation timeouts (unreferenced timer; Node 22 can exit before it fires). Use an `AbortController` with a `setTimeout` that is cleared in `finally`.
- Writes inside a request that later fails are rolled back; audit records for denied or failed requests must use their own transaction (`cds.db.tx({...})`).
- Tests must not depend on a local `sqlite.db`; they deploy their own database (`apps/cap/test/helpers/test-db.ts`).
- When a tool call with a long shell heredoc fails on quotes, write files with the editor tool instead.

## 7. Working agreement with the owner (carry these over)
- Finish a phase fully, run every test, commit, push, write a report with **measured** numbers, then **stop and wait** for the owner before starting the next phase.
- Never commit secrets, API keys, `.env` files or databases. Never fabricate test results, SAP access or approvals. Where an external input is missing, build against the contract, keep it behind a flag and record it as pending.
- Commit messages end with the co-author line the tool environment requires.

## 8. After G2-03 is verified (or while waiting)
Next is **G2-04 — LLM gateway, goal understanding and evaluation harness v1** (see the roadmap phase detail). Its main open decision is **D-08 (which model provider)**; the real provider needs the owner's API key and budget, which they supply through environment/BTP bindings, never in chat or in git.
