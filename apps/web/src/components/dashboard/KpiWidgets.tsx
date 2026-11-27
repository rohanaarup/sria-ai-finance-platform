import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Receipt,
  Percent,
  CircleDollarSign,
  Info,
  Minus,
} from 'lucide-react';
import type { MetricResult, ProvenanceMetadata } from '@sria/contracts';
import { METRIC_GLOSSARY } from '../../design-system/tokens';
import { Badge } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';
import type { PeriodSeriesPoint } from '../../services/api-client';
import { formatUsd } from '../../services/dashboard-intelligence';
import { ProvenanceBadge } from './ProvenanceBadge';
import { NO_DATA_TEXT, displayMetricValue, metricDataState } from './provenance-format';

function getMetricAccent(metricId: string, value: number) {
  switch (metricId) {
    case 'total_revenue':
      return { color: 'var(--info)', bg: 'var(--info-subtle)', icon: <TrendingUp size={15} /> };
    case 'total_expenses':
      return { color: 'var(--warning)', bg: 'var(--warning-subtle)', icon: <Receipt size={15} /> };
    case 'net_profit':
      return value >= 0
        ? { color: 'var(--positive)', bg: 'var(--positive-subtle)', icon: <CircleDollarSign size={15} /> }
        : { color: 'var(--negative)', bg: 'var(--negative-subtle)', icon: <TrendingDown size={15} /> };
    case 'profit_margin':
      return value >= 20
        ? { color: 'var(--positive)', bg: 'var(--positive-subtle)', icon: <Percent size={15} /> }
        : value >= 0
        ? { color: 'var(--warning)', bg: 'var(--warning-subtle)', icon: <Percent size={15} /> }
        : { color: 'var(--negative)', bg: 'var(--negative-subtle)', icon: <Percent size={15} /> };
    default:
      return { color: 'var(--accent)', bg: 'var(--accent-subtle)', icon: <CircleDollarSign size={15} /> };
  }
}

function getPeriodDelta(
  metricId: string,
  periodSeries?: PeriodSeriesPoint[]
): { label: string; tone: 'positive' | 'negative' | 'neutral' } | null {
  if (!periodSeries || periodSeries.length < 2) return null;
  const p1 = periodSeries[0]!;
  const p2 = periodSeries[periodSeries.length - 1]!;

  let v1 = 0;
  let v2 = 0;
  if (metricId === 'total_revenue') {
    v1 = p1.total_revenue;
    v2 = p2.total_revenue;
  } else if (metricId === 'total_expenses') {
    v1 = p1.total_expenses;
    v2 = p2.total_expenses;
  } else if (metricId === 'net_profit') {
    v1 = p1.net_profit;
    v2 = p2.net_profit;
  } else if (metricId === 'profit_margin') {
    const diff = p2.profit_margin - p1.profit_margin;
    const sign = diff >= 0 ? '+' : '';
    return {
      label: `${sign}${diff.toFixed(1)}pp vs P${p1.period}`,
      tone: diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'neutral',
    };
  }

  if (v1 === 0) return null;
  const pct = ((v2 - v1) / Math.abs(v1)) * 100;
  const sign = pct >= 0 ? '+' : '';
  const goodUp = metricId !== 'total_expenses';
  const tone =
    pct === 0 ? 'neutral' : pct > 0 === goodUp ? 'positive' : 'negative';
  return {
    label: `${sign}${pct.toFixed(1)}% P${p2.period} vs P${p1.period}`,
    tone,
  };
}

const MetricTooltipIcon: React.FC<{ metricId: string }> = ({ metricId }) => {
  const glossary = METRIC_GLOSSARY[metricId];
  if (!glossary) return null;

  return (
    <Tooltip
      content={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong style={{ fontSize: 12 }}>{glossary.label}</strong>
          <span>{glossary.explanation}</span>
          <code style={{ fontSize: 10.5, opacity: 0.85, fontFamily: 'JetBrains Mono, monospace' }}>
            {glossary.formula}
          </code>
        </div>
      }
    >
      <span
        tabIndex={0}
        aria-label={`Formula info for ${glossary.label}`}
        style={{
          color: 'var(--text-tertiary)',
          display: 'inline-flex',
          alignItems: 'center',
          cursor: 'help',
        }}
      >
        <Info size={13} />
      </span>
    </Tooltip>
  );
};

interface KpiProps {
  metric: MetricResult;
  periodSeries?: PeriodSeriesPoint[];
  wide?: boolean;
  subtitle?: string;
}

export const HeroKpiCard: React.FC<KpiProps> = ({
  metric,
  periodSeries,
  wide = false,
  subtitle,
}) => {
  const accent = getMetricAccent(metric.metricId, metric.value);
  const missing = metricDataState(metric) === 'MISSING_DATA';
  const delta = missing ? null : getPeriodDelta(metric.metricId, periodSeries);
  const glossary = METRIC_GLOSSARY[metric.metricId];

  return (
    <div className={wide ? 'kpi-hero kpi-hero--wide' : 'kpi-hero'}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 650,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {metric.label}
          </span>
          <MetricTooltipIcon metricId={metric.metricId} />
        </div>

        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: accent.bg,
            color: accent.color,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          {accent.icon}
        </div>
      </div>

      <div>
        <div
          className="kpi-value-hero tabular-nums"
          style={{
            color: missing ? 'var(--text-tertiary)' : metric.value < 0 ? 'var(--negative)' : 'var(--text-primary)',
          }}
        >
          {missing ? (
            NO_DATA_TEXT
          ) : metric.isZeroDenominator ? (
            <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--warning)' }}>
              N/A (Zero Revenue)
            </span>
          ) : (
            metric.formattedValue
          )}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
            {subtitle}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
          flexWrap: 'wrap',
        }}
      >
        {delta ? (
          <Badge tone={delta.tone}>
            {delta.tone === 'positive' ? (
              <TrendingUp size={11} />
            ) : delta.tone === 'negative' ? (
              <TrendingDown size={11} />
            ) : (
              <Minus size={11} />
            )}
            <span>{delta.label}</span>
          </Badge>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {glossary?.category || 'Validated Metric'}
          </span>
        )}

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ProvenanceBadge provenance={metric.provenance} metricIds={[metric.metricId]} contextLabel={metric.label} />
          <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
            {metric.currency}
          </span>
        </span>
      </div>
    </div>
  );
};

