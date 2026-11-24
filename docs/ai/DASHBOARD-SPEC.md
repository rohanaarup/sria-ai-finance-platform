# DashboardSpec Document Specification & Widget Catalog

**Phase:** 08 — Deterministic Finance Processing & DashboardSpec Compiler  
**Schema Definition:** [`packages/contracts/src/dashboard-spec.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/packages/contracts/src/dashboard-spec.ts)  
**Compiler Implementation:** [`apps/cap/srv/dashboard/dashboard-spec-compiler.ts`](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/dashboard/dashboard-spec-compiler.ts)

---

## 1. Architectural Philosophy (ADR-007)

Rather than allowing an LLM to generate raw HTML, JavaScript, or dynamic JSX (which introduces severe Cross-Site Scripting vulnerabilities and UI rendering bugs), the AI engine compiles into a **strictly validated JSON schema** called `DashboardSpec`.

The React frontend simply receives this JSON and renders pre-built, hardened React components.

---

## 2. DashboardSpec Structure (v1.0)

```typescript
export interface DashboardSpec {
  version: '1.0';
  dashboardId: string;           // UUID
  title: string;                 // Human-readable title
  description?: string;          // Optional context
  organizationId: string;        // Server-verified tenant
  createdAt: string;             // ISO datetime
  generatedBy: string;           // User ID
  widgets: DashboardWidgetSpec[];// Allowlisted visual components
  results?: MetricResult[];      // Grounded numerical figures
  dataProvenance: ProvenanceMetadata; // Complete audit trail
  freshnessNotice?: string;      // User-facing freshness label
}
```

---

## 3. Allowlisted Widget Visual Types

Only four widget types are permitted in `DashboardWidgetSpec.type`:

| Widget Type | Ideal Data Shape | Rendering Behavior |
|---|---|---|
| `kpi_card` | Single KPI metric | Displays large formatted figure, label, variance, and status. |
| `bar_chart` | 2+ comparative metrics or period breakdowns | Vertical bar comparison with theme coloring (`terracotta`, `rust`, etc.). |
| `line_chart` | Time-series trends over fiscal periods | Line trend visualization across periods. |
| `table` | Tabular financial breakdown | Detailed row-by-row accounting ledger summary. |

---

## 4. Security & XSS Immunity

- **Zero Dynamic Code Execution:** No `eval()`, `new Function()`, or `dangerouslySetInnerHTML`.
- **Schema Strictness:** Any unexpected fields or unknown widget types are rejected by Zod validation during compilation.
- **Auditable Provenance:** Every metric result and widget is linked directly to source system metadata.
