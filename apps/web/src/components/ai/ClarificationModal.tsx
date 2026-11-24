import React from 'react';
import type { ClarificationQuestion } from '@sria/contracts';

interface ClarificationModalProps {
  questions: ClarificationQuestion[];
  onSelectOption: (paramName: string, selectedValue: string) => void;
  onCancel: () => void;
}

export const ClarificationModal: React.FC<ClarificationModalProps> = ({
  questions,
  onSelectOption,
  onCancel
}) => {
  return (
    <div
      style={{
        background: '#fffbf5',
        border: '2px solid var(--copper)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: 'var(--shadow)',
        marginBottom: '28px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span
          style={{
            padding: '3px 8px',
            borderRadius: '4px',
            background: 'var(--copper)',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: 700
          }}
        >
          AI CLARIFICATION REQUIRED
        </span>
        <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--ink)', fontFamily: 'Georgia, serif' }}>
          Please clarify missing request parameters
        </h4>
      </div>

      <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--muted)' }}>
        The AI identified ambiguous or missing reporting parameters. Please choose from the allowable options below:
      </p>

      {questions.map((q) => (
        <div
          key={q.questionId}
          style={{
            background: '#ffffff',
            border: '1px solid var(--line)',
            borderRadius: '10px',
            padding: '16px',
            marginBottom: '12px'
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
            {q.prompt}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px' }}>
            Reason: {q.reason}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(q.options || ['1000', '2000']).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onSelectOption(q.parameterName, opt)}
                style={{
                  background: 'var(--cream)',
                  border: '1px solid var(--rust)',
                  color: 'var(--rust)',
                  fontWeight: 600,
                  fontSize: '13px',
                  padding: '6px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                {opt} {q.suggestedDefault === opt ? '(Recommended)' : ''}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Dismiss & edit prompt
        </button>
      </div>
    </div>
  );
};