export const CompactKpiCard: React.FC<KpiProps> = ({ metric, periodSeries }) => {
  const accent = getMetricAccent(metric.metricId, metric.value);
  const missing = metricDataState(metric) === 'MISSING_DATA';
  const delta = missing ? null : getPeriodDelta(metric.metricId, periodSeries);

  return (
    <div className="kpi-compact">
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {metric.label}
          </span>
          <MetricTooltipIcon metricId={metric.metricId} />
        </div>
        <div
          className="kpi-value-compact tabular-nums"
          style={{ color: missing ? 'var(--text-tertiary)' : metric.value < 0 ? 'var(--negative)' : 'var(--text-primary)' }}
        >
          {displayMetricValue(metric, '0.00% (N/A)')}
        </div>
        {delta && (
          <div style={{ marginTop: 5 }}>
            <Badge tone={delta.tone}>{delta.label}</Badge>
          </div>
        )}
        <div className="widget-provenance">
          <ProvenanceBadge provenance={metric.provenance} metricIds={[metric.metricId]} contextLabel={metric.label} align="left" />
        </div>
      </div>

      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: accent.bg,
          color: accent.color,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        {accent.icon}
      </div>
    </div>
  );
};

export const MarginRatioCard: React.FC<{ metric: MetricResult }> = ({ metric }) => {
  const missing = metricDataState(metric) === 'MISSING_DATA';
  const clamped = missing ? 0 : Math.max(0, Math.min(100, metric.value));
  const isHealthy = metric.value >= 25;
  const isNeg = metric.value < 0;

  return (
    <div className="kpi-hero">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 650,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {metric.label}
          </span>
          <MetricTooltipIcon metricId={metric.metricId} />
        </div>
        <Badge tone={missing || metric.isZeroDenominator ? 'warning' : isNeg ? 'negative' : isHealthy ? 'positive' : 'neutral'}>
          {missing ? NO_DATA_TEXT : metric.isZeroDenominator ? 'Zero Denom' : isNeg ? 'Deficit' : isHealthy ? 'Healthy' : 'Moderate'}
        </Badge>
      </div>

      <div>
        <div
          className="kpi-value-hero tabular-nums"
          style={{ color: missing ? 'var(--text-tertiary)' : isNeg ? 'var(--negative)' : 'var(--text-primary)' }}
        >
          {displayMetricValue(metric)}
        </div>
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              height: 7,
              borderRadius: 999,
              background: 'var(--bg-subtle)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${clamped}%`,
                height: '100%',
                borderRadius: 999,
                background: isNeg ? 'var(--negative)' : isHealthy ? 'var(--positive)' : 'var(--sunflower)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
            <span>0%</span>
            <span>25% Target</span>
            <span>100%</span>
          </div>
        </div>
        <div className="widget-provenance" style={{ marginTop: 8 }}>
          <ProvenanceBadge provenance={metric.provenance} metricIds={[metric.metricId]} contextLabel={metric.label} align="left" />
        </div>
      </div>
    </div>
  );
};

export const ComparisonKpiCard: React.FC<{
  label: string;
  co1000Value: number;
  co2000Value: number;
  formatted1000: string;
  formatted2000: string;
  isPercent?: boolean;
  /** Metric shown, used to scope the provenance badge's quality flags. */
  metricId?: string;
  provenance1000?: ProvenanceMetadata;
  provenance2000?: ProvenanceMetadata;
}> = ({ label, co1000Value, co2000Value, formatted1000, formatted2000, isPercent, metricId, provenance1000, provenance2000 }) => {
  const diff = co1000Value - co2000Value;
  const diffLabel = isPercent
    ? `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}pp`
    : `${diff >= 0 ? '+' : ''}${formatUsd(diff)}`;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '16px 18px',
        boxShadow: 'var(--shadow-sm), inset 0 1px 0 var(--inner-highlight)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <Badge tone="brand">Δ {diffLabel}</Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Company 1000</div>
          <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 700, color: co1000Value < 0 ? 'var(--negative)' : 'var(--text-primary)' }}>
            {formatted1000}
          </div>
        </div>
        <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Company 2000</div>
          <div className="tabular-nums" style={{ fontSize: 18, fontWeight: 700, color: co2000Value < 0 ? 'var(--negative)' : 'var(--text-primary)' }}>
            {formatted2000}
          </div>
        </div>
      </div>
      {(provenance1000 || provenance2000) && (
        <div className="widget-provenance" style={{ marginTop: 0, gap: 6, flexWrap: 'wrap' }}>
          {provenance1000 && (
            <ProvenanceBadge
              provenance={provenance1000}
              metricIds={metricId ? [metricId] : undefined}
              contextLabel={`${label}, Company 1000`}
              prefix="1000"
              align="left"
            />
          )}
          {provenance2000 && (
            <ProvenanceBadge
              provenance={provenance2000}
              metricIds={metricId ? [metricId] : undefined}
              contextLabel={`${label}, Company 2000`}
              prefix="2000"
              align="left"
            />
          )}
        </div>
      )}
    </div>
  );
};
