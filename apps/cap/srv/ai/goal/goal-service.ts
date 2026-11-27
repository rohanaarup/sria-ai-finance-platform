/**
 * GoalService (G2-04): from free text to a validated AgentGoal.
 *
 * The model's contribution is ONE step in the middle. Around it, ordinary deterministic code:
 *
 *   text ─► [1 input checks] ─► [2 injection guard] ─► [3 glossary: unsupported terms]
 *        ─► [4 build prompt: immutable system text + delimited user text]
 *        ─► [5 gateway call: redact, validate, repair, meter]            <- the only model step
 *        ─► [6 HARDEN: the model's answer is re-checked by code] ─► AgentGoal
 *
 * Step 6 is the important lesson: even after the schema check, the model's answer is only a
 * PROPOSAL. Code decides which metrics are real (the governed glossary, not the model), which
 * company codes exist, whether the request is complete (missing items become questions), and strips
 * anything that looks like leaked instructions or secrets. Nothing executes from this object; it is
 * handed to the next stage (plan validation) which re-checks permissions and bounds again.
 */
import { AgentGoalSchema, agentGoalJsonSchema, checkGoalConsistency } from '@sria/contracts';
import type { AgentGoal, MissingParameter } from '@sria/contracts';
import { loadConfig } from '../../lib/config/app-config.ts';
import type { EnvironmentTier } from '../../lib/config/app-config.ts';
import { getSemanticCatalog, ensureSemanticLoaded } from '../../semantic/runtime.ts';
import type { SemanticCatalog } from '../../semantic/catalog.ts';
import { LLMError } from '../gateway/types.ts';
import type { LLMErrorCode, UsageRecord } from '../gateway/types.ts';
import type { LLMGateway } from '../gateway/llm-gateway.ts';
import { getGateway } from '../gateway/index.ts';
import { loadPrompt, renderPrompt, asData } from '../prompts/registry.ts';
import { checkInjection, neutralizeUserText, leaksSecretsOrPrompt } from './injection-guard.ts';
import { TASK_DESCRIPTIONS } from './task-taxonomy.ts';

export interface GoalContext { tenant: string; userId: string; runId?: string; hasDashboard?: boolean }

export type GoalSource = 'input_check' | 'injection_guard' | 'glossary' | 'model' | 'model_failure';

export interface GoalOutcome {
  goal: AgentGoal;
  source: GoalSource;
  aiMode: 'mock' | 'replay' | 'live';
  modelId: string;
  /** set when the model could not be used; the goal is then a safe "unsupported/ask again" goal */
  error?: LLMErrorCode;
  usage?: UsageRecord;
  promptVersion?: string;
}

export interface GoalServiceOptions { gateway?: LLMGateway; catalog?: SemanticCatalog; tier?: EnvironmentTier; maxPromptLength?: number }

const PARAM_QUESTIONS: Record<MissingParameter, { question: string }> = {
  companyCode: { question: 'Which company code should I use?' },
  fiscalYear: { question: 'Which fiscal year?' },
  period: { question: 'Which period or periods?' },
  metric: { question: 'Which metric do you want: revenue, expenses, net profit or profit margin?' },
  comparisonTarget: { question: 'What should I compare against: another company code or another period?' },
  dashboardContext: { question: 'Which dashboard should I change? Open it first, or tell me what to build instead.' }
};

const emptyGoal = (): AgentGoal => ({
  goalVersion: '1', taskType: 'unsupported', entities: [], period: { fiscalYear: null, periodFrom: null, periodTo: null }, comparisonPeriod: null,
  metrics: [], dimensions: [], constraints: [], assumptions: [], missingInformation: [], rationale: '', unsupportedReason: null
});

export function unsupportedGoal(reason: string, rationale = 'I cannot help with this request.'): AgentGoal {
  return { ...emptyGoal(), unsupportedReason: reason.slice(0, 300), rationale: rationale.slice(0, 400) };
}

export class GoalService {
  private readonly gatewayOpt?: LLMGateway;
  private readonly catalogOpt?: SemanticCatalog;
  private readonly tierOpt?: EnvironmentTier;
  private readonly maxLen: number;

  constructor(o: GoalServiceOptions = {}) { this.gatewayOpt = o.gateway; this.catalogOpt = o.catalog; this.tierOpt = o.tier; this.maxLen = o.maxPromptLength ?? 1000; }

  private get gateway() { return this.gatewayOpt ?? getGateway(); }

