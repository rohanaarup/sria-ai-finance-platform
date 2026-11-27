# Recorded SAP responses (replay fixtures)

`recorded-responses.json` is used by `apps/cap/test/s4hana-adapter.contract.test.ts` to replay service
responses through the adapter without any network.

**Current status: SIMULATED.** The file was recorded from the local OData simulator
(`apps/cap/test/helpers/odata-simulator.ts`) with synthetic data. It is not SAP output.

When a real system is connected (runbook steps 3–5):
1. Re-run `node apps/cap/scripts/record-sap-fixtures.ts` against the real Destination.
2. **Sanitise before committing:** remove or change company names, business-partner or personal data, document numbers you do not want public, and any URL, host name or identifier of your landscape. This repository is public.
3. Replace the committed file and update the `_note`.
