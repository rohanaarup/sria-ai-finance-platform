import { z } from 'zod';
import { MetricIdEnum, SupportedDimensionEnum } from './finance-metrics.js';

/**
 * Filter Criteria Schema
 */
export const RequestFiltersSchema = z.object({
  companyCode: z.string().regex(/^[A-Za-z0-9_]{1,10}$/, 'Invalid company code format').optional(),
  fiscalYear: z.number().int().min(2000).max(2100).optional(),
  periodFrom: z.string().regex(/^([0-1][0-9]|20\d{2}-[0-1][0-9])$/, 'Invalid period format (MM or YYYY-MM)').optional(),
  periodTo: z.string().regex(/^([0-1][0-9]|20\d{2}-[0-1][0-9])$/, 'Invalid period format (MM or YYYY-MM)').optional(),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/, 'Currency must be 3-letter ISO code').optional()
}).strict();
export type RequestFilters = z.infer<typeof RequestFiltersSchema>;

/**
 * Versioned Dashboard Request Schema (v1.0)
 * Produced by the AI Intent Understanding engine after parsing natural language.
 */
export const DashboardRequestSchema = z.object({
  version: z.literal('1.0').default('1.0'),
  requestId: z.string().uuid().optional(),
  rawPrompt: z.string().min(1, 'Raw prompt must not be empty').max(1000, 'Prompt exceeds maximum length'),
  metricIds: z.array(MetricIdEnum).min(1, 'At least one allowlisted metric must be specified'),
  dimensions: z.array(SupportedDimensionEnum).default(['month']),
  filters: RequestFiltersSchema.optional(),
  organizationId: z.string().min(1, 'Organization ID is required'),
  userId: z.string().min(1, 'User ID is required')
}).strict();
export type DashboardRequest = z.infer<typeof DashboardRequestSchema>;

/**
 * Clarification Question Schema
 * Returned when the user's natural language request is ambiguous or missing required parameters.
 */
export const ClarificationQuestionSchema = z.object({
  questionId: z.string().min(1),
  parameterName: z.enum(['companyCode', 'fiscalYear', 'period', 'metric', 'dimension']),
  prompt: z.string().min(1),
  reason: z.string().min(1),
  options: z.array(z.string()).optional(),
  suggestedDefault: z.string().optional()
}).strict();
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>;

