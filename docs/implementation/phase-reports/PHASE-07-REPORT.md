# Phase 07 Report — AI Planning, Tool Orchestration & Controlled Execution

**Phase Weight:** 10%  
**Cumulative on Completion:** 67%  
**Lane:** AI Intelligence  
**Date:** 2026-11-24  
**Status:** ✅ COMPLETE

---

## 1. Executive Summary

Phase 07 implements the deterministic planning, tool registry, and bounded orchestration engine that turns validated `DashboardRequest` contracts into structured `DataPlan` executions.

Rather than delegating execution to an unconstrained autonomous agent, the system employs a deterministic **Finite State Machine** (`WorkflowStateMachine`) and a locked **Tool Registry** (`ToolRegistry`). Only one approved tool (`get_finance_metrics`) is exposed to the planner, backed by the transient `FinanceDataProvider` and deterministic `CalculationEngine`.

---

## 2. Deliverables & Files Created

| Layer | File | Purpose |
|---|---|---|
| **State Machine** | `apps/cap/srv/ai/workflow-state.ts` | Finite state machine enforcing `INTERPRET` → `PLAN` → `AUTHORIZE` → `EXECUTE` → `VALIDATE` → `RESPOND` |
| **Tool Registry** | `apps/cap/srv/ai/tool-registry.ts` | Locked tool registry with runtime Zod schema validation; rejects arbitrary tools |
| **Approved Tool** | `apps/cap/srv/ai/tools/get-finance-metrics.ts` | Typed `get_finance_metrics` tool retrieving data on-demand and computing metrics |
| **Planner** | `apps/cap/srv/ai/planner.ts` | Generates schema-valid `DataPlan` conforming to `DataPlanSchema` with step budgets |
| **Orchestrator** | `apps/cap/srv/ai/orchestrator.ts` | Orchestrates tool execution, duplicate prevention, timeouts, authorization, and tracing |
| **CAP Service** | `apps/cap/srv/orchestration-service.cds` | CDS definition exposing `/api/orchestration` endpoints `PlanRequest` and `ExecutePlan` |
| **CAP Handler** | `apps/cap/srv/orchestration-service.ts` | Server-side handler enforcing `AuthGuard` scope checks and tenant injection |
| **Tool Catalog Doc** | `docs/ai/TOOL-CATALOG.md` | Approved tool definitions, parameter schemas, and disallowed signatures |
| **Flow Doc** | `docs/ai/ORCHESTRATION-FLOW.md` | State machine transitions, guardrails, and execution trace schema |
| **CAP Tests** | `apps/cap/test/orchestrator.test.ts` | 8 comprehensive tests in CAP workspace |
| **Integration Test** | `tests/ai/orchestration/orchestration.test.ts` | End-to-end multi-metric planning and tool execution test |

---

## 3. Test & Verification Evidence

### A. CAP Workspace Tests
```
▶ Orchestration & Planning Suite
  ✔ 1. Planner builds schema-valid DataPlan from DashboardRequest (14.6ms)
  ✔ 2. ToolRegistry executes approved get_finance_metrics tool (27.3ms)
  ✔ 3. ToolRegistry rejects disallowed tool names (arbitrary SQL/shell/API) (1.1ms)
  ✔ 4. Tool parameter schema validation catches invalid parameters (1.6ms)
  ✔ 5. Orchestrator drives end-to-end plan execution with traceable success (1.8ms)
  ✔ 6. Server-side authorization check rejects requests lacking Finance roles (0.6ms)
  ✔ 7. Orchestrator halts when step budget is exceeded (0.4ms)
  ✔ 8. Execution trace omits raw transactional rows to protect privacy (0.8ms)
✔ Orchestration & Planning Suite (50.8ms)

Total CAP Workspace Tests: 72 passed / 72 total (100%)
```

### B. Integration Tests
```
▶ AI Planning & Orchestration Integration
  ✔ Executes multi-metric planning and tool execution for period 02 (33.9ms)
✔ AI Planning & Orchestration Integration (35.1ms)
```

### C. Build & Typecheck
- `npm run typecheck --workspace=apps/cap`: **0 errors**
- `cds build --no-ws-pack`: **Clean build (65+ generated artifacts)**

---

## 4. Hard Security Rules Enforced

1. **Model Output is Untrusted:** The model cannot specify SQL queries, raw OData URLs, or arbitrary HTTP endpoints. All execution routes through `ToolRegistry.execute()`.
2. **Server-Verified Identity:** `organizationId` and `userId` are injected strictly from server-side `AuthGuard`. Requests from users lacking `FinanceAnalyst`, `FinanceManager`, or `TenantAdmin` roles fail with 403.
3. **No Dynamic Code or Shells:** Arbitrary tool requests like `execute_arbitrary_sql` or `run_shell_command` are rejected immediately at the registry boundary.
4. **Duplicate Call Protection:** Idempotent call signatures prevent redundant identical tool executions in a single plan.
5. **No Raw Rows Stored or Traced:** Execution traces capture only step metadata, timings, and status codes; raw SAP records are never included in traces or application logs.

---

## 5. Next Steps

- **Current Progress:** 67% / 100%
- **Next Phase:** Phase 08 — Deterministic Finance Processing & Spec Compiler (8% weight, cumulative 75%).
  - Building the deterministic `DashboardSpec` JSON compiler.
  - Assembling layout widgets (cards, line charts, bar charts, tables).
  - Stamping final source provenance metadata.
