import React from 'react';
import { HelpCircle, ArrowRight } from 'lucide-react';
import type { ClarificationQuestion } from '@sria/contracts';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface ClarificationModalProps {
  questions: ClarificationQuestion[];
  onSelectOption: (paramName: string, selectedValue: string) => void;
  onCancel: () => void;
}

export const ClarificationModal: React.FC<ClarificationModalProps> = ({
  questions,
  onSelectOption,
  onCancel,
}) => {
  return (
    <Dialog
      open={questions.length > 0}
      onClose={onCancel}
      title="Specify Reporting Parameters"
      subtitle="Deterministic SAP calculations require explicit accounting dimensions before execution."
      footer={
        <Button variant="ghost" onClick={onCancel}>
          Modify Request
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge tone="brand">
            <HelpCircle size={12} />
            Clarification Required
          </Badge>
        </div>

        {questions.map((q) => (
          <div
            key={q.questionId}
            style={{
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 9,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)', marginBottom: 3 }}>
              {q.prompt}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginBottom: 12 }}>
              {q.reason}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(q.options || ['1000', '2000']).map((opt) => {
                const isRec = q.suggestedDefault === opt;
                return (
                  <Button
                    key={opt}
                    variant={isRec ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => onSelectOption(q.parameterName, opt)}
                    icon={<ArrowRight size={13} />}
                  >
                    {opt}
                    {isRec ? ' (Recommended)' : ''}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
};
