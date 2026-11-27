# Sign convention and account-mapping memo (G2-03) — TEMPLATE

**Status: UNCONFIRMED.** Finance fills this in. Until it is signed, the semantic-layer source mappings for S/4HANA stay `UNCONFIRMED` and the pilot-tier metrics stay disabled.

Everything the platform assumes is listed with the setting that implements it, so a different answer is a configuration change, not a code change.

| # | Question | Platform assumption today (candidate) | Setting | Finance's answer |
|---|---|---|---|---|
| 1 | Which ledger holds the figures we report? | Leading ledger `0L` | `S4_LEDGER` | |
| 2 | In the journal-entry API, are amounts stored absolute with a debit/credit indicator, or signed? | Absolute amounts, indicator gives direction | `S4_AMOUNT_CONVENTION` (`INDICATOR` or `SIGNED_DEBIT_POSITIVE`) | |
| 3 | What are the debit/credit indicator values? | `S` = debit, `H` = credit (`D`/`C` also accepted) | mapper | |
| 4 | Is revenue a credit balance (credit adds, debit reduces)? | Yes | semantic layer: `total_revenue` = CREDIT_POSITIVE | |
| 5 | Are expenses a debit balance (debit adds, credit reduces)? | Yes | `total_expenses` = DEBIT_POSITIVE | |
| 6 | Which GL accounts are revenue? | 400000–499999 | `S4_REVENUE_ACCOUNTS` | |
| 7 | Which GL accounts are expenses? | 500000–699999 | `S4_EXPENSE_ACCOUNTS` | |
| 8 | Which accounts must be excluded (balance sheet, statistical, intercompany…)? | everything outside the ranges above (flagged as "unmapped accounts") | ranges | |
| 9 | Which currency do the reference reports use? | company-code currency | `CompanyCodeCurrency` | |
| 10 | Fiscal-year variant and special periods | periods 1–12 plus special periods 13–16 (synthetic calendar K4) | semantic layer | |

Notes for Finance: the platform never converts currencies; results are reported per currency. Duplicate posting keys are flagged and counted, not removed.

| Role | Name | Date | Signature / reference |
|---|---|---|---|
| Finance reviewer | | | |
