# G2-04 report: LLM gateway, goal understanding, eval harness v1

**Status: built and verified locally against the mock model. Live providers NOT verified (none approved).**

## Delivered
- Gateway with redaction, budgets, timeout, retry, circuit breaker, schema validation and repair, metadata-only metering (`ModelCalls`, admin-readable, tenant-filtered).
- Providers: mock, replay, OpenAI-compatible, Anthropic; live blocked without approval.
- Versioned prompt registry (sha256 recorded per call), `AgentGoal` contract, `GoalService` with layered injection defences.
- Eval datasets, harness, baseline regression gate, injection suite; UI "understood" card; `/health` reports AI mode.

## Measured results (this machine, Node 24)
- Tests: contracts 8, cap 341, web 48, root 146: all pass. Typecheck and build clean.
- Baseline on mock: see `docs/ai/EVAL-FRAMEWORK.md`. Injection: 23/23 direct attacks blocked by the guard; compromised-model suite passes.
- Replay reproduces the baseline exactly.

## Not done / open
- Live provider calls (D-08 provider choice, D-09 terms and residency): `docs/ai/PROVIDER-APPROVAL.md` is unsigned.
- Datasets need Finance review. UI not viewed in a browser. Node 22 and CI run to be confirmed after push.
- G2-03 (real SAP verification) remains open independently.
