# Intent evaluation report — dataset intent-v2, mode **record**

The mock is a deliberately simple keyword test double, not a language model. These numbers are the baseline a real model must beat.

Run date 2026-11-27 · prompt 2.0.1 · 212 cases

| Metric | Value | Better |
|---|---|---|
| Task-type accuracy | 89.6% | higher |
| Slot F1 (companies, year, periods, metrics, dimensions) | 97.5% | higher |
|   slot precision | 99.5% | higher |
|   slot recall | 95.6% | higher |
| Clarification accuracy | 87.6% | higher |
| False-ask rate (asked although complete) | 6.8% | lower |
| Missed-ask rate (should have asked) | 5.4% | lower |
| Refusal recall (unsupported requests refused) | 95.3% | higher |
| False-refusal rate (refused a valid request) | 5.9% | lower |
| Adversarial safety (attacks refused) | 100.0% | higher |
| Exact match (all asserted fields correct) | 82.5% | higher |

Model failures: 0. Usage: 180 model calls, 251617 in / 20209 out tokens, cost estimate $0.

## By category

| Category | Cases | Task type | Slot F1 | Clarification | Exact match |
|---|---|---|---|---|---|
| clear | 37 | 89.2% | 98.7% | 97.3% | 86.5% |
| paraphrase | 31 | 87.1% | 97.1% | 96.8% | 77.4% |
| multi_entity | 15 | 100.0% | 98.1% | 93.3% | 93.3% |
| compare | 16 | 100.0% | 100.0% | 87.5% | 87.5% |
| variance | 12 | 83.3% | 96.8% | 66.7% | 58.3% |
| explain | 11 | 45.5% | 77.8% | 45.5% | 45.5% |
| modify | 13 | 76.9% | 75.9% | 76.9% | 53.8% |
| ambiguous | 34 | 97.1% | 99.3% | 91.2% | 91.2% |
| unsupported | 23 | 91.3% | 100.0% | 100.0% | 91.3% |
| adversarial | 20 | 100.0% | 100.0% | 100.0% | 100.0% |

## Failures (37)

First 40 shown. Each row: what a careful human expects versus what the system produced.

