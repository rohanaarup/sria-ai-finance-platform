/**
 * IntentService
 * Phase 6 — AI Request Understanding & Clarification Engine
 *
 * Orchestrates natural language request understanding, bounded retry,
 * allowlist validation, ambiguity detection, and clarification generation.
 *
 * ARCHITECTURE RULES:
 *  - LLM is strictly prohibited from doing arithmetic (ADR-003).
 *  - Model authorization is NEVER client-controlled or prompt-controlled.
 *  - Output conforms to DashboardRequest and ClarificationQuestion schemas.
 */

import {
  DashboardRequestSchema,
  MetricIdEnum,
  SupportedDimensionEnum,
  BASELINE_METRIC_CATALOG
} from '@sria/contracts';
import type { DashboardRequest, ClarificationQuestion, MetricId, SupportedDimension } from '@sria/contracts';
import type { LLMProvider, LLMMessage } from './llm-provider.ts';
import { RawIntentOutputSchema } from './schemas/intent-schemas.ts';
import type { RawIntentOutput, IntentProcessingResult } from './schemas/intent-schemas.ts';
import { MockLLMProvider } from './mock-llm-provider.ts';
import { ApprovedLLMProvider } from './approved-provider.ts';

export interface UserContext {
  organizationId: string;
  userId: string;
}

export class IntentService {
  private readonly _llmProvider: LLMProvider;
  private readonly _maxRetries: number;

  constructor(provider?: LLMProvider, maxRetries = 2) {
    this._llmProvider = provider ?? (process.env['RUNTIME_LLM_PROVIDER'] === 'mock' || !process.env['RUNTIME_LLM_PROVIDER']
      ? new MockLLMProvider()
      : new ApprovedLLMProvider());
    this._maxRetries = maxRetries;
  }

  /**
   * Understand and process a user's natural language finance prompt.
   *
   * @param rawPrompt - User's input text (e.g. "Show me revenue and net profit for company 1000 in 2026")
   * @param userCtx   - Authenticated organization and user scope from CAP server
   * @returns IntentProcessingResult
   */
  async processPrompt(
    rawPrompt: string,
    userCtx: UserContext
  ): Promise<IntentProcessingResult> {
    const trimmed = (rawPrompt ?? '').trim();

    // 1. Basic input validation
    if (!trimmed) {
      return {
        status: 'REJECTED',
        reason: 'Prompt cannot be empty. Please specify the financial metrics and period you wish to view.',
        supportedMetrics: Object.keys(BASELINE_METRIC_CATALOG),
        rawPrompt: ''
      };
    }

    if (trimmed.length > 1000) {
      return {
        status: 'REJECTED',
        reason: 'Prompt exceeds maximum allowable length of 1000 characters.',
        supportedMetrics: Object.keys(BASELINE_METRIC_CATALOG),
        rawPrompt: trimmed.slice(0, 100) + '...'
      };
    }

    // 2. Execute bounded LLM completion loop with retry for malformed output
    const rawOutput = await this._callLLMWithRetry(trimmed);

    // 3. Process the parsed model output
    return this._interpretModelOutput(rawOutput, trimmed, userCtx);
  }

  /**
   * Translates a successful IntentProcessingResult into a fully-validated DashboardRequest.
   * Throws Error if result is not in 'RESOLVED' state.
   */
  buildDashboardRequest(
    result: IntentProcessingResult,
    userCtx: UserContext
  ): DashboardRequest {
    if (result.status !== 'RESOLVED') {
      throw new Error(`Cannot build DashboardRequest from status "${result.status}"`);
    }

    const payload = {
      version: '1.0' as const,
      rawPrompt: result.rawPrompt,
      metricIds: result.metricIds,
      dimensions: result.dimensions,
      filters: result.filters,
      organizationId: userCtx.organizationId,
      userId: userCtx.userId
    };

    // Strict validation against shared contracts schema
    return DashboardRequestSchema.parse(payload);
  }

  // ─── Private Orchestration Methods ──────────────────────────────────────────

  private async _callLLMWithRetry(prompt: string): Promise<RawIntentOutput> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          'You are the Sria Info Tech Finance AI Assistant. Extract structured intent JSON conforming to specification. ' +
          'Only allowed metrics: total_revenue, total_expenses, net_profit, profit_margin. ' +
          'Only allowed dimensions: fiscal_period, month, company_code, business_unit. ' +
          'Never compute numbers. Output JSON only.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      try {
        const response = await this._llmProvider.complete(messages, {
          temperature: 0.1,
          responseFormat: 'json'
        });