  async understand(prompt: string, ctx: GoalContext, opts: { signal?: AbortSignal } = {}): Promise<GoalOutcome> {
    if (!this.catalogOpt) await ensureSemanticLoaded();
    const catalog = this.catalogOpt ?? getSemanticCatalog();
    const tier = this.tierOpt ?? loadConfig().tier;
    const gw = this.gateway;
    const meta = { aiMode: gw.mode, modelId: gw.modelFor('goal_understanding') };
    const done = (goal: AgentGoal, source: GoalSource, extra: Partial<GoalOutcome> = {}): GoalOutcome => ({ goal, source, ...meta, ...extra });
    const executable = catalog.listExecutable(tier, ctx.tenant);

    // 1. input checks
    const text = (prompt ?? '').trim();
    if (!text) return done(unsupportedGoal('Please describe what you would like to see, for example "revenue for company 1000 in 2026".'), 'input_check');
    if (text.length > this.maxLen) return done(unsupportedGoal(`The request is longer than ${this.maxLen} characters. Please shorten it.`), 'input_check');

    // 2. injection guard (obvious attacks never reach the model)
    const guard = checkInjection(text);
    if (guard.blocked) return done(unsupportedGoal('This request asks for something the assistant cannot do.'), 'injection_guard');

    // 3. glossary: known-but-unsupported terms are refused without a model call
    const scan = catalog.scanText(text, ctx.tenant);
    if (scan.unsupported.length) {
      return done(unsupportedGoal(`${scan.unsupported.map((t) => `"${t}"`).join(', ')} ${scan.unsupported.length > 1 ? 'are' : 'is'} not an available metric. Available: ${executable.join(', ')}.`), 'glossary');
    }

    // 4. build the prompt: immutable system text + user text as delimited data
    const knownEntities = (catalog.dimensions(ctx.tenant).find((d) => d.dimensionId === 'company_code')?.members.map((m) => m.memberId)) ?? [];
    const dimensionIds = catalog.dimensions(ctx.tenant).map((d) => d.dimensionId).filter((d) => ['fiscal_period', 'month', 'company_code', 'business_unit'].includes(d));
    const prompt0 = loadPrompt('goal-understanding');
    const unsupportedTerms = catalog.rows.glossary.filter((g) => g.status === 'UNSUPPORTED' && (g.tenantId === 'GLOBAL' || g.tenantId === ctx.tenant)).map((g) => g.term);
    const system = renderPrompt(prompt0, {
      metrics_json: asData(executable.map((id) => ({ id, meaning: catalog.definition(id, ctx.tenant)?.description ?? '', aliases: catalog.aliases(id, ctx.tenant).slice(0, 12) }))),
      unsupported_json: asData(unsupportedTerms),
      entities_json: asData(knownEntities),
      dimensions_json: asData(dimensionIds),
      context_json: asData({ hasDashboard: !!ctx.hasDashboard })
    });
    const userMessage = `<user_request>\n${neutralizeUserText(text)}\n</user_request>`;

    // 5. the one model step
    let outcome;
    try {
      outcome = await gw.complete<AgentGoal>({
        task: 'goal_understanding', system, promptId: prompt0.id, promptVersion: prompt0.version, promptHash: prompt0.hash,
        messages: [{ role: 'user', content: userMessage }],
        schema: { name: 'AgentGoal', jsonSchema: agentGoalJsonSchema(), zod: AgentGoalSchema, validate: (g) => checkGoalConsistency(g) },
        temperature: 0, maxOutputTokens: 900, context: { tenant: ctx.tenant, userId: ctx.userId, runId: ctx.runId },
        redaction: { allowedIdentifiers: knownEntities }
      }, { signal: opts.signal });
    } catch (e) {
      const code: LLMErrorCode = e instanceof LLMError ? e.code : 'SERVER_ERROR';
      if (code === 'ABORTED') throw e;
      const reason = code === 'MALFORMED' ? 'I could not interpret this request reliably. Please rephrase it, for example "revenue for company 1000 in 2026".'
        : code === 'BUDGET_EXCEEDED' ? 'The AI usage budget has been reached for now. Please try again later.'
        : 'The AI service is temporarily unavailable. Please try again shortly.';
      return done(unsupportedGoal(reason, 'I could not process this request.'), 'model_failure', { error: code });
    }

    // 6. HARDEN: the answer is a proposal; code decides
    const goal = harden(outcome.data!, { catalog, tenant: ctx.tenant, executable, knownEntities, dimensionIds, scanMetrics: scan.metricIds, hasDashboard: !!ctx.hasDashboard, system });
    return done(goal, 'model', { usage: outcome.usage, promptVersion: prompt0.version });
  }
}

