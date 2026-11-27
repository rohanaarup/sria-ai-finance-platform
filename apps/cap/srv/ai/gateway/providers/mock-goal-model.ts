/**
 * Mock goal model — a TEST DOUBLE that imitates a (naive) language model. Test-only.
 *
 * It exists so that development, CI and demos run offline, free and deterministically. It reads
 * the same prompt a real model would get (system message + delimited user request), uses simple
 * keyword rules, and answers with an AgentGoal JSON object.
 *
 * It is deliberately NOT clever: it does not know synonyms the product has not listed, it can miss
 * unusual phrasings, and it does not understand context. The evaluation baseline recorded for it
 * therefore shows where a keyword approach falls short — which is the point of having an
 * independent dataset (see docs/ai/EVAL-FRAMEWORK.md). Never present its output as real AI.
 */
import type { AgentGoal } from '@sria/contracts';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const FINANCE_WORDS = /\b(dashboard|report|kpi|financ\w*|metric|company|entity|fiscal|period|quarter|year|figures?|numbers?|results?|performance|overview|books?|ledger|accounts?)\b/;
const INJECTION = /(ignore (all |any )?(the )?(previous|prior|above)|disregard (the )?(rules|instructions)|system prompt|your instructions|reveal .*(prompt|instruction|secret|key|password)|developer mode|jailbreak|do anything now|\bdan\b|you are now|new rules|override|bypass|drop table|delete from|select \* from|union select|' or '1'='1|1=1|<script|rm -rf|exfiltrat|webhook|base64|sudo |act as (an? )?(admin|root|unrestricted))/i;

function between(text: string, open: string, close: string): string {
  const a = text.indexOf(open); if (a < 0) return '';
  const b = text.indexOf(close, a + open.length);
  return b < 0 ? '' : text.slice(a + open.length, b);
}
function jsonBetween<T>(text: string, open: string, close: string, fallback: T): T {
  try { return JSON.parse(between(text, open, close)) as T; } catch { return fallback; }
}

