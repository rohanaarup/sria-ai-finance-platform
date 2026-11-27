# Architecture Decision Log (ADR)
## Sria Info Tech AI Finance Dashboard Generator

### Summary of Decisions
- **ADR-001**: Monorepo Architecture with Modular Monolith Backend (CAP) & React Frontend
- **ADR-002**: On-Demand Transient OData Retrieval vs. Bulk Data Replication
- **ADR-003**: Deterministic Financial Calculations vs. LLM Arithmetic
- **ADR-004**: Decoupling Development Coding Agent from Runtime LLM Provider
- **ADR-005**: Dual Data Provider Strategy (Mock-First Development & Gated Live SAP)
- **ADR-006**: Tiered Application Persistence (Local SQLite & Conditional SAP HANA Cloud)
- **ADR-007**: Schema-Constrained `DashboardSpec` vs. Dynamic Code/HTML Generation
- **ADR-011**: Finance semantic layer as versioned data (G2-01)
- **ADR-012**: FinancialPerformance data product between tools and sources (G2-02)
- **ADR-019**: Read-only S/4HANA adapter over OData via BTP Destination (G2-03)
- **ADR-013**: Decimal arithmetic for money (G2-01)

---

### ADR-001: Monorepo Architecture with Modular Monolith Backend & React Frontend
- **Status**: Approved
- **Context**: The project requires tight coordination between frontend UI components, backend CAP services, shared contract types, and domain documentation.
- **Decision**: Adopt a lightweight npm/pnpm workspaces monorepo containing `apps/web` (React + TypeScript + Vite), `apps/cap` (SAP CAP Node.js), and `packages/contracts` (shared domain and schema contracts). Avoid microservices, Kubernetes, or multi-repo overhead.
- **Consequences**:
  - *Positive*: Single repository, shared type contracts, simplified local development and CI/CD pipelines.
  - *Negative*: Workspace dependencies must be kept strictly bounded to prevent frontend code leaking into backend runtime.

---

### ADR-002: On-Demand Transient OData Retrieval vs. Bulk Data Replication
- **Status**: Approved
- **Context**: Financial stakeholders often ask if SAP accounting data should be synced or replicated into the custom application database.
- **Decision**: Financial transaction data will **NOT** be replicated or ingested into the Sria Info Tech database. All financial figures are queried on-demand from S/4HANA via OData APIs and transiently processed in memory.
- **Consequences**:
  - *Positive*: Guarantees SAP S/4HANA remains the single source of truth; zero data synchronization lag; eliminates compliance, data duplication, and storage liabilities.
  - *Negative*: Dashboard query latency depends on S/4HANA OData API response times. Large time horizons require server-side pagination and bounded query filters.

---

### ADR-003: Deterministic Financial Calculations vs. LLM Arithmetic
- **Status**: Approved
- **Context**: LLMs are probabilistic text predictors susceptible to subtle arithmetic errors, currency confusion, and rounding hallucinations.
- **Decision**: The runtime LLM is strictly prohibited from computing numbers, sums, ratios, or variances. All metric calculations are executed by deterministic, unit-tested TypeScript functions using approved accounting formulas from the Finance Metric Registry.
- **Consequences**:
  - *Positive*: 100% mathematical auditability, reproducible results, zero financial hallucinations.
  - *Negative*: Supported metrics must be explicitly registered and implemented in code; ad-hoc undefined metrics trigger clarification rather than instant output.

---

### ADR-004: Decoupling Development Coding Agent from Runtime LLM Provider
- **Status**: Approved
- **Context**: Gemini Flash is utilized during development as the coding assistant. There is a risk of conflating the developer's coding tool with the enterprise runtime AI service.
- **Decision**: Maintain strict architectural separation between the coding agent (Gemini Flash) and the application's runtime LLM provider. The runtime LLM client will be abstracted behind an `LLMProvider` interface, and provider selection will be finalized based on company governance, data-privacy approval, and deployment region.
- **Consequences**:
  - *Positive*: Prevents architectural lock-in; ensures enterprise governance compliance for customer data.
  - *Negative*: Requires mock LLM adapter implementation during local development until corporate provider approval is granted.

---

### ADR-005: Dual Data Provider Strategy (Mock-First Development & Gated Live SAP)
- **Status**: Approved
- **Context**: Access to live SAP S/4HANA systems and BTP destinations often incurs administrative and credential provisioning delays.
- **Decision**: Implement a `FinanceDataProvider` interface backed by two distinct implementations:
  1. `MockFinanceDataProvider`: Serves deterministic synthetic fixtures with identical schema signatures.
  2. `S4HanaODataFinanceDataProvider`: Connects to SAP via BTP Destination Service.
  Live SAP integration is a hard gated milestone requiring verified credentials and reconciliation sign-off.
- **Consequences**:
  - *Positive*: Development and testing proceed unblocked; UI and orchestration logic can be verified end-to-end immediately.
  - *Negative*: Developers must ensure synthetic fixtures strictly mirror real SAP payload edge cases (currency, dates, signs).

---

### ADR-006: Tiered Application Persistence (Local SQLite & Conditional SAP HANA Cloud)
- **Status**: Approved
- **Context**: Developers need rapid, zero-cost local execution without cloud service dependencies, while production requires enterprise persistence.
- **Decision**: Use CAP's native database abstraction to run SQLite for local development and tests. Configure SAP HANA Cloud as a deployment profile target, activated only when the BTP administrator verifies instance provisioning and entitlements.
- **Consequences**:
  - *Positive*: Fast developer onboarding; zero cloud cost for local testing; clean CDS portability.
  - *Negative*: Any database-specific native SQL features are disallowed (standard CDS query syntax must be maintained).

