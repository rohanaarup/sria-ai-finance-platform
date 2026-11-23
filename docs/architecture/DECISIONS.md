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

