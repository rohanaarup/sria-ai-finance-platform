import React from 'react';
import type { DashboardSpec } from '@sria/contracts';
import { ProvenanceBanner } from './ProvenanceBanner';
import { KpiCardWidget } from './KpiCardWidget';
import { BarChartWidget } from './BarChartWidget';
import { LineChartWidget } from './LineChartWidget';
import { TableWidget } from './TableWidget';

interface DashboardRendererProps {
  spec: DashboardSpec;
}

export const DashboardRenderer: React.FC<DashboardRendererProps> = ({ spec }) => {
  const results = spec.results || [];

  return (
    <div>
      {/* Dashboard Title & Description Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2
          style={{
            margin: '0 0 6px 0',
            fontFamily: 'Georgia, serif',
            fontSize: '26px',
            color: 'var(--ink)'
          }}
        >
          {spec.title}
        </h2>
        {spec.description && (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '14px' }}>
            {spec.description}
          </p>
        )}
      </div>

      {/* Provenance & Freshness Notice */}
      <ProvenanceBanner
        provenance={spec.dataProvenance}
        freshnessNotice={spec.freshnessNotice}
      />

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
          marginBottom: '28px'
        }}
      >
        {results.map((metric) => (
          <KpiCardWidget key={metric.metricId} metric={metric} />
        ))}
      </div>

      {/* Visual Charts & Detailed Ledger */}
      {spec.widgets.some(w => w.type === 'bar_chart') && (
        <BarChartWidget
          title="Comparative Financial Aggregates"
          metrics={results}
        />
      )}

      {spec.widgets.some(w => w.type === 'line_chart') && (
        <LineChartWidget title="Multi-Period Financial Trend Analysis" />
      )}

      {spec.widgets.some(w => w.type === 'table') && (
        <TableWidget
          title="Accounting Ledger & Calculation Metadata"
          metrics={results}
        />
      )}
    </div>
  );
};
