/**
 * G2-01 Finance Semantic Layer v2 — unit tests.
 *  1. Golden suite: semantic formulas reproduce every published synthetic figure (2 dp).
 *  2. Edge cases: zero denominator, net loss, missing data, mixed currency refused.
 *  3. Decimal properties and the "no binary floats on money" source rule.
 *  4. Formula parsing and DAG cycle rejection at write time.
 *  5. Version immutability, effective-date selection and the executable gate.
 *  6. Glossary: deterministic alias resolution, unsupported and unknown terms, tenant scoping.
 *  7. Lineage: no MAPPED source without recorded evidence.
 *  8. Intent: glossary runs before the model; a model guess without a known term becomes a clarification.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_FINANCE_CALCULATIONS, SYNTHETIC_FINANCE_RECORDS } from '@sria/contracts';
import type { FinanceRecord } from '@sria/contracts';
import { SemanticCatalog, GLOBAL, MetricNotExecutableError, SemanticValidationError } from '../srv/semantic/catalog.ts';
import type { SemanticRows, VersionRow } from '../srv/semantic/catalog.ts';
import { loadSeedRows } from '../srv/semantic/runtime.ts';
import { evaluateMetrics } from '../srv/semantic/evaluate.ts';
import { parseFormula, formulaRefs, findCycle, FormulaError } from '../srv/semantic/formula.ts';
import { calculateAllMetrics, DataQualityError } from '../srv/lib/finance/calculation-engine.ts';
import { Dec, dec, sum, roundTo, toApiNumber } from '../srv/lib/finance/decimal.ts';
import { IntentService } from '../srv/ai/intent-service.ts';
import type { LLMProvider } from '../srv/ai/llm-provider.ts';

const here = dirname(fileURLToPath(import.meta.url));
const seed = () => structuredClone(loadSeedRows());
const ALL = ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'];

function withVersions(mut: (rows: SemanticRows) => void): SemanticCatalog {
  const rows = seed();
  mut(rows);
  return new SemanticCatalog(rows);
}
const v = (o: Partial<VersionRow> & Pick<VersionRow, 'ID' | 'metricId' | 'version' | 'status'>): VersionRow => ({
  tenantId: GLOBAL, kind: 'BASE', accountType: 'REVENUE', signRule: 'CREDIT_POSITIVE', expression: null, unit: 'CURRENCY', decimals: 2,
  effectiveFrom: '2020-01-01', proposedBy: 'p', approvedBy: null, approvedAt: null, ...o
});
const rec = (o: Partial<FinanceRecord>): FinanceRecord => ({
  recordId: 'R', companyCode: '1000', fiscalYear: 2026, fiscalPeriod: '01', postingDate: '2026-01-15', glAccount: '410000',
  accountType: 'REVENUE', amount: 100, currency: 'USD', debitCredit: 'C', ...o
});

describe('1. golden suite — semantic formulas reproduce the published figures', () => {
  const cases: Array<[keyof typeof EXPECTED_FINANCE_CALCULATIONS, string, string]> = [
    ['company1000_period01', '1000', '01'], ['company1000_period02', '1000', '02'],
    ['company2000_period01_zero_revenue', '2000', '01'], ['company2000_period02_net_loss', '2000', '02']
  ];
  const catalog = new SemanticCatalog(seed());
  for (const [key, cc, per] of cases) {
    it(`${key}: all four metrics to 2 dp, equal to the legacy engine, with versions recorded`, () => {
      const ev = evaluateMetrics(SYNTHETIC_FINANCE_RECORDS, catalog, ALL, { tier: 'local', companyCode: cc, fiscalPeriod: per });
      const exp = EXPECTED_FINANCE_CALCULATIONS[key] as unknown as Record<string, number>;
      const legacy = calculateAllMetrics(SYNTHETIC_FINANCE_RECORDS, cc, per);
      const got = (id: string) => toApiNumber(ev.results.get(id)!.value);
      for (const id of ALL) assert.equal(got(id), exp[id], `${key} ${id}`);
      assert.equal(got('total_revenue'), legacy.totalRevenue.value);
      assert.equal(got('profit_margin'), legacy.profitMargin.value);
      for (const id of ALL) assert.equal(ev.results.get(id)!.metricVersion, `${id}@v1`);
    });
  }
});

describe('2. edge cases', () => {
  const catalog = new SemanticCatalog(seed());
  it('zero revenue: margin is 0 with a zero-denominator flag, not an error', () => {
    const ev = evaluateMetrics([rec({ accountType: 'EXPENSE', debitCredit: 'D', amount: 500 })], catalog, ['profit_margin'], { tier: 'local' });
    const m = ev.results.get('profit_margin')!;
    assert.equal(m.isZeroDenominator, true);
    assert.equal(toApiNumber(m.value), 0);
  });
  it('net loss is negative', () => {
    const ev = evaluateMetrics([rec({ amount: 100 }), rec({ recordId: 'E', accountType: 'EXPENSE', debitCredit: 'D', amount: 250.5 })], catalog, ['net_profit'], { tier: 'local' });
    assert.equal(toApiNumber(ev.results.get('net_profit')!.value), -150.5);
  });
  it('no records: MISSING_DATA, never shown as an ordinary 0.00', () => {
    const ev = evaluateMetrics([], catalog, ALL, { tier: 'local' });
    assert.equal(ev.results.get('total_revenue')!.dataState, 'MISSING_DATA');
    assert.equal(ev.results.get('net_profit')!.dataState, 'MISSING_DATA');
  });
  it('mixed currencies are refused', () => {
    assert.throws(() => evaluateMetrics([rec({ currency: 'USD' }), rec({ recordId: 'B', currency: 'EUR' })], catalog, ['total_revenue'], { tier: 'local' }), DataQualityError);
  });
});

describe('3. decimal arithmetic', () => {
  it('0.1 + 0.2 is exactly 0.3 and money sums equal integer minor-unit sums', () => {
    assert.equal(dec(0.1).plus(dec(0.2)).toString(), '0.3');
    let seedN = 42; const rnd = () => (seedN = (seedN * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let trial = 0; trial < 200; trial++) {
      const cents = Array.from({ length: 1 + Math.floor(rnd() * 50) }, () => BigInt(Math.floor(rnd() * 10_000_000)) - 5_000_000n);
      const asDecimal = sum(cents.map((c) => dec((c < 0n ? '-' : '') + (c < 0n ? -c : c).toString().padStart(3, '0').replace(/(\d{2})$/, '.$1'))));
      const asCents = cents.reduce((a, b) => a + b, 0n);
      assert.equal(asDecimal.times(100).toFixed(0), asCents.toString(), `trial ${trial}`);
    }
  });
  it('rounding is ROUND_HALF_UP (half away from zero) at the declared decimals', () => {
    assert.equal(roundTo(dec('2.345'), 2).toString(), '2.35');
    assert.equal(roundTo(dec('-2.345'), 2).toString(), '-2.35');
    assert.equal(roundTo(dec('2.344'), 2).toString(), '2.34');
  });
  it('rejects non-finite or malformed values', () => {
    assert.throws(() => dec(Number.NaN), RangeError);
    assert.throws(() => dec('12,50'), RangeError);
  });
  it('source rule: calculation code performs no binary floating-point money operations', () => {
    const files = ['srv/lib/finance/calculation-engine.ts', 'srv/semantic/evaluate.ts', 'srv/semantic/formula.ts', 'srv/ai/tools/get-finance-metrics.ts', 'srv/finance-data-service.ts'];
    const forbidden = [/Math\.(round|floor|ceil|trunc)\(/, /parseFloat\(/, /\.amount\s*[-+*/]/, /[-+*/]=?\s*[\w.!]*\.amount\b/, /\btotal\s*[+-]=/];
    for (const f of files) {
      const code = readFileSync(join(here, '..', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const re of forbidden) assert.ok(!re.test(code), `${f} matches forbidden pattern ${re}`);
    }
    assert.ok(Dec.precision >= 34);
  });
});

