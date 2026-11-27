# Sria Info Tech AI Finance Dashboard Generator
## End-to-End Technical Architecture & Operational Flow Guide

This document explains the complete, step-by-step technical flow of how the system operates from the exact moment a user types a natural language request into the prompt input to the final rendering of a verified, interactive financial dashboard.

---

## 1. System Architectural Levels

The application is structured into four distinct, isolated layers to ensure strict financial correctness, data privacy, and role-based access control.

```mermaid
flowchart TD
    subgraph L1["Level 1: Presentation Layer (React + Vite)"]
        UI_Prompt["PromptInputBar.tsx\n(Natural Language Input)"]
        UI_Progress["WorkflowProgressIndicator.tsx\n(FSM Step Tracker)"]
        UI_Clarify["ClarificationModal.tsx\n(Ambiguity Disambiguation)"]
        UI_Renderer["DashboardRenderer.tsx\n(Declarative Spec Renderer)"]
        UI_Widgets["Widgets: KPI, Bar, Line, Table, Summary"]
        UI_Client["ApiClient.ts\n(HTTP / REST Client)"]
    end

    subgraph L2["Level 2: SAP CAP Backend Runtime (Node.js + CDS)"]
        CAP_Gateway["CAP Service Endpoints\n(/api/ai, /api/orchestration, /api/v1/lifecycle)"]
        CAP_Auth["AuthGuard.ts\n(RBAC & Tenant Boundary Enforcement)"]
        CAP_Intent["IntentService.ts & LLMProvider\n(Intent Parser & Schema Normalizer)"]
        CAP_Planner["Planner.ts & ToolRegistry.ts\n(Bounded Plan & Allowlisted Tools)"]
        CAP_Orch["Orchestrator.ts\n(Step Budget & Execution Tracer)"]
    end

    subgraph L3["Level 3: Finance Data & Arithmetic Engine"]
        PROV_Factory["ProviderFactory.ts"]
        PROV_Mock["MockFinanceDataProvider.ts\n(Synthetic Golden Fixtures)"]
        PROV_Live["S4HanaODataFinanceProvider.ts\n(SAP BTP Destination / mTLS)"]
        CALC_Engine["CalculationEngine.ts\n(Deterministic TypeScript Arithmetic)"]
        SPEC_Compiler["DashboardSpecCompiler.ts\n(Schema Validation & Provenance Assembly)"]
    end

    subgraph L4["Level 4: Systems of Record & Persistence"]
        DB_App["SQLite / SAP HANA Cloud\n(DashboardSpec JSON & Metadata ONLY)"]
        SAP_S4["SAP S/4HANA On-Prem / Cloud\n(I_JournalEntryItemBasic OData Service)"]
    end

    %% Connections
    UI_Prompt --> UI_Client
    UI_Client <-->|HTTP / REST| CAP_Gateway
    CAP_Gateway --> CAP_Auth
    CAP_Auth --> CAP_Intent
    CAP_Intent -->|Valid Intent| CAP_Planner
    CAP_Intent -->|Ambiguous| UI_Clarify
    CAP_Planner --> CAP_Orch
    CAP_Orch --> PROV_Factory
    PROV_Factory --> PROV_Mock
    PROV_Factory --> PROV_Live
    PROV_Live <-->|OData v2/v4| SAP_S4
    PROV_Mock -->|Transient FinanceRecords| CALC_Engine
    PROV_Live -->|Transient FinanceRecords| CALC_Engine
    CALC_Engine -->|Deterministic MetricResults| SPEC_Compiler
    SPEC_Compiler -->|DashboardSpec JSON| CAP_Gateway
    CAP_Gateway -->|DashboardSpec JSON| UI_Client
    UI_Client --> UI_Renderer
    UI_Renderer --> UI_Widgets
    CAP_Gateway <-->|Save / Reopen Spec| DB_App
```

---

## 2. End-to-End Sequence Flow

The following sequence diagram details what happens when a user types:
> *"Show total revenue and profit for company 1000 in FY 2026"*
and clicks **Generate Dashboard**.

