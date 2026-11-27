# What we need from SAP, BTP, Finance and Security teams (G2-03)

Plain-language request list. Copy the section for each person. Nobody needs to send passwords or keys to the developer: credentials are entered only in SAP and BTP screens.

**Purpose (one sentence):** a read-only connection from our finance dashboard application to the S/4HANA journal-entry data, so that dashboard figures come from real postings and can be reconciled with standard SAP reports.

**Scope:** read-only. Nothing is ever written to SAP. Only the fields listed under "SAP administrator" are read.

## For the SAP administrator / system owner
1. **System facts:** Is the system S/4HANA Cloud (public or private edition) or S/4HANA on-premise? Which release?
2. **A test system or client** we may read from (not production, or production only after Security approves). Which one?
3. **The API to use.** We would like the released API for journal entry line items. Our candidate is `API_JOURNALENTRYITEMBASIC_SRV`, entity set `A_JournalEntryItemBasic`. Please confirm it exists in this system, or name the released API/CDS view you recommend instead.
4. **A read-only technical/communication user** (in S/4HANA Cloud: a communication arrangement for a scenario that includes this read API; on-premise: service activation plus a technical user and a role). The role must allow **read only** and **only this API**, and should be limited to the company codes needed for the pilot.
5. **How we should authenticate** from SAP BTP: basic authentication, OAuth2 client credentials, OAuth2 SAML bearer assertion, or principal propagation? (Decision D-05.)
6. **The service description:** please let us fetch (or send us the file for) the service's `$metadata`. It contains field names only, no data.
7. **Ledger and amount facts:** which ledger is the leading ledger (we assume `0L`)? Are amounts in this API stored as absolute values with a debit/credit indicator, or signed?
8. **On-premise only:** is a Cloud Connector installed and which virtual host and port will it expose?
9. **Limits:** any rate limits, maximum rows per request, or time windows we must respect?

## For the BTP administrator
1. A BTP subaccount with the **Cloud Foundry** runtime, an org and a space, and permission for our deployment user.
2. A **Destination service** instance bound to the application, and a **Destination** pointing at the SAP system (name of your choice; we will put the name in configuration). Credentials are entered only in the Destination.
3. **XSUAA** (and, if used, IAS) for user login; role collections for our three roles plus the metric approver.
4. **Connectivity service and Cloud Connector** only if the SAP system is on-premise.
5. Logging and audit-log services if the company requires them.
6. Confirmation whether **SAP HANA Cloud** is entitled (we currently use SQLite locally).

## For the Finance reviewer
1. **A standard SAP report** that shows revenue and expenses per company code and fiscal period; please run it for **two company codes × two periods** and export the totals (template: `docs/sap/reconciliation-report-template.csv`).
2. **Written answers** (template: `docs/sap/SIGN-CONVENTION-MEMO.md`): which GL accounts count as revenue and which as expenses; what debit and credit mean for each; which ledger; which currency (company-code currency, transaction currency or group currency) the report uses; what the fiscal-year variant and special periods are.
3. **Review of the discrepancy log** (`docs/sap/RECONCILIATION-LOG.md`) and signature when every row matches.
4. Names of the **metric owner and approver** for the four metrics (decision D-04) and sign-off of the pilot-tier enablement (D-02).

## For the security owner
1. Approve the **role design**: a read-only user, one API, only the pilot company codes.
2. Approve the **network path**: BTP Destination → (Cloud Connector) → SAP.
3. Confirm where **entity-level permissions** (who may see which company code) are maintained (decision D-17).
4. Review that **no secrets** are stored in code, logs, prompts or test fixtures (we run a secret scan and a log-inspection test; results are in the G2-03 report).
