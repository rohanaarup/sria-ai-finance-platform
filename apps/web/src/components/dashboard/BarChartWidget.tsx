import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import type { MetricResult } from '@sria/contracts';

interface BarChartWidgetProps {
  title: string;
  metrics: MetricResult[];
}

export const BarChartWidget: React.FC<BarChartWidgetProps> = ({ title, metrics }) => {
  // Transform metric results into bar chart format
  const chartData = metrics
    .filter(m => m.metricId !== 'profit_margin')
    .map(m => ({
      name: m.label,
      Amount: m.value
    }));

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
          margin: '0 0 20px 0',
          fontFamily: 'Georgia, serif',
          fontSize: '18px',
          color: 'var(--ink)'
        }}
      >
        {title}
      </h3>
      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee3d5" />
            <XAxis dataKey="name" tick={{ fill: '#79665c', fontSize: 12 }} />
            <YAxis
              tick={{ fill: '#79665c', fontSize: 12 }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value: any) => [`$${Number(value).toLocaleString()}`, 'Amount']}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e3d5c4',
                borderRadius: '8px'
              }}
            />
            <Legend />
            <Bar dataKey="Amount" fill="#a65340" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

