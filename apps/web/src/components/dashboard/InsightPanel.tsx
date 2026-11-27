import React from 'react';
import {
  TrendingUp,
  AlertCircle,
  AlertTriangle,
  Info,
  Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { AnalyticalInsight } from '../../services/dashboard-intelligence';
import { Badge } from '../ui/Badge';

interface InsightPanelProps {
  insights: AnalyticalInsight[];
  title?: string;
}

export const InsightPanel: React.FC<InsightPanelProps> = ({
  insights,
  title = 'Validated Analytical Observations',
}) => {
  if (insights.length === 0) return null;

  const getIcon = (tone: AnalyticalInsight['tone']) => {
    switch (tone) {
      case 'positive':
        return <TrendingUp size={15} style={{ color: 'var(--positive)', flexShrink: 0, marginTop: 2 }} />;
      case 'negative':
        return <AlertCircle size={15} style={{ color: 'var(--negative)', flexShrink: 0, marginTop: 2 }} />;
      case 'warning':
        return <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />;
      default:
        return <Info size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0, marginTop: 2 }} />;
    }
  };

  return (
    <section aria-label={title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Sparkles size={14} style={{ color: 'var(--accent)' }} />
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 650, color: 'var(--text-primary)' }}>
            {title}
          </h3>
        </div>
        <Badge tone="neutral">Derived from deterministic calculations</Badge>
      </div>

      <div className="insights-list">
        {insights.map((ins) => (
          <div key={ins.id} className={clsx('insight-item', `insight-item--${ins.tone}`)}>
            {getIcon(ins.tone)}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-primary)', marginBottom: 2 }}>
                {ins.title}
              </div>
              <div>{ins.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

