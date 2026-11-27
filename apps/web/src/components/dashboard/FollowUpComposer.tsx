import React, { useState } from 'react';
import { MessageSquarePlus, Send, Sparkles, Database, Eye } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface FollowUpComposerProps {
  onFollowUp: (prompt: string) => void;
  isLoading: boolean;
}

const FOLLOW_UP_CHIPS: {
  label: string;
  kind: 'presentation' | 'data' | 'explain';
}[] = [
  { label: 'Change chart to line chart', kind: 'presentation' },
  { label: 'Change chart to area chart', kind: 'presentation' },
  { label: 'Explain this financial trend', kind: 'explain' },
  { label: 'Add profit margin', kind: 'data' },
  { label: 'Switch to company 2000', kind: 'data' },
  { label: 'Filter to period 02', kind: 'data' },
];

export const FollowUpComposer: React.FC<FollowUpComposerProps> = ({
  onFollowUp,
  isLoading,
}) => {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isLoading) return;
    onFollowUp(text.trim());
    setText('');
  };

  return (
    <section className="followup-bar" aria-label="Dashboard follow-up assistant">
      <div className="followup-bar__head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageSquarePlus size={15} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)' }}>
            Contextual Follow-up
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Refine presentation instantly or run a fresh SAP query
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Badge tone="neutral">
            <Eye size={10} />
            <span>View = instant</span>
          </Badge>
          <Badge tone="brand">
            <Database size={10} />
            <span>SAP Query = fresh fetch</span>
          </Badge>
        </div>
      </div>

      <div className="followup-bar__body">
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isLoading}
            placeholder="e.g. 'Change chart to line chart', 'Compare company 2000', 'Explain this trend'..."
            aria-label="Follow-up prompt"
            style={{
              flex: 1,
              minWidth: 220,
              height: 36,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid var(--border-strong)',
              background: 'var(--surface-subtle)',
              fontSize: 13,
              color: 'var(--text-primary)',
            }}
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={isLoading || !text.trim()}
            icon={<Send size={13} />}
          >
            Apply Follow-up
          </Button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginRight: 2 }}>
            Quick actions:
          </span>
          {FOLLOW_UP_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={isLoading}
              onClick={() => onFollowUp(chip.label)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 999,
                border: `1px solid ${
                  chip.kind === 'data' ? 'var(--accent-border)' : 'var(--border)'
                }`,
                background:
                  chip.kind === 'data' ? 'var(--accent-subtle)' : 'var(--surface)',
                color:
                  chip.kind === 'data' ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 11.5,
                fontWeight: chip.kind === 'data' ? 600 : 500,
              }}
            >
              {chip.kind === 'explain' ? (
                <Sparkles size={11} />
              ) : chip.kind === 'data' ? (
                <Database size={11} />
              ) : (
                <Eye size={11} />
              )}
              <span>{chip.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

