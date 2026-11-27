import React from 'react';
import type { AgentGoal } from '@sria/contracts';
import { Badge } from '../ui/Badge';
import {
  assumptionList,
  goalTone,
  goalToneLabel,
  missingList,
  modeLabel,
  taskLabel,
  understoodItems,
  type AiMode,
} from './goal-format';

export interface UnderstoodCardProps {
  goal: AgentGoal | null | undefined;
  aiMode?: AiMode;
  modelId?: string;
}

/**
 * "Here is what I understood" - shows the validated AgentGoal before anything runs.
 * Answering missing information happens in ClarificationModal; here the questions are listed.
 */
export const UnderstoodCard: React.FC<UnderstoodCardProps> = ({ goal, aiMode, modelId }) => {
  if (!goal) return null;
  const tone = goalTone(goal);
  const items = understoodItems(goal);
  const assumptions = assumptionList(goal);
  const missing = missingList(goal);
  const badgeTone = tone === 'ok' ? 'positive' : tone === 'needs-answer' ? 'warning' : 'neutral';

  return (
    <section
      className={`goal-card goal-card--${tone}`}
      role="region"
      aria-label="Here is what I understood"
      data-testid="understood-card"
    >
      <div className="goal-card__head">
        <h2 className="goal-card__title">Here is what I understood</h2>
        <span className="goal-card__task">
          <Badge tone={badgeTone}>{taskLabel(goal.taskType)}: {goalToneLabel(tone)}</Badge>
        </span>
      </div>

      <p className="goal-card__rationale">{goal.rationale}</p>

      {tone === 'unsupported' ? (
        <div>
          <h3 className="goal-section-title">Why I cannot do this</h3>
          <p className="goal-unsupported">{goal.unsupportedReason ?? 'This request is outside what I can do.'}</p>
        </div>
      ) : (
        items.length > 0 && (
          <div>
            <h3 className="goal-section-title">What I understood</h3>
            <ul className="goal-list">
              {items.map((it, i) => (
                <li key={`${it.label}-${i}`}>
                  <span className="goal-list__label">{it.label}:</span>
                  <span>{it.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {assumptions.length > 0 && (
        <div className="goal-assumptions">
          <h3 className="goal-section-title">I assumed &mdash; tell me if wrong</h3>
          <ul className="goal-list">
            {assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {missing.length > 0 && (
        <div className="goal-questions">
          <h3 className="goal-section-title">I need an answer</h3>
          <ol className="goal-list">
            {missing.map((m) => (
              <li key={m.parameter}>
                {m.question}
                {m.options.length > 0 && (
                  <span className="goal-question__options"> (options: {m.options.join(', ')})</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="goal-card__foot" data-testid="understood-card-ai">
        <span>{modeLabel(aiMode ?? 'unknown')}</span>
        {modelId && <span>&middot; model: {modelId}</span>}
      </div>
    </section>
  );
};