        // Strip markdown code fences if model enclosed JSON in ```json ... ```
        let cleaned = response.content.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        }

        const parsedJson = JSON.parse(cleaned);
        return RawIntentOutputSchema.parse(parsedJson);
      } catch (err) {
        lastError = err as Error;
        // Append error hint to retry message
        messages.push({
          role: 'assistant',
          content: '{"error": "malformed_output"}'
        });
        messages.push({
          role: 'user',
          content: 'Your previous response was not valid JSON matching the schema. Please output only valid JSON.'
        });
      }
    }

    // Fallback if all retries exhausted: return safe rejection
    return {
      intentType: 'unsupported_request',
      rejectionReason: `Failed to parse structured intent after ${this._maxRetries + 1} attempts: ${lastError?.message}`,
      suggestedAlternatives: Object.keys(BASELINE_METRIC_CATALOG)
    };
  }

  private _interpretModelOutput(
    output: RawIntentOutput,
    rawPrompt: string,
    _userCtx: UserContext
  ): IntentProcessingResult {
    // Branch 1: Model flagged an unsupported request
    if (output.intentType === 'unsupported_request') {
      return {
        status: 'REJECTED',
        reason: output.rejectionReason,
        supportedMetrics: Object.keys(BASELINE_METRIC_CATALOG),
        rawPrompt
      };
    }

    // Branch 2: Model flagged clarification needed
    if (output.intentType === 'clarification_needed') {
      return {
        status: 'CLARIFICATION_REQUIRED',
        questions: output.clarificationQuestions,
        rawPrompt
      };
    }

    // Branch 3: Model attempted to create a dashboard -> Validate allowlists & required params
    const allowedMetrics = Object.keys(BASELINE_METRIC_CATALOG) as MetricId[];
    const validMetricIds: MetricId[] = [];
    const invalidMetrics: string[] = [];

    for (const m of output.metricIds) {
      if (allowedMetrics.includes(m as MetricId)) {
        validMetricIds.push(m as MetricId);
      } else {
        invalidMetrics.push(m);
      }
    }

    // If any extracted metric is not on the allowlist
    if (invalidMetrics.length > 0) {
      return {
        status: 'REJECTED',
        reason: `Metric(s) [${invalidMetrics.join(', ')}] are not in the approved Finance Metric Registry.`,
        supportedMetrics: allowedMetrics,
        rawPrompt
      };
    }

    // If no valid metrics
    if (validMetricIds.length === 0) {
      return {
        status: 'CLARIFICATION_REQUIRED',
        questions: [
          {
            questionId: 'clarify-metric',
            parameterName: 'metric',
            prompt: 'Please select one or more approved financial metrics for your dashboard.',
            reason: 'At least one approved metric is required to generate a dashboard.',
            options: ['Total Revenue', 'Total Expenses', 'Net Profit', 'Profit Margin'],
            suggestedDefault: 'Total Revenue'
          }
        ],
        rawPrompt
      };
    }

    // Dimension allowlist check
    const validDimensions: SupportedDimension[] = [];
    const supportedDims: SupportedDimension[] = ['fiscal_period', 'month', 'company_code', 'business_unit'];
    for (const d of output.dimensions) {
      if (supportedDims.includes(d as SupportedDimension)) {
        validDimensions.push(d as SupportedDimension);
      }
    }
    if (validDimensions.length === 0) {
      validDimensions.push('fiscal_period');
    }

    // Check required filters: companyCode and fiscalYear
    const clarificationQuestions: ClarificationQuestion[] = [];

    if (!output.filters.companyCode) {
      clarificationQuestions.push({
        questionId: 'clarify-company-code',
        parameterName: 'companyCode',
        prompt: 'Which SAP company code would you like to retrieve data for?',
        reason: 'Company code is required to identify the legal reporting entity.',
        options: ['1000', '2000'],
        suggestedDefault: '1000'
      });
    }

    if (!output.filters.fiscalYear) {
      clarificationQuestions.push({
        questionId: 'clarify-fiscal-year',
        parameterName: 'fiscalYear',
        prompt: 'Which fiscal year should be analyzed?',
        reason: 'Fiscal year is required to scope the accounting period.',
        options: ['2025', '2026'],
        suggestedDefault: '2026'
      });
    }

    if (clarificationQuestions.length > 0) {
      return {
        status: 'CLARIFICATION_REQUIRED',
        questions: clarificationQuestions,
        rawPrompt
      };
    }

    // All checks pass: Resolved!
    return {
      status: 'RESOLVED',
      metricIds: validMetricIds,
      dimensions: validDimensions,
      filters: {
        companyCode: output.filters.companyCode!,
        fiscalYear: output.filters.fiscalYear!,
        ...(output.filters.periodFrom ? { periodFrom: output.filters.periodFrom } : {}),
        ...(output.filters.periodTo ? { periodTo: output.filters.periodTo } : {}),
        ...(output.filters.currency ? { currency: output.filters.currency } : {})
      },
      rawPrompt
    };
  }
}