```mermaid
sequenceDiagram
    autonumber
    actor User as Finance Controller
    participant Browser as React Frontend (apps/web)
    participant ApiClient as ApiClient.ts
    participant CAP as SAP CAP Gateway (apps/cap)
    participant Auth as AuthGuard (Security)
    participant AI as IntentService (LLM Adapter)
    participant Orch as Planner & Orchestrator
    participant Provider as FinanceDataProvider
    participant S4 as SAP S/4HANA (or Mock Fixture)
    participant Calc as CalculationEngine (Pure TS)
    participant DB as SQLite Application DB

    User->>Browser: Enters prompt & clicks "Generate Dashboard"
    Browser->>Browser: Set UI step: "INTERPRETING"
    Browser->>ApiClient: understandPrompt(promptText)
    ApiClient->>CAP: POST /api/ai/UnderstandRequest { prompt }

    CAP->>Auth: resolveUser(req) & assertAuthenticated()
    Auth-->>CAP: Authenticated (tenant: ORG_ACME, role: FinanceAnalyst)

    CAP->>AI: processPrompt(prompt, userContext)
    AI->>AI: Pattern extraction / LLM intent extraction
    Note over AI: Extracts metrics: ['total_revenue', 'net_profit']<br/>Filters: { companyCode: '1000', fiscalYear: 2026 }

    alt Unrecognized or Disallowed Prompt (e.g. "what is quata" or SQL injection)
        AI-->>Browser: Status: REJECTED (Reason: not a recognized financial metric)
        Browser->>User: Displays clear error alert with supported catalog
    else Missing Essential Parameter (e.g. no company code)
        AI-->>Browser: Status: CLARIFICATION_REQUIRED (questions: ['companyCode'])
        Browser->>User: Opens ClarificationModal for user selection
    else Valid Intent (RESOLVED)
        AI-->>CAP: Returns typed DashboardRequest DTO
        CAP-->>ApiClient: { status: 'RESOLVED', resolvedRequest }

        Browser->>Browser: Set UI step: "PLANNING"
        ApiClient->>CAP: POST /api/orchestration/ExecutePlan { requestJson }

        CAP->>Orch: buildPlan(dashboardRequest)
        Note over Orch: Tool: get_finance_metrics<br/>Step budget: max 5 steps

        Browser->>Browser: Set UI step: "RETRIEVING_DATA"
        Orch->>Provider: fetchRecords({ companyCode: '1000', fiscalYear: 2026 })
        Provider->>S4: Query I_JournalEntryItemBasic (OData filter)
        S4-->>Provider: Raw financial journal entry rows
        Provider-->>Orch: Normalized transient FinanceRecord[] DTOs

        Browser->>Browser: Set UI step: "CALCULATING"
        Orch->>Calc: calculateMetrics(FinanceRecord[], ['total_revenue', 'net_profit'])
        Note over Calc: DETERMINISTIC ARITHMETIC:<br/>• Credit adds, Debit subtracts<br/>• Zero division safeguards<br/>• Attaches ProvenanceMetadata
        Calc-->>Orch: MetricResult[] (Revenue: $350k, Profit: $120k)

        Orch->>Orch: Assemble DashboardSpec JSON
        Note over Orch: RAW SAP RECORDS DISCARDED IN-MEMORY.<br/>NEVER persisted to DB or logs.
        Orch-->>CAP: ExecutionResponse { resultsJson, provenance }
        CAP-->>ApiClient: HTTP 200 OK with MetricResults

        Browser->>Browser: Set UI step: "COMPILING"
        Browser->>Browser: Construct intent-aware layout & executive summary
        Browser->>User: Renders KPI cards, Charts, Table, Insights & Follow-up Panel
    end

    opt User Clicks "Save to Database"
        User->>Browser: Clicks "Save Dashboard"
        Browser->>ApiClient: saveDashboard(title, spec)
        ApiClient->>CAP: POST /api/v1/lifecycle/SaveDashboard
        CAP->>DB: INSERT into sria_finance_Dashboards & DashboardSpecs
        Note over DB: Persists ONLY DashboardSpec JSON & layout.<br/>Zero raw SAP financial rows.
        DB-->>Browser: Dashboard Saved (ID: dash-...)
    end
```

---

## 3. Detailed Component-by-Component Breakdown

### Component 1: Prompt Input & State Machine
- **Source Files**: 
  - [`PromptInputBar.tsx`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/components/ai/PromptInputBar.tsx)
  - [`WorkflowProgressIndicator.tsx`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/components/ai/WorkflowProgressIndicator.tsx)
  - [`WorkspacePage.tsx`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/pages/WorkspacePage.tsx)
