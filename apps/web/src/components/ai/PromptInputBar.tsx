import React, { useState } from 'react';

interface PromptInputBarProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
}

const SAMPLE_PROMPTS = [
  'Show total revenue and net profit for company 1000 in fiscal year 2026',
  'Display total expenses and profit margin for company 2000 in 2026',
  'Give me complete financial overview for company 1000'
];

export const PromptInputBar: React.FC<PromptInputBarProps> = ({ onSubmit, isLoading }) => {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;
    onSubmit(prompt.trim());
  };

  const handleSelectSample = (sample: string) => {
    setPrompt(sample);
    onSubmit(sample);
  };

  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--line)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: 'var(--shadow)',
        marginBottom: '28px'
      }}
    >
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
            placeholder="Describe your finance dashboard in natural language (e.g., 'Show total revenue and expenses for company 1000 in 2026')..."
            style={{
              flex: 1,
              padding: '14px 20px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              fontSize: '15px',
              background: 'var(--cream)',
              color: 'var(--ink)',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !prompt.trim()}
            style={{
              padding: '0 28px',
              borderRadius: '10px',
              border: 'none',
              background: isLoading ? 'var(--muted)' : 'var(--rust)',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '14px',
              cursor: isLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? 'Generating...' : 'Generate Dashboard'}
          </button>
        </div>
      </form>

      {/* Suggested Quick Prompt Chips */}
      <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>Quick templates:</span>
        {SAMPLE_PROMPTS.map((sample, idx) => (
          <button
            key={idx}
            type="button"
            disabled={isLoading}
            onClick={() => handleSelectSample(sample)}
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              padding: '4px 12px',
              borderRadius: '99px',
              fontSize: '12px',
              color: 'var(--ink-light)',
              cursor: 'pointer'
            }}
          >
            {sample.length > 50 ? sample.slice(0, 48) + '...' : sample}
          </button>
        ))}
      </div>
    </div>
  );
};