---

### ADR-007: Schema-Constrained `DashboardSpec` vs. Dynamic Code/HTML Generation
- **Status**: Approved
- **Context**: Allowing an LLM to generate raw HTML, JSX, or script code introduces severe Cross-Site Scripting (XSS) and stability vulnerabilities.
- **Decision**: The AI output compiler generates a strictly validated JSON structure (`DashboardSpec`). The React frontend renders this specification using pre-built, allowlisted React/Recharts widgets (cards, line charts, bar charts, tables).
- **Consequences**:
  - *Positive*: Complete XSS immunity from model output; uniform enterprise styling; robust error boundary protection.
  - *Negative*: Visual layouts are constrained to the pre-built widget catalog.


---

### ADR-011: Finance semantic layer as versioned data (G2-01)
- **Status:** Accepted (2026-11-27)
- **Context:** Metric meaning lived in four hard-coded objects and in prompt text; the approval gate was not enforced (F-03) and unused entities existed (F-13).
- **Decision:** Metric definitions, immutable versions with approval status and effective date, formula dependencies (DAG, cycle-checked at write time), dimensions and hierarchies, fiscal calendars, glossary aliases and source lineage are relational CDS tables (`apps/cap/db/semantic.cds`). The planner, the `get_finance_metrics` tool, the intent service and the calculator all read the same `SemanticCatalog` snapshot. Changes go through `SemanticService.proposeMetricVersion` → `approveMetricVersion` (MetricApprover scope, four-eyes). Glossary resolution runs before any model call. `SEMANTIC_LAYER=off` restores the legacy catalog as a rollback switch.
- **Consequences:** Results carry the metric version used. Tenant-specific metrics can be defined and approved, but executing new metric ids through the dashboard pipeline still requires widening `MetricIdEnum` (planned with the tool platform, G2-06).
- **Revisit when:** more than ~20 metrics or a BI semantic layer (Datasphere) becomes the source of meaning.

### ADR-013: Decimal arithmetic for money (G2-01, decision D-03)
- **Status:** Accepted (2026-11-27)
- **Decision:** decimal.js (arbitrary-precision decimal) instead of integer minor units, because ratios and percentages need division. Provider amounts are converted through their string form. Rounding is ROUND_HALF_UP to each metric's declared decimals, once per metric; derived metrics use their dependencies' rounded values.
- **Enforcement:** a test scans calculation code for binary floating-point money operations (`Math.round`, `parseFloat`, arithmetic on `.amount`).
- **Revisit when:** a Finance policy requires banker's rounding or currency-specific minor units.

### ADR-012: FinancialPerformance data product between tools and sources (G2-02)
- **Status:** Accepted (2026-11-27)
- **Context:** Tools called the single-entity provider interface directly (no multi-entity queries, paging, cancellation, freshness or quality flags), and nothing stopped a handler from reading any company.
- **Decision:** A domain-level data product (`getPerformance`) is the only path to figures. It validates business queries against the semantic layer, enforces bounds (rejecting rather than truncating), applies entity-level authorization from the `EntityAccess` table (D-17), reads through a v2 source adapter (paged, abortable, capability-described), checks quality, reports per currency without FX conversion, and returns provenance v2. An import-boundary test forbids tools and handlers from importing providers; an adapter conformance suite gates every adapter.
- **Consequences:** SAP names stay inside adapters; S/4HANA (G2-03) must pass the conformance suite. Duplicate posting keys are flagged, not silently removed.
- **Revisit when:** an approved FX rate source exists (then converted views can be added alongside per-currency ones) or result sizes need push-down aggregation instead of row retrieval.

### ADR-019: Read-only S/4HANA adapter over OData via a BTP Destination (G2-03)
- **Status:** Proposed — built and tested against a simulator; **not accepted** until verified against a real system and signed by Finance (see `docs/sap/RECONCILIATION-LOG.md`).
- **Context:** The S/4HANA provider threw unconditionally. No verified service, field list, sign convention or connection existed.
- **Decision:** An adapter implementing the v2 adapter contract reads journal-entry lines with OData GET requests only. The connection is a BTP Destination resolved by name through the SAP Cloud SDK (credentials, token exchange and the Cloud Connector path stay in the platform). Before the first data call the service `$metadata` is read and every selected field must exist in it. Failures are typed (AUTH, NOT_FOUND, BAD_QUERY, THROTTLED, TIMEOUT, UNAVAILABLE, SOURCE_ERROR, MALFORMED); only transient ones are retried (exponential backoff with jitter, honouring Retry-After) behind a circuit breaker. Rows are validated with Zod before mapping, and a mismatch fails the whole page rather than dropping money. Revenue/expense classification, ledger and amount convention are configuration (`S4_*`), because they depend on the customer's system and are confirmed by reconciliation. Every call is audited without values. An outage is an error, never a fall back to synthetic data.
- **Consequences:** Reaching a real system needs people (BTP admin, SAP owner, Finance, security) and cannot be completed by a coding agent. The simulator proves the adapter's behaviour, not SAP's.
- **Revisit when:** the real `$metadata` differs from the candidate (D-07), or principal propagation (D-05) replaces the technical user.
