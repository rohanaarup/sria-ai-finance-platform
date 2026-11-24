import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface LineChartWidgetProps {
  title: string;
}

export const LineChartWidget: React.FC<LineChartWidgetProps> = ({ title }) => {
  const trendData = [
    { period: 'Period 01', Revenue: 150000, Expenses: 90000, Profit: 60000 },
    { period: 'Period 02', Revenue: 200000, Expenses: 140000, Profit: 60000 }
  ];

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
          <LineChart data={trendData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee3d5" />
            <XAxis dataKey="period" tick={{ fill: '#79665c', fontSize: 12 }} />
            <YAxis
              tick={{ fill: '#79665c', fontSize: 12 }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value: any) => [`$${Number(value).toLocaleString()}`, '']}
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e3d5c4',
                borderRadius: '8px'
              }}
            />
            <Legend />
            <Line type="monotone" dataKey="Revenue" stroke="#71352c" strokeWidth={3} dot={{ r: 5 }} />
            <Line type="monotone" dataKey="Expenses" stroke="#d4a184" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="Profit" stroke="#3f6943" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

