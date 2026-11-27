import React, { useState, useMemo } from 'react';
import { ArrowUpDown, Info, Search } from 'lucide-react';
import type { MetricResult } from '@sria/contracts';
import { METRIC_GLOSSARY } from '../../design-system/tokens';
import type { PeriodSeriesPoint } from '../../services/api-client';
import { formatUsd } from '../../services/dashboard-intelligence';
import { Badge } from '../ui/Badge';
import { Tabs } from '../ui/Tabs';
import { Tooltip } from '../ui/Tooltip';

interface DataTableWidgetProps {
  title: string;
  subtitle?: string;
  metrics: MetricResult[];
  periodSeries?: PeriodSeriesPoint[];
}

function getStatusBadge(metricId: string, value: number, isZeroDenom?: boolean) {
  if (isZeroDenom) return { label: 'Zero Denom', tone: 'warning' as const };
  if (metricId === 'net_profit' && value < 0) return { label: 'Net Loss', tone: 'negative' as const };
  if (metricId === 'profit_margin' && value < 0) return { label: 'Negative', tone: 'negative' as const };
  if (metricId === 'profit_margin' && value >= 25) return { label: 'Strong', tone: 'positive' as const };
  if (metricId === 'profit_margin' && value < 10) return { label: 'Low', tone: 'warning' as const };
  return { label: 'Verified', tone: 'neutral' as const };
}

export const DataTableWidget: React.FC<DataTableWidgetProps> = ({
  title,
  subtitle,
  metrics,
  periodSeries = [],
}) => {
  const [tab, setTab] = useState<'metrics' | 'periods'>('metrics');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'none' | 'asc' | 'desc'>('none');

  const filteredMetrics = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = metrics.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.metricId.toLowerCase().includes(q)
    );
    if (sortDir === 'asc') return [...list].sort((a, b) => a.value - b.value);
    if (sortDir === 'desc') return [...list].sort((a, b) => b.value - a.value);
    return list;
  }, [metrics, search, sortDir]);

  const toggleSort = () => {
    setSortDir((prev) => (prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none'));
  };

  return (
    <div className="table-panel">
      <div className="table-panel__header">
        <div>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 650, color: 'var(--text-primary)' }}>
            {title}
          </h3>
          {subtitle && (
            <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              {subtitle}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {periodSeries.length > 0 && (
            <Tabs
              value={tab}
              onChange={setTab}
              options={[
                { id: 'metrics', label: 'Summary', count: metrics.length },
                { id: 'periods', label: 'By Period', count: periodSeries.length },
              ]}
            />
          )}

          {tab === 'metrics' && (
            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: 9,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                }}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter ledger..."
                aria-label="Filter financial ledger"
                style={{
                  height: 30,
                  padding: '0 10px 0 28px',
                  borderRadius: 7,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-subtle)',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  width: 170,
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        {tab === 'metrics' ? (
          <table className="finance-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Category</th>
                <th>
                  <button
                    type="button"
                    onClick={toggleSort}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      font: 'inherit',
                      color: 'inherit',
                      textTransform: 'inherit',
                      letterSpacing: 'inherit',
                    }}
                  >
                    <span>Value</span>
                    <ArrowUpDown size={11} />
                  </button>
                </th>
                <th>Unit</th>
                <th>Status</th>
                <th>Calculation</th>
              </tr>
            </thead>
            <tbody>
              {filteredMetrics.map((m) => {
                const glossary = METRIC_GLOSSARY[m.metricId];
                const status = getStatusBadge(m.metricId, m.value, m.isZeroDenominator);
                return (
                  <tr key={m.metricId}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{m.label}</span>
                        {glossary && (
                          <Tooltip content={glossary.formula}>
                            <span style={{ color: 'var(--text-tertiary)', display: 'inline-flex', cursor: 'help' }}>
                              <Info size={12} />
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {glossary?.category || 'Financial KPI'}
                    </td>
                    <td
                      className="tabular-nums"
                      style={{
                        fontWeight: 700,
                        fontSize: 13.5,
                        color: m.value < 0 ? 'var(--negative)' : 'var(--text-primary)',
                      }}
                    >
                      {m.isZeroDenominator ? 'N/A' : m.formattedValue}
                    </td>
                    <td className="font-mono" style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                      {m.currency}
                    </td>
                    <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          background: 'var(--surface-subtle)',
                          border: '1px solid var(--border)',
                          padding: '2px 7px',
                          borderRadius: 5,
                        }}
                      >
                        TS v{m.provenance?.calculationVersion || '1.0.0'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="finance-table">
            <thead>
              <tr>
                <th>Fiscal Period</th>
                <th>Total Revenue</th>
                <th>Total Expenses</th>
                <th>Net Profit</th>
                <th>Profit Margin</th>
              </tr>
            </thead>
            <tbody>
              {periodSeries.map((p) => (
                <tr key={p.period}>
                  <td style={{ fontWeight: 600 }}>{p.label}</td>
                  <td className="tabular-nums" style={{ fontWeight: 600 }}>
                    {formatUsd(p.total_revenue, p.currency)}
                  </td>
                  <td className="tabular-nums">{formatUsd(p.total_expenses, p.currency)}</td>
                  <td
                    className="tabular-nums"
                    style={{
                      fontWeight: 650,
                      color: p.net_profit < 0 ? 'var(--negative)' : 'var(--positive)',
                    }}
                  >
                    {formatUsd(p.net_profit, p.currency)}
                  </td>
                  <td className="tabular-nums">
                    {p.isZeroDenominator ? (
                      <Badge tone="warning">Zero Denom</Badge>
                    ) : (
                      `${p.profit_margin.toFixed(2)}%`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

