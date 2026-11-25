import React, { useState } from 'react';

interface FollowUpPanelProps {
  onFollowUp: (prompt: string) => void;
  onRefresh: () => void;
  onSave: () => void;
  isLoading: boolean;
  isStale?: boolean;
}

export const FollowUpPanel: React.FC<FollowUpPanelProps> = ({
  onFollowUp,
  onRefresh,
  onSave,
  isLoading,
  isStale
}) => {
  const [followUpText, setFollowUpText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!followUpText.trim() || isLoading) return;
    onFollowUp(followUpText.trim());
    setFollowUpText('');
  };

  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--line)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: 'var(--shadow)',
        marginTop: '32px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3
            style={{
              margin: '0 0 4px 0',
              fontFamily: 'Georgia, serif',
              fontSize: '18px',
              color: 'var(--ink)'
            }}
          >
            Conversational Follow-up & Dashboard Actions
          </h3>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
            Ask follow-up visual changes (chart types, styling) or data modifications (filters, metrics).
          </p>
        </div>

        {/* Action Buttons: Save & Refresh */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            style={{
              background: isStale ? '#fff3cd' : 'var(--cream)',
              border: `1px solid ${isStale ? '#ffeeba' : 'var(--line)'}`,
              color: isStale ? '#856404' : 'var(--ink)',
              padding: '8px 16px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isStale ? '⚠️ Refresh Stale Data' : '🔄 Refresh Data'}
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={isLoading}
            style={{
              background: 'var(--rust)',
              border: 'none',
              color: '#ffffff',
              padding: '8px 18px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            💾 Save to Database
          </button>
        </div>
      </div>

      {/* Follow-up Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <input
          type="text"
          value={followUpText}
          onChange={(e) => setFollowUpText(e.target.value)}
          disabled={isLoading}
          placeholder="Type a follow-up (e.g., 'Switch to line chart', 'Add profit margin', 'Switch to Company 2000')..."
          style={{
            flex: 1,
            padding: '12px 18px',
            borderRadius: '10px',
            border: '1px solid var(--line)',
            fontSize: '14px',
            background: 'var(--cream)',
            color: 'var(--ink)',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !followUpText.trim()}
          style={{
            background: 'var(--ink)',
            color: '#ffffff',
            border: 'none',
            padding: '0 24px',
            borderRadius: '10px',
            fontWeight: 600,
            fontSize: '13px',
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          Send Follow-up
        </button>
      </form>

      {/* Quick Action Chips */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
          Quick Follow-ups:
        </span>
        <button
          type="button"
          onClick={() => onFollowUp('Switch to line chart')}
          style={{
            background: 'var(--cream)',
            border: '1px solid var(--line)',
            padding: '4px 10px',
            borderRadius: '99px',
            fontSize: '12px',
            color: 'var(--ink-light)',
            cursor: 'pointer'
          }}
        >
          📈 Presentation: Line Chart
        </button>
        <button
          type="button"
          onClick={() => onFollowUp('Switch to bar chart')}
          style={{
            background: 'var(--cream)',
            border: '1px solid var(--line)',
            padding: '4px 10px',
            borderRadius: '99px',
            fontSize: '12px',
            color: 'var(--ink-light)',
            cursor: 'pointer'
          }}
        >
          📊 Presentation: Bar Chart
        </button>
        <button
          type="button"
          onClick={() => onFollowUp('Add profit margin')}
          style={{
            background: 'var(--cream)',
            border: '1px solid var(--line)',
            padding: '4px 10px',
            borderRadius: '99px',
            fontSize: '12px',
            color: 'var(--rust)',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          + Data: Add Margin
        </button>
        <button
          type="button"
          onClick={() => onFollowUp('Switch to company 2000')}
          style={{
            background: 'var(--cream)',
            border: '1px solid var(--line)',
            padding: '4px 10px',
            borderRadius: '99px',
            fontSize: '12px',
            color: 'var(--rust)',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          🏢 Data: Company 2000 (Operating Loss)
        </button>
      </div>
    </div>
  );
};

