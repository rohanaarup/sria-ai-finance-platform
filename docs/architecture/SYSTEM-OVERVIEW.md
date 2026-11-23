# System Architecture & Technical Baseline
## Sria Info Tech AI Finance Dashboard Generator

### 1. High-Level Architecture

The system is constructed as a **modular application** consisting of a React frontend and an SAP Cloud Application Programming Model (CAP) Node.js backend:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER (Web)                        │
│                   React + TypeScript + Vite + Recharts                  │
│   • Workspace & Dashboards View          • Natural Language Input UI   │
│   • Clarification & Confirmation Dialogs • Rendered KPI & Chart Widgets│
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ HTTPS / REST / OData
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        SAP CAP BACKEND RUNTIME                         │
│                  Node.js + CDS (Modular Monolith)                      │
│                                                                        │
│  ┌───────────────────────┐                    ┌─────────────────────┐  │
│  │     Auth & Context    │                    │ Application Services│  │
│  │ (XSUAA / Identity Svcs│                    │ Workspaces, Metrics,│  │
│  │  Tenant & Role Guard) │                    │ Dashboards, Shares  │  │
│  └───────────┬───────────┘                    └──────────┬──────────┘  │
│              │                                           │             │
│              ▼                                           ▼             │
│  ┌───────────────────────┐                    ┌─────────────────────┐  │
│  │    AI Orchestrator    │                    │  Sria Info Tech DB  │  │
│  │ • Intent Interpreter  │                    │ • SQLite (local)    │  │
│  │ • Clarification Logic │                    │ • SAP HANA Cloud    │  │
│  │ • Bounded Tool Reg.   │                    │   (conditional/prod)│  │
│  └───────────┬───────────┘                    │ (DashboardSpec ONLY)│  │
│              │                                └─────────────────────┘  │
│              ▼                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Finance Data Provider Layer                   │  │
│  │  ┌─────────────────────────────┐ ┌─────────────────────────────┐ │  │
│  │  │   MockFinanceDataProvider   │ │ S4HanaODataFinanceProvider  │ │  │
│  │  │ (Synthetic Golden Fixtures) │ │ (Destination Svc / BTP CF)  │ │  │
│  │  └─────────────────────────────┘ └──────────────┬──────────────┘ │  │
│  └─────────────────────────────────────────────────┼────────────────┘  │
│                                                    │                   │
│  ┌─────────────────────────────────────────────────┼────────────────┐  │
│  │          Deterministic Calculation & Spec Compiler               │  │
│  │ • Validates currency, signs, periods            │                   │
│  │ • Computes sums, variances, profit margin       │                   │
│  │ • Generates schema-valid DashboardSpec JSON     │                   │
│  └─────────────────────────────────────────────────┼────────────────┘  │
└────────────────────────────────────────────────────┼───────────────────┘
                                                     │ HTTPS (mTLS/OAuth)
                                                     ▼
                                      ┌─────────────────────────────┐
                                      │    SAP S/4HANA (Source)     │
                                      │ Standard Finance OData API  │
                                      │ System of Record            │
                                      └─────────────────────────────┘
```

---

### 2. Component Specifications

#### A. Frontend Application (`apps/web`)
- **Technology**: React 18+, TypeScript, Vite, Recharts, Tailwind CSS / Vanilla Design Tokens.
- **Role**:
  - Authenticated workspace shell.
  - Conversational request interface with prompt submission and structured clarification responses.
  - Declarative dashboard rendering driven strictly by JSON `DashboardSpec`.
  - Zero execution of model-generated code or unvetted HTML (`dangerouslySetInnerHTML` forbidden).

#### B. SAP CAP Backend Service (`apps/cap`)
- **Technology**: `@sap/cds` Node.js runtime, TypeScript/ESM.
- **Role**:
  - Acts as the security boundary, orchestration engine, and persistence authority.
  - Exposes typed REST/OData endpoints for dashboard lifecycle, AI intent processing, and data fetching.
  - Houses the **Finance Metric Registry**, strictly governing allowable metric keys, formulas, and dimensions.

#### C. AI Intelligence Layer (`apps/cap/srv/ai`)
- **Technology**: Company-approved LLM provider SDK via typed adapter.
- **Role**:
  - Translates free-form requests into a structured `DashboardRequest` JSON matching schema definitions.
  - Formulates disambiguation questions when essential parameters (e.g., fiscal year, company code) are missing.
  - Plans execution through the `get_finance_metrics` tool without autonomous recursion.

#### D. Finance Data Provider Layer (`apps/cap/srv/providers`)
- **Contract**: `FinanceDataProvider` interface.
- **Implementations**:
  1. `MockFinanceDataProvider`: Returns deterministic synthetic fixtures for development, testing, and offline demos.
  2. `S4HanaODataFinanceDataProvider`: Communicates with verified SAP S/4HANA OData APIs via SAP BTP Destination Service.
- **Behavior**: Retrieves only requested records on-demand; returns normalized `FinanceRecord` DTOs.

#### E. Deterministic Calculation & Spec Compiler (`apps/cap/srv/finance`)
- **Role**:
  - Aggregates transient `FinanceRecord` arrays.
  - Applies approved accounting calculations (revenue, expenses, net profit, margins).
  - Emits typed, schema-validated `DashboardSpec` JSON with complete data provenance metadata (timestamp, source type, filters applied).

---

### 3. Data Flow & Storage Policy

| Data Category | System of Record | Stored in Sria Info Tech DB? | Storage Rationale |
| :--- | :--- | :--- | :--- |
| **Journal entries, invoices, general ledger balances** | SAP S/4HANA | **NO** | Transiently read on demand; raw rows never persisted in application storage. |
| **Raw OData HTTP payloads** | SAP S/4HANA | **NO** | Discarded after in-memory normalization to `FinanceRecord` DTOs. |
| **Calculated KPI results** | Derived per request | **NO (by default)** | Returned in HTTP response; recomputed on user refresh to guarantee freshness. |
| **Dashboard metadata & `DashboardSpec`** | Sria Info Tech Application | **YES** | Enables saving, reopening, and sharing custom layouts and configurations. |
| **Metric Registry & Mappings** | Sria Info Tech Application | **YES** | Version-controlled governance table defining approved formulas and dimensions. |
| **Workspace & User Permissions** | Sria Info Tech Application | **YES** | Multi-tenant isolation and user ownership control. |
| **Audit Logs & Provenance** | Sria Info Tech Application | **YES** | Audit trail recording user, timestamp, metric version, and source system (no raw finance payloads). |
| **Credentials & Secrets** | SAP BTP / Vault | **NO** | Managed exclusively in BTP destination bindings or secure runtime environment variables. |

---

### 4. Enterprise Security Controls
1. **Server-Side Authorization**: Every request verifies user identity, tenant ID, and role assignments within CAP before calling data providers.
2. **Untrusted LLM Output**: All model outputs are validated against JSON schemas before downstream consumption. Unknown metric IDs or unauthorized company codes are rejected.
3. **No Direct Model Access to SAP**: The LLM possesses zero credentials, zero network access to S/4HANA, and no capability to generate dynamic OData URLs or SQL.
4. **Credential Isolation**: BTP Destination service isolates SAP technical credentials from application developers and logs.