describe('4. formulas and the dependency DAG', () => {
  it('parses expressions into a tree and lists references', () => {
    const t = parseFormula('net_profit / total_revenue * 100');
    assert.deepEqual([...formulaRefs(t)].sort(), ['net_profit', 'total_revenue']);
    assert.throws(() => parseFormula('total_revenue +'), FormulaError);
    assert.throws(() => parseFormula('process.exit(1)'), FormulaError);
  });
  it('detects cycles in a graph', () => {
    assert.deepEqual(findCycle(new Map([['a', ['b']], ['b', ['c']], ['c', ['a']]])), ['a', 'b', 'c', 'a']);
    assert.equal(findCycle(new Map([['a', ['b']], ['b', []]])), null);
  });
  it('a proposal that would create a cycle is rejected at write time', () => {
    const c = new SemanticCatalog(seed());
    assert.throws(() => c.validateProposal({ metricId: 'total_revenue', kind: 'DERIVED', expression: 'profit_margin * 2' }, 'TENANT_A'), (e: unknown) => e instanceof SemanticValidationError && /cycle/.test((e as Error).message));
    assert.throws(() => c.validateProposal({ metricId: 'x_ratio', kind: 'DERIVED', expression: 'x_ratio + 1' }, 'TENANT_A'), /cycle/);
    assert.throws(() => c.validateProposal({ metricId: 'x_ratio', kind: 'DERIVED', expression: 'unknown_metric * 2' }, 'TENANT_A'), /Unknown metric/);
    assert.deepEqual(c.validateProposal({ metricId: 'expense_ratio', kind: 'DERIVED', expression: 'total_expenses / total_revenue * 100' }, 'TENANT_A').sort(), ['total_expenses', 'total_revenue']);
  });
});

