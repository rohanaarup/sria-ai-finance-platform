/**
 * Frontend API Client
 * Phase 9 — React Dashboard Creation & Rendering Experience
 *
 * Connects the React UI to authenticated CAP endpoints.
 */

import type {
  DashboardRequest,
  ClarificationQuestion,
  MetricResult
} from '@sria/contracts';

export interface UnderstandResponse {
  status: 'RESOLVED' | 'CLARIFICATION_REQUIRED' | 'REJECTED';
  resolvedRequest?: DashboardRequest;
  clarifications?: ClarificationQuestion[];
  rejectionReason?: string;
  supportedMetrics?: string[];
}

export interface ExecutionResponse {
  status: 'SUCCESS' | 'FAILED';
  planJson?: string;
  resultsJson?: string;
  traceJson?: string;
  error?: string;
}

const getBaseUrl = () => (typeof window !== 'undefined' ? '' : 'http://localhost:4004');

export class ApiClient {
  /**
   * Health-check
   */
  static async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${getBaseUrl()}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Natural Language Intent Understanding
   */
  static async understandPrompt(prompt: string): Promise<UnderstandResponse> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/ai/UnderstandRequest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!res.ok) {
        throw new Error(`UnderstandRequest failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.status === 'RESOLVED' && data.resolvedRequest) {
        return {
          status: 'RESOLVED',
          resolvedRequest: JSON.parse(data.resolvedRequest)
        };
      }
      if (data.status === 'CLARIFICATION_REQUIRED' && data.clarificationJson) {
        return {
          status: 'CLARIFICATION_REQUIRED',
          clarifications: JSON.parse(data.clarificationJson)
        };
      }
      return {
        status: 'REJECTED',
        rejectionReason: data.rejectionReason || 'Request could not be understood.',
        supportedMetrics: data.supportedMetrics || []
      };
    } catch (err) {
      console.warn('[ApiClient] Server understand failed, evaluating with local fallback:', err);
      return this._localMockUnderstand(prompt);
    }
  }

  /**
   * Execute Plan & Retrieve Calculated Metrics
   */
  static async executeRequest(request: DashboardRequest): Promise<{
    results: MetricResult[];
    sourceType: 'mock' | 's4hana';
    isSynthetic: boolean;
  }> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/orchestration/ExecutePlan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestJson: JSON.stringify(request) })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.status === 'SUCCESS' && data.resultsJson) {
          const rawResults = JSON.parse(data.resultsJson);
          const firstBatch = rawResults[0];
          return {
            results: firstBatch?.metrics || [],
            sourceType: firstBatch?.sourceType || 'mock',
            isSynthetic: firstBatch?.isSynthetic ?? true
          };
        }
      }
    } catch (err) {
      console.warn('[ApiClient] Server execution failed, using local synthetic dataset:', err);
    }

    return this._localMockExecution(request);
  }

  // ─── Local Fallback for Seamless Offline Demo ───────────────────────────────

  private static _localMockUnderstand(prompt: string): UnderstandResponse {
    const lower = prompt.toLowerCase();
    if (!lower.includes('1000') && !lower.includes('2000') && !lower.includes('company')) {
      return {
        status: 'CLARIFICATION_REQUIRED',
        clarifications: [
          {
            questionId: 'clarify-company-code',
            parameterName: 'companyCode',
            prompt: 'Which SAP company code would you like to view?',
            reason: 'Company code is required to identify the legal reporting entity.',
            options: ['1000', '2000'],
            suggestedDefault: '1000'
          }
        ]
      };
    }

    const companyCode = lower.includes('2000') ? '2000' : '1000';
    const metricIds: ('total_revenue' | 'total_expenses' | 'net_profit' | 'profit_margin')[] = [];

    if (lower.includes('revenue') || lower.includes('sales')) metricIds.push('total_revenue');
    if (lower.includes('expense') || lower.includes('cost')) metricIds.push('total_expenses');
    if (lower.includes('profit') || lower.includes('income')) metricIds.push('net_profit');
    if (lower.includes('margin')) metricIds.push('profit_margin');
    if (metricIds.length === 0) {
      metricIds.push('total_revenue', 'total_expenses', 'net_profit', 'profit_margin');
    }

    return {
      status: 'RESOLVED',
      resolvedRequest: {
        version: '1.0',
        rawPrompt: prompt,
        metricIds,
        dimensions: ['fiscal_period'],
        filters: { companyCode, fiscalYear: 2026 },
        organizationId: 'ORG_ACME',
        userId: 'finance_analyst'
      }
    };
  }

  private static _localMockExecution(request: DashboardRequest) {
    const isCompany2000 = request.filters?.companyCode === '2000';
    const revenue = isCompany2000 ? 50000 : 350000;
    const expenses = isCompany2000 ? 75000 : 230000;
    const netProfit = revenue - expenses;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    const provenance = {
      sourceType: 'mock' as const,
      sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
      retrievedAt: new Date().toISOString(),
      calculationVersion: '1.0.0',
      isSynthetic: true,
      appliedFilters: request.filters
    };

    const results: MetricResult[] = [
      {
        metricId: 'total_revenue',
        label: 'Total Revenue',
        value: revenue,
        formattedValue: `$${revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        currency: 'USD',
        provenance
      },
      {
        metricId: 'total_expenses',
        label: 'Total Expenses',
        value: expenses,
        formattedValue: `$${expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        currency: 'USD',
        provenance
      },
      {
        metricId: 'net_profit',
        label: 'Net Profit',
        value: netProfit,
        formattedValue: `$${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        currency: 'USD',
        provenance
      },
      {
        metricId: 'profit_margin',
        label: 'Profit Margin',
        value: Math.round(margin * 100) / 100,
        formattedValue: `${margin.toFixed(2)}%`,
        currency: 'PCT',
        isZeroDenominator: false,
        provenance
      }
    ];

    return {
      results: results.filter(r => request.metricIds.includes(r.metricId)),
      sourceType: 'mock' as const,
      isSynthetic: true
    };
  }
}
