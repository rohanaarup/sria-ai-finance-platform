# Access & Environment Checklist
## Sria Info Tech AI Finance Dashboard Generator

This checklist clearly delineates responsibilities between developer local tasks and external actions requiring an SAP Administrator, Finance Reviewer, or Security Officer.

---

### 1. Developer Local Environment (No Cloud Access Needed)

| Requirement | Target / Tool | Responsibility | Status | Evidence / Notes |
| :--- | :--- | :--- | :---: | :--- |
| **Node.js LTS** | v20+ or v24+ | Developer | **DONE** | Node.js `v24.18.0` verified locally. |
| **Package Manager** | npm 10+ / 11+ | Developer | **DONE** | npm `11.16.0` verified locally. |
| **Version Control** | Git 2.40+ | Developer | **DONE** | Git `2.47.1.windows.2` verified. |
| **IDE** | VS Code | Developer | **DONE** | VS Code environment ready. |
| **Local Database** | SQLite (CAP native) | Developer | **PENDING** | Handled in Phase 01 / Phase 03. |
| **Local Mock Provider** | Deterministic Fixtures | Developer | **PENDING** | To be implemented in Phase 05. |

---

### 2. SAP BTP Environment (Requires SAP BTP Administrator)

> [!WARNING]
> Never commit credentials, passwords, private keys, or API tokens to source control or agent prompts.

| Requirement | Specification | Responsibility | Status | Action Required / Blocker Details |
| :--- | :--- | :--- | :---: | :--- |
| **BTP Subaccount** | Trial or Enterprise Subaccount | BTP Admin | **PENDING** | Confirm Subaccount ID, Region, and Org/Space. |
| **Cloud Foundry Runtime** | CF Org and Space provisioned | BTP Admin | **PENDING** | Assign CF Space Developer role to deployment user. |
| **Identity Service / XSUAA** | `xsuaa` service instance | BTP Admin | **PENDING** | Confirm whether subaccount uses default XSUAA or Custom IAS. |
| **BTP Destination Service** | Destination instance & binding | BTP Admin | **PENDING** | Create named destination pointing to S/4HANA OData API. |
| **SAP Connectivity / CC** | Cloud Connector (if on-prem) | BTP Admin | **PENDING** | Determine if S/4HANA target is on-premise or public cloud. |
| **SAP HANA Cloud** | HANA Cloud service entitlement | BTP Admin | **BLOCKED** | Unconfirmed entitlement; SQLite used for local dev. |

---

### 3. SAP S/4HANA Source System (Requires SAP System Owner)

| Requirement | Specification | Responsibility | Status | Action Required / Blocker Details |
| :--- | :--- | :--- | :---: | :--- |
| **S/4HANA Release/Edition** | S/4HANA Cloud or 2020+ On-Prem | SAP Owner | **PENDING** | Confirm exact version and deployment model. |
| **Finance OData API** | Standard G/L or Journal Entry API | SAP Owner | **PENDING** | Provide exact service metadata (e.g., `API_JOURNALENTRYITEMBASIC_SRV`). |
| **Communication User / Auth** | Technical User or OAuth2 SAML | SAP Admin | **PENDING** | Configure least-privilege role for read-only access. |
| **Reconciliation Sample Data** | Sample company code & period | SAP / Finance | **PENDING** | Provide sanitized baseline numbers for testing. |

---

### 4. Finance Domain Approval (Requires Finance Subject-Matter Expert)

| Requirement | Specification | Responsibility | Status | Action Required / Blocker Details |
| :--- | :--- | :--- | :---: | :--- |
| **Metric Definitions** | Revenue, Expenses, Net Profit | Finance Reviewer | **PENDING** | Formally approve calculation formulas and GL account ranges. |
| **Sign Conventions** | Credit/Debit handling in P&L | Finance Reviewer | **PENDING** | Confirm whether expenses are stored as negative or positive. |
| **Fiscal Year/Period Rules** | Standard (K4) vs Custom Calendar | Finance Reviewer | **PENDING** | Clarify fiscal month mapping (e.g., calendar vs fiscal). |
| **Multi-Currency Policy** | Transaction vs Company Code Currency | Finance Reviewer | **PENDING** | Default for MVP: single local currency, no FX conversion. |

---

### 5. Runtime AI Provider (Requires Company Security / AI Lead)

| Requirement | Specification | Responsibility | Status | Action Required / Blocker Details |
| :--- | :--- | :--- | :---: | :--- |
| **Approved LLM Provider** | OpenAI / Google Vertex / Azure OpenAI | AI / Security | **PENDING** | Select corporate approved runtime LLM API. |
| **Data Privacy Approval** | Prompt logging & data classification | Security Lead | **PENDING** | Confirm permission to send metric query strings to model. |
| **API Keys / Vault** | Backend environment variable | DevOps / Dev | **PENDING** | Secure key injection; mock LLM adapter used initially. |

---

### 5. G2-03 additions (S/4HANA connectivity) — see `docs/sap/SAP-REQUEST-LIST.md` and `docs/sap/S4-CONNECTIVITY-RUNBOOK.md`

| Requirement | Responsibility | Status | Notes |
| :--- | :--- | :---: | :--- |
| Adapter, simulator, discovery and reconciliation tools built and tested against the simulator | Developer | **DONE (unverified against SAP)** | `apps/cap/srv/lib/providers/s4hana/`, `apps/cap/scripts/` |
| BTP trial/enterprise subaccount with Cloud Foundry | You / BTP admin | **PENDING** | runbook step 1 |
| Source system decision (D-06) and API decision (D-07) | You / SAP owner | **PENDING** | runbook step 2 |
| Destination created and bound | You / BTP admin | **PENDING** | runbook step 3 |
| `$metadata` obtained; `FIELD-EVIDENCE.md` shows every field present | You + developer | **PENDING** | runbook step 4 |
| Live smoke test passes; replay fixtures re-recorded and sanitised | You + developer | **PENDING** | runbook step 5 |
| Reference SAP reports; sign-convention memo; reconciliation log signed | Finance | **PENDING** | runbook step 6 |
| Security owner approval of role design and network path | Security owner | **PENDING** | request list |
