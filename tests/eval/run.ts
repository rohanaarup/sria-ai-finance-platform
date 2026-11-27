/**
 * Evaluation runner (G2-04).
 *
 *   node tests/eval/run.ts --mode mock                 run the test double and print the report
 *   node tests/eval/run.ts --mode record               run the mock, save tests/eval/replay/... for CI replay
 *   node tests/eval/run.ts --mode replay               run from the recording (deterministic)
 *   node tests/eval/run.ts --mode live                 run the REAL approved model (needs AI_RUNTIME_PROVIDER, key, model, approval)
 *   options: --out report.md   --json report.json   --limit N   --write-baseline
 *
 * `--write-baseline` stores the metrics as the regression baseline (tests/eval/baseline.json) and the readable
 * report in docs/ai/eval/. Do that only deliberately, after reviewing the failures.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runIntentEval, renderMarkdown, saveRecording, writeFileSafe, PATHS } from './harness.ts';
import type { Mode } from './harness.ts';

const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const mode = (opt('mode') ?? 'mock') as Mode;
if (!['mock', 'record', 'replay', 'live'].includes(mode)) { console.error('--mode must be mock | record | replay | live'); process.exit(2); }

const { report, runner } = await runIntentEval(mode, undefined, { limit: opt('limit') ? Number(opt('limit')) : undefined });
if (mode === 'record') { saveRecording(runner); console.log('recording saved to', PATHS.replay); }
const note = mode === 'live' ? 'Live model run.' : mode === 'replay' ? 'Replay of a recording made from the mock test double (SIMULATED answers).' : 'The mock is a deliberately simple keyword test double, not a language model. These numbers are the baseline a real model must beat.';
const md = renderMarkdown(report, note);
if (opt('out')) writeFileSync(resolve(opt('out')!), md); else console.log(md);
if (opt('json')) writeFileSync(resolve(opt('json')!), JSON.stringify(report, null, 1));
if (args.includes('--write-baseline')) {
  writeFileSafe(PATHS.baseline, JSON.stringify({ _note: 'Regression baseline for dataset intent-v2 measured on the MOCK test double. A change that lowers these numbers fails tests/eval/regression.test.ts.', dataset: report.dataset, mode: 'mock', promptVersion: report.promptVersion, recordedAt: report.ranAt, metrics: report.overall }, null, 2) + '\n');
  writeFileSafe(resolve(PATHS.reportDir, 'BASELINE-D1.md'), md);
  console.log('baseline written');
}
console.error(`${mode}: ${report.overall.cases} cases · task type ${(report.overall.taskTypeAccuracy * 100).toFixed(1)}% · slot F1 ${(report.overall.slotF1 * 100).toFixed(1)}% · exact ${(report.overall.exactMatch * 100).toFixed(1)}% · adversarial safety ${(report.overall.adversarialSafety * 100).toFixed(1)}%`);
