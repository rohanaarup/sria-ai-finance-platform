/**
 * Formula language for DERIVED metrics (G2-01).
 *
 * Grammar (no functions, no variables other than metric ids, no strings):
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := NUMBER | METRIC_ID | '(' expr ')'
 *
 * Expressions are parsed once into a FormulaNode tree; the evaluator walks the tree with
 * Decimal arithmetic. Nothing is ever passed to eval/new Function.
 */
import type { FormulaNode } from '@sria/contracts';
import { Dec, ZERO } from '../lib/finance/decimal.ts';

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

type Tok = { t: 'num' | 'id' | 'op' | 'lp' | 'rp'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([a-z][a-z0-9_]*)|([+\-*/])|(\()|(\)))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new FormulaError(`Unexpected character at position ${i} in "${src}"`);
    if (m[1]) out.push({ t: 'num', v: m[1] });
    else if (m[2]) out.push({ t: 'id', v: m[2] });
    else if (m[3]) out.push({ t: 'op', v: m[3] });
    else if (m[4]) out.push({ t: 'lp', v: '(' });
    else out.push({ t: 'rp', v: ')' });
    i = re.lastIndex;
  }
  return out;
}

export function parseFormula(src: string): FormulaNode {
  if (src.length > 500) throw new FormulaError('Formula too long');
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const expr = (): FormulaNode => {
    let left = term();
    while (peek()?.t === 'op' && (peek()!.v === '+' || peek()!.v === '-')) {
      const op = toks[p++]!.v as '+' | '-';
      left = { kind: 'op', op, left, right: term() };
    }
    return left;
  };
  const term = (): FormulaNode => {
    let left = factor();
    while (peek()?.t === 'op' && (peek()!.v === '*' || peek()!.v === '/')) {
      const op = toks[p++]!.v as '*' | '/';
      left = { kind: 'op', op, left, right: factor() };
    }
    return left;
  };
  const factor = (): FormulaNode => {
    const tk = toks[p++];
    if (!tk) throw new FormulaError(`Unexpected end of formula "${src}"`);
    if (tk.t === 'num') return { kind: 'num', value: tk.v };
    if (tk.t === 'id') return { kind: 'ref', metricId: tk.v };
    if (tk.t === 'lp') {
      const inner = expr();
      if (toks[p++]?.t !== 'rp') throw new FormulaError(`Missing ")" in "${src}"`);
      return inner;
    }
    throw new FormulaError(`Unexpected "${tk.v}" in "${src}"`);
  };
  const tree = expr();
  if (p !== toks.length) throw new FormulaError(`Unexpected "${toks[p]!.v}" in "${src}"`);
  return tree;
}

export function formulaRefs(node: FormulaNode, acc: Set<string> = new Set()): Set<string> {
  if (node.kind === 'ref') acc.add(node.metricId);
  else if (node.kind === 'op') { formulaRefs(node.left, acc); formulaRefs(node.right, acc); }
  return acc;
}

export interface EvalResult { value: Dec; zeroDenominator: boolean }

/** Evaluate with Decimal arithmetic. Division by zero yields 0 and sets zeroDenominator. */
export function evaluateFormula(node: FormulaNode, values: ReadonlyMap<string, Dec>): EvalResult {
  let zeroDenominator = false;
  const walk = (n: FormulaNode): Dec => {
    if (n.kind === 'num') return new Dec(n.value);
    if (n.kind === 'ref') {
      const v = values.get(n.metricId);
      if (!v) throw new FormulaError(`No value for metric "${n.metricId}"`);
      return v;
    }
    const l = walk(n.left), r = walk(n.right);
    switch (n.op) {
      case '+': return l.plus(r);
      case '-': return l.minus(r);
      case '*': return l.times(r);
      case '/':
        if (r.isZero()) { zeroDenominator = true; return ZERO; }
        return l.dividedBy(r);
    }
  };
  const value = walk(node);
  return { value, zeroDenominator };
}

/**
 * Detect a cycle in a dependency graph (metricId → ids it depends on).
 * Returns the cycle path (e.g. ["a","b","a"]) or null.
 */
export function findCycle(graph: ReadonlyMap<string, readonly string[]>): string[] | null {
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const stack: string[] = [];
  const visit = (n: string): string[] | null => {
    if (state.get(n) === 2) return null;
    if (state.get(n) === 1) return [...stack.slice(stack.indexOf(n)), n];
    state.set(n, 1); stack.push(n);
    for (const d of graph.get(n) ?? []) { const c = visit(d); if (c) return c; }
    stack.pop(); state.set(n, 2);
    return null;
  };
  for (const n of graph.keys()) { const c = visit(n); if (c) return c; }
  return null;
}