- **What it does**:
  1. Accepts user natural language input or template clicks.
  2. Initiates the Finite State Machine (FSM) progress tracker:
     - `INTERPRETING` → `PLANNING` → `RETRIEVING_DATA` → `CALCULATING` → `COMPILING`.
  3. Manages clarification states if the AI requires more context.

---

### Component 2: Frontend API Gateway Client
- **Source File**: [`api-client.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/services/api-client.ts)
- **What it does**:
  1. Acts as the single HTTP communication bridge between React and SAP CAP backend.
  2. Routes `understandPrompt`, `executeRequest`, `saveDashboard`, `reopenDashboard`, `renameDashboard`, and `refreshDashboard`.
  3. Includes offline fallback logic with deterministic golden figures when backend network connectivity is unavailable.

---

### Component 3: Security & Authorization Boundary
- **Source File**: [`auth-guard.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/lib/auth/auth-guard.ts)
- **What it does**:
  1. Inspects every incoming HTTP request header (SAP XSUAA JWT token or CAP mock context).
  2. Resolves `userId`, `tenant` (`organizationId`), and roles (`FinanceAnalyst`, `FinanceManager`, `TenantAdmin`).
  3. Strictly isolates multi-tenant data: Tenant Beta can never view or manipulate Tenant Alpha's saved dashboards.
  4. Blocks anonymous access with HTTP `401 Unauthorized`.

---

### Component 4: AI Intent Interpretation Engine
- **Source Files**: 
  - [`ai-service.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/ai-service.ts)
  - [`intent-service.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/ai/intent-service.ts)
  - [`mock-llm-provider.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/ai/mock-llm-provider.ts)
- **What it does**:
  1. **Prompt Sanitization**: Blocks prompt injections (e.g. `ignore previous instructions`, `drop table`, `<script>`).
  2. **Metric Allowlist Enforcement**: Checks against approved catalog (`total_revenue`, `total_expenses`, `net_profit`, `profit_margin`). Rejects unsupported metrics (e.g., EBITDA, ARR, churn) with 0% hallucination.
  3. **Entity Extraction**: Extracts `companyCode` (e.g., `1000`, `2000`) and `fiscalYear` (e.g., `2026`).
  4. **Strict Schema Emission**: Produces a typed `DashboardRequest` adhering to Zod schema contracts in [`schemas.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/packages/contracts/src/schemas.ts).

---

### Component 5: AI Planner & Orchestrator
- **Source Files**: 
  - [`planner.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/ai/planner.ts)
  - [`orchestrator.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/ai/orchestrator.ts)
  - [`tool-registry.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/ai/tool-registry.ts)
- **What it does**:
  1. Translates `DashboardRequest` into an execution plan (`DataPlan`).
  2. Constrains tool execution to allowlisted tools (only `get_finance_metrics` is approved).
  3. Enforces a hard budget ceiling (maximum 5 execution steps) to make autonomous recursive loops physically impossible.
  4. Records execution trace timestamps without logging confidential financial figures.

---

### Component 6: Finance Data Provider Layer
- **Source Files**: 
  - [`provider-factory.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/providers/provider-factory.ts)
  - [`mock-finance-data-provider.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/providers/mock-finance-data-provider.ts)
  - [`s4hana-odata-finance-provider.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/providers/s4hana-odata-finance-provider.ts)
- **What it does**:
  1. Connects to the data source:
     - **Live Mode**: Calls SAP S/4HANA OData endpoint `I_JournalEntryItemBasic` via SAP BTP Destination Service.
     - **Mock/Dev Mode**: Loads synthetic golden fixtures (`SYNTHETIC_FINANCE_RECORDS`).
  2. Normalizes records into typed `FinanceRecord` DTOs with fields:
     - `recordId`, `companyCode`, `fiscalYear`, `fiscalPeriod`, `amount`, `currency`, `debitCreditCode` (`S` or `H`), `financialAccountType` (`REVENUE` or `EXPENSE`).

---

