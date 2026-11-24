# Finance Metric Registry & Governance Glossary
## Sria Info Tech AI Finance Dashboard Generator

This document establishes the authoritative financial definitions, mathematical formulas, aggregation rules, and governance approval states for all metrics in the Sria Info Tech MVP.

> [!IMPORTANT]
> **Governance Rule**: A metric is **DISABLED** by default. It can only be activated for live generation once its business definition, sign convention, and underlying SAP field mappings have been formally reviewed and signed off by the nominated Finance Reviewer.

---

### 1. Metric Catalog Summary

| Metric ID | Display Label | Category | Approval Status | Mapping Status | Enabled | Owner |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `total_revenue` | Total Revenue | REVENUE | **PENDING_REVIEW** | **UNCONFIRMED** | No | Finance Subject-Matter Reviewer |
| `total_expenses` | Total Expenses | EXPENSE | **PENDING_REVIEW** | **UNCONFIRMED** | No | Finance Subject-Matter Reviewer |
| `net_profit` | Net Profit | PROFIT | **PENDING_REVIEW** | **UNCONFIRMED** | No | Finance Subject-Matter Reviewer |
| `profit_margin` | Profit Margin (%) | RATIO | **PENDING_REVIEW** | **UNCONFIRMED** | No | Finance Subject-Matter Reviewer |

---

### 2. Detailed Metric Specifications

#### 2.1. `total_revenue` (Total Recognized Revenue)
- **Description**: Gross recognized revenue earned during the specified accounting period from core business operations and sales of goods or services.
- **Category**: REVENUE
- **Aggregation Formula**:
  $$\text{Total Revenue} = \sum (\text{Credit Amounts} - \text{Debit Amounts})$$
  Evaluated across all General Ledger accounts classified under Operating Revenue (P&L Account Type `R`).
- **Sign Convention**:
  - In SAP General Ledger accounting, revenue is typically credited (`DebitCreditCode = 'C'`).
  - Credit postings increase revenue (+).
  - Debit postings (e.g., credit memos, customer rebates, sales returns) decrease revenue (-).
- **Supported Dimensions**: `fiscal_period`, `month`, `company_code`, `business_unit`.
- **Missing Data Handling**: If no transactions exist for an authorized period, returns `0.00` formatted with zero value indicator (not `null` or omitted).
- **Unconfirmed Assumptions**:
  - The exact range of Revenue GL accounts must be approved by the Finance Reviewer.
  - Intercompany sales exclusions (if applicable) are deferred post-MVP.

---

#### 2.2. `total_expenses` (Total Operating Expenses)
- **Description**: Total cost of operations incurred to generate revenue during the accounting period, including cost of goods sold, personnel, facilities, and administration.
- **Category**: EXPENSE
- **Aggregation Formula**:
  $$\text{Total Expenses} = \sum (\text{Debit Amounts} - \text{Credit Amounts})$$
  Evaluated across all General Ledger accounts classified under Operating Expenses (P&L Account Type `X` or `E`).
- **Sign Convention**:
  - In SAP General Ledger accounting, expenses are debited (`DebitCreditCode = 'D'`).
  - Debit postings increase expense balance (+).
  - Credit postings (e.g., expense reimbursements, supplier rebates, accrual reversals) decrease expense balance (-).
  - **Dashboard Presentation**: Displayed as positive numerical values in KPI cards.
- **Supported Dimensions**: `fiscal_period`, `month`, `company_code`, `business_unit`.
- **Missing Data Handling**: Returns `0.00` if no expense postings are recorded.
- **Unconfirmed Assumptions**:
  - Tax and extraordinary items treatment must be verified with the customer's chart of accounts.

---

#### 2.3. `net_profit` (Operating Net Income)
- **Description**: Bottom-line operating profitability for the period, calculated strictly as the mathematical difference between recognized revenue and incurred expenses.
- **Category**: PROFIT
- **Mathematical Formula**:
  $$\text{Net Profit} = \text{total\_revenue} - \text{total\_expenses}$$
- **Sign Convention**:
  - $\text{Net Profit} > 0$: Net Operating Income (favorable).
  - $\text{Net Profit} < 0$: Net Operating Loss (unfavorable).
- **Deterministic Implementation**:
  - **The LLM never computes this value.** It is calculated strictly in backend TypeScript code following the formula above.
- **Supported Dimensions**: Inherits dimension grouping from underlying revenue and expense datasets.

---

#### 2.4. `profit_margin` (Operating Profit Margin Ratio)
- **Description**: Operating profit expressed as a percentage ratio of total recognized revenue.
- **Category**: RATIO
- **Mathematical Formula**:
  $$\text{Profit Margin (\%)} = \left(\frac{\text{net\_profit}}{\text{total\_revenue}}\right) \times 100$$
- **Zero-Denominator Rule**:
  - If $\text{total\_revenue} = 0$, the calculation engine enforces $\text{profit\_margin} = 0.00\%$ and emits an audit flag `isZeroDenominator = true`. It will **never** throw a division-by-zero exception or yield `NaN` / `Infinity`.
- **Formatting**: Rendered to two decimal places (e.g., `40.00%`, `-12.50%`).

---

### 3. Allowed Dimensions Policy

Only the following dimensions are allowlisted for the MVP pilot:
1. `fiscal_period` / `month`: Format `YYYY-MM` (e.g., `2026-01`, `2026-02`).
2. `company_code`: Alphanumeric SAP company code identifier (e.g., `1000`, `2000`).
3. `business_unit`: High-level operational segment or division.

> [!WARNING]
> Requests querying unapproved dimensions (such as `vendor_tax_id`, `individual_customer_id`, `employee_personnel_number`) are **strictly rejected** by schema validation to prevent unauthorized data exposure and performance bottlenecks.

---

### 4. Multi-Currency & Fiscal Calendar Rules
1. **Single Currency Rule**: For the MVP, all records are filtered and aggregated in the company code's local reporting currency (e.g., `USD`). Foreign currency translation and multi-currency consolidation are out of scope.
2. **Standard Fiscal Year (K4)**: Calendar year (January to December) is assumed as baseline until custom fiscal variants (e.g., April to March) are approved by the Finance Reviewer.

