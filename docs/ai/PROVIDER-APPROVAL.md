# Live AI provider approval record

**Status: NOT APPROVED.** No live provider may run until every field below is filled in by the named owners. The application enforces this: a live provider refuses to start unless `AI_PROVIDER_APPROVED=true`, and that flag must only be set after this record is complete.

| Item | Value |
|---|---|
| Provider and model | [to be decided: decision D-08] |
| Approved by (role) | [Security / Data Protection owner] |
| Approval date | [date] |
| Data processing terms signed | [yes / no] |
| Data residency | [region: decision D-09] |
| Provider retains or trains on prompts | [no / yes, with details] |
| Data sent | Redacted request text only. No ledger rows, no credentials. |
| Budget limits | [tokens per run / per tenant per day] |
| Price per million tokens (for estimates) | [input / output] |
| Key storage | Secret store of the runtime platform; never in git |

Evidence to attach: terms of service excerpt, data-processing agreement reference, redaction golden-test result, injection-suite result for the chosen model.
