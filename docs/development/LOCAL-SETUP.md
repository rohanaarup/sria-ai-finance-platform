# Local Development Setup Guide
## Sria Info Tech AI Finance Dashboard Generator

This guide provides step-by-step instructions for getting the local development environment running cleanly from scratch.

---

### 1. Prerequisites
- **Node.js**: `v20.0.0+` or `v24.0.0+` (LTS verified)
- **npm**: `v10.0.0+` (Workspace support)
- **Git**: `v2.40.0+`
- **Recommended Editor**: Visual Studio Code with SAP CDS Language Support extension.

---

### 2. Workspace Architecture
The repository is managed as an npm workspaces monorepo:
```
├── apps/
│   ├── web/               # React + TypeScript + Vite frontend
│   └── cap/               # SAP CAP Node.js backend
│       ├── db/            # CDS persistence models
│       ├── srv/           # CAP service definitions, handlers, and REST endpoints
│       └── test/          # Node.js backend contract tests
├── packages/
│   └── contracts/         # Shared TypeScript DTOs, schemas, and enums
├── docs/                  # Architecture, governance, and phase implementation guides
└── .github/workflows/     # Automated Continuous Integration (CI)
```

---

### 3. Installation & Build

#### Step A: Install Dependencies
Run from the root of the repository:
```bash
npm install
```
This will install all root and workspace dependencies, automatically linking `@sria/contracts` across `apps/web` and `apps/cap`.

#### Step B: Build Shared Contracts
```bash
npm run build --workspace=packages/contracts
```

#### Step C: Type-check and Test
```bash
# Typecheck entire workspace
npm run typecheck

# Execute automated tests
npm run test

# Build all applications for production
npm run build
```

---

### 4. Running the Development Servers

#### Option 1: Start CAP Backend
```bash
npm run dev:cap
```
- Listens on `http://localhost:4004`.
- Health check: `http://localhost:4004/health`
- CAP CDS Services: `http://localhost:4004/api/v1/health/getStatus()`

#### Option 2: Start React Frontend
In a separate terminal:
```bash
npm run dev:web
```
- Listens on `http://localhost:5173`.
- Proxies `/health` and `/api` requests directly to `http://localhost:4004`.

---

### 5. SAP CAP Learning Track: Key Concepts
- **`db/` folder**: Contains Core Data Services (`.cds`) domain entities and persistence definitions.
- **`srv/` folder**: Contains service definitions (`.cds`), custom service implementations (`.js`/`.ts`), and Express server extensions (`server.js`).
- **`@cap-js/sqlite`**: Provides zero-configuration local database persistence stored in `sqlite.db`.
- **Local Runtime vs. SAP BTP**:
  - Local mode executes completely offline without SAP Cloud Foundry or paid cloud services.
  - Production mode will activate the `@sap/hana-client` driver and XSUAA authentication once deployed to SAP BTP Cloud Foundry in Phase 04.

---

### 6. AI Architecture Track: Key Concepts
- **`@sria/contracts`**: Exposes typed contracts (`DashboardRequest`, `ClarificationQuestion`, `DashboardSpec`, `MetricResult`).
- **Orchestration Seams**: The backend exposes controlled, typed interfaces (`HealthResponse`, `get_finance_metrics`).
- **Isolation**: The runtime AI model will interact exclusively through typed adapters and JSON schema boundaries, never direct SQL or arbitrary external URLs.

