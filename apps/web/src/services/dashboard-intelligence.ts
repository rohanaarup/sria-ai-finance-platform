import type { DashboardSpec, MetricResult } from '@sria/contracts';
import type {
  BusinessUnitSlice,
  CompanyComparisonPoint,
  PeriodSeriesPoint,
} from './api-client';

export type DashboardLayoutArchetype =
  | 'executive_overview'
  | 'revenue_intelligence'
  | 'expense_intelligence'
  | 'profitability_analysis'
  | 'financial_comparison';

export interface AnalyticalInsight {
  id: string;
  tone: 'positive' | 'negative' | 'warning' | 'neutral';
  title: string;
  detail: string;
}

/**
 * Deterministically selects the optimal dashboard composition layout
 * from the DashboardSpec without modifying the underlying schema.
 */
export function detectDashboardLayout(
  spec: DashboardSpec,
  comparisonMode: boolean
): DashboardLayoutArchetype {
  const lowerTitle = spec.title.toLowerCase();
  const lowerDesc = (spec.description || '').toLowerCase();
  const metricIds = (spec.results || []).map((r) => r.metricId);

  if (
    comparisonMode ||
    lowerTitle.includes('comparison') ||
    lowerTitle.includes('compare') ||
    lowerDesc.includes('compare')
  ) {
    return 'financial_comparison';
  }

  if (
    (metricIds.length === 1 && metricIds[0] === 'total_revenue') ||
    (lowerTitle.includes('revenue') && !lowerTitle.includes('overview'))
  ) {
    return 'revenue_intelligence';
  }

  if (
    (metricIds.length === 1 && metricIds[0] === 'total_expenses') ||
    (lowerTitle.includes('expense') && !lowerTitle.includes('overview'))
  ) {
    return 'expense_intelligence';
  }

  if (
    lowerTitle.includes('profitability') ||
    (metricIds.length <= 2 &&
      (metricIds.includes('net_profit') || metricIds.includes('profit_margin')) &&
      !metricIds.includes('total_revenue'))
  ) {
    return 'profitability_analysis';
  }

  return 'executive_overview';
}

export function getLayoutDisplayName(layout: DashboardLayoutArchetype): string {
  switch (layout) {
    case 'executive_overview':
      return 'Executive Overview';
    case 'revenue_intelligence':
      return 'Revenue Intelligence';
    case 'expense_intelligence':
      return 'Expense Intelligence';
    case 'profitability_analysis':
      return 'Profitability Analysis';
    case 'financial_comparison':
      return 'Entity Comparison';
  }
}

export function buildExecutiveNarrative(
  spec: DashboardSpec,
  periodSeries: PeriodSeriesPoint[],
  comparisonData?: CompanyComparisonPoint[]
): string | null {
  const results = spec.results || [];
  if (results.length === 0) return null;

  const find = (id: string) => results.find((r) => r.metricId === id);
  const revenue = find('total_revenue');
  const expenses = find('total_expenses');
  const profit = find('net_profit');
  const margin = find('profit_margin');

  const parts: string[] = [];

  if (revenue) {
    parts.push(`Recognized revenue totals ${revenue.formattedValue}`);
  }
  if (expenses && revenue && revenue.value > 0) {
    const ratio = ((expenses.value / revenue.value) * 100).toFixed(1);
    parts.push(`against ${expenses.formattedValue} in operating expenses (${ratio}% cost ratio)`);
  } else if (expenses) {
    parts.push(`with total operating expenses at ${expenses.formattedValue}`);
  }
  if (profit) {
    const isPositive = profit.value >= 0;
    parts.push(
      `yielding a ${isPositive ? 'net profit' : 'net operating loss'} of ${profit.formattedValue}`
    );
  }
  if (margin && !margin.isZeroDenominator) {
    parts.push(`(${margin.formattedValue} operating margin)`);
  } else if (margin?.isZeroDenominator) {
    parts.push('(profit margin is undefined due to zero recognized revenue)');
  }

  let narrative = parts.length > 0 ? parts.join(' ') + '.' : '';

  if (periodSeries.length >= 2) {
    const first = periodSeries[0]!;
    const last = periodSeries[periodSeries.length - 1]!;
    if (first.total_revenue > 0) {
      const revDelta = ((last.total_revenue - first.total_revenue) / first.total_revenue) * 100;
      const sign = revDelta >= 0 ? '+' : '';
      narrative += ` Period ${last.period} revenue moved ${sign}${revDelta.toFixed(1)}% versus Period ${first.period}.`;
    }
  }

  if (comparisonData && comparisonData.length === 2) {
    const c1 = comparisonData[0]!.results.find((r) => r.metricId === 'total_revenue');
    const c2 = comparisonData[1]!.results.find((r) => r.metricId === 'total_revenue');
    if (c1 && c2) {
      narrative += ` Comparing Company 1000 (${c1.formattedValue}) against Company 2000 (${c2.formattedValue}).`;
    }
  }

  return narrative.trim() || null;
}

