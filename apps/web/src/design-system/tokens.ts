// ─── Sria Info Tech Design System Tokens ──────────────────────────────────────
// Enterprise Financial Intelligence · Linear · Stripe · Ramp · Vercel inspired

export const colors = {
  // Surfaces & Backgrounds
  bgCanvas: '#F6F5F2',
  bgSubtle: '#EFECE6',
  surface: '#FFFFFF',
  surfaceElevated: '#FAFAF8',
  surfaceHover: '#F5F3EE',

  // Sidebar (Deep warm obsidian)
  sidebarBg: '#161412',
  sidebarSurface: '#211E1B',
  sidebarBorder: 'rgba(255, 255, 255, 0.08)',
  sidebarText: '#D6D3D1',
  sidebarMuted: '#8C8680',
  sidebarActiveText: '#FFFFFF',

  // Typography
  textPrimary: '#181615',
  textSecondary: '#57534E',
  textMuted: '#8C8680',

  // Brand Accent (Restrained terracotta — identity & primary CTAs only)
  brand: '#C2531A',
  brandHover: '#A84412',
  brandSubtle: '#FDF1EA',
  brandMuted: '#E8A07A',
  brandBorder: 'rgba(194, 83, 26, 0.22)',

  // Semantic Financial Indicators
  positive: '#15803D',
  positiveBg: '#ECFDF5',
  positiveBorder: '#BBF7D0',

  negative: '#B91C1C',
  negativeBg: '#FEF2F2',
  negativeBorder: '#FECACA',

  warning: '#B45309',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',

  info: '#0369A1',
  infoBg: '#F0F9FF',
  infoBorder: '#BAE6FD',

  neutral: '#57534E',
  neutralBg: '#F5F4F1',

  // Borders & Dividers
  border: '#E7E4DE',
  borderStrong: '#D4CFC7',
} as const;

export const chartPalette = {
  total_revenue: '#0284C7',   // Sky Blue 600
  total_expenses: '#D97706',  // Amber 600
  net_profit: '#15803D',      // Emerald 700
  profit_margin: '#6366F1',   // Indigo 500
  comparisonA: '#0284C7',     // Primary Entity / Period
  comparisonB: '#64748B',     // Secondary Entity / Prior Period
  brandHighlight: '#C2531A',  // Selective highlight only
  gridLine: '#EAE6DF',
  axisText: '#78716C',
} as const;

export const typography = {
  fontSans: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`,
  fontMono: `'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace`,
} as const;

export const radius = {
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '10px',
  xl: '14px',
  full: '9999px',
} as const;

export const shadow = {
  xs: '0 1px 2px rgba(24, 22, 21, 0.04)',
  sm: '0 1px 3px rgba(24, 22, 21, 0.06), 0 1px 2px rgba(24, 22, 21, 0.03)',
  md: '0 4px 12px rgba(24, 22, 21, 0.07), 0 2px 4px rgba(24, 22, 21, 0.03)',
  lg: '0 12px 32px rgba(24, 22, 21, 0.10), 0 4px 10px rgba(24, 22, 21, 0.04)',
  popover: '0 16px 40px rgba(24, 22, 21, 0.14), 0 4px 12px rgba(24, 22, 21, 0.06)',
} as const;

export interface MetricGlossaryEntry {
  id: 'total_revenue' | 'total_expenses' | 'net_profit' | 'profit_margin';
  label: string;
  category: string;
  formula: string;
  explanation: string;
  sapSource: string;
}

export const METRIC_GLOSSARY: Record<string, MetricGlossaryEntry> = {
  total_revenue: {
    id: 'total_revenue',
    label: 'Total Revenue',
    category: 'Revenue',
    formula: 'SUM(CreditAmount - DebitAmount) for Revenue GL Accounts (Type R)',
    explanation: 'Gross recognized revenue from sales and services, net of debit returns and deductions.',
    sapSource: 'I_JournalEntryItemBasic · AmountInCompanyCodeCurrency',
  },
  total_expenses: {
    id: 'total_expenses',
    label: 'Total Expenses',
    category: 'Operating Expense',
    formula: 'SUM(DebitAmount - CreditAmount) for Expense GL Accounts (Type X/E)',
    explanation: 'Operating and administrative costs incurred in the selected fiscal scope, net of reversals.',
    sapSource: 'I_JournalEntryItemBasic · AmountInCompanyCodeCurrency',
  },
  net_profit: {
    id: 'net_profit',
    label: 'Net Profit',
    category: 'Net Income',
    formula: 'total_revenue - total_expenses',
    explanation: 'Deterministic operating income after deducting total expenses from total revenue.',
    sapSource: 'Derived in CAP CalculationEngine v1.0.0',
  },
  profit_margin: {
    id: 'profit_margin',
    label: 'Profit Margin',
    category: 'Profitability Ratio',
    formula: '(net_profit / total_revenue) * 100',
    explanation: 'Share of revenue retained as net profit. Protected against zero-revenue division.',
    sapSource: 'Derived in CAP CalculationEngine v1.0.0',
  },
};
