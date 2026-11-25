/**
 * Mock LLM Provider
 * Phase 6 — AI Request Understanding & Clarification Engine
 *
 * Implements deterministic intent parsing and simulated LLM completions.
 * Used for development, offline testing, CI/CD, and prompt evaluation.
 *
 * Guaranteed properties:
 *  - Fully reproducible outputs for identical inputs.
 *  - Evaluates clear, ambiguous, unsupported, adversarial, and malformed inputs.
 *  - Zero external network dependencies or token costs.
 */

import type { LLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResponse } from './llm-provider.ts';
import type { RawIntentOutput } from './schemas/intent-schemas.ts';

export class MockLLMProvider implements LLMProvider {
  private _simulateMalformedOnce = false;

  getProviderName(): string {
    return 'mock-llm-provider';
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * Test hook: simulate a malformed (non-JSON) response on next call to test retry
   */
  simulateMalformedNextCall(): void {
    this._simulateMalformedOnce = true;
  }

  async complete(
    messages: LLMMessage[],
    _options?: LLMCompletionOptions
  ): Promise<LLMCompletionResponse> {
    if (this._simulateMalformedOnce) {
      this._simulateMalformedOnce = false;
      return {
        content: 'Error 500: Invalid syntax, model returned plain text instead of JSON.',
        modelName: 'mock-llm-v1',
        isMock: true
      };
    }

    // Extract the original user prompt from messages (first user message in conversation)
    const userMessage = messages.find(m => m.role === 'user');
    const prompt = (userMessage?.content ?? '').trim();

    const output = this._parsePromptToIntent(prompt);

    return {
      content: JSON.stringify(output, null, 2),
      usage: {
        promptTokens: 250,
        completionTokens: 80,
        totalTokens: 330
      },
      modelName: 'mock-finance-intent-model-v1',
      isMock: true
    };
  }

  // ─── Deterministic Rule Engine for Intent Mocking ──────────────────────────

  private _parsePromptToIntent(prompt: string): RawIntentOutput {
    const lower = prompt.toLowerCase();

    // 1. Guardrail / Adversarial Detection
    if (
      lower.includes('ignore previous') ||
      lower.includes('system prompt') ||
      lower.includes('drop table') ||
      lower.includes('delete from') ||
      lower.includes('select * from') ||
      lower.includes('grant admin') ||
      lower.includes('bypass') ||
      lower.includes('jailbreak') ||
      lower.includes('dan mode') ||
      lower.includes('developer mode') ||
      lower.includes('root administrator') ||
      lower.includes('repeat instructions') ||
      lower.includes('print instructions') ||
      lower.includes('union select') ||
      lower.includes("' or '1'='1") ||
      lower.includes('1=1') ||
      lower.includes('<script') ||
      lower.includes('rm -rf') ||
      lower.includes('webhook.site') ||
      lower.includes('exfiltrat')
    ) {
      return {
        intentType: 'unsupported_request',
        rejectionReason: 'The request contains disallowed commands or instructions that violate security policy.',
        suggestedAlternatives: ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin']
      };
    }

    // 2. Unsupported Metric Detection
    const unsupportedList = ['ebitda', 'arr', 'mrr', 'churn', 'headcount', 'stock price', 'cogs', 'cash flow'];
    for (const badMetric of unsupportedList) {
      if (lower.includes(badMetric)) {
        return {
          intentType: 'unsupported_request',
          rejectionReason: `Metric "${badMetric.toUpperCase()}" is not supported in the approved MVP metric catalog.`,
          suggestedAlternatives: ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin']
        };
      }
    }

    // 3. Metric Extraction
    const extractedMetrics: string[] = [];
    if (lower.includes('revenue') || lower.includes('sales')) {
      extractedMetrics.push('total_revenue');
    }
    if (lower.includes('expense') || lower.includes('cost') || lower.includes('spend')) {
      extractedMetrics.push('total_expenses');
    }
    if (lower.includes('profit margin') || lower.includes('margin')) {
      extractedMetrics.push('profit_margin');
    } else if (lower.includes('profit') || lower.includes('net income')) {
      extractedMetrics.push('net_profit');
    }

    // If no approved metric is found at all
    if (extractedMetrics.length === 0) {
      return {
        intentType: 'clarification_needed',
        clarificationQuestions: [
          {
            questionId: 'clarify-metric',
            parameterName: 'metric',
            prompt: 'Which financial metric would you like to view on your dashboard?',
            reason: 'No recognized financial metric was specified in the request.',
            options: ['Total Revenue', 'Total Expenses', 'Net Profit', 'Profit Margin'],
            suggestedDefault: 'Total Revenue'
          }
        ]
      };
    }

    // 4. Parameter Extraction
    // Company Code
    let companyCode: string | undefined;
    const ccMatch = prompt.match(/\b(?:company\s*code|company|cc|co)\s*[:=]?\s*([A-Za-z0-9_]{3,10})\b/i) ||
                    prompt.match(/\b(1000|2000|3000|US01|DE01)\b/);
    if (ccMatch) {
      companyCode = ccMatch[1];
    }

    // Fiscal Year
    let fiscalYear: number | undefined;
    const yrMatch = prompt.match(/\b(202[0-9])\b/);
    if (yrMatch) {
      fiscalYear = parseInt(yrMatch[1]!, 10);
    }

    // Fiscal Period
    let periodFrom: string | undefined;
    let periodTo: string | undefined;
    const periodRangeMatch = prompt.match(/\bperiod\s*(\d{1,2})\s*(?:to|-)\s*(\d{1,2})\b/i);
    if (periodRangeMatch) {
      periodFrom = periodRangeMatch[1]!.padStart(2, '0');
      periodTo = periodRangeMatch[2]!.padStart(2, '0');
    } else {
      const singlePeriodMatch = prompt.match(/\b(?:period|p|q[1-4]\s*m)\s*[:=]?\s*(\d{1,2})\b/i);
      if (singlePeriodMatch) {
        periodFrom = singlePeriodMatch[1]!.padStart(2, '0');
        periodTo = periodFrom;
      }
    }

    // 5. Ambiguity Check (Missing required parameters)
    const clarificationQuestions = [];

    if (!companyCode) {
      clarificationQuestions.push({
        questionId: 'clarify-company-code',
        parameterName: 'companyCode' as const,
        prompt: 'Which SAP company code would you like to retrieve data for?',
        reason: 'Company code is required to identify the legal reporting entity.',
        options: ['1000', '2000'],
        suggestedDefault: '1000'
      });
    }

    if (!fiscalYear) {
      clarificationQuestions.push({
        questionId: 'clarify-fiscal-year',
        parameterName: 'fiscalYear' as const,
        prompt: 'Which fiscal year should be analyzed?',
        reason: 'Fiscal year is required to scope the financial accounting period.',
        options: ['2025', '2026'],
        suggestedDefault: '2026'
      });
    }

    if (clarificationQuestions.length > 0) {
      return {
        intentType: 'clarification_needed',
        clarificationQuestions
      };
    }

    // 6. Complete, Unambiguous Intent
    return {
      intentType: 'create_dashboard',
      metricIds: Array.from(new Set(extractedMetrics)),
      dimensions: ['fiscal_period'],
      filters: {
        companyCode: companyCode!,
        fiscalYear: fiscalYear!,
        ...(periodFrom ? { periodFrom } : {}),
        ...(periodTo ? { periodTo } : {})
      }
    };
  }
}