describe('5. versions, effective dates and the executable gate', () => {
  it('seed versions are PENDING_REVIEW: runnable in mock/local, refused in pilot/production (D-02)', () => {
    const c = new SemanticCatalog(seed());
    assert.deepEqual(c.listExecutable('local').sort(), [...ALL].sort());
    assert.deepEqual(c.listExecutable('pilot'), []);
    assert.throws(() => c.assertExecutable(['total_revenue'], 'production'), MetricNotExecutableError);
  });
  it('only APPROVED and effective versions run in pilot; a derived metric needs approved dependencies', () => {
    const c = withVersions((r) => {
      r.versions.find((x) => x.metricId === 'net_profit')!.status = 'APPROVED';
    });
    assert.equal(c.isExecutableInTier('net_profit', 'pilot'), false, 'dependencies still pending');
    const c2 = withVersions((r) => { for (const x of r.versions) x.status = 'APPROVED'; });
    assert.deepEqual(c2.listExecutable('pilot').sort(), [...ALL].sort());
  });
  it('REJECTED versions never run, in any tier', () => {
    const c = withVersions((r) => { r.versions.find((x) => x.metricId === 'total_revenue')!.status = 'REJECTED'; });
    assert.equal(c.isExecutableInTier('total_revenue', 'local'), false);
    assert.equal(c.isExecutableInTier('net_profit', 'local'), false, 'depends on a rejected metric');
  });
  it('a new version does not change the old one; effective date decides which runs', () => {
    const future = '2999-01-01';
    const c = withVersions((r) => {
      r.versions.find((x) => x.metricId === 'total_revenue')!.status = 'APPROVED';
      r.versions.push(v({ ID: 'v2', metricId: 'total_revenue', version: 2, status: 'APPROVED', effectiveFrom: future }));
    });
    assert.equal(c.activeVersion('total_revenue')!.version, 1, 'v2 not yet effective');
    assert.equal(c.activeVersion('total_revenue', GLOBAL, future)!.version, 2);
    assert.deepEqual(c.allVersions('total_revenue').map((x) => x.version), [2, 1], 'history stays readable');
    assert.equal(c.allVersions('total_revenue').find((x) => x.version === 1)!.signRule, 'CREDIT_POSITIVE');
  });
});

