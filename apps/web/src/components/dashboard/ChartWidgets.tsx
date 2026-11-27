import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { Maximize2, BarChart3 } from 'lucide-react';
import type { MetricResult } from '@sria/contracts';
import type {
  BusinessUnitSlice,
  CompanyComparisonPoint,
  PeriodSeriesPoint,
} from '../../services/api-client';
import { formatCompactCurrency, formatUsd } from '../../services/dashboard-intelligence';
import { Tabs } from '../ui/Tabs';
import { EmptyState } from '../ui/EmptyState';

export type ChartVisualMode = 'bar' | 'line' | 'area' | 'donut';

const METRIC_COLORS: Record<string, string> = {
  total_revenue: 'var(--chart-revenue)',
  total_expenses: 'var(--chart-expenses)',
  net_profit: 'var(--chart-profit)',
  profit_margin: 'var(--chart-margin)',
};

const BU_COLORS = [
  'var(--chart-revenue)',
  'var(--chart-expenses)',
  'var(--chart-profit)',
  'var(--chart-margin)',
  'var(--chart-compare)',
];

const FinancialTooltip = ({ active, payload, label, isCurrency = true }: any) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div
      style={{
        background: 'var(--chart-tooltip-bg)',
        color: 'var(--chart-tooltip-text)',
        border: '1px solid var(--border-strong)',
        borderRadius: 10,
        padding: '10px 13px',
        boxShadow: 'var(--shadow-md)',
        fontSize: 12,
        minWidth: 175,
      }}
    >
      {label && (
        <div style={{ fontWeight: 650, marginBottom: 7, opacity: 0.85, fontSize: 11.5 }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {payload.map((entry: any) => {
          const val = Number(entry.value ?? 0);
          return (
            <div
              key={entry.dataKey || entry.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 14,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, opacity: 0.9 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: entry.color || entry.fill || entry.stroke || 'var(--accent)',
                    flexShrink: 0,
                  }}
                />
                <span>{entry.name}</span>
              </span>
              <span className="tabular-nums" style={{ fontWeight: 700 }}>
                {isCurrency ? formatUsd(val) : `${val.toFixed(2)}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface AggregatesBarChartProps {
  title: string;
  subtitle?: string;
  metrics: MetricResult[];
  horizontal?: boolean;
  onExpand?: () => void;
  height?: number;
}

export const AggregatesBarChart: React.FC<AggregatesBarChartProps> = ({
  title,
  subtitle,
  metrics,
  horizontal = false,
  onExpand,
  height = 270,
}) => {
  const monetary = metrics.filter((m) => m.metricId !== 'profit_margin');
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const visibleData = monetary
    .filter((m) => !hiddenIds.includes(m.metricId))
    .map((m) => ({
      name: m.label,
      value: m.value,
      metricId: m.metricId,
    }));

  const toggleSeries = (id: string) => {
    setHiddenIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < monetary.length - 1
        ? [...prev, id]
        : prev
    );
  };

  return (
    <div className="chart-panel">
      <div className="chart-panel__header">
        <div>
          <h3 className="chart-panel__title">{title}</h3>
          {subtitle && <p className="chart-panel__subtitle">{subtitle}</p>}
        </div>
        {onExpand && (
          <button
            type="button"
            className="btn btn--ghost btn--xs"
            onClick={onExpand}
            aria-label={`Expand ${title}`}
            title="Expand chart"
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>

      {monetary.length === 0 || monetary.every((m) => m.value === 0) ? (
        <EmptyState
          icon={<BarChart3 size={18} />}
          title="No monetary figures for this filter"
          description="Try switching fiscal year to FY 2026 or clearing the active period filter."
        />
      ) : (
        <>
          <div style={{ width: '100%', height }}>
            <ResponsiveContainer width="100%" height="100%">
              {horizontal ? (
                <BarChart
                  data={visibleData}
                  layout="vertical"
                  margin={{ top: 4, right: 24, left: 20, bottom: 4 }}
                  barSize={26}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                    tickFormatter={formatCompactCurrency}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: 'var(--chart-axis)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={108}
                  />
                  <Tooltip content={<FinancialTooltip />} cursor={{ fill: 'var(--accent-subtle)' }} />
                  <ReferenceLine x={0} stroke="var(--border-strong)" />
                  <Bar dataKey="value" name="Amount" radius={[0, 6, 6, 0]}>
                    {visibleData.map((entry) => (
                      <Cell
                        key={entry.metricId}
                        fill={
                          entry.metricId === 'net_profit' && entry.value < 0
                            ? 'var(--negative)'
                            : METRIC_COLORS[entry.metricId] || 'var(--chart-compare)'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <BarChart
                  data={visibleData}
                  margin={{ top: 8, right: 14, left: 6, bottom: 4 }}
                  barSize={52}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--chart-axis)', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--chart-axis)', fontSize: 11 }}
                    tickFormatter={formatCompactCurrency}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                  />
                  <Tooltip content={<FinancialTooltip />} cursor={{ fill: 'var(--accent-subtle)' }} />
                  <ReferenceLine y={0} stroke="var(--border-strong)" />
                  <Bar dataKey="value" name="Amount" radius={[6, 6, 0, 0]}>
                    {visibleData.map((entry) => (
                      <Cell
                        key={entry.metricId}
                        fill={
                          entry.metricId === 'net_profit' && entry.value < 0
                            ? 'var(--negative)'
                            : METRIC_COLORS[entry.metricId] || 'var(--chart-compare)'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {monetary.map((m) => {
              const hidden = hiddenIds.includes(m.metricId);
              return (
                <button
                  key={m.metricId}
                  type="button"
                  onClick={() => toggleSeries(m.metricId)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 9px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: hidden ? 'var(--surface-subtle)' : 'var(--surface)',
                    opacity: hidden ? 0.5 : 1,
                    fontSize: 11.5,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: METRIC_COLORS[m.metricId] || 'var(--chart-compare)',
                    }}
                  />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

interface PeriodTrendChartProps {
  title: string;
  subtitle?: string;
  series: PeriodSeriesPoint[];
  focusMetrics?: ('total_revenue' | 'total_expenses' | 'net_profit')[];
  defaultMode?: 'line' | 'area' | 'bar';
  onExpand?: () => void;
  height?: number;
}

export const PeriodTrendChart: React.FC<PeriodTrendChartProps> = ({
  title,
  subtitle,
  series,
  focusMetrics = ['total_revenue', 'total_expenses', 'net_profit'],
  defaultMode = 'line',
  onExpand,
  height = 270,
}) => {
  const [mode, setMode] = useState<'line' | 'area' | 'bar'>(defaultMode);
  const [enabled, setEnabled] = useState<string[]>(focusMetrics);

  const toggleKey = (key: string) => {
    setEnabled((prev) =>
      prev.includes(key)
        ? prev.length > 1
          ? prev.filter((k) => k !== key)
          : prev
        : [...prev, key]
    );
  };

  const seriesMeta = [
    { key: 'total_revenue', label: 'Revenue', color: 'var(--chart-revenue)', hex: '#0284C7' },
    { key: 'total_expenses', label: 'Expenses', color: 'var(--chart-expenses)', hex: '#F5B700' },
    { key: 'net_profit', label: 'Net Profit', color: 'var(--chart-profit)', hex: '#15803D' },
  ].filter((s) => focusMetrics.includes(s.key as any));

  return (
    <div className="chart-panel">
      <div className="chart-panel__header">
        <div>
          <h3 className="chart-panel__title">{title}</h3>
          {subtitle && <p className="chart-panel__subtitle">{subtitle}</p>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tabs
            value={mode}
            onChange={setMode}
            options={[
              { id: 'line', label: 'Line' },
              { id: 'area', label: 'Area' },
              { id: 'bar', label: 'Bar' },
            ]}
          />
          {onExpand && (
            <button
              type="button"
              className="btn btn--ghost btn--xs"
              onClick={onExpand}
              aria-label={`Expand ${title}`}
              title="Expand chart"
            >
              <Maximize2 size={13} />
            </button>
          )}
        </div>
      </div>

      {series.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={18} />}
          title="No fiscal period records found"
          description="No posted accounting records exist for the selected company and fiscal year."
        />
      ) : (
        <>
          <div style={{ width: '100%', height }}>
            <ResponsiveContainer width="100%" height="100%">
              {mode === 'area' ? (
                <AreaChart data={series} margin={{ top: 8, right: 18, left: 6, bottom: 4 }}>
                  <defs>
                    {seriesMeta.map((s) => (
                      <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={s.hex} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={s.hex} stopOpacity={0.01} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--chart-axis)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} tickFormatter={formatCompactCurrency} axisLine={false} tickLine={false} width={58} />
                  <Tooltip content={<FinancialTooltip />} />
                  <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="3 3" />
                  {seriesMeta
                    .filter((s) => enabled.includes(s.key))
                    .map((s) => (
                      <Area
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={s.color}
                        strokeWidth={2.3}
                        fill={`url(#grad-${s.key})`}
                        dot={{ r: 4, fill: s.color, strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                </AreaChart>
              ) : mode === 'bar' ? (
                <BarChart data={series} margin={{ top: 8, right: 18, left: 6, bottom: 4 }} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--chart-axis)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} tickFormatter={formatCompactCurrency} axisLine={false} tickLine={false} width={58} />
                  <Tooltip content={<FinancialTooltip />} cursor={{ fill: 'var(--accent-subtle)' }} />
                  <ReferenceLine y={0} stroke="var(--border-strong)" />
                  {seriesMeta
                    .filter((s) => enabled.includes(s.key))
                    .map((s) => (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        name={s.label}
                        fill={s.color}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={36}
                      />
                    ))}
                </BarChart>
              ) : (
                <LineChart data={series} margin={{ top: 8, right: 18, left: 6, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--chart-axis)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} tickFormatter={formatCompactCurrency} axisLine={false} tickLine={false} width={58} />
                  <Tooltip content={<FinancialTooltip />} />
                  <ReferenceLine y={0} stroke="var(--border-strong)" strokeDasharray="3 3" />
                  {seriesMeta
                    .filter((s) => enabled.includes(s.key))
                    .map((s) => (
                      <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={s.color}
                        strokeWidth={2.5}
                        strokeDasharray={s.key === 'net_profit' ? '5 3' : undefined}
                        dot={{ r: 4.5, fill: s.color, strokeWidth: 0 }}
                        activeDot={{ r: 6.5 }}
                      />
                    ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {seriesMeta.map((s) => {
                const isOn = enabled.includes(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleKey(s.key)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 9px',
                      borderRadius: 999,
                      border: '1px solid var(--border)',
                      background: isOn ? 'var(--surface)' : 'var(--surface-subtle)',
                      opacity: isOn ? 1 : 0.45,
                      fontSize: 11.5,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span style={{ width: 9, height: 3, borderRadius: 2, background: s.color }} />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Verified SAP period totals ({series.length} {series.length === 1 ? 'period' : 'periods'})
            </span>
          </div>
        </>
      )}
    </div>
  );
};

interface BusinessUnitChartProps {
  title: string;
  subtitle?: string;
  slices: BusinessUnitSlice[];
  metricKey: 'total_expenses' | 'total_revenue';
  defaultMode?: 'donut' | 'bar';
  onExpand?: () => void;
  height?: number;
}

export const BusinessUnitChart: React.FC<BusinessUnitChartProps> = ({
  title,
  subtitle,
  slices,
  metricKey,
  defaultMode = 'donut',
  onExpand,
  height = 270,
}) => {
  const [mode, setMode] = useState<'donut' | 'bar'>(defaultMode);
  const activeSlices = slices
    .filter((s) => s[metricKey] > 0)
    .map((s) => ({
      name: s.label,
      businessUnit: s.businessUnit,
      value: s[metricKey],
    }));

  const total = activeSlices.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="chart-panel">
      <div className="chart-panel__header">
        <div>
          <h3 className="chart-panel__title">{title}</h3>
          {subtitle && <p className="chart-panel__subtitle">{subtitle}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tabs
            value={mode}
            onChange={setMode}
            options={[
              { id: 'donut', label: 'Share' },
              { id: 'bar', label: 'Ranked' },
            ]}
          />
          {onExpand && (
            <button type="button" className="btn btn--ghost btn--xs" onClick={onExpand} aria-label={`Expand ${title}`}>
              <Maximize2 size={13} />
            </button>
          )}
        </div>
      </div>

      {activeSlices.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={18} />}
          title="No business unit breakdown"
          description="No postings matched business unit filters for this selection."
        />
      ) : mode === 'donut' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'center', minHeight: height }}>
          <div style={{ width: '100%', height: height - 20 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={activeSlices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="56%"
                  outerRadius="84%"
                  paddingAngle={2}
                >
                  {activeSlices.map((_, i) => (
                    <Cell key={i} fill={BU_COLORS[i % BU_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<FinancialTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeSlices.map((s, i) => {
              const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : '0.0';
              return (
                <div key={s.businessUnit} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--text-primary)', fontWeight: 500 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: BU_COLORS[i % BU_COLORS.length] }} />
                    <span>{s.name}</span>
                  </span>
                  <span className="tabular-nums" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {formatCompactCurrency(s.value)} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activeSlices} layout="vertical" margin={{ top: 4, right: 20, left: 16, bottom: 4 }} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} tickFormatter={formatCompactCurrency} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--chart-axis)', fontSize: 12 }} axisLine={false} tickLine={false} width={104} />
              <Tooltip content={<FinancialTooltip />} cursor={{ fill: 'var(--accent-subtle)' }} />
              <Bar dataKey="value" name={metricKey === 'total_expenses' ? 'Expense' : 'Revenue'} radius={[0, 6, 6, 0]}>
                {activeSlices.map((_, i) => (
                  <Cell key={i} fill={BU_COLORS[i % BU_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

interface EntityComparisonChartProps {
  title: string;
  subtitle?: string;
  data: CompanyComparisonPoint[];
  onExpand?: () => void;
  height?: number;
}

export const EntityComparisonChart: React.FC<EntityComparisonChartProps> = ({
  title,
  subtitle,
  data,
  onExpand,
  height = 280,
}) => {
  const c1 = data[0];
  const c2 = data[1];

  const rows = ['total_revenue', 'total_expenses', 'net_profit'].map((metricId) => {
    const m1 = c1?.results.find((r) => r.metricId === metricId);
    const m2 = c2?.results.find((r) => r.metricId === metricId);
    return {
      metric:
        metricId === 'total_revenue'
          ? 'Total Revenue'
          : metricId === 'total_expenses'
          ? 'Total Expenses'
          : 'Net Profit',
      'Company 1000': m1?.value ?? 0,
      'Company 2000': m2?.value ?? 0,
    };
  });

  return (
    <div className="chart-panel">
      <div className="chart-panel__header">
        <div>
          <h3 className="chart-panel__title">{title}</h3>
          {subtitle && <p className="chart-panel__subtitle">{subtitle}</p>}
        </div>
        {onExpand && (
          <button type="button" className="btn btn--ghost btn--xs" onClick={onExpand} aria-label={`Expand ${title}`}>
            <Maximize2 size={13} />
          </button>
        )}
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 18, left: 6, bottom: 4 }} barGap={8}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="metric" tick={{ fill: 'var(--chart-axis)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} tickFormatter={formatCompactCurrency} axisLine={false} tickLine={false} width={58} />
            <Tooltip content={<FinancialTooltip />} cursor={{ fill: 'var(--accent-subtle)' }} />
            <ReferenceLine y={0} stroke="var(--border-strong)" />
            <Bar dataKey="Company 1000" fill="var(--chart-revenue)" radius={[5, 5, 0, 0]} maxBarSize={42} />
            <Bar dataKey="Company 2000" fill="var(--chart-expenses)" radius={[5, 5, 0, 0]} maxBarSize={42} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11.5, color: 'var(--text-secondary)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--chart-revenue)' }} />
          <span>Company 1000 (HQ)</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--chart-expenses)' }} />
          <span>Company 2000 (Subsidiary)</span>
        </span>
      </div>
    </div>
  );
};
