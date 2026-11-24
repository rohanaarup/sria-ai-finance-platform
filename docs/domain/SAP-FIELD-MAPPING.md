# S/4HANA OData Field Mapping Worksheet
## Sria Info Tech AI Finance Dashboard Generator

This worksheet documents the technical contract mapping between the Sria Info Tech domain model and SAP S/4HANA Finance OData entities.

> [!CAUTION]
> **Live Integration Gate Status**: **BLOCKED / UNCONFIRMED**
> No live SAP S/4HANA endpoint or BTP communication arrangement has been connected yet. All field definitions below represent the verified standard SAP candidate schema (`API_JOURNALENTRYITEMBASIC_SRV` / `I_JournalEntryItemBasic`) and must be validated against the customer's actual SAP system in Phase 05.

---

### 1. Target SAP Source Candidate

- **Candidate API**: SAP S/4HANA Cloud / On-Premise Standard OData Service
- **Service Name**: `API_JOURNALENTRYITEMBASIC_SRV`
- **Primary Entity Set**: `A_JournalEntryItemBasic` or CDS View `I_JournalEntryItemBasic`
- **Protocol**: OData v2 / v4 over HTTPS
- **Access Pattern**: On-demand parameterized query (no bulk ETL replication)

---

### 2. Entity Field Mapping Matrix

| Sria Info Tech DTO Field | Target Type | SAP Candidate Property | OData EDM Type | Notes & Transformation |
| :--- | :--- | :--- | :--- | :--- |
| `recordId` | `string` | `concat(AccountingDocument, LedgerGrc, FiscalYear)` | `Edm.String` | Unique transaction compound key |
| `companyCode` | `string` | `CompanyCode` | `Edm.String` | e.g. `1000`, `2000` |
| `fiscalYear` | `number` | `FiscalYear` | `Edm.String` | Parsed to integer (e.g. `2026`) |
| `fiscalPeriod` | `string` | `FiscalPeriod` | `Edm.String` | e.g. `001` normalized to `01` |
| `postingDate` | `string` | `PostingDate` | `Edm.DateTime` | Formatted to ISO `YYYY-MM-DD` |
| `glAccount` | `string` | `GLAccount` | `Edm.String` | G/L Account number (e.g. `0000410000`) |
| `accountType` | `enum` | `GLAccountType` / Chart of Accounts | `Edm.String` | Classified as `REVENUE` or `EXPENSE` based on GL range |
| `amount` | `number` | `AmountInCompanyCodeCurrency` | `Edm.Decimal` | Raw decimal amount |
| `currency` | `string` | `CompanyCodeCurrency` | `Edm.String` | 3-letter ISO currency code (`USD`, `EUR`) |
| `debitCredit` | `enum` | `DebitCreditCode` | `Edm.String` | `'D'` (Debit) or `'C'` (Credit) |
| `businessUnit` | `string` | `Segment` or `CostCenter` | `Edm.String` | Organizational division mapping |

---

### 3. Metric Derivation Logic from SAP Source

#### A. Total Revenue (`total_revenue`)
- **OData Filter Expression Candidate**:
  ```odata
  $filter=CompanyCode eq '{companyCode}' and FiscalYear eq '{fiscalYear}' and GLAccountType eq 'R'
  ```
- **Backend Derivation**:
  - Filter for Revenue GL accounts.
  - If `DebitCreditCode eq 'C'` $\rightarrow$ Add `AmountInCompanyCodeCurrency`
  - If `DebitCreditCode eq 'D'` $\rightarrow$ Subtract `AmountInCompanyCodeCurrency` (returns/reversals)

#### B. Total Expenses (`total_expenses`)
- **OData Filter Expression Candidate**:
  ```odata
  $filter=CompanyCode eq '{companyCode}' and FiscalYear eq '{fiscalYear}' and GLAccountType eq 'X'
  ```
- **Backend Derivation**:
  - Filter for Expense GL accounts.
  - If `DebitCreditCode eq 'D'` $\rightarrow$ Add `AmountInCompanyCodeCurrency`
  - If `DebitCreditCode eq 'C'` $\rightarrow$ Subtract `AmountInCompanyCodeCurrency` (refunds/deductions)

#### C. Net Profit & Margin
- Derived purely in memory within the CAP backend calculation engine. No SAP field queried.

---

### 4. Open Questions for Human SAP Administrator & Finance Reviewer

1. **Exact API Release**: Is the target S/4HANA system Cloud (Public/Private) or 2020+ On-Premise?
2. **Account Classification**: Does the customer use `GLAccountType` (`R` for revenue, `X` for expense), or is classification driven by specific G/L Account Number ranges?
3. **Leading Ledger**: Should queries restrict to the leading ledger (e.g., `0L`) to avoid duplicate local ledger postings?
4. **Communication User**: Will the BTP Destination authenticate via Basic Auth, OAuth2 SAML Bearer, or Principal Propagation?