interface HardenInput {
  catalog: SemanticCatalog; tenant: string; executable: string[]; knownEntities: string[]; dimensionIds: string[]; scanMetrics: string[]; hasDashboard: boolean; system: string;
}

/** Exported for the injection suite: apply the deterministic rules to any (even hostile) goal. */
export function harden(g0: AgentGoal, h: HardenInput): AgentGoal {
  const g: AgentGoal = structuredClone(g0);
  g.goalVersion = '1';
  const ask = (parameter: MissingParameter, options: string[] | null = null) => {
    if (!g.missingInformation.some((m) => m.parameter === parameter)) g.missingInformation.push({ parameter, question: PARAM_QUESTIONS[parameter].question, options });
  };

  // never trust text that leaks the prompt or secrets, or contains our delimiter tags
  if (leaksSecretsOrPrompt(`${g.rationale} ${g.unsupportedReason ?? ''} ${g.assumptions.join(' ')} ${g.constraints.map((c) => c.description).join(' ')}`, h.system)) {
    return unsupportedGoal('This request asks for something the assistant cannot do.');
  }
  g.rationale = g.rationale.replace(/[<>]/g, '');

  if (g.taskType === 'unsupported') {
    return { ...emptyGoal(), rationale: g.rationale || 'I cannot help with this request.', unsupportedReason: g.unsupportedReason ?? 'This request is outside what the assistant can do.' };
  }

  // metrics: the governed glossary decides; a model-chosen metric without a recognised term is a guess
  if (g.taskType !== 'modify_dashboard') {
    if (h.scanMetrics.length) g.metrics = h.scanMetrics.filter((m) => h.executable.includes(m));
    else g.metrics = [];
    if (!g.metrics.length) ask('metric', h.executable.map((id) => h.catalog.definition(id, h.tenant)?.label ?? id));
  } else {
    g.metrics = g.metrics.filter((m) => h.executable.includes(m));
  }
  g.missingInformation = g.missingInformation.filter((m) => !(m.parameter === 'metric' && g.metrics.length > 0));

  // entities: only company codes that exist; others become a question (never silently kept)
  const unknown = g.entities.filter((e) => !h.knownEntities.includes(e));
  g.entities = [...new Set(g.entities.filter((e) => h.knownEntities.includes(e)))];
  if (unknown.length && g.taskType !== 'explain_metric') ask('companyCode', h.knownEntities.slice(0, 8));

  g.dimensions = g.dimensions.filter((d) => h.dimensionIds.includes(d));

  if (g.taskType === 'modify_dashboard' && !h.hasDashboard) {
    ask('dashboardContext');
    g.metrics = []; g.entities = []; g.period = { fiscalYear: null, periodFrom: null, periodTo: null }; g.comparisonPeriod = null;
  }
  if (g.taskType === 'explain_metric') {
    g.entities = []; g.missingInformation = g.missingInformation.filter((m) => m.parameter === 'metric');
    return g;
  }
  if (g.taskType !== 'modify_dashboard') {
    if (!g.entities.length) ask('companyCode', h.knownEntities.slice(0, 8));
    if (g.period.fiscalYear === null && !g.missingInformation.some((m) => m.parameter === 'period')) ask('fiscalYear', ['2025', '2026']);
    if ((g.taskType === 'compare' || g.taskType === 'analyze_variance') && g.entities.length < 2 && !g.comparisonPeriod) ask('comparisonTarget');
  }
  // drop questions that no longer apply
  if (g.entities.length && !unknown.length) g.missingInformation = g.missingInformation.filter((m) => m.parameter !== 'companyCode');
  if (g.period.fiscalYear !== null) g.missingInformation = g.missingInformation.filter((m) => m.parameter !== 'fiscalYear');
  if (g.period.periodFrom && g.period.periodTo && g.period.periodFrom > g.period.periodTo) { g.period.periodFrom = null; g.period.periodTo = null; ask('period'); }

  // final safety net: anything still inconsistent becomes an honest question, never a guess
  if (checkGoalConsistency(g).length) return unsupportedGoal('I could not interpret this request reliably. Please rephrase it.');
  return g;
}

export { TASK_DESCRIPTIONS };
