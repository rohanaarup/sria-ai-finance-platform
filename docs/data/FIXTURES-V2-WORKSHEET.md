# Synthetic fixtures v2 — hand-verification worksheet (G2-02)

Fixtures: `packages/contracts/src/fixtures/synthetic-fixtures-v2.ts`. All data is synthetic. These totals were worked out by hand from the generation rules and are asserted in `apps/cap/test/data-product.test.ts`. Sign rules: revenue = credits − debits; expenses = debits − credits.

## 3000 Europe (EUR), FY2025, P01–P12
| Line | Rule | Calculation | Total |
|---|---|---|---|
| Revenue credits | 50,000 + 1,000·p | 12 × 50,000 + 1,000 × (1+…+12 = 78) | 678,000 |
| Revenue returns (debits) | 1,500 in P03, P06, P09, P12 | 4 × 1,500 | −6,000 |
| **Total revenue** | | 678,000 − 6,000 | **672,000.00** |
| Operations expenses | 30,000 + 500·p | 12 × 30,000 + 500 × 78 | 399,000 |
| Admin expenses | 4,000 every period | 12 × 4,000 | 48,000 |
| Refund (credit) | 250.50 in P06 | | −250.50 |
| **Total expenses** | | 399,000 + 48,000 − 250.50 | **446,749.50** |
| **Net profit** | revenue − expenses | 672,000 − 446,749.50 | **225,250.50** |
| **Profit margin** | net ÷ revenue × 100 | 225,250.50 ÷ 672,000 × 100 = 33.5194… | **33.52** |

## 3000 Europe (EUR), FY2026, P01–P03
- Revenue: (50,000 + 1,000·p + 2,000) for p = 1..3 = 53,000 + 54,000 + 55,000 = 162,000, minus the P03 return 1,500 → **160,500.00**
- Expenses: (30,000 + 500·p + 4,000) for p = 1..3 = 34,500 + 35,000 + 35,500 → **105,000.00**

## 1000 (USD), FY2025, P01–P12
- Revenue: 12 × 100,000 + 2,000 × 78 = **1,356,000.00**
- Expenses: 12 × 60,000 + 1,000 × 78 = **798,000.00**
- Net profit 558,000; margin 558,000 ÷ 1,356,000 × 100 = 41.150… → **41.15**

## 2000 (USD), FY2025, P01–P12
- Revenue 12 × 40,000 = 480,000; expenses 12 × 45,000 = 540,000; net profit **−60,000.00**

## Multi-entity 1000 + 2000 + 3000, FY2025
- USD total revenue (1000 + 2000): 1,356,000 + 480,000 = **1,836,000.00**
- EUR total revenue (3000): **672,000.00**
- The two currencies are reported separately; no conversion is performed.

## 4000 defect fixture (USD), FY2026, P01–P06 — expected flags
| Period | Defect | Expected flag |
|---|---|---|
| 02 | posting key `V2-4000-2026-02-R1` twice | DUPLICATE_POSTING_KEY |
| 03 | revenue 5,000 C and 5,000 D | ZERO_VALUE (revenue) |
| 04 | 8,000 USD + 2,000 GBP revenue | CURRENCY_MIX; reported as USD 8,000.00 and GBP 2,000.00 |
| 05 | no postings | MISSING_PERIOD |
