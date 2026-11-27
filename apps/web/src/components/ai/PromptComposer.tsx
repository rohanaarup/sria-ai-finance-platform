import React, { useState } from 'react';
import { Sparkles, Building2, Calendar, Layers, CornerDownLeft, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '../ui/Button';

interface PromptComposerProps {
  onSubmit: (prompt: string, options?: { compareEntities?: boolean }) => void;
  isLoading: boolean;
}

const PROMPT_SUGGESTIONS = [
  'Executive overview for company 1000 in FY 2026',
  'Revenue performance for company 1000 in FY 2026',
  'Expense & margin for company 2000 FY 2026',
];

export const PromptComposer: React.FC<PromptComposerProps> = ({ onSubmit, isLoading }) => {
  const [prompt, setPrompt] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [companyScope, setCompanyScope] = useState<'auto' | '1000' | '2000'>('auto');
  const [yearScope, setYearScope] = useState<'2026' | '2025'>('2026');
  const [periodScope, setPeriodScope] = useState<'all' | '01' | '02'>('all');

  const buildScopedPrompt = (rawText: string): string => {
    let finalPrompt = rawText.trim();
    const lower = finalPrompt.toLowerCase();

    if (companyScope !== 'auto' && !lower.includes('1000') && !lower.includes('2000') && !lower.includes('company')) {
      finalPrompt += ` for company ${companyScope}`;
    }
    if (!/\b202[0-9]\b/.test(finalPrompt)) {
      finalPrompt += ` in FY ${yearScope}`;
    }
    if (periodScope !== 'all' && !lower.includes('period')) {
      finalPrompt += ` period ${periodScope}`;
    }

    return finalPrompt;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmit(buildScopedPrompt(prompt));
  };

  const handleSuggestion = (text: string) => {
    setPrompt(text);
    onSubmit(text);
  };

  return (
    <div className={clsx('composer-shell', isFocused && 'composer-shell--focused')}>
      <div className="composer-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 650, color: 'var(--text-primary)' }}>
          <Sparkles size={15} style={{ color: 'var(--sunflower)' }} />
          <span>Ask AI Finance Analyst</span>
        </div>

        <div className="composer-scope-group">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            <Building2 size={12} />
            <select
              aria-label="Default company code"
              className="scope-select"
              value={companyScope}
              onChange={(e) => setCompanyScope(e.target.value as 'auto' | '1000' | '2000')}
              disabled={isLoading}
            >
              <option value="auto">Company: Auto</option>
              <option value="1000">Company 1000</option>
              <option value="2000">Company 2000</option>
            </select>
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            <Calendar size={12} />
            <select
              aria-label="Fiscal year"
              className="scope-select"
              value={yearScope}
              onChange={(e) => setYearScope(e.target.value as '2026' | '2025')}
              disabled={isLoading}
            >
              <option value="2026">FY 2026</option>
              <option value="2025">FY 2025</option>
            </select>
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-secondary)' }}>
            <Layers size={12} />
            <select
              aria-label="Fiscal period"
              className="scope-select"
              value={periodScope}
              onChange={(e) => setPeriodScope(e.target.value as 'all' | '01' | '02')}
              disabled={isLoading}
            >
              <option value="all">Full Year</option>
              <option value="01">Period 01</option>
              <option value="02">Period 02</option>
            </select>
          </label>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={isLoading}
          placeholder="Example: Show total revenue, expenses, and profit margin for Company 1000 in FY 2026..."
          rows={3}
          className="composer-textarea"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              if (prompt.trim() && !isLoading) {
                onSubmit(buildScopedPrompt(prompt));
              }
            }
          }}
        />

        <div className="composer-suggestions">
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Try:</span>
          {PROMPT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={isLoading}
              onClick={() => handleSuggestion(s)}
              className="suggestion-pill"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="composer-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="kbd-hint">
              <span className="kbd">Ctrl</span>
              <span>+</span>
              <span className="kbd">Enter</span>
              <span>to generate</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
              <Lock size={11} />
              <span>Deterministic SAP calculations only</span>
            </span>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isLoading}
            disabled={!prompt.trim()}
            icon={<CornerDownLeft size={14} />}
          >
            {isLoading ? 'Generating...' : 'Generate Dashboard'}
          </Button>
        </div>
      </form>
    </div>
  );
};
