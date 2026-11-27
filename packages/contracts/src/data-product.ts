/**
 * FinancialPerformance data product contracts (G2-02, ADR-012).
 *
 * Tools ask for business concepts (entities, periods, metrics), never for tables. The data
 * product validates the query against the semantic layer, enforces bounds and entity access,
 * reads through a source adapter, checks quality, calculates and returns provenance v2.
 * SAP-specific names live only inside adapters.
 */
import { z } from 'zod';

export const QualityFlagCodeEnum = z.enum([
  'SYNTHETIC_DATA',        // results come from synthetic fixtures
  'MISSING_PERIOD',        // a requested period has no postings for an entity
  'MISSING_DATA',          // a metric has no source records at all
  'ZERO_VALUE',            // records exist but the value is exactly zero
  'CURRENCY_MIX',          // more than one currency in scope: reported per currency, not converted
  'DUPLICATE_POSTING_KEY', // the same posting key appears more than once
  'ZERO_DENOMINATOR',      // a ratio's denominator is zero (value reported as 0)
  'UNMAPPED_ACCOUNT'       // postings on accounts that map to neither revenue nor expense are excluded from the metrics
]);
export type QualityFlagCode = z.infer<typeof QualityFlagCodeEnum>;

export const QualityFlagSchema = z.object({
  code: QualityFlagCodeEnum,
  severity: z.enum(['info', 'warning']),
  message: z.string(),
  companyCode: z.string().optional(),
  fiscalPeriod: z.string().optional(),
  metricId: z.string().optional()
});
export type QualityFlag = z.infer<typeof QualityFlagSchema>;

const Period = z.string().regex(/^(0[1-9]|1[0-6])$/, 'Period must be 01–16');

export const DataProductQuerySchema = z.object({
  /** Company codes (legal entities). */
  entities: z.array(z.string().regex(/^[A-Za-z0-9_]{1,10}$/)).min(1),
  fiscalYear: z.number().int().min(2000).max(2100),
  periodFrom: Period.default('01'),
  periodTo: Period.default('12'),
  metrics: z.array(z.string().min(1)).min(1),
  /** Result grouping. Default: by company code. */
  groupBy: z.array(z.enum(['company_code', 'fiscal_period', 'business_unit'])).default(['company_code']),
  businessUnit: z.string().max(50).optional()
}).strict().refine((q) => q.periodFrom <= q.periodTo, { message: 'periodFrom must not be after periodTo', path: ['periodFrom'] });
export type DataProductQuery = z.infer<typeof DataProductQuerySchema>;
export type DataProductQueryInput = z.input<typeof DataProductQuerySchema>;

export const ProvenanceV2Schema = z.object({
  provenanceVersion: z.literal('2'),
  sourceType: z.enum(['mock', 's4hana']),
  sourceSystem: z.string(),
  apiName: z.string(),
  apiVersion: z.string(),
  /** sha256 of the normalised query (entities, year, periods, metrics, grouping, source). */
  queryHash: z.string().regex(/^[a-f0-9]{64}$/),
  retrievedAt: z.string(),
  freshness: z.object({ ttlSeconds: z.number().int(), ageSeconds: z.number().int(), stale: z.boolean() }),
  recordCount: z.number().int().nonnegative(),
  qualityFlags: z.array(QualityFlagSchema),
  /** metricId → version used, e.g. { total_revenue: "total_revenue@v1" } */
  metricVersions: z.record(z.string(), z.string()),
  environmentTier: z.enum(['mock', 'local', 'pilot', 'production']),
  isSynthetic: z.boolean(),
  /** Always false in a successful result: over-limit queries are rejected, never cut short. */
  truncated: z.literal(false),
  reusedFromRunCache: z.boolean()
});
export type ProvenanceV2 = z.infer<typeof ProvenanceV2Schema>;

export const DataProductMetricSchema = z.object({
  metricId: z.string(),
  label: z.string(),
  value: z.number(),
  /** Exact decimal string, e.g. "150000.00" */
  valueText: z.string(),
  unit: z.enum(['CURRENCY', 'PERCENT']),
  decimals: z.number().int(),
  metricVersion: z.string(),
  dataState: z.enum(['AVAILABLE', 'ZERO_VALUE', 'MISSING_DATA', 'UNSUPPORTED_METRIC']),
  isZeroDenominator: z.boolean()
});
export type DataProductMetric = z.infer<typeof DataProductMetricSchema>;

export const DataProductGroupSchema = z.object({
  key: z.object({ companyCode: z.string().optional(), fiscalPeriod: z.string().optional(), businessUnit: z.string().optional() }),
  /** Each group is single-currency; a group with two currencies appears twice, once per currency. */
  currency: z.string().length(3),
  recordCount: z.number().int(),
  metrics: z.array(DataProductMetricSchema)
});
export type DataProductGroup = z.infer<typeof DataProductGroupSchema>;

export const DataProductResultSchema = z.object({
  query: z.object({
    entities: z.array(z.string()), fiscalYear: z.number(), periodFrom: z.string(), periodTo: z.string(),
    metrics: z.array(z.string()), groupBy: z.array(z.string()), businessUnit: z.string().optional()
  }),
  groups: z.array(DataProductGroupSchema),
  /** Totals across all groups, one entry per currency (never converted into one). */
  totalsByCurrency: z.array(z.object({ currency: z.string().length(3), recordCount: z.number().int(), metrics: z.array(DataProductMetricSchema) })),
  currencies: z.array(z.string()),
  converted: z.literal(false),
  provenance: ProvenanceV2Schema
});
export type DataProductResult = z.infer<typeof DataProductResultSchema>;

export const AdapterCapabilitiesSchema = z.object({
  adapterId: z.string(),
  sourceType: z.enum(['mock', 's4hana']),
  sourceSystem: z.string(),
  apiName: z.string(),
  apiVersion: z.string(),
  isSynthetic: z.boolean(),
  dimensions: z.array(z.string()),
  pushdownFilters: z.array(z.string()),
  maxPageSize: z.number().int().positive(),
  supportsAbort: z.boolean(),
  freshnessTtlSeconds: z.number().int().positive()
});
export type AdapterCapabilities = z.infer<typeof AdapterCapabilitiesSchema>;
