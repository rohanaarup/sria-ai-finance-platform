/**
 * Task taxonomy (G2-04): the kinds of request the assistant distinguishes, and what the platform can
 * do with each TODAY. This table is the honest capability map; the agent runtime (G2-05 onward)
 * extends the "supported now" column.
 */
import type { TaskType } from '@sria/contracts';

export interface TaskInfo { label: string; description: string; executableToday: boolean; note: string }

export const TASK_DESCRIPTIONS: Record<TaskType, TaskInfo> = {
  create_dashboard: { label: 'Create a dashboard', description: 'Build a dashboard of metrics for a company and period.', executableToday: true, note: 'Single company code, one fiscal year.' },
  answer_question: { label: 'Answer a question', description: 'Answer a specific factual question about one value.', executableToday: true, note: 'Shown as a focused dashboard until the agent runtime exists.' },
  compare: { label: 'Compare', description: 'Compare companies or periods.', executableToday: false, note: 'Understood now; multi-entity and period comparison arrive with the agent runtime (G2-05/G2-06).' },
  analyze_variance: { label: 'Explain a change', description: 'Explain why a metric changed between periods.', executableToday: false, note: 'Understood now; analysis tools arrive with G2-06.' },
  explain_metric: { label: 'Explain a metric', description: 'Explain what a metric means and how it is calculated.', executableToday: false, note: 'Understood now; answered from the semantic layer with the agent runtime.' },
  modify_dashboard: { label: 'Change the open dashboard', description: 'Change filters, metrics or layout of an open dashboard.', executableToday: false, note: 'Understood now; applied through the follow-up flow later.' },
  unsupported: { label: 'Not supported', description: 'Outside scope, unsafe, or an unsupported metric.', executableToday: false, note: 'Refused with an explanation.' }
};
