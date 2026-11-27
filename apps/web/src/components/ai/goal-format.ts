/**
 * Pure display helpers for AgentGoal (G2-04). No React; type-only imports so node --test can load it.
 */
import type { AgentGoal, TaskType } from '@sria/contracts';

export type GoalTone = 'ok' | 'needs-answer' | 'unsupported';
export type AiMode = 'mock' | 'replay' | 'live' | 'unknown';
export type ModeTone = 'warning' | 'info' | 'positive' | 'neutral';

const TASK_LABELS: Record<TaskType, string> = {
  create_dashboard: 'Create a dashboard',
  answer_question: 'Answer a question',
  compare: 'Compare',
  analyze_variance: 'Analyze a variance',
  explain_metric: 'Explain a metric',
  modify_dashboard: 'Modify the dashboard',
  unsupported: 'Not supported',
};

export function taskLabel(t: TaskType): string {
  return TASK_LABELS[t] ?? 'Unknown task';
}

type PeriodLike = { fiscalYear: number | null; periodFrom: string | null; periodTo: string | null };

export function formatPeriod(p: PeriodLike | null | undefined): string {
  if (!p || (p.fiscalYear === null && !p.periodFrom && !p.periodTo)) return 'Period not specified';
  const fy = p.fiscalYear !== null ? `fiscal year ${p.fiscalYear}` : null;
  const from = p.periodFrom;
  const to = p.periodTo;
  if (!from && !to) return `whole ${fy}`;
  let range: string;
  if (from && to) range = from === to ? `period ${from}` : `periods ${from} to ${to}`;
  else if (from) range = `from period ${from}`;
  else range = `up to period ${to}`;
  return fy ? `${range}, ${fy}` : range;
}

export interface GoalItem {
  label: string;
  value: string;
}

export function formatMetric(id: string): string {
  const words = id.split('_').join(' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} (${id})`;
}

export function understoodItems(goal: AgentGoal): GoalItem[] {
  const items: GoalItem[] = [];
  if (goal.entities.length) {
    items.push({ label: goal.entities.length > 1 ? 'Companies' : 'Company', value: goal.entities.map((e) => `Company ${e}`).join(', ') });
  }
  if (goal.taskType !== 'unsupported' && goal.taskType !== 'explain_metric') {
    items.push({ label: 'Period', value: formatPeriod(goal.period) });
  }
  if (goal.comparisonPeriod) items.push({ label: 'Compared with', value: formatPeriod(goal.comparisonPeriod) });
  if (goal.metrics.length) items.push({ label: 'Metrics', value: goal.metrics.map(formatMetric).join(', ') });
  if (goal.dimensions.length) items.push({ label: 'Broken down by', value: goal.dimensions.map((d) => d.split('_').join(' ')).join(', ') });
  for (const c of goal.constraints) items.push({ label: 'Constraint', value: c.description });
  return items;
}

export function assumptionList(goal: AgentGoal): string[] {
  return [...goal.assumptions];
}

export interface MissingItem {
  parameter: string;
  question: string;
  options: string[];
}

export function missingList(goal: AgentGoal): MissingItem[] {
  return goal.missingInformation.map((m) => ({ parameter: m.parameter, question: m.question, options: m.options ?? [] }));
}

export function goalTone(goal: AgentGoal): GoalTone {
  if (goal.taskType === 'unsupported') return 'unsupported';
  return goal.missingInformation.length > 0 ? 'needs-answer' : 'ok';
}

export function goalToneLabel(tone: GoalTone): string {
  return tone === 'unsupported' ? 'Outside what I can do' : tone === 'needs-answer' ? 'I need an answer' : 'Ready';
}

export function normalizeMode(v: unknown): AiMode {
  return v === 'mock' || v === 'replay' || v === 'live' ? v : 'unknown';
}

export function modeLabel(mode: AiMode | undefined): string {
  switch (mode) {
    case 'mock': return 'Test double \u2014 not a real model';
    case 'replay': return 'Replay of recorded answers';
    case 'live': return 'Live model';
    default: return 'AI mode unknown';
  }
}

export function modeTone(mode: AiMode | undefined): ModeTone {
  switch (mode) {
    case 'mock': return 'warning';
    case 'replay': return 'info';
    case 'live': return 'positive';
    default: return 'neutral';
  }
}

/** Short top-bar text, e.g. "AI: anthropic / model-x (live)" or "AI: unknown". */
export function aiBadgeText(ai: { provider: string; mode: AiMode; model: string | null } | undefined): string {
  if (!ai || ai.mode === 'unknown') return 'AI: unknown';
  return `AI: ${ai.provider}${ai.model ? ` / ${ai.model}` : ''} (${ai.mode})`;
}
