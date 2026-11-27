# Reconciliation log (G2-03)

**Status: OPEN — no reconciliation has been performed.** No real SAP data has been compared yet. This file is the record that Finance signs. It intentionally contains no results until a real run exists.

## How a run is recorded
1. Finance exports totals from a standard SAP report (two company codes × two fiscal periods at least) into a CSV (`docs/sap/reconciliation-report-template.csv`).
2. Run: `node apps/cap/scripts/reconcile.ts report.csv --tenant <TENANT> --out result.md`
3. Paste the generated section below (newest first). Do **not** commit the CSV or figures if they are confidential; paste only what the company agrees may be public, or keep this log in a private location and record the sign-off here with a reference.
4. Every row that is not MATCH needs an entry in the discrepancy register with a cause and a resolution.

## Discrepancy register
| # | Run date | Company / period / metric | Difference | Cause | Resolution | Closed by / date |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

## Runs
_(none yet)_

## Sign-off
| Role | Name | Date | Statement |
|---|---|---|---|
| Finance reviewer | | | All rows of the run dated ____ match the SAP reports to currency precision and the discrepancy register is closed. |
| SAP system owner | | | The reports used were produced from the system and client named in the request list. |

The metrics stay disabled in the pilot tier until this log is signed.
