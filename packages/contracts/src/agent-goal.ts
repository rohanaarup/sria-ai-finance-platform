/**
 * AgentGoal (G2-04): the validated, structured meaning of a user's request.
 *
 * The model's job is to turn free text into this object. Everything after that is deterministic
 * code: the object is validated, checked against the semantic layer and the user's permissions,
 * and only then may a plan be built from it. Nothing executes on unvalidated model output.
 *
 * Optional fields are `nullable` (not `optional`) so the schema can also be sent to providers that
 * require every property to be present (strict structured output).
 */
import { z } from 'zod';

export const TaskTypeEnum = z.enum([
  'create_dashboard',   // build a dashboard of metrics for entities and a period
  'answer_question',    // answer a specific question about a metric/period
  'compare',            // compare entities or periods
  'analyze_variance',   // explain why a metric changed between periods
  'explain_metric',     // explain what a metric means / how it is calculated
  'modify_dashboard',   // change an existing dashboard (filters, metrics, layout)
  'unsupported'         // outside scope, unsafe, or not a finance request
]);
export type TaskType = z.infer<typeof TaskTypeEnum>;

export const PeriodSchema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100).nullable(),
  /** '01'..'16' */
  periodFrom: z.string().regex(/^(0[1-9]|1[0-6])$/).nullable(),
  periodTo: z.string().regex(/^(0[1-9]|1[0-6])$/).nullable()
}).strict();
export type Period = z.infer<typeof PeriodSchema>;

export const ConstraintKindEnum = z.enum(['top_n', 'threshold', 'filter', 'sort', 'comparison_basis']);

export const MissingParameterEnum = z.enum([
  'companyCode', 'fiscalYear', 'period', 'metric', 'comparisonTarget', 'dashboardContext'
]);
export type MissingParameter = z.infer<typeof MissingParameterEnum>;

export const MissingInformationSchema = z.object({
  parameter: MissingParameterEnum,
  question: z.string().min(1).max(300),
  options: z.array(z.string().max(60)).max(8).nullable()
}).strict();

export const AgentGoalSchema = z.object({
  goalVersion: z.literal('1'),
  taskType: TaskTypeEnum,
  /** company codes mentioned or implied by the user */
  entities: z.array(z.string().regex(/^[A-Za-z0-9_]{1,10}$/)).max(10),
  period: PeriodSchema,
  /** only for taskType 'compare' / 'analyze_variance' when a second period is named */
  comparisonPeriod: PeriodSchema.nullable(),
  /** metric ids from the governed catalog (validated against the semantic layer afterwards) */
  metrics: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,49}$/)).max(20),
  dimensions: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,49}$/)).max(5),
  constraints: z.array(z.object({ kind: ConstraintKindEnum, description: z.string().min(1).max(200) }).strict()).max(10),
  /** things the model assumed that the user did not say (shown to the user for confirmation) */
  assumptions: z.array(z.string().min(1).max(200)).max(10),
  missingInformation: z.array(MissingInformationSchema).max(6),
  /** one or two sentences shown to the user: "Here is what I understood" */
  rationale: z.string().min(1).max(400),
  /** set when taskType is 'unsupported' */
  unsupportedReason: z.string().min(1).max(300).nullable()
}).strict();
export type AgentGoal = z.infer<typeof AgentGoalSchema>;

/** Cross-field rules the JSON shape cannot express. Returns a list of problems (empty = valid). */
export function checkGoalConsistency(g: AgentGoal): string[] {
  const p: string[] = [];
  const missing = new Set(g.missingInformation.map((m) => m.parameter));
  if (g.taskType === 'unsupported') {
    if (!g.unsupportedReason) p.push('unsupported goals need unsupportedReason');
    if (g.metrics.length || g.entities.length) p.push('unsupported goals must not carry metrics or entities');
    return p;
  }
  if (g.unsupportedReason) p.push('only unsupported goals may set unsupportedReason');
  const needsMetric = g.taskType !== 'modify_dashboard';
  if (needsMetric && g.metrics.length === 0 && !missing.has('metric')) p.push('a goal without metrics must ask which metric (missingInformation: metric)');
  if (g.taskType === 'explain_metric') return p;
  if (g.taskType === 'modify_dashboard') {
    if (!missing.has('dashboardContext') && g.metrics.length === 0 && g.entities.length === 0 && g.period.fiscalYear === null) p.push('modify_dashboard needs a change or must ask for the dashboard context');
    return p;
  }
  if (g.entities.length === 0 && !missing.has('companyCode')) p.push('no company code and no question asked about it');
  if (g.period.fiscalYear === null && !missing.has('fiscalYear') && !missing.has('period')) p.push('no fiscal year and no question asked about it');
  if (g.period.periodFrom && g.period.periodTo && g.period.periodFrom > g.period.periodTo) p.push('periodFrom is after periodTo');
  if ((g.taskType === 'compare' || g.taskType === 'analyze_variance') && g.entities.length < 2 && !g.comparisonPeriod && !missing.has('comparisonTarget')) p.push('a comparison needs two entities, a comparison period, or a question about the comparison target');
  return p;
}

/** JSON Schema for providers that accept one (OpenAI-style strict schemas, Anthropic tool input_schema). */
export function agentGoalJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(AgentGoalSchema, { target: 'draft-7' }) as Record<string, unknown>;
}
