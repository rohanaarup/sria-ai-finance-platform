# Operator & Administrator Runbook
## Sria Info Tech AI Finance Dashboard Generator
**Phase 12: Pilot Deployment, Acceptance & Handover**  
**Audience:** System Administrators, DevOps Engineers & Finance Application Operators

---

### 1. System Architecture & Topology

The **Sria Info Tech AI Finance Dashboard Generator** is architected as a modular, containerized multi-tier enterprise application:

```
┌────────────────────────────────────────────────────────┐
│             Web Client (React 18 + Vite)               │
│              Local: http://localhost:5173              │
│       Cloud: SAP BTP Approuter / Standalone HTML5      │
└───────────────────────────┬────────────────────────────┘
                            │ REST / JSON (OData v4)
┌───────────────────────────▼────────────────────────────┐
│          SAP CAP Backend Service (Node.js 20+)         │
│              Local: http://localhost:4004              │
│            Cloud: Cloud Foundry Node.js Buildpack      │
│                                                        │
│  ├── /api/ai           : Intent Understanding Engine   │
│  ├── /api/orchestration: Planner & Tool Orchestration  │
│  ├── /api/finance      : Finance Calculation Engine    │
│  ├── /api/v1/lifecycle : Dashboard Persistence & Follow│
│  └── /health           : Liveness & Readiness Probes   │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
              ▼                            ▼
┌───────────────────────────┐┌───────────────────────────┐
│     Persistence Layer     ││     Data Provider Layer   │
│  Local: SQLite (sqlite.db)││  Local: MockProvider     │
│  Cloud: SAP HANA Cloud    ││  Cloud: S/4HANA OData     │
└───────────────────────────┘└───────────────────────────┘
```

---

### 2. Environment Variables & Runtime Configuration

| Variable | Scope | Permitted Values | Default | Description |
|---|---|---|---|---|
| `PORT` | Backend | Port number (e.g., `4004`) | `4004` | HTTP listening port for CAP backend |
| `NODE_ENV` | Backend | `development`, `production` | `development` | Runtime environment profile |
| `DATA_SOURCE_MODE` | Backend | `mock`, `s4hana` | `mock` | Switches between synthetic offline fixtures and live SAP S/4HANA OData |
| `RUNTIME_LLM_PROVIDER` | Backend | `mock`, `approved` | `mock` | Selects local deterministic intent parser or approved corporate LLM gateway |
| `SAP_DESTINATION_NAME` | Backend | String (e.g. `S4HANA_FINANCE_API`) | None | SAP BTP destination pointing to S/4HANA communication arrangement |
| `CDS_ENV` | Backend | `development`, `production` | `development` | SAP CAP runtime profile |

---

### 3. Local Development & Pilot Operations

#### Starting Development Services

```bash
# 1. Install all monorepo dependencies
npm install

# 2. Build shared contracts
npm run build --workspace=packages/contracts

# 3. Deploy local SQLite database schema
npm run deploy --workspace=apps/cap

# 4. Start CAP backend (listening on http://localhost:4004)
npm run dev:cap

# 5. In a separate terminal, start React frontend (listening on http://localhost:5173)
npm run dev:web
```

#### Running Tests & Typechecks

```bash
# Run all 176 tests across all packages
npm test --workspace=packages/contracts
npm test --workspace=apps/web
npm test --workspace=apps/cap
node --test --test-concurrency=1 tests/**/*.test.ts

# Typecheck all workspaces
npm run typecheck --workspace=packages/contracts
npm run typecheck --workspace=apps/cap
npm run typecheck --workspace=apps/web
```

---

### 4. SAP BTP Cloud Foundry Production Deployment

When deploying to a provisioned SAP BTP Subaccount:

#### Step 1: Login to SAP BTP Cloud Foundry
```bash
cf login -a https://api.cf.<region>.hana.ondemand.com -o <org> -s <space>
```

#### Step 2: Build Multi-Target Application Archive (MTAR)
```bash
# Build MTA package using Cloud MTA Build Tool
mbt build -t ./mta_archives
```

#### Step 3: Deploy MTAR to Cloud Foundry
```bash
cf deploy ./mta_archives/sria-finance-dashboard_0.1.0.mtar
```

#### Step 4: Verify Service Bindings
Verify that the deployed CAP service is bound to:
1. `sria-finance-xsuaa` (XSUAA Service Instance)
2. `sria-finance-hana` (SAP HANA Cloud Database)
3. `sria-finance-dest` (SAP BTP Destination Service)

---

### 5. Monitoring & Health Probes

The system provides standard health endpoints for container liveness and readiness:

- **Endpoint:** `GET http://localhost:4004/health`
- **Response Format:**
```json
{
  "status": "UP",
  "service": "sria-cap-backend",
  "version": "0.1.0",
  "timestamp": "2026-11-25T12:00:00.000Z",
  "environment": "development",
  "components": {
    "capService": { "status": "UP", "profile": "development" },
    "database": { "status": "UP", "dialect": "sqlite" },
    "dataProvider": { "status": "UP", "mode": "mock" },
    "aiEngine": { "status": "UP", "provider": "mock" }
  }
}
```

---

### 6. Incident Handling & Troubleshooting Guide

| Symptom | Probable Cause | Remediation Action |
|---|---|---|
| `ERR_SQLITE_ERROR: database is locked` | Concurrent test runners or processes locking `sqlite.db`. | Ensure tests are executed with `--test-concurrency=1`. Terminate orphan Node processes holding write locks. |
| `HTTP 401 Unauthorized` | Missing authentication token or anonymous request context. | Authenticate with valid XSUAA credentials or run in local dev mode where mock identity is defaulted. |
| `HTTP 403 Forbidden` | User lacks `FinanceManager` or `FinanceAnalyst` scope. | Assign the user to the appropriate Role Collection (`SriaFinanceManager` or `SriaFinanceAnalyst`) in the BTP Cockpit. |
| `S4HanaProviderBlockedError` | `DATA_SOURCE_MODE` is set to `s4hana` but destination credentials are not yet configured. | Revert `DATA_SOURCE_MODE=mock` for synthetic operation until BTP communication arrangement is active. |
| `Port 4004 already in use` | Zombie background CAP process running on Windows. | Run `Get-NetTCPConnection -LocalPort 4004` and `Stop-Process -Id <PID>` in PowerShell. |

