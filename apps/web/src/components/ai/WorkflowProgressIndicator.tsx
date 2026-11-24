import React from 'react';

export type ProgressStep =
  | 'INTERPRETING'
  | 'VALIDATING'
  | 'PLANNING'
  | 'AUTHORIZING'
  | 'RETRIEVING_DATA'
  | 'CALCULATING'
  | 'DONE';

interface WorkflowProgressIndicatorProps {
  currentStep: ProgressStep;
}

const STEPS: { key: ProgressStep; label: string }[] = [
  { key: 'INTERPRETING', label: '1. Interpret Intent' },
  { key: 'VALIDATING', label: '2. Check Allowlist' },
  { key: 'PLANNING', label: '3. Build DataPlan' },
  { key: 'AUTHORIZING', label: '4. CAP Auth' },
  { key: 'RETRIEVING_DATA', label: '5. Query Data' },
  { key: 'CALCULATING', label: '6. Deterministic Math' }
];

export const WorkflowProgressIndicator: React.FC<WorkflowProgressIndicatorProps> = ({ currentStep }) => {
  const currentIdx = STEPS.findIndex(s => s.key === currentStep);

  return (
    <div
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--line)',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '24px',
        boxShadow: 'var(--shadow)'
      }}
    >
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
        Live Backend State Machine Progress
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        {STEPS.map((s, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;

          return (
            <div
              key={s.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: isCurrent ? 700 : 500,
                color: isDone ? 'var(--success)' : isCurrent ? 'var(--rust)' : 'var(--muted)'
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isDone ? 'var(--success)' : isCurrent ? 'var(--rust)' : 'var(--line)'
                }}
              />
              <span>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
