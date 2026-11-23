# MVP Scope & Product Boundary
## Sria Info Tech AI Finance Dashboard Generator

### 1. Product Vision & Mission
The **Sria Info Tech AI Finance Dashboard Generator** enables finance professionals (Financial Analysts, Finance Managers, and Controllers) to describe analytical dashboard needs in plain, natural English and immediately receive an interactive, validated, and auditable financial dashboard.

The system bridges conversational AI with enterprise-grade SAP data governance:
- **Natural Language Understanding**: Structured extraction of financial metrics, dimensions, filters, and time horizons with proactive ambiguity clarification.
- **Deterministic Data Access**: Controlled, bounded tool execution fetching authorized transactional figures on-demand from SAP S/4HANA via SAP CAP and BTP Destinations.
- **Rigorous Financial Correctness**: Zero mathematical hallucination—all arithmetic, aggregations, ratios, and sign reconciliations occur in deterministic, tested backend services.
- **Dynamic Interactive Presentation**: Output compiled into a typed `DashboardSpec` JSON rendered through reusable KPI cards, charts (line/bar), and tabular views via React and Recharts.

---

### 2. Pilot Boundary & Target Users

#### Target Organization & Deployment
- **Target Organization**: One pilot enterprise organization/tenant.
- **User Personas**:
  1. *Finance Analyst*: Requests ad-hoc views, filters across company codes, and explores monthly/quarterly variance.
  2. *Finance Manager*: Reviews approved KPIs, verifies data freshness, and saves/shares standard executive dashboards.
  3. *Tenant Administrator*: Manages user access, role assignments, and workspace configurations.

#### Domain Scope
- **Domain**: Corporate Finance & Management Accounting (General Ledger and P&L indicators).
- **Data Source**: Exactly **one verified SAP S/4HANA Finance OData API** (or deterministic mock provider during local development).
- **Core Candidate Metric Set**:
  1. `total_revenue`: Gross / operating revenue recognized in the period.
  2. `total_expenses`: Operating expenses incurred in the period.
  3. `net_profit`: Deterministically calculated as `total_revenue - total_expenses`.
  4. `profit_margin`: Deterministically calculated as `(net_profit / total_revenue) * 100` (with zero-division protection).
- **Allowed Dimensions**:
  - `fiscal_period` / `month` (e.g., 2026-01 through 2026-12).
  - `company_code` (e.g., 1000, 2000).
  - `business_unit` / `cost_center` (subject to source API availability).

---

### 3. Explicit Non-Goals (Out of Scope for MVP)

To maintain focus and enterprise security, the following capabilities are explicitly excluded from this MVP:
- **No Bulk ETL / Database Mirroring**: We do not replicate, sync, or copy S/4HANA financial transaction tables into the application database.
- **No Unrestricted Natural Language to SQL/OData**: The LLM is never permitted to emit raw SQL queries, arbitrary OData filter expressions, or direct network calls.
- **No LLM Mathematical Computations**: The model does not sum, divide, or project numbers; all calculation logic is deterministic backend code.
- **No Predictive Analytics / Machine Learning Forecasting**: The MVP displays historical and current actuals only.
- **No Microservices or Multi-Cloud Adapters**: One modular monolith SAP CAP Node.js backend and one React frontend.
- **No Heavy Infrastructure**: No Kubernetes, Kafka, Redis, Elasticsearch, Vector Databases (RAG), or LangChain/LangGraph frameworks.
- **No Direct SAP Analytics Cloud (SAC) / Datasphere Integration**: Access is exclusively via SAP CAP calling the target S/4HANA OData service.

---

### 4. End-to-End User Journey

```
[Finance User]
      │
      ▼
1. Prompt Entry ────────► "Show me revenue and net profit by month for Company Code 1000"
      │
      ▼
2. AI Request Engine ───► Interprets intent, checks allowlist, clarifies ambiguities
      │
      ▼
3. CAP Orchestrator ────► Validates user authorization; calls bounded 'get_finance_metrics' tool
      │
      ▼
4. Finance Data Provider► Fetches authorized records from S/4HANA OData via BTP Destination
      │                    (or Mock Provider locally). Transient in-memory processing only.
      ▼
5. Calculation Engine ──► Calculates net_profit, profit_margin, aggregates deterministically
      │
      ▼
6. Spec Compiler ───────► Assembles validated DashboardSpec JSON with provenance metadata
      │
      ▼
7. React Dashboard ─────► Renders KPI cards, line charts, and tables; supports Save / Reopen / Refresh
```

---

### 5. Success Criteria & Definition of Done for MVP
- [ ] End-to-end flow operational: prompt -> clarification -> data fetch -> deterministic calculation -> dashboard rendering.
- [ ] Source provenance clearly visible (e.g., "Source: S/4HANA OData [Live]" or "Source: Synthetic Fixtures [Mock]").
- [ ] Stored application data strictly limited to dashboard specifications and metadata; no raw financial transactions persisted.
- [ ] Dashboard definitions can be saved, reopened, and refreshed with fresh data.
- [ ] All automated tests (unit, contract, authorization, and AI intent evaluation) pass without failure.

