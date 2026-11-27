# Baseline audit — status after G2-00

Full audit: `docs/architecture/SRIA-PHASE-2-ARCHITECTURE-AND-IMPLEMENTATION-ROADMAP.html` (§03–§04). Status of findings F-01…F-13:

| ID | Finding | Status after G2-00 |
|---|---|---|
| F-01 | No transport-level authorization | Fixed (`@requires`, HTTP matrix test) |
| F-02 | Fail-open identity defaults | Fixed (no defaults; headers ignored) |
| F-03 | Metric approval gate not on execution path | Fixed (tier-aware gate in planner + tool) |
| F-04 | Three calculation implementations | Fixed (single `inspectAndCalculate` pipeline) |
| F-05 | Test evidence ≠ reports | Fixed (root `npm test` = 248 tests; counts from command output) |
| F-06 | Provider env-variable mismatch | Fixed (`AppConfig`; `/health` reads it) |
| F-07 | Follow-up logic duplicated client-side | Open |
| F-08 | UI/docs describe behaviour that doesn't occur | Fixed for progress copy |
| F-09 | Monetary arithmetic on binary floats | Open → G2-01 |
| F-10 | Circular intent evaluation | Open → G2-04 / G2-10 |
| F-11 | Unstable baseline (uncommitted tree) | Fixed (baseline commit, pushed) |
| F-12 | Wildcard CORS | Fixed (allow-list) |
| F-13 | Unused / hard-coded state | Open |
