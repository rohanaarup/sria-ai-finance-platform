import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Sparkles,
  LayoutGrid,
  BarChart2,
  Sun,
  Moon,
  ArrowRight,
  GitCompareArrows,
  BookMarked,
} from 'lucide-react';
import { Dialog } from './Dialog';
import { Badge } from './Badge';
import type { ThemeMode } from '../../hooks/useTheme';

interface CommandAction {
  id: string;
  label: string;
  category: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onGoStudio: () => void;
  onGoCanvas: () => void;
  onGoSaved: () => void;
  onRunPrompt: (prompt: string, compare?: boolean) => void;
  onOpenMetricCatalog?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  theme,
  onToggleTheme,
  onGoStudio,
  onGoCanvas,
  onGoSaved,
  onRunPrompt,
  onOpenMetricCatalog,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const actions: CommandAction[] = useMemo(
    () => [
      {
        id: 'exec-1000',
        label: 'Generate Executive Overview (Company 1000, FY 2026)',
        category: 'AI Template',
        icon: <Sparkles size={14} style={{ color: 'var(--accent)' }} />,
        run: () => onRunPrompt('Give me complete financial overview for company 1000 in FY 2026'),
      },
      {
        id: 'rev-1000',
        label: 'Generate Revenue Intelligence (Company 1000)',
        category: 'AI Template',
        icon: <BarChart2 size={14} style={{ color: 'var(--info)' }} />,
        run: () => onRunPrompt('Show total revenue for company 1000 in fiscal year 2026'),
      },
      {
        id: 'exp-1000',
        label: 'Generate Expense Analysis (Company 1000)',
        category: 'AI Template',
        icon: <BarChart2 size={14} style={{ color: 'var(--warning)' }} />,
        run: () => onRunPrompt('Show total expenses for company 1000 in FY 2026'),
      },
      {
        id: 'cmp-entities',
        label: 'Compare Company 1000 vs Company 2000',
        category: 'Comparison',
        icon: <GitCompareArrows size={14} style={{ color: 'var(--accent)' }} />,
        run: () =>
          onRunPrompt('Compare financial overview for company 1000 and company 2000 in FY 2026', true),
      },
      {
        id: 'nav-studio',
        label: 'Go to Create Dashboard Studio',
        category: 'Navigation',
        icon: <Sparkles size={14} />,
        run: onGoStudio,
      },
      {
        id: 'nav-canvas',
        label: 'View Active Dashboard Canvas',
        category: 'Navigation',
        icon: <BarChart2 size={14} />,
        run: onGoCanvas,
      },
      {
        id: 'nav-saved',
        label: 'Open My Dashboards Library',
        category: 'Navigation',
        icon: <LayoutGrid size={14} />,
        run: onGoSaved,
      },
      ...(onOpenMetricCatalog
        ? [
            {
              id: 'open-metric-catalog',
              label: 'Open Metric Catalog & Glossary',
              category: 'Governance',
              icon: <BookMarked size={14} />,
              run: onOpenMetricCatalog,
            },
          ]
        : []),
      {
        id: 'toggle-theme',
        label: `Switch to ${theme === 'light' ? 'Dark Espresso & Sunflower' : 'Warm Cream & Sunflower'} Mode`,
        category: 'Appearance',
        icon: theme === 'light' ? <Moon size={14} /> : <Sun size={14} />,
        run: onToggleTheme,
      },
    ],
    [theme, onToggleTheme, onGoStudio, onGoCanvas, onGoSaved, onRunPrompt, onOpenMetricCatalog]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return actions;
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
    );
  }, [actions, query]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Quick Command Menu"
      subtitle="Jump to any view, launch a dashboard template, or switch theme"
    >
      <div style={{ position: 'relative' }}>
        <Search
          size={15}
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-tertiary)',
          }}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command, company code, or view..."
          autoFocus
          style={{
            width: '100%',
            height: 40,
            padding: '0 14px 0 36px',
            borderRadius: 9,
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-subtle)',
            color: 'var(--text-primary)',
            fontSize: 13.5,
          }}
        />
      </div>

      <div className="cmd-list">
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            className="cmd-item"
            onClick={() => {
              item.run();
              onClose();
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {item.icon}
              <span style={{ fontSize: 13, fontWeight: 550 }}>{item.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Badge tone="neutral">{item.category}</Badge>
              <ArrowRight size={12} style={{ color: 'var(--text-tertiary)' }} />
            </div>
          </button>
        ))}

        {query.trim().length > 2 && (
          <button
            type="button"
            className="cmd-item"
            style={{ borderColor: 'var(--accent-border)', background: 'var(--accent-subtle)' }}
            onClick={() => {
              onRunPrompt(query.trim());
              onClose();
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Sparkles size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Ask AI: &ldquo;{query.trim()}&rdquo;
              </span>
            </div>
            <Badge tone="brand">Run Query</Badge>
          </button>
        )}
      </div>
    </Dialog>
  );
};

