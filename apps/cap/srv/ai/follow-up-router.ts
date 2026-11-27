/**
 * Follow-up Intent Classifier & Context Router
 * Phase 10 — Follow-up requests, save/reopen & dashboard lifecycle
 *
 * Classifies conversational follow-up requests into:
 *   1. PRESENTATION_ONLY: Visual changes, chart toggles, color themes, title changes.
 *      -> Reuses current validated aggregates; ZERO redundant data retrieval.
 *   2. DATA_CHANGING: Changes in metrics, company code, fiscal year, or period.
 *      -> Triggers fresh authorized retrieval via Orchestrator.
 *   3. REFRESH: Re-queries same filters to pull latest accounting postings.
 *   4. UNSUPPORTED: Out-of-scope, predictive, or malicious queries rejected safely.
 */

import type { DashboardSpec, DashboardRequest, MetricId, WidgetType } from '@sria/contracts';
import { Orchestrator } from './orchestrator.ts';
import type { ExecutionContext } from './tool-registry.ts';
import { DashboardSpecCompiler } from '../dashboard/dashboard-spec-compiler.ts';

export type FollowUpType =
  | 'PRESENTATION_ONLY'
  | 'DATA_CHANGING'
  | 'REFRESH'
  | 'UNSUPPORTED';

export interface FollowUpClassification {
  type: FollowUpType;
  reason: string;
  suggestedAction?: string;
  extractedParameters?: {
    preferredVisualType?: WidgetType;
    newTitle?: string;
    addMetrics?: MetricId[];
    newCompanyCode?: string;
    newPeriod?: string;
  };
}

export interface FollowUpExecutionResult {
  type: FollowUpType;
  spec?: DashboardSpec;
  reusedExistingData: boolean;
  message: string;
}

export class FollowUpRouter {
  private readonly _orchestrator: Orchestrator;
  private readonly _compiler: DashboardSpecCompiler;

  constructor(orchestrator?: Orchestrator, compiler?: DashboardSpecCompiler) {
    this._orchestrator = orchestrator ?? new Orchestrator();
    this._compiler = compiler ?? new DashboardSpecCompiler();
  }

  /**
   * Classifies a follow-up user prompt
   */
  classify(prompt: string): FollowUpClassification {
    const lower = prompt.toLowerCase().trim();

    // 1. Guardrail / Unsupported
    if (
      lower.includes('predict') ||
      lower.includes('forecast') ||
      lower.includes('stock price') ||
      lower.includes('ebitda') ||
      lower.includes('drop') ||
      lower.includes('delete from') ||
      lower.includes('select *') ||
      lower.includes('ignore previous') ||
      lower.includes('jailbreak') ||
      lower.includes('developer mode') ||
      lower.includes('dan mode') ||
      lower.includes('union select') ||
      lower.includes("' or '1'='1") ||
      lower.includes('1=1') ||
      lower.includes('<script') ||
      lower.includes('rm -rf') ||
      lower.includes('system prompt') ||
      lower.includes('webhook.site')
    ) {
      return {
        type: 'UNSUPPORTED',
        reason: 'Follow-up requests for predictive forecasting, unapproved metrics, security bypasses, or database commands are not supported.'
      };
    }

    // 2. Data Refresh
    if (
      lower === 'refresh' ||
      lower.includes('refresh data') ||
      lower.includes('reload') ||
      lower.includes('fetch latest') ||
      lower.includes('sync')
    ) {
      return {
        type: 'REFRESH',
        reason: 'User requested on-demand data refresh against current query parameters.'
      };
    }

    // 3. Presentation-Only Visual Modifications
    if (
      lower.includes('bar chart') ||
      lower.includes('line chart') ||
      lower.includes('table') ||
      lower.includes('rename') ||
      lower.includes('title') ||
      lower.includes('color') ||
      lower.includes('theme') ||
      lower.includes('view as')
    ) {
      let preferredVisualType: WidgetType | undefined;
      if (lower.includes('bar')) preferredVisualType = 'bar_chart';
      else if (lower.includes('line')) preferredVisualType = 'line_chart';
      else if (lower.includes('table')) preferredVisualType = 'table';

      let newTitle: string | undefined;
      const quotedMatch = prompt.match(/["']([^"']+)["']/);
      if (quotedMatch) {
        newTitle = quotedMatch[1]?.trim();
      } else {
        const titleMatch = prompt.match(/(?:rename(?: dashboard)?|title)\s*(?:to|as|=)?\s*[:=]?\s*(.+)$/i);
        if (titleMatch) {
          newTitle = titleMatch[1]?.trim();
        }
      }

      return {
        type: 'PRESENTATION_ONLY',
        reason: 'Visual presentation or layout modification without changing underlying metric data.',
        extractedParameters: {
          preferredVisualType,
          newTitle
        }
      };
    }

    // 4. Data-Changing Modifications
    if (
      lower.includes('add') ||
      lower.includes('margin') ||
      lower.includes('revenue') ||
      lower.includes('expense') ||
      lower.includes('profit') ||
      lower.includes('company') ||
      lower.includes('2000') ||
      lower.includes('1000') ||
      lower.includes('period') ||
      lower.includes('filter')
    ) {
      const addMetrics: MetricId[] = [];
      if (lower.includes('margin')) addMetrics.push('profit_margin');
      if (lower.includes('revenue') || lower.includes('sales')) addMetrics.push('total_revenue');
      if (lower.includes('expense') || lower.includes('cost')) addMetrics.push('total_expenses');
      if (lower.includes('profit') || lower.includes('net income')) addMetrics.push('net_profit');

      let newCompanyCode: string | undefined;
      if (lower.includes('2000')) newCompanyCode = '2000';
      else if (lower.includes('1000')) newCompanyCode = '1000';

      let newPeriod: string | undefined;
      const periodMatch = prompt.match(/period\s*(\d{1,2})/i);
      if (periodMatch) {
        newPeriod = periodMatch[1]?.padStart(2, '0');
      }

      return {
        type: 'DATA_CHANGING',
        reason: 'Request modifies requested metrics, reporting entity, or accounting period.',
        extractedParameters: {
          addMetrics,
          newCompanyCode,
          newPeriod
        }
      };
    }

    // Default to presentation if no data changes detected, else unsupported
    return {
      type: 'PRESENTATION_ONLY',
      reason: 'General layout adjustment.'
    };
  }

