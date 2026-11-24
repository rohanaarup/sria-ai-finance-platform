/**
 * Structured Output Schemas for AI Intent Understanding
 * Phase 6 — AI Request Understanding & Clarification Engine
 *
 * Enforces Zod schemas on raw model output before constructing DashboardRequest.
 */

import { z } from 'zod';
import {
  MetricIdEnum,
  SupportedDimensionEnum,
  ClarificationQuestionSchema
} from '@sria/contracts';

/**
 * Raw intent output schema emitted by LLM
 */
export const RawIntentOutputSchema = z.discriminatedUnion('intentType', [
  // 1. Unambiguous dashboard creation intent
  z.object({
    intentType: z.literal('create_dashboard'),
    metricIds: z.array(z.string()).min(1, 'At least one metric must be extracted'),
    dimensions: z.array(z.string()).default(['fiscal_period']),
    filters: z.object({
      companyCode: z.string().optional(),
      fiscalYear: z.number().int().optional(),
      periodFrom: z.string().optional(),
      periodTo: z.string().optional(),
      currency: z.string().length(3).optional()
    }).default({})
  }).strict(),

  // 2. Ambiguous request requiring user clarification
  z.object({
    intentType: z.literal('clarification_needed'),
    clarificationQuestions: z.array(ClarificationQuestionSchema).min(1)
  }).strict(),

  // 3. Unsupported or adversarial request rejected safely
  z.object({
    intentType: z.literal('unsupported_request'),
    rejectionReason: z.string().min(1),
    suggestedAlternatives: z.array(z.string()).optional()
  }).strict()
]);

export type RawIntentOutput = z.infer<typeof RawIntentOutputSchema>;

/**
 * Validated final result returned by IntentService to the caller
 */
export type IntentProcessingResult =
  | {
      status: 'RESOLVED';
      metricIds: z.infer<typeof MetricIdEnum>[];
      dimensions: z.infer<typeof SupportedDimensionEnum>[];
      filters: {
        companyCode: string;
        fiscalYear: number;
        periodFrom?: string;
        periodTo?: string;
        currency?: string;
      };
      rawPrompt: string;
    }
  | {
      status: 'CLARIFICATION_REQUIRED';
      questions: z.infer<typeof ClarificationQuestionSchema>[];
      rawPrompt: string;
    }
  | {
      status: 'REJECTED';
      reason: string;
      supportedMetrics: string[];
      rawPrompt: string;
    };
