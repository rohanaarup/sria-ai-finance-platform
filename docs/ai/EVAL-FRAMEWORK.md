# Evaluation framework (G2-04)

- **Datasets** (`tests/eval/datasets/`): `intent-v2.jsonl` (212 cases), `injection-v1.jsonl` (52 cases). AI-drafted, **pending Finance review**. Written independently of the mock model so scores are not circular.
- **Harness** (`tests/eval/harness.ts`, run with `node tests/eval/run.ts`): task-type accuracy, slot precision/recall/F1, clarification accuracy, false-ask and missed-ask rates, refusal recall, false-refusal rate, adversarial safety, exact match.
- **Modes**: `mock`, `record` (writes a replay file), `replay` (plays it back; deterministic), `live` (opt-in, needs an approved provider).
- **Regression gate**: `tests/eval/baseline.json` is compared in replay mode; a drop fails `regression.test.ts`.
- **Injection suite**: runs against the mock and against a deliberately compromised model that obeys every attack; no attack may produce an executable or leaking result.

## Baseline (mock model, SIMULATED, prompt 2.0.1)

| Metric | Value |
|---|---|
| Cases | 212 |
| Task-type accuracy | 89.6% |
| Slot F1 | 97.5% |
| Clarification accuracy | 87.6% |
| Refusal recall | 95.4% |
| False refusal | 5.9% |
| Adversarial safety | 100% |
| Exact match | 82.5% |

These measure the mock, not a real model. Weak areas: explain, modify and variance categories. Real-model numbers require an approved provider.