describe('6. glossary', () => {
  const c = new SemanticCatalog(seed());
  it('aliases resolve deterministically, longest match first', () => {
    assert.equal(c.resolveTerm('sales').metricId, 'total_revenue');
    assert.equal(c.resolveTerm('Net Income').metricId, 'net_profit');
    assert.deepEqual(c.scanText('Show sales and net income for 1000').metricIds, ['total_revenue', 'net_profit']);
    assert.deepEqual(c.scanText('what is our profit margin?').metricIds, ['profit_margin'], '"profit margin" must not also count as "profit"');
  });
  it('known-unsupported and unknown terms are never guessed', () => {
    assert.equal(c.resolveTerm('EBITDA').status, 'UNSUPPORTED');
    assert.equal(c.resolveTerm('synergy index').status, 'UNKNOWN');
    assert.deepEqual(c.scanText('Show EBITDA for 2026').unsupported, ['ebitda']);
  });
  it('tenant-specific aliases are visible only to that tenant', () => {
    const t = withVersions((r) => r.glossary.push({ ID: 'g-t', term: 'umsatz', metricId: 'total_revenue', status: 'RESOLVES', tenantId: 'TENANT_A', note: null }));
    assert.equal(t.resolveTerm('umsatz', 'TENANT_A').metricId, 'total_revenue');
    assert.equal(t.resolveTerm('umsatz', 'TENANT_B').status, 'UNKNOWN');
  });
});

describe('7. lineage', () => {
  const c = new SemanticCatalog(seed());
  it('derived metrics trace to base source fields; SAP fields stay UNCONFIRMED', () => {
    const l = c.lineage('profit_margin');
    assert.ok(l.some((e) => e.metricId === 'total_revenue' && e.sourceSystem === 'S4HANA' && e.mappingStatus === 'UNCONFIRMED'));
    assert.ok(l.some((e) => e.metricId === 'total_expenses'));
  });
  it('no source mapping is MAPPED without recorded evidence', () => {
    for (const m of seed().mappings) {
      if (m.mappingStatus === 'MAPPED') assert.ok(m.evidence && m.evidence.length > 10, `${m.metricId}/${m.field} MAPPED without evidence`);
      if (m.sourceSystem === 'S4HANA') assert.notEqual(m.mappingStatus, 'MAPPED', 'S/4HANA mappings stay UNCONFIRMED until G2-03');
    }
  });
});

describe('8. intent: glossary before the model', () => {
  const guessingModel: LLMProvider = {
    getProviderName: () => 'stub', isAvailable: async () => true,
    complete: async () => ({ content: JSON.stringify({ intentType: 'create_dashboard', metricIds: ['total_revenue'], dimensions: ['fiscal_period'], filters: { companyCode: '1000', fiscalYear: 2026 } }), model: 'stub', usage: { promptTokens: 0, completionTokens: 0 } } as any)
  };
  const ctx = { organizationId: 'TENANT_A', userId: 'u' };
  it('a metric the model picked without any known term in the request becomes a clarification', async () => {
    const r = await new IntentService(guessingModel).processPrompt('show me the numbers for company 1000 in 2026', ctx);
    assert.equal(r.status, 'CLARIFICATION_REQUIRED');
  });
  it('a glossary term decides the metric, regardless of what the model says', async () => {
    const r = await new IntentService(guessingModel).processPrompt('show me spending for company 1000 in 2026', ctx);
    assert.equal(r.status, 'RESOLVED');
    assert.deepEqual((r as any).metricIds, ['total_expenses']);
  });
  it('an unsupported term is refused before any model call', async () => {
    let called = false;
    const spy: LLMProvider = { ...guessingModel, complete: async (...a: any[]) => { called = true; return (guessingModel.complete as any)(...a); } };
    const r = await new IntentService(spy).processPrompt('show EBITDA for company 1000 in 2026', ctx);
    assert.equal(r.status, 'REJECTED');
    assert.equal(called, false);
  });
});

describe('9. generated docs', () => {
  it('FINANCE-METRICS.md and CALCULATION-RULES.md match the semantic model (no drift)', async () => {
    const { renderMetricsDoc, renderRulesDoc, DOC_PATHS } = await import('../scripts/generate-semantic-docs.ts');
    const norm = (s: string) => s.replace(/\r\n/g, '\n');
    assert.equal(norm(readFileSync(DOC_PATHS.metrics, 'utf8')), norm(renderMetricsDoc()), 'run: npm run docs:semantic --workspace=apps/cap');
    assert.equal(norm(readFileSync(DOC_PATHS.rules, 'utf8')), norm(renderRulesDoc()));
  });
});
