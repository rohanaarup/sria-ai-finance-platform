# Phase 06 Report — AI Request Understanding & Clarification Engine

**Phase Weight:** 9%  
**Cumulative on Completion:** 57%  
**Lane:** AI Intelligence  
**Date:** 2026-11-24  
**Status:** ✅ COMPLETE (Mock LLM Adapter) | 🔴 GATED (Live Runtime LLM Provider)

---

## 1. Executive Summary

Phase 06 establishes the AI Intelligence layer responsible for translating conversational Finance user prompts into validated, typed `DashboardRequest` payloads and asking structured clarification questions when requests are ambiguous or unsupported.

In compliance with **ADR-004**, Gemini Flash is maintained strictly as the developer coding agent. The runtime LLM is abstracted behind a typed `LLMProvider` interface. A deterministic `MockLLMProvider` powers offline development, automated testing, and CI/CD without network latency or token costs. An `ApprovedLLMProvider` stub remains gated until corporate approval is granted.

---

## 2. Deliverables & Files Created

| Category | File | Description |
|---|---|---|
| **Contract & Schema** | `apps/cap/srv/ai/schemas/intent-schemas.ts` | Zod schemas for raw model output and validated `IntentProcessingResult` |
| **Provider Abstraction** | `apps/cap/srv/ai/llm-provider.ts` | `LLMProvider`, `LLMMessage`, and `LLMCompletionResponse` interfaces |
| **Mock Provider** | `apps/cap/srv/ai/mock-llm-provider.ts` | Deterministic mock adapter evaluating clear, ambiguous, and unsupported prompts |
| **Approved Adapter** | `apps/cap/srv/ai/approved-provider.ts` | Gated provider stub with corporate approval check (`RuntimeLLMNotApprovedError`) |
| **System Prompt** | `apps/cap/srv/ai/prompts/finance-intent.v1.md` | Versioned system prompt grounded strictly in `BASELINE_METRIC_CATALOG` |
| **Orchestrator** | `apps/cap/srv/ai/intent-service.ts` | Core service handling retry loops, post-model allowlist checks, and Zod compilation |
| **CAP Service** | `apps/cap/srv/ai-service.cds` | CDS service definition exposing `/api/ai` and `UnderstandRequest` action |
| **CAP Handler** | `apps/cap/srv/ai-service.ts` | Server-side handler enforcing `AuthGuard` tenant and user context |
| **Evaluation Dataset**| `tests/fixtures/ai/intent-cases.json` | 13 evaluation cases across 5 categories |
| **CAP Tests** | `apps/cap/test/intent-service.test.ts` | 8 integration tests in CAP workspace |
| **Evaluation Matrix** | `tests/ai/intent/intent-eval.test.ts` | Complete test suite evaluating all 13 test fixture cases |
| **Documentation** | `docs/ai/INTENT-EVALUATION.md` | Evaluation matrix, architecture explanation, and error taxonomy |

---

## 3. Test & Verification Results

### A. CAP Workspace Tests
```
▶ IntentService Suite
  ✔ 1. Successfully resolves clear request and builds valid DashboardRequest (12.2ms)
  ✔ 2. Ambiguous request (missing company code) triggers clarification question (3.5ms)
  ✔ 3. Ambiguous request (missing fiscal year) triggers clarification question (0.6ms)
  ✔ 4. Unsupported metric (EBITDA) is rejected safely without hallucination (1.7ms)
  ✔ 5. Adversarial prompt injection attempt is rejected safely (1.3ms)
  ✔ 6. Empty or whitespace prompt is rejected gracefully (0.4ms)
  ✔ 7. Bounded retry recovers when model initially returns malformed output (0.7ms)
  ✔ 8. Server context strictly controls tenant and user identity regardless of prompt content (0.5ms)
✔ IntentService Suite (23.9ms)

Total CAP Workspace Tests: 64 passed / 64 total (100%)
```

### B. AI Intent Evaluation Matrix (`intent-eval.test.ts`)
```
▶ AI Intent Understanding Evaluation Matrix
  ✔ Category: Clear Requests (3/3 passed)
  ✔ Category: Ambiguous Requests (3/3 passed)
  ✔ Category: Unsupported Requests (3/3 passed)
  ✔ Category: Adversarial Requests (2/2 passed)
  ✔ Category: Malformed Requests (2/2 passed)
Total Evaluation Matrix: 13 passed / 13 total (100% Accuracy)
```

### C. Build & Typecheck
- `npm run typecheck --workspace=apps/cap`: **0 errors**
- `cds build --no-ws-pack`: **Clean build (60+ generated artifacts)**

---

## 4. Key Architectural Guarantees Enforced

1. **Zero Mathematical Hallucination (ADR-003):** The prompt explicitly instructs the LLM that arithmetic is forbidden. The model only identifies metrics and filter keys. Calculations are executed exclusively by the deterministic `CalculationEngine` built in Phase 05.
2. **Strict Metric Allowlisting:** The model is constrained to the 4 approved metrics: `total_revenue`, `total_expenses`, `net_profit`, `profit_margin`. Requests for EBITDA, ARR, churn, or stock prices are rejected with suggested approved alternatives.
3. **Proactive Ambiguity Handling:** If a user omits `companyCode` or `fiscalYear`, the system does NOT invent defaults. It returns structured `ClarificationQuestion` objects for the frontend UI.
4. **Server-Side Identity Authority:** Tenant and user scopes are stamped server-side by `AuthGuard`. Adversarial prompt injection claiming elevated roles is completely ignored.
5. **Bounded Retry on Malformed Output:** If a model returns invalid JSON, the orchestrator triggers up to 2 corrective retries before safely rejecting.

---

## 5. Next Steps

- **Current Progress:** 57% / 100%
- **Next Phase:** Phase 07 — AI Planning, Tool Orchestration & Controlled Execution (10% weight, cumulative 67%).
  - Building the execution state machine.
  - Bounded tool calling (`get_finance_metrics`).
  - Strict step budget and loop prevention.
