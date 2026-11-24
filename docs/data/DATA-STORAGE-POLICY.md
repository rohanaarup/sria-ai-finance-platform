# Data Storage & Privacy Policy
## Sria Info Tech AI Finance Dashboard Generator

This policy establishes the authoritative data contract governing what data is stored, where it is stored, how long it is retained, and how tenant isolation is guaranteed.

---

### 1. The Core Principle: No Bulk Financial Data Replication

> [!IMPORTANT]
> **Data Separation Rule**:
> **SAP S/4HANA is and remains the sole system of record for all accounting and transactional financial data.**
> Sria Info Tech does **NOT** mirror, sync, replicate, or store general ledger rows, journal entries, invoices, or customer transactions in the application database.
> Data retrieval from SAP is **transient and on-demand**: each user request queries only the authorized records needed for that specific dashboard, processes them in backend memory, and discards the raw rows immediately after metric calculation.

---

### 2. Data Inventory & Ownership Matrix

| Data Category | System of Record | Stored in Sria Info Tech DB? | Retention Period | Access Control / Scoping |
| :--- | :--- | :---: | :--- | :--- |
| **Journal entries, invoices, GL line items, accounting vouchers** | SAP S/4HANA | **NO** | Kept in SAP per corporate accounting retention rules | Authorized at source via SAP OData communication user / principal propagation. |
| **Raw OData HTTP payloads / `FinanceRecord[]`** | SAP S/4HANA | **NO** | In-memory lifetime of the HTTP request only (transient DTO) | Processed in CAP backend RAM; never written to database, disk, or logs. |
| **Calculated KPI summary results** | Derived per request | **NO (by default)** | Returned in HTTP response; recalculated on user refresh | Accessible only by the requesting user within authorized workspace. |
| **Dashboard metadata (`title`, `description`, `ownerId`)** | Sria Info Tech App | **YES** | Retained until archived/deleted by owner | Scoped strictly to `organization_ID` and authenticated owner. |
| **Compiled `DashboardSpec` JSON** | Sria Info Tech App | **YES** | Retained with dashboard definition | Contains widget layout, metric IDs, and chart configs. No transaction rows. |
| **Dashboard Shares & Permissions** | Sria Info Tech App | **YES** | Managed by dashboard owner | Governs READ/WRITE permissions for users or role collections. |
| **Finance Metric Registry Configuration** | Sria Info Tech App | **YES** | Version-controlled application config | Public to all authorized users within organization; no secrets. |
| **Data Source References (`alias`, `systemId`)** | Sria Info Tech App | **YES** | Lifetime of workspace | Stores technical destination name (e.g. `S4HANA_FINANCE_API`). **Zero credentials.** |
| **Audit Logs (`action`, `targetId`, `timestamp`)** | Sria Info Tech App | **YES (Minimized)** | Standard 90-day retention | Records who, when, action, and metric version. **No confidential financial payloads.** |
| **Passwords, tokens, private keys, client secrets** | SAP BTP / Vault | **NO** | Managed exclusively by BTP secure destination bindings | Kept strictly outside source code, prompts, client bundles, and DB tables. |

---

### 3. Server-Side Multi-Tenant Isolation

To prevent cross-tenant data leakage:
1. **Mandatory Foreign Keys**: Every `Workspaces`, `Dashboards`, `DashboardSpecs`, and `AuditEvents` record contains an `organization_ID` column.
2. **Server-Side Enforcement**: All database queries executed through `DashboardRepository` explicitly enforce `.where({ organization_ID: ctx.organizationId })`.
3. **No UI-Only Security**: Even if a malicious client supplies a foreign dashboard UUID, the backend query resolves to zero rows (`null`), completely blocking cross-organization access.

