# Evaluation datasets (G2-04)

Files:
- `intent-v2.jsonl`: 212 `EvalCase` lines (schema `EvalCaseSchema`, `packages/contracts/src/eval-case.ts`).
- `injection-v1.jsonl`: 52 `InjectionCase` lines (schema `InjectionCaseSchema`).
- `../datasets.test.ts`: validates both files (`node --test tests/eval/datasets.test.ts`).

## Status and review requirement

These datasets were **drafted by an AI assistant** (Claude) and must be **reviewed and extended by Finance and engineering before they are treated as authoritative**. Until then, a pass rate against them is indicative, not a release gate.

## How they were authored

Written by hand from the business specification (governed metrics, glossary terms, company codes 1000-4000, fiscal years 2025/2026, calendar fiscal variant, policy rules below) and the governed vocabulary CSV (`apps/cap/db/data/sria.finance-GlossaryTerms.csv`). They were deliberately **not** derived from the rules of the system under test: the author did not read the mock provider, the intent service or the earlier fixture, and did not run any system against the cases. This addresses finding F-10 (circular intent evaluation). Prompts are written in varied staff styles (typos, abbreviations, "CC1000", "FY26", "'26", "P03", terse and polite forms, multi-sentence prompts) and include numbers that are not slots (document numbers, "5 million", ticket numbers).

## Policy rules the expectations follow

a. Task types: dashboard/overview/report -> `create_dashboard`; one specific value -> `answer_question`; "compare / versus / vs" -> `compare`; "why did ... change" -> `analyze_variance`; "what is / how is ... calculated / define" -> `explain_metric` (no entities or period, must not ask); changing an open dashboard -> `modify_dashboard`.
b. Missing information is never guessed. No company code -> `companyCode`; no year -> `fiscalYear`; "all companies / every entity / the group" -> `companyCode`; unanchored relative time ("this year", "last year", "YTD", "recently", "last quarter") -> `fiscalYear`. A year without a period means the whole year (`periodFrom`/`periodTo` null, nothing missing).
c. No metric, or a word that is not a glossary term ("takings", "outgoings", "bottom-line number", "P&L result", "money coming in") -> `metric` missing. No synonym guessing.
d. Any known-unsupported term (EBITDA, churn, cash flow, headcount, forecast/predict/budget, ...), write-back/posting/export, or a non-finance request -> `unsupported` for the whole request, even if a supported metric is also named.
e. `modify_dashboard` with context `{"hasDashboard": true}` carries the stated change; without an open dashboard -> missing `dashboardContext`.
f. `compare` / `analyze_variance` need a basis (two codes, or two periods/years). Absent -> `comparisonTarget`. For period-vs-period cases `fiscalYear` is not asserted.
g. Dimensions are asserted only when the request states one.
h. Adversarial requests -> `unsupported`. Benign requests with odd formatting, markdown, or "ignore" in a finance sense are classified on their merits.
i. Only the fields of `EvalExpectationSchema` are used; `mustNotAsk: true` on complete requests; `entities` and `metrics` are exact sets.

Policy points resolved while authoring (flag for Finance confirmation):
- "Compare X for 2000 versus last year": basis is named but unanchored, so expectation is `compare` with missing `["fiscalYear"]` only (rules b + f combined).
- Two entities in a single `analyze_variance` question ("why did net profit change for 1000 and 2000 in 2026") count as a basis (rule f), and fiscalYear is asserted.
- "Revenue versus expenses" (metric vs metric) is not a comparison basis under rule f; no such case is included because the spec does not say what is intended.
- A prompt that names a company code that does not exist (for example 5000) is not covered by the spec; no such case is included.
- Multi-entity dashboard requests with a stated dimension "split by company" assert `company_code`.
- Short "modify" prompts without context use different wording than their context-bearing twins so that no prompt is duplicated.

## Provenance fields

Every intent case has `provenance`: `author` ("Claude (AI-assisted draft, pending Finance review)"), `authoredAt` (2026-11-27), `method` (`hand-written-from-spec`; `adapted-from-support-style-phrasing` for the paraphrase category; `adversarial-catalogue` for adversarial cases) and an optional `notes` stating the policy rule that decides tricky expectations. Injection cases carry the same fields (without notes).

## Composition

intent-v2: clear 37, paraphrase 31, multi_entity 15, compare 16, variance 12, explain 11, modify 13, ambiguous 34, unsupported 23, adversarial 20 (ambiguous + unsupported + adversarial = 77 of 212, about 36%).

injection-v1: direct 23, indirect_glossary 10, indirect_metric_text 9, indirect_tool_output 10; every attack class appears at least 4 times. For indirect vectors the poisoned text is in `poisonedText` and `prompt` is benign. All credentials, tenant ids and addresses are obviously fake placeholders (`TENANT-FAKE-002`, `<FAKE-TOKEN>`, `example.invalid`); no real people or companies appear.

## Extending

Add cases with unique ids (`C-`, `P-`, `M-`, `CMP-`, `V-`, `X-`, `MOD-`, `A-`, `U-`, `ADV-`, `INJ-`), keep prompts unique, and run the test file. Cases should be written from the policy, not from observed system output.
