/**
 * Semantic layer contracts (G2-01).
 *
 * Business meaning is data: metric definitions are versioned rows with an approval
 * status, a formula (an expression tree over other metrics or a signed aggregation of
 * source records), dependencies, lineage and glossary aliases.
 */
import { z } from 'zod';

export const MetricVersionStatusEnum = z.enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'RETIRED']);
export type MetricVersionStatus = z.infer<typeof MetricVersionStatusEnum>;

export const MetricUnitEnum = z.enum(['CURRENCY', 'PERCENT']);
export type MetricUnit = z.infer<typeof MetricUnitEnum>;

/** BASE = signed sum of source records; DERIVED = expression over other metrics. */
export const MetricKindEnum = z.enum(['BASE', 'DERIVED']);
export type MetricKind = z.infer<typeof MetricKindEnum>;

export const SignRuleEnum = z.enum(['CREDIT_POSITIVE', 'DEBIT_POSITIVE']);
export type SignRule = z.infer<typeof SignRuleEnum>;

export const MappingStatusEnum = z.enum(['MAPPED', 'UNCONFIRMED', 'BLOCKED']);

/** Parsed formula tree (the evaluator never runs strings). */
export type FormulaNode =
  | { kind: 'num'; value: string }
  | { kind: 'ref'; metricId: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/'; left: FormulaNode; right: FormulaNode };

export const FormulaNodeSchema: z.ZodType<FormulaNode> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('num'), value: z.string().regex(/^\d+(\.\d+)?$/) }),
    z.object({ kind: z.literal('ref'), metricId: z.string().min(1) }),
    z.object({ kind: z.literal('op'), op: z.enum(['+', '-', '*', '/']), left: FormulaNodeSchema, right: FormulaNodeSchema })
  ])
);

export const MetricVersionSchema = z.object({
  id: z.string(),
  metricId: z.string(),
  version: z.number().int().positive(),
  status: MetricVersionStatusEnum,
  kind: MetricKindEnum,
  /** BASE: account type filter (e.g. REVENUE); DERIVED: null */
  accountType: z.string().nullable(),
  signRule: SignRuleEnum.nullable(),
  /** DERIVED: human-readable expression, e.g. "total_revenue - total_expenses" */
  expression: z.string().nullable(),
  unit: MetricUnitEnum,
  decimals: z.number().int().min(0).max(6),
  effectiveFrom: z.string(),
  proposedBy: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  dependsOn: z.array(z.string())
});
export type MetricVersion = z.infer<typeof MetricVersionSchema>;

export const LineageEdgeSchema = z.object({
  metricId: z.string(),
  sourceSystem: z.string(),
  entitySet: z.string(),
  field: z.string(),
  mappingStatus: MappingStatusEnum,
  evidence: z.string().nullable()
});
export type LineageEdge = z.infer<typeof LineageEdgeSchema>;

/** One row of the metric catalog as served to the UI and the agent. */
export const MetricCatalogEntrySchema = z.object({
  metricId: z.string(),
  label: z.string(),
  category: z.string(),
  description: z.string(),
  owner: z.string(),
  tenantId: z.string().nullable(),
  /** The version that would execute now (latest APPROVED effective version), if any */
  activeVersion: MetricVersionSchema.nullable(),
  /** Latest version of any status (what is being reviewed) */
  latestVersion: MetricVersionSchema,
  /** True when the metric may run in the server's current environment tier */
  executable: z.boolean(),
  aliases: z.array(z.string()),
  lineage: z.array(LineageEdgeSchema)
});
export type MetricCatalogEntry = z.infer<typeof MetricCatalogEntrySchema>;

export const TermResolutionSchema = z.object({
  status: z.enum(['RESOLVED', 'UNSUPPORTED', 'UNKNOWN']),
  term: z.string(),
  metricId: z.string().nullable(),
  message: z.string()
});
export type TermResolution = z.infer<typeof TermResolutionSchema>;