### Component 7: Deterministic Arithmetic Engine (Zero LLM Math)
- **Source File**: [`calculation-engine.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/lib/finance/calculation-engine.ts)
- **What it does**:
  > [!IMPORTANT]
  > Financial arithmetic is **100% deterministic TypeScript code**. An LLM is **NEVER** allowed to calculate totals, subtract expenses, or divide margins.
  1. **Total Revenue**: Sums revenue records. Credits (`H`) add; Debits (`S`) subtract (customer refunds/returns).
  2. **Total Expenses**: Sums expense records. Debits (`S`) add; Credits (`H`) subtract (supplier refunds).
  3. **Net Profit**: Deterministic formula `Total Revenue - Total Expenses`.
  4. **Profit Margin**: `(Net Profit / Total Revenue) * 100`. If `Total Revenue === 0`, it emits `0.00%` and sets flag `isZeroDenominator: true` to prevent division by zero runtime crashes.
  5. Attaches **Data Provenance**:
     - `sourceSystem`: `SAP_S4HANA_LIVE` or `SAP_SYNTHETIC_OFFLINE_FIXTURE`
     - `retrievedAt`: ISO 8601 UTC timestamp
     - `calculationVersion`: `1.0.0`
     - `isSynthetic`: `boolean`
     - `appliedFilters`: `{ companyCode, fiscalYear }`

---

### Component 8: Declarative Visual Dashboard Renderer
- **Source Files**:
  - [`DashboardRenderer.tsx`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/components/dashboard/DashboardRenderer.tsx)
  - [`KpiCardWidget.tsx`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/components/dashboard/KpiCardWidget.tsx)
  - [`BarChartWidget.tsx`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/components/dashboard/BarChartWidget.tsx)
  - [`LineChartWidget.tsx`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/components/dashboard/LineChartWidget.tsx)
  - [`TableWidget.tsx`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/components/dashboard/TableWidget.tsx)
  - [`ProvenanceBanner.tsx`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/components/dashboard/ProvenanceBanner.tsx)
  - [`FollowUpPanel.tsx`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/components/dashboard/FollowUpPanel.tsx)
- **What it does**:
  1. Renders the typed `DashboardSpec` JSON.
  2. Adapts layout dynamically:
     - **1 metric requested**: Shows 1 KPI card + period trend line chart + table.
     - **2+ metrics requested**: Shows multi-KPI cards + comparative bar chart + trend line + table.
     - **Company 2000**: Displays operating loss in red with negative margin warnings.
  3. Generates analytical context:
     - Executive summary sentences derived from verified ratios.
     - Margin health thresholds (healthy vs. low margin).
     - Revenue-to-expense coverage multiplier.
  4. Follow-up panel:
     - **Presentation-only requests** (e.g. "Switch to line chart") update React widgets instantly without re-querying SAP.
     - **Data-changing requests** (e.g. "Switch to company 2000") trigger a fresh authorized retrieval.

---

### Component 9: Persistence & Lifecycle Management
- **Source Files**:
  - [`dashboard-lifecycle-service.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/dashboard-lifecycle-service.ts)
  - [`MyDashboardsPage.tsx`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/web/src/pages/MyDashboardsPage.tsx)
  - [`sqlite.db`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/sqlite.db)
- **What it does**:
  1. Allows users to save, reopen, rename, and delete dashboards.
  2. Stores **only dashboard metadata and layout specifications** (`DashboardSpec` JSON).
  3. **Strict Data Retention Rule**: Raw SAP accounting transactions and financial ledger rows are **never stored** in the application database.
  4. When a saved dashboard is reopened, it is visually badged as **STALE** until the user clicks "Refresh Data" to re-authenticate and fetch current SAP figures.

---

## 4. Key Architectural Guarantees Summary

| Guarantee | How It Is Enforced | Source File |
| :--- | :--- | :--- |
| **Zero LLM Arithmetic** | All formulas implemented in compiled TypeScript functions | [`calculation-engine.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/lib/finance/calculation-engine.ts) |
| **Zero Raw Financial Persistence** | Database models store only `specJson`; ledger rows are transient in memory | [`dashboard-lifecycle-service.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/dashboard-lifecycle-service.ts) |
| **Strict Multi-Tenant Isolation** | All queries filtered by verified token tenant (`organizationId`) | [`auth-guard.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/lib/auth/auth-guard.ts) |
| **Prompt Injection Defense** | Input sanitization, mode override blocking, SQL injection rejection | [`mock-llm-provider.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/ai/mock-llm-provider.ts) |
| **No Infinite Agent Loops** | Orchestrator step budget capped at 5; single approved tool | [`orchestrator.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/ai/orchestrator.ts) |
| **Audit Provenance Traceability** | Every result carries retrieval timestamp, engine version, and source system | [`schemas.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/packages/contracts/src/schemas.ts) |

