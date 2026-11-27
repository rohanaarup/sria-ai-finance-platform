import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  Coins,
  Sparkles,
  AlertTriangle,
  Layers,
  LayoutTemplate,
} from 'lucide-react';
import type { DashboardSpec, MetricResult } from '@sria/contracts';
import type {
  BusinessUnitSlice,
  CompanyComparisonPoint,
  PeriodSeriesPoint,
} from '../../services/api-client';
import {
  buildAnalyticalInsights,
  buildExecutiveNarrative,
  detectDashboardLayout,
  getLayoutDisplayName,
} from '../../services/dashboard-intelligence';
import { Badge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';
import { EmptyState } from '../ui/EmptyState';
import {
  HeroKpiCard,
  CompactKpiCard,
  MarginRatioCard,
  ComparisonKpiCard,
} from './KpiWidgets';
import {
  AggregatesBarChart,
  PeriodTrendChart,
  BusinessUnitChart,
  EntityComparisonChart,
} from './ChartWidgets';
import { InsightPanel } from './InsightPanel';
import { DataTableWidget } from './DataTableWidget';
import { ProvenanceBadge } from './ProvenanceBadge';
import { displayMetricValue } from './provenance-format';
import type { VisibleSections } from './DashboardToolbar';

interface DashboardRendererProps {
  spec: DashboardSpec;
  periodSeries: PeriodSeriesPoint[];
  buSlices: BusinessUnitSlice[];
  comparisonData?: CompanyComparisonPoint[];
  comparisonMode: boolean;
  isStale?: boolean;
  visibleSections: VisibleSections;
  preferredChartMode?: 'bar' | 'line' | 'area' | 'donut';
  explanationNote?: string | null;
}

export const DashboardRenderer: React.FC<DashboardRendererProps> = ({
  spec,
  periodSeries,
  buSlices,
  comparisonData,
  comparisonMode,
  isStale = false,
  visibleSections,
  preferredChartMode,
  explanationNote,
}) => {
  const [expandedChart, setExpandedChart] = useState<
    null | 'aggregates' | 'trend' | 'bu_expense' | 'bu_revenue' | 'comparison'
  >(null);

  const results = spec.results || [];
  const layout = detectDashboardLayout(spec, comparisonMode);
  const layoutLabel = getLayoutDisplayName(layout);
  const summary = buildExecutiveNarrative(spec, periodSeries, comparisonData);
  const insights = buildAnalyticalInsights(spec, periodSeries, buSlices, comparisonData);

  const filters = spec.dataProvenance?.appliedFilters || {};
  const companyCode = String(filters['companyCode'] || '1000');
  const fiscalYear = String(filters['fiscalYear'] || '2026');
  const periodFrom = filters['periodFrom'] ? String(filters['periodFrom']) : null;
  const currency = results.find((r) => r.currency !== 'PCT')?.currency || 'USD';

  const findMetric = (id: string): MetricResult | undefined =>
    results.find((r) => r.metricId === id);

  const rev = findMetric('total_revenue');
  const exp = findMetric('total_expenses');
  const profit = findMetric('net_profit');
  const margin = findMetric('profit_margin');

  const chartDefaultTrend =
    preferredChartMode === 'area'
      ? 'area'
      : preferredChartMode === 'bar'
      ? 'bar'
      : 'line';

  // Per-widget provenance (G2-02): flags scoped to the widget's metrics plus global flags.
  const TREND_METRICS = ['total_revenue', 'total_expenses', 'net_profit'];
  const monetaryIds = results.filter((r) => r.metricId !== 'profit_margin').map((r) => r.metricId);
  const chartBadge = (metricIds: readonly string[], label: string) => (
    <ProvenanceBadge provenance={spec.dataProvenance} metricIds={metricIds} contextLabel={label} />
  );
  const comparisonBadges = comparisonData ? (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {comparisonData.map((c) => (
        <ProvenanceBadge
          key={c.companyCode}
          provenance={c.results[0]?.provenance}
          metricIds={TREND_METRICS}
          contextLabel={`comparison, Company ${c.companyCode}`}
          prefix={c.companyCode}
        />
      ))}
    </span>
  ) : null;

  const hasAnyData = results.some((r) => r.value !== 0) || comparisonMode;

  return (
    <div className="dashboard-section animate-fade-in">
      {/* 1. Dashboard Header & Compact Provenance */}
      <div className="dash-header">
        <div className="dash-header__top">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <Badge tone="neutral">
                <LayoutTemplate size={11} />
                <span>{layoutLabel}</span>
              </Badge>
              <Badge tone="info">
                <Building2 size={11} />
                <span>{comparisonMode ? 'Co. 1000 & 2000' : `Company ${companyCode}`}</span>
              </Badge>
              <Badge tone="neutral">
                <Calendar size={11} />
                <span>FY {fiscalYear}{periodFrom ? ` · Period ${periodFrom}` : ' · Full Year'}</span>
              </Badge>
              <Badge tone="neutral">
                <Coins size={11} />
                <span className="font-mono">{currency}</span>
              </Badge>
              {isStale && (
                <Badge tone="warning" dot>
                  <AlertTriangle size={11} />
                  <span>Stale Saved Snapshot</span>
                </Badge>
              )}
            </div>

            <h2 className="dash-title">{spec.title}</h2>
            {spec.description && <p className="dash-subtitle">{spec.description}</p>}
          </div>

          {/* Data provenance (G2-02): source, freshness and quality for the whole dashboard */}
          <ProvenanceBadge
            provenance={spec.dataProvenance}
            variant="full"
            staleSnapshot={isStale}
            contextLabel="this dashboard"
          />
        </div>
      </div>

      {/* 2. Executive Summary Band */}
      {visibleSections.summary && summary && (
        <div className="summary-band">
          <Sparkles size={16} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
              Executive Summary
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.55 }}>
              {summary}
            </p>
            {explanationNote && (
              <p style={{ margin: '8px 0 0 0', fontSize: 12.5, color: 'var(--text-secondary)', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                {explanationNote}
              </p>
            )}
          </div>
        </div>
      )}

      {!hasAnyData ? (
        <EmptyState
          icon={<Layers size={20} />}
          title={`No postings found for Company ${companyCode} in FY ${fiscalYear}`}
          description="The deterministic calculation engine received zero SAP journal records for this scope. Switch to FY 2026 or select Company 1000 / 2000 to view verified figures."
        />
      ) : (
        <>
          {/* 3. Layout-Specific Composition */}
          {layout === 'financial_comparison' && comparisonData && comparisonData.length === 2 && (
            <>
              <div className="kpi-grid-equal">
                {(['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'] as const).map((id) => {
                  const m1 = comparisonData[0]!.results.find((r) => r.metricId === id);
                  const m2 = comparisonData[1]!.results.find((r) => r.metricId === id);
                  if (!m1 || !m2) return null;
                  return (
                    <ComparisonKpiCard
                      key={id}
                      label={m1.label}
                      co1000Value={m1.value}
                      co2000Value={m2.value}
                      formatted1000={displayMetricValue(m1)}
                      formatted2000={displayMetricValue(m2)}
                      isPercent={id === 'profit_margin'}
                      metricId={id}
                      provenance1000={m1.provenance}
                      provenance2000={m2.provenance}
                    />
                  );
                })}
              </div>

              {visibleSections.charts && (
                <div className="layout-grid-7-5">
                  <EntityComparisonChart
                    badge={comparisonBadges}
                    title="Company 1000 vs Company 2000 — Monetary Performance"
                    subtitle={`FY ${fiscalYear}${periodFrom ? ` Period ${periodFrom}` : ''} side-by-side deterministic aggregates`}
                    data={comparisonData}
                    onExpand={() => setExpandedChart('comparison')}
                  />
                  <PeriodTrendChart
                    badge={chartBadge(TREND_METRICS, 'period trend')}
                    title={`Company ${companyCode} Period Trajectory`}
                    subtitle="Verified period-over-period revenue, expenses & profit"
                    series={periodSeries}
                    defaultMode={chartDefaultTrend}
                    onExpand={() => setExpandedChart('trend')}
                  />
                </div>
              )}
            </>
          )}

          {layout === 'revenue_intelligence' && (
            <>
              <div className="kpi-band-asymmetric">
                {rev && (
                  <HeroKpiCard
                    metric={rev}
                    periodSeries={periodSeries}
                    wide
                    subtitle={`Recognized top-line revenue for Company ${companyCode} in FY ${fiscalYear}`}
                  />
                )}
                <div className="kpi-compact-stack" style={{ gridColumn: 'span 6', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  {periodSeries.map((p) => (
                    <div key={p.period} className="kpi-compact">
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                          {p.label} Revenue
                        </div>
                        <div className="kpi-value-compact tabular-nums" style={{ marginTop: 4 }}>
                          ${p.total_revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <Badge tone="info">P{p.period}</Badge>
                    </div>
                  ))}
                  {profit && <CompactKpiCard metric={profit} periodSeries={periodSeries} />}
                  {margin && <CompactKpiCard metric={margin} periodSeries={periodSeries} />}
                </div>
              </div>

              {visibleSections.charts && (
                <div className="layout-grid-8-4">
                  <PeriodTrendChart
                    badge={chartBadge(['total_revenue'], 'period trend')}
                    title="Revenue Period Trajectory"
                    subtitle="Period 01 to Period 02 recognized revenue movement"
                    series={periodSeries}
                    focusMetrics={['total_revenue']}
                    defaultMode={preferredChartMode === 'bar' ? 'bar' : 'area'}
                    onExpand={() => setExpandedChart('trend')}
                  />
                  <BusinessUnitChart
                    badge={chartBadge(['total_revenue'], 'business unit breakdown')}
                    title="Revenue by Business Unit"
                    subtitle="Contribution by organizational unit"
                    slices={buSlices}
                    metricKey="total_revenue"
                    defaultMode="bar"
                    onExpand={() => setExpandedChart('bu_revenue')}
                  />
                </div>
              )}
            </>
          )}

          {layout === 'expense_intelligence' && (
            <>
              <div className="kpi-band-asymmetric">
                {exp && (
                  <HeroKpiCard
                    metric={exp}
                    periodSeries={periodSeries}
                    wide
                    subtitle={`Total operating & administrative costs for Company ${companyCode}`}
                  />
                )}
                <div className="kpi-compact-stack" style={{ gridColumn: 'span 6', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  {periodSeries.map((p) => (
                    <div key={p.period} className="kpi-compact">
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                          {p.label} Spend
                        </div>
                        <div className="kpi-value-compact tabular-nums" style={{ marginTop: 4 }}>
                          ${p.total_expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <Badge tone="warning">P{p.period}</Badge>
                    </div>
                  ))}
                  {margin && <CompactKpiCard metric={margin} periodSeries={periodSeries} />}
                </div>
              </div>

              {visibleSections.charts && (
                <div className="layout-grid-6-6">
                  <BusinessUnitChart
                    badge={chartBadge(['total_expenses'], 'business unit breakdown')}
                    title="Expense Composition by Business Unit"
                    subtitle="Share of operating spend across cost centers"
                    slices={buSlices}
                    metricKey="total_expenses"
                    defaultMode={preferredChartMode === 'bar' ? 'bar' : 'donut'}
                    onExpand={() => setExpandedChart('bu_expense')}
                  />
                  <PeriodTrendChart
                    badge={chartBadge(['total_expenses'], 'period trend')}
                    title="Period Expense Trajectory"
                    subtitle="Operating cost movement across posted periods"
                    series={periodSeries}
                    focusMetrics={['total_expenses']}
                    defaultMode={chartDefaultTrend}
                    onExpand={() => setExpandedChart('trend')}
                  />
                </div>
              )}
            </>
          )}

          {layout === 'profitability_analysis' && (
            <>
              <div className="kpi-band-asymmetric">
                {profit && (
                  <HeroKpiCard
                    metric={profit}
                    periodSeries={periodSeries}
                    subtitle="Net operating result (Revenue − Expenses)"
                  />
                )}
                {margin && <MarginRatioCard metric={margin} />}
                <div className="kpi-compact-stack">
                  {rev && <CompactKpiCard metric={rev} periodSeries={periodSeries} />}
                  {exp && <CompactKpiCard metric={exp} periodSeries={periodSeries} />}
                </div>
              </div>

              {visibleSections.charts && (
                <div className="layout-grid-6-6">
                  <PeriodTrendChart
                    badge={chartBadge(TREND_METRICS, 'period trend')}
                    title="Profitability & Cost Trajectory"
                    subtitle="Net profit relative to revenue and expenses"
                    series={periodSeries}
                    defaultMode={chartDefaultTrend}
                    onExpand={() => setExpandedChart('trend')}
                  />
                  <AggregatesBarChart
                    badge={chartBadge(monetaryIds, 'aggregates')}
                    title="Income Bridge Summary"
                    subtitle="Horizontal monetary comparison"
                    metrics={results}
                    horizontal
                    onExpand={() => setExpandedChart('aggregates')}
                  />
                </div>
              )}
            </>
          )}

          {layout === 'executive_overview' && (
            <>
              {/* Asymmetric Executive KPI Band: 2 Hero + 2 Compact (or adaptive if fewer metrics) */}
              {results.length >= 3 ? (
                <div className="kpi-band-asymmetric">
                  {rev && <HeroKpiCard metric={rev} periodSeries={periodSeries} />}
                  {profit && <HeroKpiCard metric={profit} periodSeries={periodSeries} />}
                  <div className="kpi-compact-stack">
                    {exp && <CompactKpiCard metric={exp} periodSeries={periodSeries} />}
                    {margin && <CompactKpiCard metric={margin} periodSeries={periodSeries} />}
                  </div>
                </div>
              ) : (
                <div className="kpi-grid-equal">
                  {results.map((m) =>
                    m.metricId === 'profit_margin' ? (
                      <MarginRatioCard key={m.metricId} metric={m} />
                    ) : (
                      <HeroKpiCard key={m.metricId} metric={m} periodSeries={periodSeries} />
                    )
                  )}
                </div>
              )}

              {visibleSections.charts && (
                <div className="layout-grid-7-5">
                  <PeriodTrendChart
                    badge={chartBadge(TREND_METRICS, 'period trend')}
                    title="Period Performance Trajectory"
                    subtitle="Verified period-by-period revenue, expenses & net profit"
                    series={periodSeries}
                    defaultMode={chartDefaultTrend}
                    onExpand={() => setExpandedChart('trend')}
                  />
                  <AggregatesBarChart
                    badge={chartBadge(monetaryIds, 'aggregates')}
                    title="Comparative Aggregates"
                    subtitle="Monetary totals for active reporting scope"
                    metrics={results}
                    onExpand={() => setExpandedChart('aggregates')}
                  />
                </div>
              )}
            </>
          )}

          {/* 4. Insights */}
          {visibleSections.insights && (
            <InsightPanel insights={insights} />
          )}

          {/* 5. Ledger Table */}
          {visibleSections.table && (
            <DataTableWidget
              badge={chartBadge(results.map((r) => r.metricId), 'ledger table')}
              title="Accounting Ledger Breakdown"
              subtitle="Deterministic calculation outputs with SAP formula governance and period drilldown"
              metrics={results}
              periodSeries={periodSeries}
            />
          )}
        </>
      )}

      {/* Expandable Chart Modal */}
      <Dialog
        open={expandedChart !== null}
        onClose={() => setExpandedChart(null)}
        size="lg"
        title="Expanded Chart Inspection"
        subtitle={`${spec.title} · Company ${companyCode} · FY ${fiscalYear}`}
      >
        {expandedChart === 'aggregates' && (
          <AggregatesBarChart
            badge={chartBadge(monetaryIds, 'aggregates')}
            title="Comparative Aggregates"
            metrics={results}
            height={380}
          />
        )}
        {expandedChart === 'trend' && (
          <PeriodTrendChart
            badge={chartBadge(TREND_METRICS, 'period trend')}
            title="Period Performance Trajectory"
            series={periodSeries}
            defaultMode={chartDefaultTrend}
            height={380}
          />
        )}
        {expandedChart === 'bu_expense' && (
          <BusinessUnitChart
            badge={chartBadge(['total_expenses'], 'business unit breakdown')}
            title="Expense Composition by Business Unit"
            slices={buSlices}
            metricKey="total_expenses"
            defaultMode="bar"
            height={380}
          />
        )}
        {expandedChart === 'bu_revenue' && (
          <BusinessUnitChart
            badge={chartBadge(['total_revenue'], 'business unit breakdown')}
            title="Revenue by Business Unit"
            slices={buSlices}
            metricKey="total_revenue"
            defaultMode="bar"
            height={380}
          />
        )}
        {expandedChart === 'comparison' && comparisonData && (
          <EntityComparisonChart
            badge={comparisonBadges}
            title="Company 1000 vs Company 2000"
            data={comparisonData}
            height={380}
          />
        )}
      </Dialog>
    </div>
  );
};
