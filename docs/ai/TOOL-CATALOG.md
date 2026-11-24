# Approved AI Tool Catalog

**Phase:** 07 — AI Planning, Tool Orchestration & Controlled Execution  
**Status:** ✅ Active & Enforced

---

## 1. Tool Governance Policy

In accordance with system security principles and **ADR-003**:
- The AI is **strictly prohibited** from executing arbitrary SQL, raw OData URLs, shell commands, or arbitrary HTTP webhooks.
- Only tools registered in the `ToolRegistry` with explicit Zod parameter schemas can be invoked.
- All tool executions require server-verified identity context (`organizationId`, `userId`, `userRoles`).
- The model may propose a tool and parameters, but the backend verifies schema validity and user authorization before execution.

---

## 2. Approved Tool: `get_finance_metrics`

### Overview
Retrieves authorized transactional records from the designated `FinanceDataProvider` (mock or S/4HANA OData) and executes deterministic aggregation and margin computations using the backend `CalculationEngine`.

### Tool Definition
- **Tool Name:** `get_finance_metrics`
- **Action Type:** `fetch_records`
- **Backed By:** `FinanceDataProvider` + `CalculationEngine`
- **Output:** Normalized metric values and provenance metadata. **Zero raw accounting records returned or logged.**

### Input Parameter Schema (`GetFinanceMetricsParamsSchema`)

| Parameter | Type | Required? | Constraints | Description |
|---|:---:|:---:|---|---|
| `companyCode` | string | **Yes** | `^[A-Za-z0-9_]{1,10}$` | SAP Company Code (legal entity) |
| `fiscalYear` | integer | **Yes** | `2000` to `2100` | 4-digit fiscal accounting year |
| `fiscalPeriod` | string | No | `^([0-1][0-9]\|20\d{2}-[0-1][0-9])$` | Accounting period (e.g., '01', '02') |
| `metrics` | string[] | **Yes** | Subset of allowlisted metric IDs | Metrics to compute: `total_revenue`, `total_expenses`, `net_profit`, `profit_margin` |

### Output Result Schema

```typescript
export interface GetFinanceMetricsResult {
  companyCode: string;
  fiscalYear: number;
  fiscalPeriod?: string;
  sourceType: 'mock' | 's4hana';
  isSynthetic: boolean;
  recordCount: number;
  calculatedAt: string;
  metrics: {
    metricId: string;
    label: string;
    value: number;
    formattedValue: string;
    currency: string;
    isZeroDenominator?: boolean;
  }[];
}
```

---

## 3. Disallowed Tool Signatures (Rejected at Registry Boundary)

The following tool calls are strictly intercepted and rejected by `ToolRegistry.execute()`:

| Tool Name | Action Taken | Rationale |
|---|---|---|
| `execute_arbitrary_sql` | Throws Error | Prevents SQL injection and unauthorized data access |
| `run_shell_command` | Throws Error | Prevents remote code execution |
| `fetch_arbitrary_url` | Throws Error | Prevents SSRF attacks and data exfiltration |
| `query_sap_table` | Throws Error | Direct table queries bypass SAP business authorization |
