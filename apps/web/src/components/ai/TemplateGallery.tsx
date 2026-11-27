import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Receipt,
  Percent,
  GitCompareArrows,
  ArrowRight,
  Info,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Tooltip } from '../ui/Tooltip';

export interface DashboardTemplate {
  id: string;
  title: string;
  purpose: string;
  description: string;
  prompt: string;
  featured?: boolean;
  compareEntities?: boolean;
  iconBg: string;
  iconColor: string;
  icon: React.ReactNode;
}

const CONFIGURED_TEMPLATES: DashboardTemplate[] = [
  {
    id: 'executive-overview',
    title: 'Executive Financial Overview',
    purpose: 'Full P&L Snapshot',
    description: 'Revenue, operating expenses, net profit & margin for Company 1000 (FY 2026).',
    prompt: 'Give me complete financial overview for company 1000 in FY 2026',
    featured: true,
    iconBg: 'var(--accent-subtle)',
    iconColor: 'var(--accent)',
    icon: <LayoutDashboard size={17} />,
  },
  {
    id: 'revenue-intelligence',
    title: 'Revenue Intelligence',
    purpose: 'Top-line Growth',
    description: 'Period 01 vs 02 trajectory & commercial unit breakdown.',
    prompt: 'Show total revenue for company 1000 in fiscal year 2026',
    iconBg: 'var(--info-subtle)',
    iconColor: 'var(--info)',
    icon: <TrendingUp size={16} />,
  },
  {
    id: 'expense-analysis',
    title: 'Expense Analysis',
    purpose: 'Cost Structure',
    description: 'Operating spend across Operations, Admin & Marketing units.',
    prompt: 'Show total expenses for company 1000 in FY 2026',
    iconBg: 'var(--warning-subtle)',
    iconColor: 'var(--warning)',
    icon: <Receipt size={16} />,
  },
  {
    id: 'profitability',
    title: 'Profitability Analysis',
    purpose: 'Net Income & Margin',
    description: 'Deterministic net profit & margin efficiency with loss guards.',
    prompt: 'Show net profit and profit margin for company 1000 FY 2026',
    iconBg: 'var(--positive-subtle)',
    iconColor: 'var(--positive)',
    icon: <Percent size={16} />,
  },
  {
    id: 'entity-comparison',
    title: 'Entity Comparison (1000 vs 2000)',
    purpose: 'Inter-company Variance',
    description: 'Compare revenue, costs & profitability across both SAP entities.',
    prompt: 'Compare financial overview for company 1000 and company 2000 in FY 2026',
    compareEntities: true,
    iconBg: 'var(--accent-subtle)',
    iconColor: 'var(--accent)',
    icon: <GitCompareArrows size={16} />,
  },
];

interface TemplateGalleryProps {
  onSelectTemplate: (template: DashboardTemplate) => void;
  isLoading: boolean;
}

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  onSelectTemplate,
  isLoading,
}) => {
  return (
    <div className="template-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 650,
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          Or Start From a Verified Template
        </span>

        <Tooltip content="Templates map strictly to allowlisted metrics in FinanceMetricRegistry (Revenue, Expenses, Net Profit, Margin).">
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11.5,
              color: 'var(--text-tertiary)',
              cursor: 'help',
            }}
          >
            <Info size={12} />
            <span>5 configured</span>
          </span>
        </Tooltip>
      </div>

      <div className="template-grid">
        {CONFIGURED_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            disabled={isLoading}
            onClick={() => onSelectTemplate(tpl)}
            className={clsx('template-card', tpl.featured && 'template-card--featured')}
          >
            <div
              className="template-card__icon"
              style={{ background: tpl.iconBg, color: tpl.iconColor }}
            >
              {tpl.icon}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>
                  {tpl.title}
                </span>
                {tpl.featured && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 650,
                      color: 'var(--accent)',
                      background: 'var(--accent-subtle)',
                      padding: '2px 8px',
                      borderRadius: 999,
                    }}
                  >
                    Recommended
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: tpl.iconColor, marginTop: 2 }}>
                {tpl.purpose}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 4 }}>
                {tpl.description}
              </div>
            </div>

            {tpl.featured && (
              <ArrowRight size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