export function buildAnalyticalInsights(
  spec: DashboardSpec,
  periodSeries: PeriodSeriesPoint[],
  buSlices: BusinessUnitSlice[],
  comparisonData?: CompanyComparisonPoint[]
): AnalyticalInsight[] {
  const results = spec.results || [];
  const insights: AnalyticalInsight[] = [];

  const find = (id: string) => results.find((r) => r.metricId === id);
  const revenue = find('total_revenue');
  const expenses = find('total_expenses');
  const profit = find('net_profit');
  const margin = find('profit_margin');

  if (margin) {
    if (margin.isZeroDenominator) {
      insights.push({
        id: 'zero-denom',
        tone: 'warning',
        title: 'Zero Revenue Denominator',
        detail:
          'Profit margin defaulted to 0.00% because no positive revenue postings were recorded in the selected scope.',
      });
    } else if (margin.value >= 25) {
      insights.push({
        id: 'margin-strong',
        tone: 'positive',
        title: 'Strong Operating Margin',
        detail: `Operating margin of ${margin.formattedValue} reflects healthy unit economics and disciplined operating cost absorption.`,
      });
    } else if (margin.value >= 0) {
      insights.push({
        id: 'margin-mod',
        tone: 'neutral',
        title: 'Moderate Margin Profile',
        detail: `Operating margin stands at ${margin.formattedValue}. Review top expense units for margin expansion leverage.`,
      });
    } else {
      insights.push({
        id: 'margin-neg',
        tone: 'negative',
        title: 'Negative Margin Alert',
        detail: `Operating margin of ${margin.formattedValue} indicates operating costs exceeded recognized revenue for this period.`,
      });
    }
  }

  if (revenue && expenses && expenses.value > 0) {
    const coverage = (revenue.value / expenses.value).toFixed(2);
    insights.push({
      id: 'cost-coverage',
      tone: revenue.value >= expenses.value ? 'positive' : 'negative',
      title: 'Expense Coverage Ratio',
      detail: `Revenue covers expenses ${coverage}× — each $1.00 of operating cost corresponds to $${coverage} in recognized revenue.`,
    });
  }

  if (profit && profit.value < 0) {
    insights.push({
      id: 'net-loss',
      tone: 'negative',
      title: 'Operating Loss Recorded',
      detail: `Net profit is ${profit.formattedValue}. Investigate period expense postings and revenue timing.`,
    });
  }

  if (periodSeries.length >= 2) {
    const p1 = periodSeries[0]!;
    const p2 = periodSeries[1]!;
    const expChange = p2.total_expenses - p1.total_expenses;
    const revChange = p2.total_revenue - p1.total_revenue;
    insights.push({
      id: 'period-shift',
      tone: revChange >= expChange ? 'positive' : 'warning',
      title: 'Period-over-Period Movement',
      detail: `From Period ${p1.period} to Period ${p2.period}, revenue shifted by ${formatSignedUsd(revChange)} while expenses changed by ${formatSignedUsd(expChange)}.`,
    });
  }

  if (buSlices.length > 0) {
    const topExpenseBu = [...buSlices].sort((a, b) => b.total_expenses - a.total_expenses)[0];
    if (topExpenseBu && topExpenseBu.total_expenses > 0) {
      insights.push({
        id: 'top-expense-bu',
        tone: 'neutral',
        title: 'Largest Cost Center',
        detail: `${topExpenseBu.label} (${topExpenseBu.businessUnit}) represents the highest operating spend at ${formatUsd(topExpenseBu.total_expenses)}.`,
      });
    }
  }

  if (comparisonData && comparisonData.length === 2) {
    const p1 = comparisonData[0]!.results.find((r) => r.metricId === 'net_profit');
    const p2 = comparisonData[1]!.results.find((r) => r.metricId === 'net_profit');
    if (p1 && p2) {
      const gap = p1.value - p2.value;
      insights.push({
        id: 'entity-variance',
        tone: 'neutral',
        title: 'Inter-Company Net Profit Variance',
        detail: `Company 1000 outperforms Company 2000 by ${formatUsd(Math.abs(gap))} in net profit across the selected fiscal scope.`,
      });
    }
  }

  if (spec.dataProvenance?.isSynthetic) {
    insights.push({
      id: 'synthetic-notice',
      tone: 'warning',
      title: 'Synthetic Validation Dataset',
      detail:
        'Figures are deterministically computed from SAP synthetic test fixtures (Mock Dev Mode). Connect a live S/4HANA destination for production books.',
    });
  }

  return insights;
}

export function formatUsd(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCompactCurrency(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatSignedUsd(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatUsd(value)}`;
}

export function exportSpecAsCsv(spec: DashboardSpec): void {
  const headers = ['Metric ID', 'Metric Label', 'Value', 'Formatted Value', 'Currency', 'Source Type', 'Retrieved At'];
  const rows = (spec.results || []).map((r: MetricResult) => [
    r.metricId,
    `"${r.label.replace(/"/g, '""')}"`,
    String(r.value),
    `"${r.formattedValue}"`,
    r.currency,
    r.provenance.sourceType,
    r.provenance.retrievedAt,
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  triggerDownload(csv, `${slugify(spec.title)}.csv`, 'text/csv;charset=utf-8;');
}

export function exportSpecAsJson(spec: DashboardSpec): void {
  const json = JSON.stringify(spec, null, 2);
  triggerDownload(json, `${slugify(spec.title)}.json`, 'application/json');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'sria-dashboard';
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

