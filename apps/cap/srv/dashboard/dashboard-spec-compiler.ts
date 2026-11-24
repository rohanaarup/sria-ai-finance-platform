/**
 * DashboardSpec Compiler
 * Phase 8 — Deterministic Finance Processing & DashboardSpec Compiler
 *
 * Compiles validated DashboardRequest, calculated MetricResults, and ProvenanceMetadata
 * into a strictly validated DashboardSpec JSON document.
 *
 * GOVERNANCE RULES:
 *  - Component types restricted to allowlist: kpi_card, bar_chart, line_chart, table.
 *  - The model may propose titles/descriptions, but CANNOT alter numerical values or provenance.
 *  - Attached provenance preserves: sourceType, sourceSystem, retrievedAt, appliedFilters.
 *  - Enforces schema validation against DashboardSpecSchema from @sria/contracts.
 */

import { randomUUID } from 'node:crypto';
import {
  DashboardSpecSchema,
  WidgetTypeEnum
} from '@sria/contracts';
import type {
  DashboardSpec,
  DashboardWidgetSpec,
  DashboardRequest,
  MetricResult,
  ProvenanceMetadata,
  MetricId,
  WidgetType
} from '@sria/contracts';

export interface CompilationOptions {
  title?: string;
  description?: string;
  preferredVisualType?: WidgetType;
  colorScheme?: 'terracotta' | 'rust' | 'copper' | 'neutral';
}

export class DashboardSpecCompiler {
  /**
   * Compiles a complete, schema-valid DashboardSpec from verified components.
   */
  compile(
    request: DashboardRequest,
    results: MetricResult[],
    provenance: ProvenanceMetadata,
    options?: CompilationOptions
  ): DashboardSpec {
    const dashboardId = randomUUID();
    const createdAt = new Date().toISOString();

    // 1. Construct title & description
    const companyCode = request.filters?.companyCode || 'All Companies';
    const fiscalYear = request.filters?.fiscalYear || new Date().getFullYear();
    const periodLabel = request.filters?.periodFrom
      ? `Period ${request.filters.periodFrom}${request.filters.periodTo ? ` - ${request.filters.periodTo}` : ''}`
      : 'Full Year';

    const defaultTitle = `Finance Overview: Company ${companyCode} (FY ${fiscalYear} ${periodLabel})`;
    const title = options?.title?.trim() || defaultTitle;
    const description = options?.description?.trim() ||
      `Generated financial dashboard for ${companyCode} covering ${request.metricIds.join(', ')}.`;

    // 2. Build allowlisted visual widgets
    const widgets = this._buildWidgets(request, results, options);

    // 3. Construct freshness notice
    const sourceLabel = provenance.sourceType === 'mock'
      ? 'Source: Synthetic Test Fixtures [Mock Dev Mode]'
      : `Source: SAP S/4HANA OData [Live System: ${provenance.sourceSystem}]`;
    const freshnessNotice = `${sourceLabel} · Retrieved: ${new Date(provenance.retrievedAt).toLocaleTimeString()} · Calculation Engine v${provenance.calculationVersion}`;

    // 4. Assemble complete payload
    const specPayload = {
      version: '1.0' as const,
      dashboardId,
      title,
      description,
      organizationId: request.organizationId,
      createdAt,
      generatedBy: request.userId,
      widgets,
      results,
      dataProvenance: provenance,
      freshnessNotice
    };

    // 5. Schema validation against @sria/contracts
    return DashboardSpecSchema.parse(specPayload);
  }

  // ─── Private Widget Assembler ───────────────────────────────────────────────

  private _buildWidgets(
    request: DashboardRequest,
    _results: MetricResult[],
    options?: CompilationOptions
  ): DashboardWidgetSpec[] {
    const widgets: DashboardWidgetSpec[] = [];
    const colorScheme = options?.colorScheme || 'terracotta';

    // A. Always generate KPI summary cards for each requested metric
    for (const metricId of request.metricIds) {
      const widgetId = `kpi-${metricId}-${randomUUID().slice(0, 8)}`;
      const widget: DashboardWidgetSpec = {
        id: widgetId,
        type: 'kpi_card',
        title: this._formatMetricTitle(metricId),
        metricIds: [metricId as MetricId],
        dimension: request.dimensions?.[0] || 'fiscal_period',
        options: {
          colorScheme,
          decimalPlaces: metricId === 'profit_margin' ? 2 : 0
        }
      };
      this._assertAllowedWidgetType(widget.type);
      widgets.push(widget);
    }

    // B. If request asks for trend or multiple metrics, add a Comparative Bar/Line Chart
    if (request.metricIds.length >= 2 || (request.filters?.periodFrom && request.filters?.periodTo)) {
      const chartType: WidgetType = options?.preferredVisualType === 'line_chart' ? 'line_chart' : 'bar_chart';
      this._assertAllowedWidgetType(chartType);

      widgets.push({
        id: `chart-trend-${randomUUID().slice(0, 8)}`,
        type: chartType,
        title: 'Financial Metrics Comparison',
        metricIds: request.metricIds as MetricId[],
        dimension: request.dimensions?.[0] || 'fiscal_period',
        options: {
          showLegend: true,
          colorScheme
        }
      });
    }

    // C. Tabular Breakdown Widget
    widgets.push({
      id: `table-details-${randomUUID().slice(0, 8)}`,
      type: 'table',
      title: 'Detailed Financial Ledger Summary',
      metricIds: request.metricIds as MetricId[],
      dimension: request.dimensions?.[0] || 'fiscal_period',
      options: {
        sortOrder: 'asc'
      }
    });

    return widgets;
  }

  private _assertAllowedWidgetType(type: string): void {
    const allowed = WidgetTypeEnum.options;
    if (!allowed.includes(type as WidgetType)) {
      throw new Error(`[DashboardSpecCompiler] Disallowed widget visual type: "${type}". Allowed: [${allowed.join(', ')}]`);
    }
  }

  private _formatMetricTitle(metricId: string): string {
    switch (metricId) {
      case 'total_revenue': return 'Total Revenue';
      case 'total_expenses': return 'Total Expenses';
      case 'net_profit': return 'Net Profit';
      case 'profit_margin': return 'Profit Margin (%)';
      default: return metricId;
    }
  }
}

