# Sria Info Tech AI Finance Dashboard Generator
[![Project Status](https://img.shields.io/badge/Status-100%25%20Complete-brightgreen.svg)](#)
[![Monorepo Tests](https://img.shields.io/badge/Tests-176%2F176%20Passing-success.svg)](#)
[![Security Audit](https://img.shields.io/badge/Security-OWASP%20LLM%20Hardened-blue.svg)](#)
[![Architecture](https://img.shields.io/badge/Stack-SAP%20CAP%20%2B%20React%2018-orange.svg)](#)

An enterprise-grade analytical financial dashboard generator for corporate finance professionals. Users express financial reporting needs in natural, plain English, and receive verified, interactive, and auditable financial dashboards powered by **SAP Cloud Application Programming Model (CAP)** and **React 18**.

---

## 1. Product Vision & Architecture

The system bridges conversational AI with enterprise-grade SAP accounting governance:
- **Natural Language Intent Engine:** Interprets financial metrics, dimensions, company codes, and periods with interactive ambiguity clarification.
- **Zero LLM Arithmetic (ADR-003):** The model never computes or calculates numbers. 100% of arithmetic, margins, and aggregations are performed by deterministic, tested backend TypeScript services.
- **Transient SAP Ledger Processing:** Raw accounting records (`I_JournalEntryItemBasic`) are processed transiently in-memory and are **never stored** in the application database or audit logs.
- **Zero Redundant Data Retrieval (ADR-008):** Conversational follow-ups for presentation changes (switching from bar chart to line chart or table) reuse in-memory validated results with zero redundant queries to SAP.
- **Hardened Multi-Tenant Isolation:** Server-side `AuthGuard` extracts verified tenant and user identity from authenticated tokens; client-side parameter tampering is blocked.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        React 18 + Vite Frontend                        │
│                   Serving live: http://localhost:5173                  │
│                                                                        │
│   [ Prompt Bar ] ──► [ Clarification Modal ] ──► [ Workflow Stepper ]  │
│   [ KPI Cards  ] ──► [ Recharts Bar/Line    ] ──► [ Follow-up Panel ]  │
│   [ Save/Open  ] ──► [ Stale Data Badges    ] ──► [ Saved Dashboards]  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST / JSON (OData v4)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    SAP CAP Node.js Backend Service                     │
│                   Serving live: http://localhost:4004                  │
│                                                                        │
│   ├── /api/ai            : Intent Understanding & Clarification Engine │
│   ├── /api/orchestration : Planner, Step Budget & Tool Orchestrator    │
│   ├── /api/finance       : CalculationEngine (Deterministic Math)      │
│   ├── /api/v1/lifecycle  : Save, Rename, Delete, Share, Reopen, Refresh│
│   └── /health            : Multi-Component Liveness & Readiness Probes │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌───────────────────────────────────┐┌───────────────────────────────────┐
│     Application Persistence       ││        Data Provider Layer        │
│    Local: SQLite (`sqlite.db`)    ││  Local: MockFinanceDataProvider   │
│     Cloud: SAP HANA Cloud         ││  Cloud: S/4HANA OData (Trans.)    │
│  (Persists Specs & Metadata Only) ││   (Zero Raw Data Persistence)     │
└───────────────────────────────────┘└───────────────────────────────────┘
```

---

## 2. Approved Finance Domain Metrics & Allowlist

| Metric ID | Display Label | Formula / Calculation | Allowlisted Dimensions |
|---|---|---|---|
| `total_revenue` | Total Revenue | Sum of Credit ('C') entries minus Debit ('D') entries on `REVENUE` G/L accounts | `fiscal_period`, `company_code` |
| `total_expenses` | Total Expenses | Sum of Debit ('D') entries minus Credit ('C') entries on `EXPENSE` G/L accounts | `fiscal_period`, `company_code` |
| `net_profit` | Net Profit | `total_revenue - total_expenses` (Deterministic arithmetic) | `fiscal_period`, `company_code` |
| `profit_margin` | Profit Margin (%) | `(net_profit / total_revenue) * 100` with **Zero-Denominator Protection** | `fiscal_period`, `company_code` |

---

## 3. 12-Phase Complete Implementation Roadmap

| Phase | Lane | Description | Weight | Cumulative | Status |
|:---:|---|---|:---:|:---:|:---:|
| **00** | Foundation | Project discovery, MVP boundary freeze, decision log ADR-001..007 | 5% | 5% | ✅ **COMPLETE** |
| **01** | Foundation | Monorepo setup (`@sria/contracts`, `@sria/cap`, `@sria/web`), health probe | 7% | 12% | ✅ **COMPLETE** |
| **02** | Domain | Finance contracts, `FinanceMetricRegistry` allowlist, synthetic fixtures | 8% | 20% | ✅ **COMPLETE** |
| **03** | SAP Foundation | CDS persistence models, SQLite deployment, multi-tenant repository | 8% | 28% | ✅ **COMPLETE** |
| **04** | SAP Foundation | BTP security descriptors (`xs-security.json`, `mta.yaml`), AuthGuard RBAC | 9% | 37% | ✅ **COMPLETE** |
| **05** | SAP Integration | `FinanceDataProvider`, `CalculationEngine`, zero-denominator protection | 11% | 48% | ✅ **COMPLETE** |
| **06** | AI Intelligence | `IntentService`, versioned prompt v1, bounded retry, clarification modal | 9% | 57% | ✅ **COMPLETE** |
| **07** | AI Intelligence | `WorkflowStateMachine`, `ToolRegistry`, `Planner`, `Orchestrator` trace | 10% | 67% | ✅ **COMPLETE** |
| **08** | Correctness | `DashboardSpecCompiler`, widget allowlists, normalization & provenance | 8% | 75% | ✅ **COMPLETE** |
| **09** | Product Experience| React frontend, Recharts charts, KPI cards, table widgets, provenance banner| 8% | 83% | ✅ **COMPLETE** |
| **10** | Product Workflow | Follow-up routing (ADR-008), save, rename, delete, reopen, stale data marker| 6% | 89% | ✅ **COMPLETE** |
| **11** | Quality & Assurance| Security audit, OWASP LLM Top 10, jailbreak & injection tests, 176 tests | 7% | 96% | ✅ **COMPLETE** |
| **12** | Release | Pilot deployment, operator runbook, acceptance sign-off, handover | 4% | **100%** | ✅ **COMPLETE** |

---

## 4. Quick Start (Running Locally)

### Prerequisites
- Node.js `v20+` or `v24+`
- npm `v10+`

### 1. Installation & Build
```bash
# Clone the repository and install all monorepo dependencies
npm install

# Build shared contracts
npm run build --workspace=packages/contracts

# Deploy SQLite database schema
npm run deploy --workspace=apps/cap

# Run typecheck across all workspaces
npm run typecheck --workspaces --if-present
```

### 2. Run Test Battery (176 / 176 Tests)
```bash
npm test --workspace=packages/contracts
npm test --workspace=apps/web
npm test --workspace=apps/cap
node --test --test-concurrency=1 tests/**/*.test.ts
```

### 3. Launch Development Servers
```bash
# Terminal 1: Launch CAP Backend Service (http://localhost:4004)
npm run dev:cap

# Terminal 2: Launch React Frontend (http://localhost:5173)
npm run dev:web
```

---

## 5. Enterprise Security & Quality Assurance Guarantees

- **OWASP Top 10 for LLMs Hardened:** Defeats prompt injections, jailbreaks ("DAN mode", "Developer mode"), SQL injections, and system prompt leakage attempts.
- **Multi-Tenant Boundary:** Strict tenant scoping (`WHERE organization_ID = ctx.organizationId`) enforced in all queries. Cross-tenant access attempts return 403 / null.
- **Audit Logging:** Non-sensitive operational metadata is recorded; monetary amounts and customer line-items are scrubbed.
- **Traceability:** Every KPI card and visualization carries transparent provenance stamping: source system, retrieval timestamp, calculation version, and synthetic/live tags.

---

## 6. Key Documentation References

- [Architecture System Overview](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/docs/architecture/SYSTEM-OVERVIEW.md)
- [Architectural Decision Records (ADR-001 through ADR-008)](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/docs/architecture/DECISIONS.md)
- [Operator & Administrator Runbook](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/docs/deployment/OPERATOR-RUNBOOK.md)
- [Pilot Acceptance & Sign-off Checklist](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/docs/deployment/ACCEPTANCE-CHECKLIST.md)
- [Security Evaluation & OWASP Audit Report](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/docs/security/SECURITY-EVALUATION.md)
- [Implementation Progress Tracker (100% Complete)](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/docs/implementation/IMPLEMENTATION-STATUS.md)
- [Phase 12 Handover Report](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/docs/implementation/phase-reports/PHASE-12-REPORT.md)
