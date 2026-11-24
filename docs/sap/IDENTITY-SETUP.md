# SAP Identity Setup & Role Governance
## Sria Info Tech AI Finance Dashboard Generator

This guide details how user authentication, role templates, and role collections are configured across SAP BTP XSUAA and SAP Cloud Identity Services.

---

### 1. Identity Architecture: XSUAA & Trust Configuration

SAP BTP utilizes **XSUAA** (Extended Services User Account and Authentication) as the OAuth 2.0 authorization server for Cloud Foundry applications.

```
[ User Browser ]
       │
       ▼ (1. HTTPS Request)
[ Approuter / CAP Endpoint ] ──(No JWT)──► Redirect to SAP Cloud Identity / XSUAA
       │
       ▼ (2. Authenticate & Issue Signed JWT)
[ SAP Cloud Identity Services (IAS) / Corporate IdP ]
       │
       ▼ (3. Returns Bearer JWT with Scopes: FinanceAnalyst, FinanceManager)
[ User Client ] ──(Bearer JWT)──► [ CAP Backend AuthGuard ]
                                        │
                                        ▼ (4. Validate Signature & Scopes)
                                  [ Authorized Operation ]
```

---

### 2. Scopes, Role Templates, and Role Collections

Defined in [`apps/cap/xs-security.json`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/xs-security.json):

#### Scopes
- `$XSAPPNAME.FinanceAnalyst`: Allows users to query approved metrics, view dashboard KPI widgets, and view charts.
- `$XSAPPNAME.FinanceManager`: Allows users to submit new natural-language requests, update layout definitions, and archive dashboards.
- `$XSAPPNAME.TenantAdmin`: Allows administrators to configure workspaces, destinations, and review audit logs.

#### Role Templates & Role Collections
Role Collections group role templates into user-assignable bundles in the SAP BTP Cockpit:

| Role Collection | Assigned Role Templates | Intended Business Persona |
| :--- | :--- | :--- |
| **`SriaFinanceAnalyst`** | `FinanceAnalyst` | Financial Analysts, Accountants, Operations Reviewers. |
| **`SriaFinanceManager`** | `FinanceAnalyst`, `FinanceManager` | Finance Directors, Controllers, FP&A Leads. |
| **`SriaTenantAdministrator`**| `TenantAdmin` | IT Administrators, Cloud DevOps Engineers. |

---

### 3. Administrator Setup Steps in BTP Cockpit

1. **Deploy Security Configuration**:
   ```bash
   cf create-service xsuaa application sria-xsuaa -c xs-security.json
   ```
2. **Assign Role Collections to Users**:
   - In BTP Cockpit, navigate to **Security** → **Users**.
   - Select the target user email (e.g., `analyst@company.com`).
   - Under **Role Collections**, click **Assign Role Collection**.
   - Select `SriaFinanceAnalyst` or `SriaFinanceManager` and click **Assign**.
3. **Corporate Identity Provider (IdP) Federation**:
   - If using Azure AD, Okta, or SAP Cloud Identity Services, configure user group mappings under **Trust Configuration** → **Role Collection Mappings**.

