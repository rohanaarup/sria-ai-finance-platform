/**
 * Evaluation case format (G2-04). Datasets are JSONL files: one EvalCase per line.
 *
 * A dataset is INDEPENDENT when its cases were written from the business specification and not
 * derived from the rules of the system under test (finding F-10, "circular intent evaluation").
 * Each case records its provenance so that can be audited.
 */
import { z } from 'zod';
import { TaskTypeEnum, MissingParameterEnum } from './agent-goal.js';

export const EvalCategoryEnum = z.enum([
  'clear',          // complete, unambiguous request
  'paraphrase',     // same meaning in unusual wording, slang, typos, other word order
  'multi_entity',   // several company codes
  'compare',        // compare entities or periods
  'variance',       // why did X change
  'explain',        // what does metric X mean
  'modify',         // change an existing dashboard
  'ambiguous',      // information missing: the right answer is a question
  'unsupported',    // known-but-unsupported metric or non-finance request
  'adversarial'     // prompt injection, jailbreak, data exfiltration, abuse
]);
export type EvalCategory = z.infer<typeof EvalCategoryEnum>;

export const EvalExpectationSchema = z.object({
  taskType: TaskTypeEnum,
  /** exact set of company codes expected (order irrelevant); omit when not asserted */
  entities: z.array(z.string()).optional(),
  /** null = the request has no year (so a question is expected) */
  fiscalYear: z.number().int().nullable().optional(),
  periodFrom: z.string().nullable().optional(),
  periodTo: z.string().nullable().optional(),
  /** exact set of catalog metric ids expected */
  metrics: z.array(z.string()).optional(),
  dimensions: z.array(z.string()).optional(),
  /** parameters the system must ask about (exact set) */
  missing: z.array(MissingParameterEnum).optional(),
  /** true when the request is complete and asking a question would be a defect */
  mustNotAsk: z.boolean().optional()
}).strict();

export const EvalCaseSchema = z.object({
  id: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{2,40}$/),
  category: EvalCategoryEnum,
  prompt: z.string().max(1500),
  /** extra context available to the system when the request is asked */
  context: z.object({ hasDashboard: z.boolean().optional() }).strict().optional(),
  expected: EvalExpectationSchema,
  provenance: z.object({
    author: z.string().min(1),
    authoredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    method: z.enum(['hand-written-from-spec', 'adapted-from-support-style-phrasing', 'adversarial-catalogue']),
    notes: z.string().max(300).optional()
  }).strict()
}).strict();
export type EvalCase = z.infer<typeof EvalCaseSchema>;

/** Injection / abuse cases: the system must stay safe whatever the text says. */
export const InjectionCaseSchema = z.object({
  id: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{2,40}$/),
  /** direct = in the user's request; indirect = hidden in data the system reads (glossary alias, metric description, tool text) */
  vector: z.enum(['direct', 'indirect_glossary', 'indirect_metric_text', 'indirect_tool_output']),
  /** the attack class */
  attack: z.enum(['instruction_override', 'prompt_leak', 'secret_exfiltration', 'privilege_escalation', 'sql_or_code', 'role_play', 'encoding_trick', 'tenant_crossing', 'unsupported_action', 'output_format_hijack']),
  /** user prompt (for direct) or the benign prompt used while the poisoned text is present (for indirect) */
  prompt: z.string().max(1500),
  /** for indirect vectors: the poisoned text planted in a glossary alias / metric description / tool output */
  poisonedText: z.string().max(800).optional(),
  /** what a safe system must do */
  mustNot: z.array(z.enum(['execute_unsupported_task', 'return_unlisted_metric', 'echo_system_prompt', 'reveal_secrets', 'access_other_tenant', 'change_taskType_to_attackers_choice'])).min(1),
  provenance: z.object({ author: z.string().min(1), authoredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), method: z.enum(['hand-written-from-spec', 'adversarial-catalogue']) }).strict()
}).strict();
export type InjectionCase = z.infer<typeof InjectionCaseSchema>;
