import React from 'react';
import { Check, Loader2 } from 'lucide-react';

export type ProgressStep =
  | 'INTERPRETING'
  | 'PLANNING'
  | 'RETRIEVING_DATA'
  | 'CALCULATING'
  | 'COMPILING';

interface WorkflowProgressIndicatorProps {
  currentStep: ProgressStep | null;
}

const STEPS: { id: ProgressStep; label: string; desc: string }[] = [
  { id: 'INTERPRETING', label: 'Understand', desc: 'Matching keywords in your request to metrics and filters' },
  { id: 'PLANNING', label: 'Plan', desc: 'Building a query plan for the matched metrics' },
  { id: 'RETRIEVING_DATA', label: 'Fetch', desc: 'Fetching finance records from the backend data provider' },
  { id: 'CALCULATING', label: 'Calculate', desc: 'Calculating metric values with fixed formulas' },
  { id: 'COMPILING', label: 'Compile', desc: 'Compiling the dashboard layout and rendering it' },
];

export const WorkflowProgressIndicator: React.FC<WorkflowProgressIndicatorProps> = ({
  currentStep,
}) => {
  if (!currentStep) return null;

  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);
  const current = STEPS[currentIdx];

  return (
    <div
      className="animate-fade-in"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 11,
        padding: '16px 20px',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: 20,
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Loader2 size={17} className="animate-spin" style={{ color: 'var(--accent)' }} />
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>
              {current?.label}: {current?.desc}
            </div>
          </div>
        </div>
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Step {currentIdx + 1} / {STEPS.length}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {STEPS.map((step, idx) => {
          const isCompleted = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <React.Fragment key={step.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    background: isCompleted
                      ? 'var(--positive)'
                      : isCurrent
                      ? 'var(--accent)'
                      : 'var(--bg-subtle)',
                    color: isCompleted || isCurrent ? '#FFFFFF' : 'var(--text-tertiary)',
                    border: isCompleted || isCurrent ? 'none' : '1px solid var(--border-strong)',
                    flexShrink: 0,
                  }}
                >
                  {isCompleted ? <Check size={12} /> : idx + 1}
                </div>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: isCurrent ? 650 : 500,
                    color: isCurrent
                      ? 'var(--text-primary)'
                      : isCompleted
                      ? 'var(--positive)'
                      : 'var(--text-tertiary)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    borderRadius: 99,
                    background: isCompleted ? 'var(--positive)' : 'var(--border)',
                    minWidth: 12,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
