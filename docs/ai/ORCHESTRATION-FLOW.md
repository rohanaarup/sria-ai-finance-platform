# AI Orchestration & State Machine Flow

**Phase:** 07 — AI Planning, Tool Orchestration & Controlled Execution  
**Component:** `apps/cap/srv/ai/orchestrator.ts`  
**Status:** ✅ Implemented & Tested

---

## 1. Architectural Overview

The AI Orchestrator enforces a deterministic **Finite State Machine (FSM)** workflow. Rather than allowing an autonomous agent to recurse unpredictably, the system advances through seven bounded phases:

```
  [INITIALIZED]
        │
        ▼
  [INTERPRETING] ───────► (IntentService parses prompt)
        │
        ▼
  [VALIDATING_REQUEST] ──► (Verify allowlists, parameters, context)
        │
        ▼
  [PLANNING] ───────────► (Planner generates schema-valid DataPlan)
        │
        ▼
  [AUTHORIZING_PLAN] ───► (AuthGuard checks server-side roles)
        │
        ▼
  [EXECUTING_TOOLS] ────► (ToolRegistry executes get_finance_metrics)
        │
        ▼
  [VALIDATING_RESULTS] ─► (Sanity checks, non-finite guards)
        │
        ▼
  [COMPLETED] ──────────► (Generates execution trace & response)
```

If any validation, timeout, or authorization fails, the state transitions immediately to **`FAILED`** and returns a structured error.

---

## 2. Guardrails & Execution Controls

### A. Step Budget Enforcement (`maxSteps`)
- The `Planner` and `Orchestrator` enforce a strict upper bound on execution steps (default: 3 to 5 steps).
- Plans that exceed this budget are rejected during the planning phase before any tool executes.

### B. Execution Timeout (`timeoutMs`)
- End-to-end execution is governed by a configurable timeout (default: 10,000 ms).
- If execution exceeds this window, the orchestrator cancels pending steps and marks the plan as `FAILED`.

### C. Duplicate Tool Call Protection
- Each tool invocation generates an idempotent signature: `${tool}:${JSON.stringify(params)}`.
- If an identical call is scheduled multiple times within the same plan, the orchestrator halts execution, preventing redundant round-trips.

### D. Server-Side Context & Destination Resolution
- The model is **never trusted** to specify the `organizationId`, `userId`, or SAP destination name.
- Identity and destination are resolved exclusively from trusted server-side request context (`AuthGuard`).

---

## 3. Structured Execution Trace

Every orchestrator run emits an `ExecutionTrace` metadata object:

```typescript
export interface ExecutionTrace {
  traceId: string;              // Unique UUID for auditability
  planId: string;               // Associated DataPlan UUID
  organizationId: string;       // Verified tenant identifier
  userId: string;               // Authenticated user ID
  startTime: string;            // ISO timestamp
  endTime: string;              // ISO timestamp
  totalDurationMs: number;      // Total execution time in ms
  stepsExecuted: number;        // Count of executed tool steps
  statesVisited: WorkflowState[];// Complete audit trail of FSM transitions
  toolCalls: {
    tool: string;
    stepNumber: number;
    durationMs: number;
    status: 'SUCCESS' | 'FAILED';
    error?: string;
  }[];
}
```

> [!NOTE]
> In compliance with the **Data Storage Policy**, the execution trace records only step metadata, timings, and status codes. Raw SAP transactional records are never retained in trace logs.