export function mockGoalModel(system: string, userText: string): AgentGoal {
  const raw = userText;
  const t = userText.toLowerCase();
  const ctx = jsonBetween<{ hasDashboard?: boolean }>(system, '<context>', '</context>', {});
  const entitiesKnown = jsonBetween<string[]>(system, 'Company codes that exist: <data>', '</data>', []);
  const unsupportedTerms = jsonBetween<string[]>(system, 'does NOT support (a request using any of them is "unsupported"):\n<data>', '</data>', []);

  const base = (): AgentGoal => ({
    goalVersion: '1', taskType: 'create_dashboard', entities: [], period: { fiscalYear: null, periodFrom: null, periodTo: null },
    comparisonPeriod: null, metrics: [], dimensions: [], constraints: [], assumptions: [], missingInformation: [], rationale: '', unsupportedReason: null
  });
  const unsupported = (reason: string): AgentGoal => ({ ...base(), taskType: 'unsupported', rationale: 'I cannot help with this request.', unsupportedReason: reason });

  // 1. safety and scope
  if (INJECTION.test(raw)) return unsupported('This request asks for something the assistant cannot do.');
  if (/\b(post|book|write|change|update|delete|reverse)\b.*\b(entry|entries|journal|ledger|posting|invoice|sap)\b/.test(t) || /\bexport\b.*\b(to|into)\b.*\b(excel|csv|email|external|drive|sharepoint)\b/.test(t) || /\b(forecast|predict|budget|projection)\b/.test(t)) {
    return unsupported('Forecasts, budgets and changing or exporting accounting data are not available. I can show revenue, expenses, net profit and profit margin for past periods.');
  }
  for (const term of unsupportedTerms) if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(raw)) {
    return unsupported(`"${term}" is not an available metric. I can show revenue, expenses, net profit and profit margin.`);
  }

  // 2. metrics (own small alias list: a naive model does not know the product glossary)
  const metrics: string[] = [];
  const has = (re: RegExp) => re.test(t);
  if (has(/\b(revenue|sales)\b/)) metrics.push('total_revenue');
  if (has(/\b(expenses?|costs?|spend(ing)?)\b/)) metrics.push('total_expenses');
  if (has(/\bprofit margin\b|\bmargin\b/)) metrics.push('profit_margin');
  else if (has(/\b(profit|net income|earnings)\b/)) metrics.push('net_profit');
  if (has(/\bprofit\b/) && has(/\bmargin\b/) === false && !metrics.includes('net_profit')) metrics.push('net_profit');

  // 3. task type
  let taskType: AgentGoal['taskType'] = 'create_dashboard';
  if (/\bwhy\b|\bwhat caused\b|\breason\b|\bdrivers?\b/.test(t)) taskType = 'analyze_variance';
  else if (/\b(compare|versus|vs\.?|difference between)\b/.test(t)) taskType = 'compare';
  else if (/^\s*(what is|what's|what does|how is|how do you calculate|define|explain)\b/.test(t) && !/\b(for|in|of)\b.*\b(20\d\d|company|entity)\b/.test(t)) taskType = 'explain_metric';
  else if (/\b(add|remove|drop|switch|change|filter|swap|replace)\b/.test(t) && /\b(dashboard|chart|view|it|this|that|too)\b|^\s*(add|remove|drop|switch|change)\b/.test(t)) taskType = 'modify_dashboard';
  else if (/^\s*(what was|what were|what is the|how much|how many|tell me)\b/.test(t)) taskType = 'answer_question';

  // 4. entities
  const entities: string[] = [];
  const addEntity = (c: string) => { if (!entities.includes(c)) entities.push(c); };
  for (const m of raw.matchAll(/\b(?:company(?:\s*code)?|co|cc|entity|code)\s*[:=#]?\s*([A-Za-z0-9_]{3,10})\b/gi)) if (/^\d{4}$|^[A-Z]{2}\d{2}$/.test(m[1]!)) addEntity(m[1]!);
  for (const m of raw.matchAll(/\bcc(\d{4})\b/gi)) addEntity(m[1]!);
  for (const c of entitiesKnown) if (new RegExp(`(^|[^\\d.,])${c}(?![\\d.,]\\d)(?!\\d)`).test(raw)) addEntity(c);

  // 5. period
  let fiscalYear: number | null = null; let comparisonYear: number | null = null;
  const years = [...raw.matchAll(/\b(20[2-3]\d)\b/g)].map((m) => Number(m[1]));
  for (const m of raw.matchAll(/\bfy\s?'?(\d{2}|\d{4})\b/gi)) years.push(m[1]!.length === 2 ? 2000 + Number(m[1]) : Number(m[1]));
  for (const m of raw.matchAll(/'(\d{2})\b/g)) years.push(2000 + Number(m[1]));
  if (years.length) fiscalYear = years[0]!;
  if (years.length > 1 && years[1] !== years[0]) comparisonYear = years[1]!;
  let periodFrom: string | null = null; let periodTo: string | null = null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const q = /\bq([1-4])\b|\bquarter\s*([1-4])\b/i.exec(raw);
  const h = /\bh([12])\b|\b(first|second) half\b/i.exec(raw);
  const monthIdx = MONTHS.findIndex((m) => new RegExp(`\\b${m}\\b`, 'i').test(raw));
  const range = /\bperiods?\s*(\d{1,2})\s*(?:to|-|–|through)\s*(\d{1,2})\b/i.exec(raw);
  const single = /\b(?:periods?|p)\s*0?(\d{1,2})\b/i.exec(raw);
  const assumptions: string[] = [];
  if (range) { periodFrom = pad(Number(range[1])); periodTo = pad(Number(range[2])); }
  else if (q) { const n = Number(q[1] ?? q[2]); periodFrom = pad(n * 3 - 2); periodTo = pad(n * 3); assumptions.push(`Quarter ${n} means periods ${periodFrom}–${periodTo}.`); }
  else if (h) { const n = Number(h[1] ?? (h[2]!.toLowerCase() === 'first' ? 1 : 2)); periodFrom = n === 1 ? '01' : '07'; periodTo = n === 1 ? '06' : '12'; assumptions.push(`Half ${n} means periods ${periodFrom}–${periodTo}.`); }
  else if (monthIdx >= 0) { periodFrom = periodTo = pad(monthIdx + 1); assumptions.push(`${MONTHS[monthIdx]} means period ${periodFrom} (calendar-year fiscal variant).`); }
  else if (single) { periodFrom = periodTo = pad(Number(single[1])); }
  const relative = /\b(this|last|current|previous|prior|next) (fiscal )?(year|quarter|month)\b|\bytd\b|\byear[- ]to[- ]date\b|\brecent(ly)?\b|\bnow\b/i.test(raw);
  if (relative && !years.length) fiscalYear = null;

  // 6. dimensions (only when stated)
  const dimensions: string[] = [];
  if (/\b(by|per|split by|broken down by)\s+(month|monthly)\b/.test(t)) dimensions.push('month');
  if (/\b(by|per|split by|broken down by)\s+(business unit|bu|division)s?\b/.test(t)) dimensions.push('business_unit');
  if (/\b(by|per|split by|broken down by)\s+(company|entity|company code)\b/.test(t)) dimensions.push('company_code');
  if (/\b(by|per|split by|broken down by)\s+(fiscal )?periods?\b/.test(t)) dimensions.push('fiscal_period');

  const goal = base();
  goal.taskType = taskType; goal.entities = entities; goal.metrics = metrics; goal.dimensions = dimensions; goal.assumptions = assumptions;
  goal.period = { fiscalYear, periodFrom, periodTo };
  if (comparisonYear && (taskType === 'compare' || taskType === 'analyze_variance')) goal.comparisonPeriod = { fiscalYear: comparisonYear, periodFrom, periodTo };

  // 7. not a finance request at all
  if (!metrics.length && !FINANCE_WORDS.test(t)) return unsupported('This does not look like a finance reporting request. I can show revenue, expenses, net profit and profit margin.');

  // 8. missing information (never guess)
  const ask = (parameter: AgentGoal['missingInformation'][number]['parameter'], question: string, options: string[] | null = null) => goal.missingInformation.push({ parameter, question, options });
  if (taskType === 'modify_dashboard' && !ctx.hasDashboard) {
    goal.metrics = []; goal.entities = []; goal.period = { fiscalYear: null, periodFrom: null, periodTo: null };
    ask('dashboardContext', 'Which dashboard should I change? Open it first, or tell me what to build instead.');
  } else if (taskType !== 'explain_metric') {
    if (!metrics.length && taskType !== 'modify_dashboard') ask('metric', 'Which metric do you want: revenue, expenses, net profit or profit margin?', ['Total revenue', 'Total expenses', 'Net profit', 'Profit margin']);
    if (taskType !== 'modify_dashboard') {
      if (!entities.length) ask('companyCode', 'Which company code should I use?', entitiesKnown.slice(0, 8));
      if (fiscalYear === null) ask('fiscalYear', 'Which fiscal year?', ['2025', '2026']);
    }
    if ((taskType === 'compare' || taskType === 'analyze_variance') && entities.length < 2 && !goal.comparisonPeriod) ask('comparisonTarget', 'What should I compare against: another company code or another period?');
  } else if (!metrics.length) ask('metric', 'Which metric do you want explained?', ['Total revenue', 'Total expenses', 'Net profit', 'Profit margin']);

  const parts = [`I understood a request to ${({ create_dashboard: 'build a dashboard', answer_question: 'answer a question', compare: 'compare figures', analyze_variance: 'explain a change', explain_metric: 'explain a metric', modify_dashboard: 'change the open dashboard', unsupported: 'do something unsupported' } as const)[taskType]}`];
  if (metrics.length) parts.push(`for ${metrics.join(', ')}`);
  if (entities.length) parts.push(`for company ${entities.join(', ')}`);
  if (fiscalYear) parts.push(`in ${fiscalYear}`);
  goal.rationale = parts.join(' ') + (goal.missingInformation.length ? '. I need a bit more information.' : '.');
  return goal;
}
