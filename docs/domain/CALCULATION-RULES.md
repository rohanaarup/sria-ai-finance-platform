# Deterministic Finance Calculation & Normalization Rules

**Phase:** 08 — Deterministic Finance Processing & DashboardSpec Compiler  
**Status:** ✅ Active & Tested  
**Enforcement:** Code-level deterministic execution (LLM arithmetic strictly forbidden per ADR-003)

---

## 1. Approved Accounting Formulas

All calculations consume normalized `FinanceRecord` DTOs and execute in [apps/cap/srv/finance/calculations/](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/finance/calculations/).

| Metric ID | Label | Mathematical Aggregation Rule | SAP Sign Convention |
|---|---|---|---|
| `total_revenue` | Total Revenue | $\sum (\text{Amount}_{C}) - \sum (\text{Amount}_{D})$ for `accountType == 'REVENUE'` | **Credit ('C'):** Revenue addition.<br>**Debit ('D'):** Revenue deduction/return. |
| `total_expenses` | Total Expenses | $\sum (\text{Amount}_{D}) - \sum (\text{Amount}_{C})$ for `accountType == 'EXPENSE'` | **Debit ('D'):** Expense addition.<br>**Credit ('C'):** Expense deduction/refund. |
| `net_profit` | Net Profit | $\text{total\_revenue} - \text{total\_expenses}$ | **Positive:** Net income.<br>**Negative:** Operating loss. |
| `profit_margin` | Profit Margin (%) | $\frac{\text{net\_profit}}{\text{total\_revenue}} \times 100$ | **Zero Denominator:** Returns `0.00%` with flag `isZeroDenominator: true`. |

---

## 2. Missing Data vs. Zero Value Distinction

To prevent misleading financial reporting, the normalization engine ([normalization.ts](file:///c:/Users/darla/OneDrive/Desktop/SAP,AI%20project/apps/cap/srv/finance/normalization.ts)) distinguishes three distinct states:

| State | Condition | UI Display Meaning |
|---|---|---|
| `AVAILABLE` | Records exist, computed value $\neq 0$ | Standard formatted currency/percentage value. |
| `ZERO_VALUE` | Records exist, but computed sum equals $0.00$ | Displays `$0.00` or `0.00%` (e.g., zero revenue or break-even profit). |
| `MISSING_DATA` | Zero transactions exist for the selected period/company | Displays `N/A` or "No Data Recorded" (prevents falsely stating balance is zero). |

---

## 3. Currency Consistency Guard

- **Rule:** The system **never silently converts or sums across different currencies** without an approved exchange-rate table from the Finance reviewer.
- If a query retrieves transactions with mixed currencies (e.g., USD and EUR), `normalizeAndInspectRecords()` raises `hasMixedCurrencies: true` and isolates records by currency group.

---

## 4. Provenance & Audit Metadata

Every compiled metric attaches provenance metadata:
- `sourceType`: `'mock'` (local synthetic) or `'s4hana'` (live BTP OData)
- `sourceSystem`: System identifier or fixture label
- `retrievedAt`: ISO 8601 retrieval timestamp
- `calculationVersion`: Version of the calculation logic (`1.0.0`)
- `appliedFilters`: Exact filters applied (`companyCode`, `fiscalYear`, `fiscalPeriod`)
- `isSynthetic`: Boolean indicator for auditability
