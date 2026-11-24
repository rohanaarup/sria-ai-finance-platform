import React from 'react';
import type { MetricResult } from '@sria/contracts';

interface TableWidgetProps {
  title: string;
  metrics: MetricResult[];
}

export const TableWidget: React.FC<TableWidgetProps> = ({ title, metrics }) => {
  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--line)',
        borderRadius: '14px',
        padding: '24px',
        boxShadow: 'var(--shadow)',
        marginBottom: '24px'
      }}
    >
      <h3
        style={{
          margin: '0 0 16px 0',
          fontFamily: 'Georgia, serif',
          fontSize: '18px',
          color: 'var(--ink)'
        }}
      >
        {title}
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--line)', color: 'var(--muted)', fontSize: '12px' }}>
              <th style={{ padding: '10px 16px' }}>METRIC NAME</th>
              <th style={{ padding: '10px 16px' }}>CATEGORY</th>
              <th style={{ padding: '10px 16px' }}>COMPUTED VALUE</th>
              <th style={{ padding: '10px 16px' }}>CURRENCY</th>
              <th style={{ padding: '10px 16px' }}>CALCULATION ENGINE</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m, idx) => (
              <tr
                key={m.metricId}
                style={{
                  borderBottom: '1px solid var(--sand)',
                  backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(251, 247, 240, 0.5)'
                }}
              >
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{m.label}</td>
                <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>
                  {m.metricId.includes('revenue') ? 'REVENUE' : m.metricId.includes('expense') ? 'EXPENSE' : m.metricId.includes('margin') ? 'RATIO' : 'PROFIT'}
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 700, color: m.value < 0 ? 'var(--rust)' : 'var(--ink)' }}>
                  {m.formattedValue}
                </td>
                <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>{m.currency}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      background: 'var(--cream)',
                      border: '1px solid var(--line)',
                      color: 'var(--muted)'
                    }}
                  >
                    Deterministic TS (v{m.provenance?.calculationVersion || '1.0.0'})
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
