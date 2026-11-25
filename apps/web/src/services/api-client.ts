/**
 * Frontend API Client
 * Phase 9 — React Dashboard Creation & Rendering Experience
 *
 * Connects the React UI to authenticated CAP endpoints.
 */

import type {
  DashboardRequest,
  ClarificationQuestion,
  MetricResult,
  DashboardSpec
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

const getBaseUrl = () => (typeof window !== 'undefined' ? '' : 'http://127.0.0.1:4004');

export class ApiClient {
  /**
   * Health-check
   */
  static async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${getBaseUrl()}/health`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Natural Language Intent Understanding
   */
  static async understandPrompt(prompt: string): Promise<UnderstandResponse> {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      return this._localMockUnderstand(prompt);
    }
    try {
      const res = await fetch(`${getBaseUrl()}/api/ai/UnderstandRequest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(1500)
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
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
      return this._localMockExecution(request);
    }
    try {
      const res = await fetch(`${getBaseUrl()}/api/orchestration/ExecutePlan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestJson: JSON.stringify(request) }),
        signal: AbortSignal.timeout(1500)
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

  // ─── Lifecycle & Follow-up API Methods ──────────────────────────────────────

  /**
   * Save active dashboard configuration to database
   */
  static async saveDashboard(
    title: string,
    spec: DashboardSpec,
    description?: string
  ): Promise<{ dashboardId: string; status: string }> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/SaveDashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || spec.description,
          specJson: JSON.stringify(spec)
        })
      });
      if (res.ok) {
        const data = await res.json();
        return { dashboardId: data.dashboardId, status: data.status };
      }
    } catch (err) {
      console.warn('[ApiClient] Server save failed, saving to local cache:', err);
    }

    const localId = `local-${Date.now()}`;
    const localStore = JSON.parse(localStorage.getItem('sria_saved_dashboards') || '[]');
    localStore.push({
      id: localId,
      title,
      description: description || spec.description,
      createdAt: new Date().toISOString(),
      version: '1.0',
      isStale: true,
      spec
    });
    localStorage.setItem('sria_saved_dashboards', JSON.stringify(localStore));
    return { dashboardId: localId, status: 'SAVED' };
  }

  /**
   * List saved dashboards from database
   */
  static async listDashboards(): Promise<Array<{
    id: string;
    title: string;
    description?: string;
    createdAt: string;
    version: string;
    isStale: boolean;
  }>> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/ListDashboards()`);
      if (res.ok) {
        const data = await res.json();
        const items = data.value || data;
        if (Array.isArray(items) && items.length > 0) {
          return items.map((item: any) => ({
            id: item.ID || item.id,
            title: item.title,
            description: item.description,
            createdAt: item.createdAt || new Date().toISOString(),
            version: '1.0',
            isStale: true
          }));
        }
      }
    } catch (err) {
      console.warn('[ApiClient] Server list failed, checking local storage:', err);
    }

    const localStore = JSON.parse(localStorage.getItem('sria_saved_dashboards') || '[]');
    return localStore.map((d: any) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      createdAt: d.createdAt,
      version: d.version,
      isStale: true
    }));
  }

  /**
   * Reopen a saved dashboard specification
   */
  static async reopenDashboard(
    dashboardId: string
  ): Promise<{ spec: DashboardSpec; isStale: boolean }> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/ReopenDashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId })
      });
      if (res.ok) {
        const data = await res.json();
        return {
          spec: JSON.parse(data.specJson),
          isStale: data.isStale ?? true
        };
      }
    } catch (err) {
      console.warn('[ApiClient] Server reopen failed, reading local storage:', err);
    }

    const localStore = JSON.parse(localStorage.getItem('sria_saved_dashboards') || '[]');
    const match = localStore.find((d: any) => d.id === dashboardId);
    if (match && match.spec) {
      return { spec: match.spec, isStale: true };
    }
    throw new Error(`Dashboard ${dashboardId} not found.`);
  }

  /**
   * Rename a dashboard
   */
  static async renameDashboard(dashboardId: string, newTitle: string): Promise<boolean> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/RenameDashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId, newTitle })
      });
      if (res.ok) return true;
    } catch (err) {
      console.warn('[ApiClient] Server rename failed:', err);
    }

    const localStore = JSON.parse(localStorage.getItem('sria_saved_dashboards') || '[]');
    const match = localStore.find((d: any) => d.id === dashboardId);
    if (match) {
      match.title = newTitle;
      if (match.spec) match.spec.title = newTitle;
      localStorage.setItem('sria_saved_dashboards', JSON.stringify(localStore));
      return true;
    }
    return false;
  }

  /**
   * Delete a dashboard
   */
  static async deleteDashboard(dashboardId: string): Promise<boolean> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/DeleteDashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId })
      });
      if (res.ok) return true;
    } catch (err) {
      console.warn('[ApiClient] Server delete failed:', err);
    }

    let localStore = JSON.parse(localStorage.getItem('sria_saved_dashboards') || '[]');
    localStore = localStore.filter((d: any) => d.id !== dashboardId);
    localStorage.setItem('sria_saved_dashboards', JSON.stringify(localStore));
    return true;
  }

  /**
   * Refresh a dashboard's financial data on demand
   */
  static async refreshDashboard(
    dashboardId: string
  ): Promise<{ spec: DashboardSpec; refreshedAt: string }> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/RefreshDashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId })
      });
      if (res.ok) {
        const data = await res.json();
        return {
          spec: JSON.parse(data.refreshedSpecJson),
          refreshedAt: data.refreshedAt
        };
      }
    } catch (err) {
      console.warn('[ApiClient] Server refresh failed:', err);
    }
    throw new Error('On-demand refresh requires active backend connection.');
  }

  /**
   * Process a conversational follow-up request
   */
  static async processFollowUp(
    prompt: string,
    currentSpec: DashboardSpec
  ): Promise<{
    spec?: DashboardSpec;
    reusedExistingData: boolean;
    message: string;
    type: 'PRESENTATION_ONLY' | 'DATA_CHANGING' | 'REFRESH' | 'UNSUPPORTED';
  }> {
    const lower = prompt.toLowerCase().trim();

    // 1. Guardrail / Unsupported
    if (
      lower.includes('predict') ||
      lower.includes('forecast') ||
      lower.includes('stock price') ||
      lower.includes('ebitda') ||
      lower.includes('drop') ||
      lower.includes('delete from')
    ) {
      return {
        type: 'UNSUPPORTED',
        reusedExistingData: true,
        message: 'Unsupported follow-up: Predictive analysis and direct DB commands are blocked.'
      };
    }

    // 2. Presentation Only
    if (
      lower.includes('bar') ||
      lower.includes('line') ||
      lower.includes('table') ||
      lower.includes('rename') ||
      lower.includes('title')
    ) {
      let targetType: 'bar_chart' | 'line_chart' | 'table' | undefined;
      if (lower.includes('bar')) targetType = 'bar_chart';
      else if (lower.includes('line')) targetType = 'line_chart';
      else if (lower.includes('table')) targetType = 'table';

      const updatedWidgets = currentSpec.widgets.map((w: any) => {
        if (targetType && (w.type === 'bar_chart' || w.type === 'line_chart')) {
          return { ...w, type: targetType };
        }
        return w;
      });

      const updatedSpec: DashboardSpec = {
        ...currentSpec,
        widgets: updatedWidgets
      };

      return {
        type: 'PRESENTATION_ONLY',
        spec: updatedSpec,
        reusedExistingData: true,
        message: 'Presentation updated. Validated calculation figures reused without re-querying SAP.'
      };
    }

    // 3. Data-Changing or Refresh -> Route through understand/execute flow
    return {
      type: 'DATA_CHANGING',
      reusedExistingData: false,
      message: 'Data modification detected. Triggering fresh authorized retrieval.'
    };
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
