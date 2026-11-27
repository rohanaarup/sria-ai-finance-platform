import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvalCaseSchema, InjectionCaseSchema } from '@sria/contracts';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'datasets');
function readJsonl(name: string): unknown[] {
  return readFileSync(join(dir, name), 'utf8').split('\n').filter((l) => l.trim().length > 0).map((l, i) => {
    try { return JSON.parse(l); } catch (e) { throw new Error(`${name} line ${i + 1}: invalid JSON`); }
  });
}
const count = <T>(xs: T[], f: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});

const INTENT_MIN = { clear: 30, paraphrase: 28, multi_entity: 12, compare: 14, variance: 10, explain: 9, modify: 10, ambiguous: 28, unsupported: 17, adversarial: 17 } as const;
const INJ_VECTOR_MIN = { direct: 20, indirect_glossary: 10, indirect_metric_text: 8, indirect_tool_output: 8 } as const;
const ATTACKS = ['instruction_override', 'prompt_leak', 'secret_exfiltration', 'privilege_escalation', 'sql_or_code', 'role_play', 'encoding_trick', 'tenant_crossing', 'unsupported_action', 'output_format_hijack'];

test('intent-v2.jsonl: schema, ids, quotas, hard-case share, no duplicate prompts', () => {
  const cases = readJsonl('intent-v2.jsonl').map((raw, i) => {
    const r = EvalCaseSchema.safeParse(raw);
    assert.ok(r.success, `intent line ${i + 1}: ${r.success ? '' : JSON.stringify(r.error.issues)}`);
    return r.data;
  });
  assert.ok(cases.length >= 165, `expected >=165 cases, got ${cases.length}`);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length, 'duplicate ids');
  const byCat = count(cases, (c) => c.category);
  for (const [cat, min] of Object.entries(INTENT_MIN)) assert.ok((byCat[cat] ?? 0) >= min, `category ${cat}: ${byCat[cat] ?? 0} < ${min}`);
  const hard = cases.filter((c) => ['ambiguous', 'unsupported', 'adversarial'].includes(c.category)).length;
  assert.ok(hard / cases.length >= 0.2, `hard share ${(hard / cases.length).toFixed(2)} < 0.20`);
  const prompts = cases.map((c) => c.prompt.trim().toLowerCase());
  assert.equal(new Set(prompts).size, prompts.length, 'duplicate prompts');
});

test('injection-v1.jsonl: schema, ids, vector quotas, attack coverage', () => {
  const cases = readJsonl('injection-v1.jsonl').map((raw, i) => {
    const r = InjectionCaseSchema.safeParse(raw);
    assert.ok(r.success, `injection line ${i + 1}: ${r.success ? '' : JSON.stringify(r.error.issues)}`);
    return r.data;
  });
  assert.ok(cases.length >= 48, `expected >=48 cases, got ${cases.length}`);
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length, 'duplicate ids');
  const byVec = count(cases, (c) => c.vector);
  for (const [v, min] of Object.entries(INJ_VECTOR_MIN)) assert.ok((byVec[v] ?? 0) >= min, `vector ${v}: ${byVec[v] ?? 0} < ${min}`);
  const byAttack = count(cases, (c) => c.attack);
  for (const a of ATTACKS) assert.ok((byAttack[a] ?? 0) >= 2, `attack ${a}: ${byAttack[a] ?? 0} < 2`);
  for (const c of cases) if (c.vector !== 'direct') assert.ok(c.poisonedText, `${c.id}: indirect case needs poisonedText`);
});
