/**
 * Evaluation harness (G2-04): measures how well the goal-understanding system does its job.
 *
 * WHY A HARNESS: with AI you cannot reason your way to "it works". You measure. A harness is a
 * small program that (1) feeds a fixed set of realistic requests to the system, (2) compares each
 * answer with what a careful human expects, and (3) reports numbers that can be compared before and
 * after any change (a prompt edit, a model swap, a new rule).
 *
 * Modes (same dataset, same scorers):
 *   mock    run the deterministic test double          (fast, free, offline)
 *   record  like mock, but save every request/answer so it can be replayed
 *   replay  answer from the saved recording            (deterministic CI gate; fails loudly if the input changed)
 *   live    run the real approved model                (costs money; run on demand or nightly)
 *
 * Metrics (all between 0 and 1; higher is better):
 *   taskTypeAccuracy        did it pick the right kind of task?
 *   slotF1                  precision/recall over the asserted fields (companies, year, periods, metrics, dimensions)
 *   clarificationAccuracy   when information is missing it asks exactly for that; when complete it does NOT ask
 *   falseAskRate            (lower is better) asked a question although the request was complete
 *   missedAskRate           (lower is better) failed to ask although information was missing
 *   refusalRecall           supported-vs-unsupported: refused the requests that must be refused
 *   falseRefusalRate        (lower is better) refused a request it should have served
 *   adversarialSafety       refused every adversarial request (the policy: injection attempts are unsupported)
 *   exactMatch              every asserted field of the case correct at once
 * Results are also broken down by category so weak spots are visible.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalCaseSchema } from '@sria/contracts';
import type { EvalCase, AgentGoal } from '@sria/contracts';
import { GoalService } from '../../apps/cap/srv/ai/goal/goal-service.ts';
import type { GoalOutcome } from '../../apps/cap/srv/ai/goal/goal-service.ts';
import { createGateway } from '../../apps/cap/srv/ai/gateway/index.ts';
import { MockProvider } from '../../apps/cap/srv/ai/gateway/providers/mock-provider.ts';
import { ReplayProvider, RecordingProvider } from '../../apps/cap/srv/ai/gateway/providers/replay-provider.ts';
import { loadConfig } from '../../apps/cap/srv/lib/config/app-config.ts';
import type { ProviderV2 } from '../../apps/cap/srv/ai/gateway/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const PATHS = {
  intent: resolve(here, 'datasets/intent-v2.jsonl'),
  injection: resolve(here, 'datasets/injection-v1.jsonl'),
  replay: resolve(here, 'replay/intent-v2.mock.replay.json'),
  baseline: resolve(here, 'baseline.json'),
  reportDir: resolve(here, '../../docs/ai/eval')
};

export function loadIntentCases(path = PATHS.intent): EvalCase[] {
  return readFileSync(path, 'utf8').split('\n').filter((l) => l.trim()).map((l) => EvalCaseSchema.parse(JSON.parse(l)));
}

export type Mode = 'mock' | 'record' | 'replay' | 'live';

export interface Runner { service: GoalService; provider: ProviderV2; mode: Mode; recorder?: RecordingProvider }

export function makeRunner(mode: Mode): Runner {
  if (mode === 'live') {
    const cfg = loadConfig();                       // throws unless a live provider is configured AND approved
    if (cfg.aiMode !== 'live') throw new Error(`Live mode needs a live provider (AI_RUNTIME_PROVIDER=openai|anthropic, approved). Current mode: ${cfg.aiMode}.`);
    const gw = createGateway(cfg, undefined, false);
    return { service: new GoalService({ gateway: gw }), provider: gw as unknown as ProviderV2, mode };
  }
  const base = loadConfig({});                      // clean defaults: ignores the developer's environment
  const mock = new MockProvider();
  const recorder = mode === 'record' ? new RecordingProvider(mock) : undefined;
  const provider: ProviderV2 = mode === 'replay' ? ReplayProvider.fromPath(PATHS.replay) : recorder ?? mock;
  const gw = createGateway(base, provider, false);
  return { service: new GoalService({ gateway: gw, tier: 'local' }), provider, mode, recorder };
}

// ── scoring ─────────────────────────────────────────────────────────────────────────────────
const setEq = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

export interface CaseResult {
  id: string; category: string; prompt: string; source: string;
  taskTypeOk: boolean; slotTp: number; slotFp: number; slotFn: number;
  askAsserted: boolean; askOk: boolean; asked: boolean; mustNotAsk: boolean; expectedMissing: number;
  expectedUnsupported: boolean; actualUnsupported: boolean; exact: boolean;
  actual: { taskType: string; entities: string[]; fiscalYear: number | null; periodFrom: string | null; periodTo: string | null; metrics: string[]; dimensions: string[]; missing: string[] };
  expected: EvalCase['expected']; error?: string;
}

export function scoreCase(c: EvalCase, o: GoalOutcome): CaseResult {
  const g: AgentGoal = o.goal; const e = c.expected;
  let tp = 0, fp = 0, fn = 0;
  const set = (exp: readonly string[] | undefined, act: readonly string[]) => { if (!exp) return; const E = new Set(exp), A = new Set(act); for (const x of A) (E.has(x) ? tp++ : fp++); for (const x of E) if (!A.has(x)) fn++; };
  const scalar = (exp: unknown, act: unknown) => { if (exp === undefined) return; if (exp === act) tp++; else { fn++; if (act !== null && act !== undefined) fp++; } };
  set(e.entities, g.entities); set(e.metrics, g.metrics); set(e.dimensions, g.dimensions);
  scalar(e.fiscalYear, g.period.fiscalYear); scalar(e.periodFrom, g.period.periodFrom); scalar(e.periodTo, g.period.periodTo);
  const missing = g.missingInformation.map((m) => m.parameter);
  const taskTypeOk = g.taskType === e.taskType;
  const asked = missing.length > 0;
  const askAsserted = e.missing !== undefined || e.mustNotAsk === true;
  let askOk = true;
  if (e.missing !== undefined) askOk = setEq(e.missing, missing);
  else if (e.mustNotAsk) askOk = !asked && g.taskType !== 'unsupported';
  const sloOk = fp === 0 && fn === 0;
  return {
    id: c.id, category: c.category, prompt: c.prompt, source: o.source, taskTypeOk, slotTp: tp, slotFp: fp, slotFn: fn,
    askAsserted, askOk, asked, mustNotAsk: !!e.mustNotAsk, expectedMissing: e.missing?.length ?? 0,
    expectedUnsupported: e.taskType === 'unsupported', actualUnsupported: g.taskType === 'unsupported',
    exact: taskTypeOk && sloOk && (!askAsserted || askOk),
    actual: { taskType: g.taskType, entities: g.entities, fiscalYear: g.period.fiscalYear, periodFrom: g.period.periodFrom, periodTo: g.period.periodTo, metrics: g.metrics, dimensions: g.dimensions, missing },
    expected: e, ...(o.error ? { error: o.error } : {})
  };
}

const ratio = (n: number, d: number) => (d === 0 ? 1 : Math.round((n / d) * 10000) / 10000);
const f1 = (tp: number, fp: number, fn: number) => { const p = ratio(tp, tp + fp), r = ratio(tp, tp + fn); return p + r === 0 ? 0 : Math.round((2 * p * r / (p + r)) * 10000) / 10000; };

export interface Metrics {
  cases: number; taskTypeAccuracy: number; slotF1: number; slotPrecision: number; slotRecall: number; clarificationAccuracy: number;
  falseAskRate: number; missedAskRate: number; refusalRecall: number; falseRefusalRate: number; adversarialSafety: number; exactMatch: number; modelFailures: number;
}

export function aggregate(rs: CaseResult[]): Metrics {
  const sum = (f: (r: CaseResult) => number) => rs.reduce((n, r) => n + f(r), 0);
  const tp = sum((r) => r.slotTp), fp = sum((r) => r.slotFp), fn = sum((r) => r.slotFn);
  const askCases = rs.filter((r) => r.askAsserted);
  const mustNot = rs.filter((r) => r.mustNotAsk);
  const shouldAsk = rs.filter((r) => r.expectedMissing > 0);
  const refuse = rs.filter((r) => r.expectedUnsupported);
  const serve = rs.filter((r) => !r.expectedUnsupported);
  const adv = rs.filter((r) => r.category === 'adversarial');
  return {
    cases: rs.length,
    taskTypeAccuracy: ratio(rs.filter((r) => r.taskTypeOk).length, rs.length),
    slotF1: f1(tp, fp, fn), slotPrecision: ratio(tp, tp + fp), slotRecall: ratio(tp, tp + fn),
    clarificationAccuracy: ratio(askCases.filter((r) => r.askOk).length, askCases.length),
    falseAskRate: ratio(mustNot.filter((r) => r.asked).length, mustNot.length),
    missedAskRate: ratio(shouldAsk.filter((r) => !r.asked).length, shouldAsk.length),
    refusalRecall: ratio(refuse.filter((r) => r.actualUnsupported).length, refuse.length),
    falseRefusalRate: ratio(serve.filter((r) => r.actualUnsupported).length, serve.length),
    adversarialSafety: ratio(adv.filter((r) => r.actualUnsupported).length, adv.length),
    exactMatch: ratio(rs.filter((r) => r.exact).length, rs.length),
    modelFailures: rs.filter((r) => r.error).length
  };
}

export interface Report { mode: Mode; dataset: string; promptVersion: string; ranAt: string; overall: Metrics; byCategory: Record<string, Metrics>; failures: CaseResult[]; usage: { calls: number; inputTokens: number; outputTokens: number; costEstimateUsd: number } }

export async function runIntentEval(mode: Mode, cases = loadIntentCases(), opts: { limit?: number } = {}): Promise<{ report: Report; runner: Runner }> {
  const runner = makeRunner(mode);
  const results: CaseResult[] = [];
  let inTok = 0, outTok = 0, cost = 0, calls = 0, promptVersion = '';
  for (const c of cases.slice(0, opts.limit ?? cases.length)) {
    const o = await runner.service.understand(c.prompt, { tenant: 'EVAL', userId: 'eval-runner', hasDashboard: c.context?.hasDashboard === true });
    results.push(scoreCase(c, o));
    if (o.usage) { calls++; inTok += o.usage.inputTokens; outTok += o.usage.outputTokens; cost += o.usage.costEstimateUsd; }
    promptVersion = o.promptVersion ?? promptVersion;
  }
  const cats = [...new Set(results.map((r) => r.category))];
  const report: Report = {
    mode, dataset: 'intent-v2', promptVersion, ranAt: new Date().toISOString().slice(0, 10), overall: aggregate(results),
    byCategory: Object.fromEntries(cats.map((k) => [k, aggregate(results.filter((r) => r.category === k))])),
    failures: results.filter((r) => !r.exact), usage: { calls, inputTokens: inTok, outputTokens: outTok, costEstimateUsd: Math.round(cost * 1e6) / 1e6 }
  };
  return { report, runner };
}

// ── reporting ────────────────────────────────────────────────────────────────────────────────
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
export function renderMarkdown(r: Report, note = ''): string {
  const m = r.overall;
  let md = `# Intent evaluation report — dataset ${r.dataset}, mode **${r.mode}**\n\n${note ? note + '\n\n' : ''}Run date ${r.ranAt} · prompt ${r.promptVersion} · ${m.cases} cases\n\n`;
  md += '| Metric | Value | Better |\n|---|---|---|\n';
  const rows: Array<[string, number, string]> = [['Task-type accuracy', m.taskTypeAccuracy, 'higher'], ['Slot F1 (companies, year, periods, metrics, dimensions)', m.slotF1, 'higher'], ['  slot precision', m.slotPrecision, 'higher'], ['  slot recall', m.slotRecall, 'higher'], ['Clarification accuracy', m.clarificationAccuracy, 'higher'], ['False-ask rate (asked although complete)', m.falseAskRate, 'lower'], ['Missed-ask rate (should have asked)', m.missedAskRate, 'lower'], ['Refusal recall (unsupported requests refused)', m.refusalRecall, 'higher'], ['False-refusal rate (refused a valid request)', m.falseRefusalRate, 'lower'], ['Adversarial safety (attacks refused)', m.adversarialSafety, 'higher'], ['Exact match (all asserted fields correct)', m.exactMatch, 'higher']];
  for (const [k, v, b] of rows) md += `| ${k} | ${pct(v)} | ${b} |\n`;
  md += `\nModel failures: ${m.modelFailures}. Usage: ${r.usage.calls} model calls, ${r.usage.inputTokens} in / ${r.usage.outputTokens} out tokens, cost estimate $${r.usage.costEstimateUsd}.\n\n## By category\n\n| Category | Cases | Task type | Slot F1 | Clarification | Exact match |\n|---|---|---|---|---|---|\n`;
  for (const [k, v] of Object.entries(r.byCategory)) md += `| ${k} | ${v.cases} | ${pct(v.taskTypeAccuracy)} | ${pct(v.slotF1)} | ${pct(v.clarificationAccuracy)} | ${pct(v.exactMatch)} |\n`;
  md += `\n## Failures (${r.failures.length})\n\nFirst 40 shown. Each row: what a careful human expects versus what the system produced.\n\n| Case | Category | Request | Expected | Got |\n|---|---|---|---|---|\n`;
  const brief = (x: Record<string, unknown>) => JSON.stringify(x).replace(/\|/g, '/').slice(0, 170);
  for (const f of r.failures.slice(0, 40)) md += `| ${f.id} | ${f.category} | ${f.prompt.replace(/\|/g, '/').slice(0, 90)} | ${brief(f.expected as Record<string, unknown>)} | ${brief(f.actual)} |\n`;
  return md;
}

export function saveRecording(runner: Runner): void {
  runner.recorder!.save(PATHS.replay, 'mock', 'SIMULATED: recorded from the mock test double (not from a real model). Re-record from a real approved model with: node tests/eval/run.ts --mode record (after switching the provider), then review before committing.');
}
export function writeFileSafe(path: string, text: string) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); }
