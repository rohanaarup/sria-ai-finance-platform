# S/4HANA connectivity runbook (G2-03)

Status: **the code is built and tested against a simulator; nothing here has been verified against a real SAP system yet.** This runbook is the guided path for doing that, step by step. Each step has the same shape: **you do** → **I build or check** → **how we confirm**.

> **Rules for the whole runbook**
> - Never paste a password, token, key, client secret or Destination JSON into chat, into a file in this repository, or into a prompt. Type credentials only into SAP's own screens.
> - This repository is public. Anything you commit must be free of company names, host names, user IDs and real figures. Blank things out first.
> - SAP's screens and menu names change between releases. Where this document says "the Destinations screen", look for the closest match and tell me what you actually see; do not guess.
> - Everything we do is **read-only**. Nothing is ever written to SAP.

## What exists in the repository now
| Piece | Where |
|---|---|
| The adapter | `apps/cap/srv/lib/providers/s4hana/` (`adapter.ts`, `mapper.ts`, `metadata.ts`, `odata-client.ts`, `errors.ts`) |
| Discovery tool (checks the system's `$metadata` against the fields we read) | `apps/cap/scripts/s4-discover.ts` |
| Reconciliation tool (compares our totals with a SAP report export) | `apps/cap/scripts/reconcile.ts` |
| Simulator and replay fixtures | `apps/cap/test/helpers/odata-simulator.ts`, `tests/fixtures/sap/` |
| Settings (all candidates) | `.env.example` (`S4_*`) |
| What to ask other people for | `docs/sap/SAP-REQUEST-LIST.md` |
| Where results are signed | `docs/sap/RECONCILIATION-LOG.md`, `docs/sap/SIGN-CONVENTION-MEMO.md` |

## Step 1 — a BTP account
**You do:** create a free SAP BTP trial account (search "SAP BTP trial"). Open its cockpit, find the subaccount, and enable Cloud Foundry in it if it is not already. Note the names of the subaccount, the org and the space.
**You learn:** global account vs subaccount, Cloud Foundry org/space, entitlements.
**Confirm:** tell me the subaccount region and the space name (not passwords or IDs of people).
**I do:** record them in `docs/implementation/ACCESS-CHECKLIST.md`.

## Step 2 — decide where the data comes from
This is the decision **D-06 (which system)** and **D-07 (which API)**. Pick the first that applies:

| Situation | What to do |
|---|---|
| Your company (or a customer) has an S/4HANA system and lets you read from it | Use it. Ask the SAP administrator the questions in `SAP-REQUEST-LIST.md`. Cloud edition → direct internet connection. On-premise → a Cloud Connector is also needed (the SAP team sets it up). |
| You only want to learn the mechanics first | Look for a published API sandbox in SAP's API catalogue (the "SAP Business Accelerator Hub"). Availability and the exact API names vary; check what is offered today. A sandbox returns SAP sample data, so it can teach the Destination and OData parts but it cannot satisfy the Finance reconciliation. |
| Nothing available yet | Skip to the end of this runbook ("While you wait"). The platform keeps working on synthetic data. |

**Confirm:** tell me which row you are in and whether the system is cloud or on-premise.

## Step 3 — create a Destination
A **Destination** is a named connection stored in BTP. The app asks for "the finance destination" by name and never sees the password.
**You do (in the BTP cockpit, Connectivity → Destinations, or the nearest equivalent):**
1. New destination. Type HTTP. Give it a name such as `S4HANA_FINANCE` (this name goes into `FINANCE_S4HANA_DESTINATION_NAME`, never a secret).
2. URL: the **host only** of the SAP system (the SAP administrator gives you this). Do not put the service path in the URL; the adapter adds `/sap/opu/odata/sap/<service>`.
3. Proxy type: *Internet* for a cloud system; *OnPremise* if it goes through a Cloud Connector.
4. Authentication: whatever the SAP administrator provides for the read-only communication user. Typical options are basic authentication, OAuth2 client credentials, or OAuth2 SAML bearer assertion. Enter the credentials **only in this screen**.
5. Save, then use the cockpit's "Check connection" if offered.

**Local practice without BTP (works today, verified by a test):** the SAP Cloud SDK can read destinations from an environment variable named `destinations`. Start the simulator with `node apps/cap/scripts/run-simulator.ts --port 4010`, then in a local `.env` file (git ignores it; never commit it) set `destinations=[{"name":"SIM_LOCAL","url":"http://127.0.0.1:4010"}]`. The simulator serves **synthetic** data shaped like the candidate API, so this teaches the mechanics (Destination by name, `$metadata`, OData queries) but proves nothing about SAP. For a real system, check the current SAP Cloud SDK documentation for the extra fields (authentication) and keep any credentials out of files in the repository.

**I do:** nothing to build here; the adapter already resolves the Destination by name. When you have created it, we run `node apps/cap/scripts/s4-discover.ts --destination <NAME>` together (needs the app environment to see the Destination; if that is awkward, use step 4's file route).
**Confirm:** the connection check or the discovery run returns the service description without an authentication error. If you get 401/403, the cause is almost always the communication user or its role, not our code (see "Troubleshooting").

## Step 4 — read the evidence (`$metadata`)
**You do:** in a browser (or with the SAP administrator), open `<host>/sap/opu/odata/sap/API_JOURNALENTRYITEMBASIC_SRV/$metadata` while logged in, and save the page as `metadata.xml`. (This service name is our **candidate**. If your system uses a different released API for journal entry line items, the administrator tells you which; that is decision D-07.)
**You learn:** what OData is, entity sets, properties and key fields.
**I do / we do together:** run `node apps/cap/scripts/s4-discover.ts --file metadata.xml --out docs/sap/FIELD-EVIDENCE.md`. It lists every field the adapter reads and whether the real system has it.
**Confirm:** every field says "yes". If something says **NO**, we do not push on: either we pick another released API/view with the administrator, or we adjust the field list and the mapping with Finance. We never invent a field.
Before committing `FIELD-EVIDENCE.md`, check it contains no landscape-identifying names.

## Step 5 — run the adapter for real
**You do:** set (in your local `.env`, not committed) `FINANCE_DATA_PROVIDER=s4hana`, `FINANCE_S4HANA_DESTINATION_NAME=<your destination>` and `APP_ENV_TIER=local` (or `pilot` on BTP). If the discovery step showed differences from our candidates, set the matching `S4_*` values (service path, entity set, ledger).
**I do:** review the adapter's first live call with you and fix mismatches the evidence shows. We then run the opt-in live smoke test:

```
S4_LIVE_SMOKE=1 S4_LIVE_DESTINATION=<name> S4_LIVE_COMPANY_CODE=<code> S4_LIVE_FISCAL_YEAR=<year> npm run test:root
```
(on Windows PowerShell set the variables with `$env:NAME='value'` first). The test only reads a few rows and checks they validate.
**Then:** re-record the replay fixtures from the real system with `node apps/cap/scripts/record-sap-fixtures.ts`, **sanitise the file** (see `tests/fixtures/sap/README.md`), and commit it.
**Confirm:** the smoke test passes; the dashboard shows "Live S/4HANA" provenance for a company code you are allowed to read.

## Step 6 — reconcile with Finance
**You / Finance do:**
1. Choose a standard SAP report that shows revenue and expenses by company code and period. Run it for **two company codes × two periods**.
2. Copy the numbers into a CSV with the columns in `docs/sap/reconciliation-report-template.csv`.
3. Fill in `docs/sap/SIGN-CONVENTION-MEMO.md` (what debit/credit and the signs mean in your system, which ledger, which accounts count as revenue and expense).

**I do:** run `node apps/cap/scripts/reconcile.ts report.csv --tenant <TENANT> --out result.md` and paste the result into `docs/sap/RECONCILIATION-LOG.md`. Every discrepancy is explained. Typical causes, and what to change:

| Symptom | Likely cause | What changes |
|---|---|---|
| Revenue and expenses swapped or negative | Amount convention or debit/credit meaning differs | `S4_AMOUNT_CONVENTION` |
| Totals about double | More than one ledger read | `S4_LEDGER` |
| Small differences | Postings on accounts outside our revenue/expense ranges | `S4_REVENUE_ACCOUNTS`, `S4_EXPENSE_ACCOUNTS` (the data product also flags "unmapped accounts") |
| Different currency | Company code currency vs transaction/group currency | decision with Finance; we never convert |

**Confirm:** all rows match exactly (to cents), Finance signs the log and the memo. Only then do we set the source mappings to "mapped" with evidence links and ask Finance to approve the metrics for the pilot tier (G2-01 workflow).

## Troubleshooting by error type
The adapter reports typed errors; the dashboard and logs show the type in brackets.

| Type | Meaning | First thing to check |
|---|---|---|
| `[AUTH]` | SAP refused the login or the role | the communication user, its authorizations, the Destination's authentication type |
| `[NOT_FOUND]` | Destination, service or entity set not found | destination name and binding; is the service activated; `S4_SERVICE_ROOT`, `S4_ENTITY_SET` |
| `[BAD_QUERY]` | SAP rejected a filter or field | run the discovery step; a field may not exist in this system |
| `[THROTTLED]` | SAP is rate-limiting | wait; ask the SAP team about limits |
| `[TIMEOUT]` | no answer in time | network path, Cloud Connector, or too large a query |
| `[UNAVAILABLE]` | system or route temporarily down | system status, Cloud Connector |
| `[MALFORMED]` | the answer does not match the expected shape or the amount convention | `$metadata`, `S4_AMOUNT_CONVENTION`; messages name fields, never values |

When SAP is down the dashboard shows the typed error. It never falls back to demo data.

## While you wait for access
If SAP's trial shows "temporarily offline", that is SAP maintenance: wait and retry; do not create extra accounts. Meanwhile:
- Run the simulator (`node apps/cap/scripts/run-simulator.ts`) and open its `$metadata` and data URLs in a browser to see what OData looks like.
- Run the discovery tool on that metadata and read every line of its output.
The platform runs on synthetic data and everything else in the roadmap (G2-04 onward) does not depend on SAP. You can still learn the SAP side without a system: read the field table in `SAP-FIELD-MAPPING.md`, run `node apps/cap/scripts/s4-discover.ts --file <path>` against the simulator's metadata (see `apps/cap/test/helpers/odata-simulator.ts`), and study the OData query the adapter builds in `adapter.ts` (`baseQuery`).