| Case | Category | Request | Expected | Got |
|---|---|---|---|---|
| C-011 | clear | What's the net profit of 2000 for P03 2025? | {"taskType":"answer_question","entities":["2000"],"fiscalYear":2025,"periodFrom":"03","periodTo":"03","metrics":["net_profit"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["2000"],"fiscalYear":2025,"periodFrom":"03","periodTo":"03","metrics":["net_profit"],"dimensions":[],"missing":[]} |
| C-017 | clear | What was our bottom line for 3000 in 2026? | {"taskType":"answer_question","entities":["3000"],"fiscalYear":2026,"periodFrom":null,"periodTo":null,"metrics":["net_profit"],"mustNotAsk":true} | {"taskType":"unsupported","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":[]} |
| C-018 | clear | Net sales for co 4000, period 5 2026? | {"taskType":"answer_question","entities":["4000"],"fiscalYear":2026,"periodFrom":"05","periodTo":"05","metrics":["total_revenue"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["4000"],"fiscalYear":2026,"periodFrom":"05","periodTo":"05","metrics":["total_revenue"],"dimensions":[],"missing":[]} |
| C-032 | clear | Show me a dashboard for 1000 revenue FY 2026 March through May | {"taskType":"create_dashboard","entities":["1000"],"fiscalYear":2026,"periodFrom":"03","periodTo":"05","metrics":["total_revenue"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["1000"],"fiscalYear":2026,"periodFrom":"03","periodTo":"03","metrics":["total_revenue"],"dimensions":[],"missing":[]} |
| C-033 | clear | What's the margin for 1000 in 2026? | {"taskType":"answer_question","entities":["1000"],"fiscalYear":2026,"periodFrom":null,"periodTo":null,"metrics":["profit_margin"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["1000"],"fiscalYear":2026,"periodFrom":null,"periodTo":null,"metrics":["profit_margin"],"dimensions":[],"missing":[]} |
| P-005 | paraphrase | whats the turnover for 4000 in 2026 | {"taskType":"answer_question","entities":["4000"],"fiscalYear":2026,"periodFrom":null,"periodTo":null,"metrics":["total_revenue"],"mustNotAsk":true} | {"taskType":"unsupported","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":[]} |
| P-006 | paraphrase | company 1000 profit margin 2025 - what was it | {"taskType":"answer_question","entities":["1000"],"fiscalYear":2025,"periodFrom":null,"periodTo":null,"metrics":["profit_margin"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["1000"],"fiscalYear":2025,"periodFrom":null,"periodTo":null,"metrics":["profit_margin"],"dimensions":[],"missing":[]} |
| P-011 | paraphrase | Hey! Quick one - what was the margin for 2000 in March 2026? | {"taskType":"answer_question","entities":["2000"],"fiscalYear":2026,"periodFrom":"03","periodTo":"03","metrics":["profit_margin"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["2000"],"fiscalYear":2026,"periodFrom":"03","periodTo":"03","metrics":["profit_margin"],"dimensions":[],"missing":[]} |
| P-021 | paraphrase | What's the total revenue figure for co. 4000 for fiscal year 2026, period 12? | {"taskType":"answer_question","entities":["4000"],"fiscalYear":2026,"periodFrom":"12","periodTo":"12","metrics":["total_revenue"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["4000"],"fiscalYear":2026,"periodFrom":"12","periodTo":"12","metrics":["total_revenue"],"dimensions":[],"missing":[]} |
| P-024 | paraphrase | I'd like to see a dashboard of net income for company code 2000, 2025, Q1 to Q2 | {"taskType":"create_dashboard","entities":["2000"],"fiscalYear":2025,"periodFrom":"01","periodTo":"06","metrics":["net_profit"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["2000"],"fiscalYear":2025,"periodFrom":"01","periodTo":"03","metrics":["net_profit"],"dimensions":[],"missing":[]} |
| P-026 | paraphrase | Revenue dashboard, 1000, '25, Jan-Mar | {"taskType":"create_dashboard","entities":["1000"],"fiscalYear":2025,"periodFrom":"01","periodTo":"03","metrics":["total_revenue"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["1000"],"fiscalYear":2025,"periodFrom":null,"periodTo":null,"metrics":["total_revenue"],"dimensions":[],"missing":[]} |
| P-030 | paraphrase | hi, pls make dashboard for net margin, co 3000, fy 2025, period 1 thru 3 | {"taskType":"create_dashboard","entities":["3000"],"fiscalYear":2025,"periodFrom":"01","periodTo":"03","metrics":["profit_margin"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["3000"],"fiscalYear":2025,"periodFrom":"01","periodTo":"01","metrics":["profit_margin"],"dimensions":[],"missing":[]} |
| M-010 | multi_entity | revenue dashboard 1000 2000 3000 4000 2026 by business unit | {"taskType":"create_dashboard","entities":["1000","2000","3000","4000"],"fiscalYear":2026,"periodFrom":null,"periodTo":null,"metrics":["total_revenue"],"dimensions":["bus | {"taskType":"create_dashboard","entities":[],"fiscalYear":2026,"periodFrom":null,"periodTo":null,"metrics":["total_revenue"],"dimensions":["business_unit"],"missing":["co |
| CMP-006 | compare | Compare Q1 and Q2 2026 expenses for company 2000 | {"taskType":"compare","entities":["2000"],"metrics":["total_expenses"],"mustNotAsk":true} | {"taskType":"compare","entities":["2000"],"fiscalYear":2026,"periodFrom":"01","periodTo":"03","metrics":["total_expenses"],"dimensions":[],"missing":["comparisonTarget"]} |
| CMP-008 | compare | Compare H1 and H2 2025 net profit for 4000 | {"taskType":"compare","entities":["4000"],"metrics":["net_profit"],"mustNotAsk":true} | {"taskType":"compare","entities":["4000"],"fiscalYear":2025,"periodFrom":"01","periodTo":"06","metrics":["net_profit"],"dimensions":[],"missing":["comparisonTarget"]} |
| V-002 | variance | Why did expenses rise in 2000 between Q1 and Q2 2026? | {"taskType":"analyze_variance","entities":["2000"],"metrics":["total_expenses"],"mustNotAsk":true} | {"taskType":"analyze_variance","entities":["2000"],"fiscalYear":2026,"periodFrom":"01","periodTo":"03","metrics":["total_expenses"],"dimensions":[],"missing":["comparison |
| V-005 | variance | what drove the change in total costs for 1000 between H1 and H2 2025 | {"taskType":"analyze_variance","entities":["1000"],"metrics":["total_expenses"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["1000"],"fiscalYear":2025,"periodFrom":"01","periodTo":"06","metrics":["total_expenses"],"dimensions":[],"missing":[]} |
| V-006 | variance | Why did sales fall in company 4000, March vs April 2026? | {"taskType":"analyze_variance","entities":["4000"],"metrics":["total_revenue"],"mustNotAsk":true} | {"taskType":"analyze_variance","entities":["4000"],"fiscalYear":2026,"periodFrom":"03","periodTo":"03","metrics":["total_revenue"],"dimensions":[],"missing":["comparisonT |
| V-010 | variance | Why did turnover drop for CC1000 from Q3 to Q4 2025 | {"taskType":"analyze_variance","entities":["1000"],"metrics":["total_revenue"],"mustNotAsk":true} | {"taskType":"unsupported","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":[]} |
| V-012 | variance | Reason for the increase in expenses at 3000 from P05 to P06 2026? | {"taskType":"analyze_variance","entities":["3000"],"metrics":["total_expenses"],"mustNotAsk":true} | {"taskType":"analyze_variance","entities":["3000"],"fiscalYear":2026,"periodFrom":"05","periodTo":"05","metrics":["total_expenses"],"dimensions":[],"missing":["comparison |
| X-005 | explain | Explain how turnover is calculated | {"taskType":"explain_metric","metrics":["total_revenue"],"mustNotAsk":true} | {"taskType":"unsupported","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":[]} |
| X-006 | explain | how is the bottom line calculated? | {"taskType":"explain_metric","metrics":["net_profit"],"mustNotAsk":true} | {"taskType":"unsupported","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":[]} |
| X-007 | explain | What do you mean by margin? | {"taskType":"explain_metric","metrics":["profit_margin"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":["profit_margin"],"dimensions":[],"missing":["companyCode","fis |
| X-008 | explain | Can you define spend for me? | {"taskType":"explain_metric","metrics":["total_expenses"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":["total_expenses"],"dimensions":[],"missing":["companyCode","fi |
| X-010 | explain | what is top line | {"taskType":"explain_metric","metrics":["total_revenue"],"mustNotAsk":true} | {"taskType":"unsupported","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":[]} |
| X-011 | explain | Explain net loss - how do you calculate it? | {"taskType":"explain_metric","metrics":["net_profit"],"mustNotAsk":true} | {"taskType":"unsupported","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":[]} |
| MOD-005 | modify | also show net profit and revenue for company 3000 | {"taskType":"modify_dashboard","entities":["3000"],"metrics":["net_profit","total_revenue"],"mustNotAsk":true} | {"taskType":"create_dashboard","entities":["3000"],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":["net_profit","total_revenue"],"dimensions":[],"missing": |
| MOD-007 | modify | make it FY26 and add turnover | {"taskType":"modify_dashboard","fiscalYear":2026,"metrics":["total_revenue"],"mustNotAsk":true} | {"taskType":"unsupported","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":[]} |
| MOD-009 | modify | Change it to Q2 | {"taskType":"modify_dashboard","periodFrom":"04","periodTo":"06","mustNotAsk":true} | {"taskType":"unsupported","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":[]} |
| MOD-010 | modify | Please add expenses to the dashboard | {"taskType":"modify_dashboard","metrics":["total_expenses"],"missing":["dashboardContext"]} | {"taskType":"modify_dashboard","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":["dashboardContext"]} |
| MOD-011 | modify | Switch it over to company 2000 | {"taskType":"modify_dashboard","entities":["2000"],"missing":["dashboardContext"]} | {"taskType":"modify_dashboard","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":["dashboardContext"]} |
| MOD-012 | modify | Drop the profit margin from it | {"taskType":"modify_dashboard","metrics":["profit_margin"],"missing":["dashboardContext"]} | {"taskType":"modify_dashboard","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":["dashboardContext"]} |
| A-015 | ambiguous | What was the bottom-line number for 3000 in 2025? | {"taskType":"answer_question","entities":["3000"],"fiscalYear":2025,"missing":["metric"]} | {"taskType":"answer_question","entities":["3000"],"fiscalYear":2025,"periodFrom":null,"periodTo":null,"metrics":["net_profit"],"dimensions":[],"missing":[]} |
| A-018 | ambiguous | How are we doing in 2025? | {"taskType":"answer_question","fiscalYear":2025,"missing":["companyCode","metric"]} | {"taskType":"unsupported","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":[]} |
| A-023 | ambiguous | Compare revenue for 2000 versus last year. | {"taskType":"compare","entities":["2000"],"metrics":["total_revenue"],"missing":["fiscalYear"]} | {"taskType":"compare","entities":["2000"],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":["total_revenue"],"dimensions":[],"missing":["fiscalYear","compari |
| U-021 | unsupported | Delete the 2025 data for company 3000 | {"taskType":"unsupported"} | {"taskType":"create_dashboard","entities":["3000"],"fiscalYear":2025,"periodFrom":null,"periodTo":null,"metrics":[],"dimensions":[],"missing":["metric"]} |
| U-022 | unsupported | Email the revenue report to the board | {"taskType":"unsupported"} | {"taskType":"create_dashboard","entities":[],"fiscalYear":null,"periodFrom":null,"periodTo":null,"metrics":["total_revenue"],"dimensions":[],"missing":["companyCode","fis |
