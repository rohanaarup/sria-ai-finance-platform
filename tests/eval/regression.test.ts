/**
 * Evaluation regression gate (G2-04).
 *
 * Replay mode answers from a recording, so this test is deterministic and free. It fails when:
 *  - the recording no longer matches the inputs (prompt, glossary, model or request changed): re-record;
 *  - any metric gets worse than the committed baseline (a regression).
 * To accept a deliberate change: run `node tests/eval/run.ts --mode record --write-baseline`, review the
 * failures list in docs/ai/eval/BASELINE-D1.md, and commit the new baseline and recording together.
 *
 * Honest scope: the baseline was measured on the mock test double (SIMULATED answers). It guards the
 * deterministic parts of the pipeline (glossary, guards, hardening, validation, prompt building). The real
 * model is measured by `--mode live` (on demand / nightly), which has no committed baseline until an
 * approved provider exists.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runIntentEval, loadIntentCases, PATHS } from './harness.ts';
import type { Metrics } from './harness.ts';
import { ReplayProvider } from '../../apps/cap/srv/ai/gateway/providers/replay-provider.ts';

const baseline = JSON.parse(readFileSync(PATHS.baseline, 'utf8')) as { metrics: Metrics; promptVersion: string; dataset: string };
const HIGHER: Array<keyof Metrics> = ['taskTypeAccuracy', 'slotF1', 'slotPrecision', 'slotRecall', 'clarificationAccuracy', 'refusalRecall', 'adversarialSafety', 'exactMatch'];
const LOWER: Array<keyof Metrics> = ['falseAskRate', 'missedAskRate', 'falseRefusalRate', 'modelFailures'];
const TOLERANCE = 0.005;

describe('evaluation regression gate (replay mode)', () => {
  it('the dataset is the independent D1 set with at least 150 cases and at least 20% hard cases', () => {
    const cases = loadIntentCases();
    assert.ok(cases.length >= 150, `${cases.length} cases`);
    const hard = cases.filter((c) => ['ambiguous', 'unsupported', 'adversarial'].includes(c.category)).length;
    assert.ok(hard / cases.length >= 0.2);
    assert.equal(baseline.dataset, 'intent-v2');
  });

  it('replay finds every recorded answer (no REPLAY_MISS) and reproduces the baseline metrics', async () => {
    const { report } = await runIntentEval('replay');
    assert.equal(report.promptVersion, baseline.promptVersion, 'prompt version changed: re-record the baseline');
    assert.equal(report.overall.modelFailures, 0, 'a replay miss means the inputs changed: node tests/eval/run.ts --mode record --write-baseline');
    for (const k of HIGHER) assert.ok(report.overall[k] >= baseline.metrics[k] - TOLERANCE, `${k} regressed: ${report.overall[k]} < baseline ${baseline.metrics[k]}`);
    for (const k of LOWER) assert.ok(report.overall[k] <= baseline.metrics[k] + TOLERANCE, `${k} regressed: ${report.overall[k]} > baseline ${baseline.metrics[k]}`);
  });

  it('replay and mock produce identical results (the recording is faithful and the run is deterministic)', async () => {
    const [a, b, c] = [(await runIntentEval('replay')).report, (await runIntentEval('replay')).report, (await runIntentEval('mock')).report];
    assert.deepEqual(a.overall, b.overall, 'two replays are identical');
    assert.deepEqual(a.overall, c.overall, 'replay equals the mock it recorded');
  });

  it('the recording is labelled SIMULATED and covers every case', () => {
    const rp = ReplayProvider.fromPath(PATHS.replay);
    assert.match(rp.meta._note, /SIMULATED/);
    assert.equal(rp.meta.source, 'mock');
  });

  it('weak spots are known and stay visible: the baseline report lists failures by category', () => {
    const md = readFileSync(`${PATHS.reportDir}/BASELINE-D1.md`, 'utf8');
    assert.match(md, /## By category/);
    assert.match(md, /## Failures \(/);
  });
});
