import { z } from 'zod';
import { MetricIdEnum, SupportedDimensionEnum } from './finance-metrics.js';
import { MetricResultSchema, ProvenanceMetadataSchema } from './metric-result.js';

/**
 * Supported Widget Visual Types
 */
export const WidgetTypeEnum = z.enum([
  'kpi_card',
  'bar_chart',
  'line_chart',
  'table'
]);
export type WidgetType = z.infer<typeof WidgetTypeEnum>;

/**
 * Individual Dashboard Widget Specification Schema
 */
export const DashboardWidgetSpecSchema = z.object({
  id: z.string().min(1),
  type: WidgetTypeEnum,
  title: z.string().min(1),
  metricIds: z.array(MetricIdEnum).min(1),
  dimension: SupportedDimensionEnum.optional(),
  options: z.object({
    showLegend: z.boolean().optional(),
    colorScheme: z.enum(['terracotta', 'rust', 'copper', 'neutral']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    decimalPlaces: z.number().int().min(0).max(4).optional(),
    unit: z.string().optional()
  }).optional()
}).strict();
export type DashboardWidgetSpec = z.infer<typeof DashboardWidgetSpecSchema>;

/**
 * Complete Dashboard Specification Schema (v1.0)
 * Compiled deterministically from verified data; consumed directly by React renderer.
 */
export const DashboardSpecSchema = z.object({
  version: z.literal('1.0').default('1.0'),
  dashboardId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  organizationId: z.string().min(1),
  createdAt: z.string().datetime(),
  generatedBy: z.string().min(1),
  widgets: z.array(DashboardWidgetSpecSchema).min(1),
  results: z.array(MetricResultSchema).optional(),
  dataProvenance: ProvenanceMetadataSchema,
  freshnessNotice: z.string().optional()
}).strict();
export type DashboardSpec = z.infer<typeof DashboardSpecSchema>;