  /**
   * Executes follow-up modification based on classified routing
   */
  async executeFollowUp(
    prompt: string,
    currentSpec: DashboardSpec,
    ctx: ExecutionContext
  ): Promise<FollowUpExecutionResult> {
    const classification = this.classify(prompt);

    switch (classification.type) {
      // ─── Case A: Presentation Only (Reuse in-memory validated figures) ─────────
      case 'PRESENTATION_ONLY': {
        const updatedWidgets = [...currentSpec.widgets];
        const preferredType = classification.extractedParameters?.preferredVisualType;

        if (preferredType) {
          // Update visual widget types without calling backend data provider
          for (const w of updatedWidgets) {
            if (w.type === 'bar_chart' || w.type === 'line_chart') {
              w.type = preferredType;
            }
          }
        }

        const updatedTitle = classification.extractedParameters?.newTitle || currentSpec.title;

        const updatedSpec: DashboardSpec = {
          ...currentSpec,
          title: updatedTitle,
          widgets: updatedWidgets
        };

        return {
          type: 'PRESENTATION_ONLY',
          spec: updatedSpec,
          reusedExistingData: true,
          message: 'Presentation updated successfully without re-querying SAP.'
        };
      }

      // ─── Case B: Data Refresh (Re-run same query filters) ──────────────────────
      case 'REFRESH': {
        const filters = currentSpec.dataProvenance.appliedFilters || {};
        const companyCode = (filters['companyCode'] as string) || '1000';
        const fiscalYear = Number(filters['fiscalYear'] || 2026);
        const fiscalPeriod = filters['fiscalPeriod'] as string | undefined;

        // Reconstruct request
        const metricIds = (currentSpec.results || []).map(r => r.metricId as MetricId);
        if (metricIds.length === 0) metricIds.push('total_revenue', 'net_profit');

        const request: DashboardRequest = {
          version: '1.0',
          rawPrompt: `Refresh: ${currentSpec.title}`,
          metricIds,
          dimensions: ['fiscal_period'],
          filters: {
            companyCode,
            fiscalYear,
            ...(fiscalPeriod ? { periodFrom: fiscalPeriod } : {})
          },
          organizationId: ctx.organizationId,
          userId: ctx.userId
        };

        const outcome = await this._orchestrator.executeRequest(request, ctx);
        if (outcome.status !== 'SUCCESS') {
          throw new Error(`Refresh failed: ${outcome.error}`);
        }

        const firstBatch = outcome.results[0]!;
        const refreshedProvenance = {
          ...currentSpec.dataProvenance,
          retrievedAt: new Date().toISOString(),
          isSynthetic: firstBatch.isSynthetic
        };

        const refreshedResults = firstBatch.metrics.map(m => ({
          metricId: m.metricId as MetricId,
          label: m.label,
          value: m.value,
          formattedValue: m.formattedValue,
          currency: m.currency,
          isZeroDenominator: m.isZeroDenominator,
          provenance: refreshedProvenance
        }));

        const refreshedSpec = this._compiler.compile(
          request,
          refreshedResults,
          refreshedProvenance,
          { title: currentSpec.title, description: currentSpec.description }
        );

        return {
          type: 'REFRESH',
          spec: refreshedSpec,
          reusedExistingData: false,
          message: 'Financial figures refreshed on demand from source.'
        };
      }

      // ─── Case C: Data Changing (New metrics, company, or period) ───────────────
      case 'DATA_CHANGING': {
        const currentFilters = currentSpec.dataProvenance.appliedFilters || {};
        const companyCode =
          classification.extractedParameters?.newCompanyCode ||
          (currentFilters['companyCode'] as string) ||
          '1000';

        const fiscalYear = Number(currentFilters['fiscalYear'] || 2026);
        const fiscalPeriod =
          classification.extractedParameters?.newPeriod ||
          (currentFilters['fiscalPeriod'] as string | undefined);

        // Merge metrics
        const existingMetrics = (currentSpec.results || []).map(r => r.metricId as MetricId);
        const newMetrics = classification.extractedParameters?.addMetrics || [];
        const mergedMetrics = Array.from(new Set([...existingMetrics, ...newMetrics]));
        if (mergedMetrics.length === 0) mergedMetrics.push('total_revenue');

        const request: DashboardRequest = {
          version: '1.0',
          rawPrompt: prompt,
          metricIds: mergedMetrics,
          dimensions: ['fiscal_period'],
          filters: {
            companyCode,
            fiscalYear,
            ...(fiscalPeriod ? { periodFrom: fiscalPeriod } : {})
          },
          organizationId: ctx.organizationId,
          userId: ctx.userId
        };

        const outcome = await this._orchestrator.executeRequest(request, ctx);
        if (outcome.status !== 'SUCCESS') {
          throw new Error(`Data-changing follow-up failed: ${outcome.error}`);
        }

        const firstBatch = outcome.results[0]!;
        const provenance = {
          sourceType: firstBatch.sourceType,
          sourceSystem: firstBatch.isSynthetic ? 'SAP_SYNTHETIC_OFFLINE_FIXTURE' : 'SAP_S4HANA_LIVE',
          retrievedAt: new Date().toISOString(),
          calculationVersion: '1.0.0',
          isSynthetic: firstBatch.isSynthetic,
          appliedFilters: request.filters,
          // G2-02: keep the data product's provenance v2 (freshness, query hash, quality flags, versions)
          ...((firstBatch as any).provenance ? { v2: (firstBatch as any).provenance } : {})
        };

        const results = firstBatch.metrics.map(m => ({
          metricId: m.metricId as MetricId,
          label: m.label,
          value: m.value,
          formattedValue: m.formattedValue,
          currency: m.currency,
          isZeroDenominator: m.isZeroDenominator,
          provenance
        }));

        const newSpec = this._compiler.compile(
          request,
          results,
          provenance,
          {
            title: `Finance Dashboard: Company ${companyCode} (FY ${fiscalYear})`,
            description: `Updated from follow-up: "${prompt}".`
          }
        );

        return {
          type: 'DATA_CHANGING',
          spec: newSpec,
          reusedExistingData: false,
          message: `Retrieved fresh data for ${mergedMetrics.join(', ')}.`
        };
      }

      // ─── Case D: Unsupported ──────────────────────────────────────────────────
      case 'UNSUPPORTED':
      default:
        return {
          type: 'UNSUPPORTED',
          reusedExistingData: true,
          message: classification.reason
        };
    }
  }
}
