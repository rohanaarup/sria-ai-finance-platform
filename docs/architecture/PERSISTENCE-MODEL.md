# Persistence Architecture & CDS Entity Model
## Sria Info Tech AI Finance Dashboard Generator

### 1. Persistence Overview
The Sria Info Tech application database stores **application state only**: multi-tenant organizations, workspaces, saved dashboard layouts (`DashboardSpec` JSON), user preferences, and governance audit trails. 

All financial accounting data remains inside SAP S/4HANA and is accessed transiently via OData.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SRIA INFO TECH DATABASE                         │
│                    (SQLite local / HANA Cloud prod)                    │
│                                                                        │
│  ┌──────────────────────┐          ┌────────────────────────────────┐  │
│  │    Organizations     │◀─────────┤           Workspaces           │  │
│  │ (Tenant Root Scope)  │  1    *  │   (Analytical Asset Container) │  │
│  └──────────┬───────────┘          └──────────────┬─────────────────┘  │
│             │                                     │                    │
│             │ 1                                   │ 1                  │
│             │                                     │                    │
│             │ *                                   │ *                  │
│  ┌──────────▼───────────┐          ┌──────────────▼─────────────────┐  │
│  │      Dashboards      │─────────▶│      DataSourceReferences      │  │
│  │ (Owner, Title, Arch) │          │  (Destination Alias ONLY)      │  │
│  └──────────┬───────────┘          └────────────────────────────────┘  │
│             │                                                          │
│             ├──────────────────────────┐                               │
│             │ 1                        │ 1                             │
│             │                          │                               │
│             │ 1..*                     │ *                             │
│  ┌──────────▼───────────┐   ┌──────────▼───────────┐                   │
│  │    DashboardSpecs    │   │   DashboardShares    │                   │
│  │ (Serialized JSON)    │   │  (Role/User Access)  │                   │
│  └──────────────────────┘   └──────────────────────┘                   │
│                                                                        │
│  ┌──────────────────────┐   ┌──────────────────────┐                   │
│  │ MetricConfigurations │   │     AuditEvents      │                   │
│  │ (Versioned Registry) │   │ (Minimized Provenance│                   │
│  └──────────────────────┘   └──────────────────────┘                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2. CDS Entities & Schema Breakdown

#### `Organizations` (`apps/cap/db/tenant.cds`)
- Represents enterprise tenant boundary.
- All subsequent assets require foreign key association to an Organization.

#### `Workspaces` (`apps/cap/db/tenant.cds`)
- Sub-division within an organization (e.g., US Commercial Finance, Corporate HQ).
- Groups dashboards and data source references.

#### `Dashboards` (`apps/cap/db/dashboard.cds`)
- Root entity for a saved dashboard.
- Fields: `ID` (UUID), `organization_ID`, `workspace_ID`, `title`, `description`, `ownerId` (User UUID), `isArchived` (Boolean flag for soft-deletion).

#### `DashboardSpecs` (`apps/cap/db/dashboard.cds`)
- Versioned storage for compiled `DashboardSpec` JSON strings.
- Key properties: `specJson` (`LargeString`), `version` (`1.0`, `1.1`), `metricIds`, `dimensions`, `sourceType` (`mock` or `s4hana`).
- Enables reopening and viewing dashboard layouts across user sessions without storing underlying transactional rows.

#### `DashboardShares` (`apps/cap/db/dashboard.cds`)
- Manages collaborative sharing.
- Maps a dashboard to a `principalId` (User or Role collection) with permission level (`READ` or `WRITE`).

#### `DataSourceReferences` (`apps/cap/db/metric-config.cds`)
- Stores technical alias for SAP BTP Destination (e.g. `S4HANA_FINANCE_API`).
- **Security Rule**: Zero credentials or passwords stored; BTP Destination service handles authentication at runtime.

#### `AuditEvents` (`apps/cap/db/metric-config.cds`)
- Non-sensitive operational audit trail.
- Records `userId`, `action` (`CREATE_DASHBOARD`, `FETCH_METRICS`), `sourceSystem`, and `timestamp`.

---

### 3. Application Services & Endpoints

| Service Name | Path | Description | Access Boundary |
| :--- | :--- | :--- | :--- |
| `DashboardService` | `/api/v1/dashboards` | Create, read, update, archive dashboards & specs | Scoped to authenticated user's organization |
| `MetricCatalogService` | `/api/v1/metrics` | Exposes approved metrics and formulas | Read-only for finance users |
| `AdminService` | `/api/v1/admin` | Tenant, workspace, and destination reference config | Restricted to Tenant Administrators |

---

### 4. Database Adapters: SQLite vs. SAP HANA Cloud
- **Local Development**: Uses `@cap-js/sqlite`. Zero cloud dependency; stored locally in `apps/cap/sqlite.db`.
- **Production Target**: Configured in `.cdsrc.json` under profile `[production]` targeting SAP HANA Cloud via `@sap/hana-client`.
