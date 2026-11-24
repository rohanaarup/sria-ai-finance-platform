import { z } from 'zod';
import { MetricIdEnum, SupportedDimensionEnum } from './finance-metrics.js';

/**
 * Data Provenance Metadata Schema
 */
export const ProvenanceMetadataSchema = z.object({
  sourceType: z.enum(['mock', 's4hana']),
  sourceSystem: z.string().min(1),
  retrievedAt: z.string().datetime(),
  calculationVersion: z.string().min(1),
  appliedFilters: z.record(z.string(), z.unknown()).optional(),
  isSynthetic: z.boolean(),
  notes: z.string().optional()
}).strict();
export type ProvenanceMetadata = z.infer<typeof ProvenanceMetadataSchema>;

/**
 * Single Metric Result Schema
 */
export const MetricResultSchema = z.object({
  metricId: MetricIdEnum,
  label: z.string().min(1),
  value: z.number(),
  formattedValue: z.string().min(1),
  currency: z.string().length(3),
  dimensionKey: SupportedDimensionEnum.optional(),
  dimensionValue: z.string().optional(),
  variancePercent: z.number().optional(),
  isZeroDenominator: z.boolean().optional(),
  provenance: ProvenanceMetadataSchema
}).strict();
export type MetricResult = z.infer<typeof MetricResultSchema>;

/**
 * Normalized Finance Record DTO Schema
 * Returned by FinanceDataProvider before deterministic aggregation.
 */
export const FinanceRecordSchema = z.object({
  recordId: z.string().min(1),
  companyCode: z.string().min(1),
  fiscalYear: z.number().int(),
  fiscalPeriod: z.string().min(1),
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  glAccount: z.string().min(1),
  accountType: z.enum(['REVENUE', 'EXPENSE', 'OTHER']),
  amount: z.number(),
  currency: z.string().length(3),
  debitCredit: z.enum(['D', 'C']),
  businessUnit: z.string().optional(),
  costCenter: z.string().optional()
}).strict();
export type FinanceRecord = z.infer<typeof FinanceRecordSchema>;
