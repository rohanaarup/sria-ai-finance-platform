/**
 * Redaction pipeline (G2-04): what must NOT reach an external model provider.
 *
 * Principle: DATA MINIMISATION. The model only needs to understand the *shape* of a request
 * ("revenue for company 1000 in 2026"), not any real accounting data a user may paste into it.
 * So before text leaves our system we replace sensitive-looking values with neutral placeholders
 * like [AMOUNT_1]. The mapping from placeholder back to value stays inside our process.
 *
 * Allowed through unchanged (an "allowlist"): fiscal years (2000–2100), small numbers (periods,
 * quarters), and identifiers the caller explicitly allows — in practice the company codes the
 * user may query. Everything else that looks like an amount, an account/document number, an
 * e-mail, a phone number, a card/IBAN number or a secret is replaced.
 *
 * This is a safety net, not a guarantee: patterns cannot recognise every sensitive string.
 * The stronger protections are (a) the model never receives data rows at all, and (b) logs keep
 * hashes only. The golden test suite documents exactly what is and is not caught.
 */
export interface RedactionReport {
  counts: Record<string, number>;
  /** placeholder → original text. Kept only in memory, never logged or sent. */
  restore: ReadonlyMap<string, string>;
}

export interface RedactionOptions {
  /** identifiers (for example company codes) that may pass through */
  allowedIdentifiers?: readonly string[];
}

interface Rule { kind: string; re: RegExp; keep?: (match: string, opts: RedactionOptions) => boolean }

const rules: Rule[] = [
  // Secrets first, so their digits are never mistaken for something else
  { kind: 'SECRET', re: /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g },
  { kind: 'SECRET', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: 'SECRET', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi },
  { kind: 'SECRET', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g },
  { kind: 'SECRET', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { kind: 'SECRET', re: /\b(?:password|passwd|pwd|secret|api[_ -]?key|token)\s*[:=]\s*\S{4,}/gi },
  { kind: 'SECRET', re: /https?:\/\/[^\s/:@]+:[^\s/@]+@[^\s]+/g },
  { kind: 'SECRET', re: /\b[A-Za-z0-9+/_-]{40,}={0,2}\b/g },
  // Personal data
  { kind: 'EMAIL', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: 'IBAN', re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g },
  { kind: 'CARD', re: /\b\d(?:[ -]?\d){12,18}\b/g },
  { kind: 'PHONE', re: /(?<![\w.])\+?\d{1,3}[ .-]?\(?\d{2,4}\)?[ .-]\d{3,4}[ .-]\d{3,4}(?![\w.])/g },
  // Money: a symbol/code next to a number, or a number with a magnitude word
  { kind: 'AMOUNT', re: /(?:[$€£¥]\s?\d[\d,.]*(?:\s?(?:k|m|mn|bn|million|billion|thousand))?)/gi },
  { kind: 'AMOUNT', re: /\b\d[\d,.]*\s?(?:USD|EUR|GBP|JPY|CHF|CAD|AUD|INR|dollars?|euros?|pounds?)\b/gi },
  { kind: 'AMOUNT', re: /\b\d+(?:[.,]\d+)?\s?(?:k|m|mn|bn|million|billion|thousand)\b/gi },
  { kind: 'AMOUNT', re: /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g },
  { kind: 'AMOUNT', re: /\b\d+\.\d{2}\b/g },
  // Identifiers: prefixed document ids first, then long digit strings (accounts, documents, invoices) unless allowed
  { kind: 'ID', re: /\b(?:INV|PO|SO|DOC|ACC|GL)[-_ ]?\d{3,}\b/gi },
  { kind: 'ID', re: /\b\d{4,}\b/g, keep: (m, o) => isYear(m) || (o.allowedIdentifiers ?? []).includes(m) }
];

const isYear = (s: string) => /^\d{4}$/.test(s) && Number(s) >= 2000 && Number(s) <= 2100;

export function redact(text: string, opts: RedactionOptions = {}): { text: string; report: RedactionReport } {
  const counts: Record<string, number> = {};
  const restore = new Map<string, string>();
  let out = text;
  for (const rule of rules) {
    out = out.replace(rule.re, (match) => {
      if (rule.keep?.(match, opts)) return match;
      // company codes and years that appear inside a larger allowed token stay untouched
      if ((opts.allowedIdentifiers ?? []).includes(match.trim())) return match;
      const n = (counts[rule.kind] = (counts[rule.kind] ?? 0) + 1);
      const placeholder = `[${rule.kind}_${n}]`;
      restore.set(placeholder, match);
      return placeholder;
    });
  }
  return { text: out, report: { counts, restore } };
}

/** Put original values back into text that came from the model (only inside our process). */
export function restorePlaceholders(text: string, report: RedactionReport): string {
  let out = text;
  for (const [ph, original] of report.restore) out = out.split(ph).join(original);
  return out;
}

export const mergeCounts = (a: Record<string, number>, b: Record<string, number>) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
};
