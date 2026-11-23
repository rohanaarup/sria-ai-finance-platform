/**
 * Foundational Dashboard Domain Contracts
 */

export type MetricId = 'total_revenue' | 'total_expenses' | 'net_profit' | 'profit_margin';

export type SupportedDimension = 'fiscal_period' | 'month' | 'company_code' | 'business_unit';

export interface DashboardRequest {
  id?: string;
  rawPrompt: string;
  metricIds: MetricId[];
  dimensions: SupportedDimension[];
  filters?: {
    companyCode?: string;
    fiscalYear?: number;
    periodFrom?: string;
    periodTo?: string;
  };
  organizationId: string;
  userId: string;
}

export interface ClarificationQuestion {
  questionId: string;
  parameterName: string;
  prompt: string;
  options?: string[];
  suggestedDefault?: string;
}

export interface MetricResult {
  metricId: MetricId;
  label: string;
  value: number;
  formattedValue: string;
  currency: string;
  variancePercent?: number;
  provenance: {
    sourceType: 'mock' | 's4hana';
    sourceSystem: string;
    retrievedAt: string;
    calculationVersion: string;
  };
}

export interface DashboardWidgetSpec {
  id: string;
  type: 'kpi_card' | 'bar_chart' | 'line_chart' | 'table';
  title: string;
  metricIds: MetricId[];
  dimension?: SupportedDimension;
  options?: Record<string, unknown>;
}

export interface DashboardSpec {
  version: '1.0';
  dashboardId: string;
  title: string;
  description?: string;
  organizationId: string;
  createdAt: string;
  generatedBy: string;
  widgets: DashboardWidgetSpec[];
  dataProvenance: {
    sourceType: 'mock' | 's4hana';
    retrievedAt: string;
  };
}

