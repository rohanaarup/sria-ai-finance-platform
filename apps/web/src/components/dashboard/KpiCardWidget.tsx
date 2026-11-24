import React from 'react';
import type { MetricResult } from '@sria/contracts';

interface KpiCardWidgetProps {
  metric: MetricResult;
  subtitle?: string;
}

export const KpiCardWidget: React.FC<KpiCardWidgetProps> = ({ metric, subtitle }) => {
  const isNegative = metric.value < 0;
  const isMargin = metric.metricId === 'profit_margin';

  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--line)',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: 'var(--shadow)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
    >
      <div>
        <div
          style={{
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--muted)',
            letterSpacing: '0.06em',
            marginBottom: '8px'
          }}
        >
          {metric.label}
        </div>
        <div
          style={{
            fontSize: '32px',
            fontWeight: 800,
            color: isNegative ? 'var(--rust)' : 'var(--ink)',
            fontFamily: 'Georgia, serif',
            letterSpacing: '-0.02em'
          }}
        >
          {metric.formattedValue}
        </div>
      </div>

      <div
        style={{
          marginTop: '16px',
          paddingTop: '12px',
          borderTop: '1px solid var(--sand)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          color: 'var(--muted)'
        }}
      >
        <span>{subtitle || (metric.provenance.appliedFilters?.['companyCode'] ? `Company ${metric.provenance.appliedFilters['companyCode']}` : 'All Entities')}</span>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: '4px',
            background: isMargin && metric.isZeroDenominator ? '#fff3cd' : 'var(--cream)',
            color: isMargin && metric.isZeroDenominator ? '#856404' : 'var(--muted)',
            fontWeight: 600,
            fontSize: '11px'
          }}
        >
          {metric.isZeroDenominator ? 'Zero Denominator' : 'Deterministic'}
        </span>
      </div>
    </div>
  );
};

