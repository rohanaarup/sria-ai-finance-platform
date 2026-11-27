/**
 * Pure presentation helpers for the metric catalog & glossary (G2-01).
 * Type-only imports so this module runs under plain `node --test`.
 */
import type { LineageEdge, MetricCatalogEntry, MetricVersion, MetricVersionStatus } from '@sria/contracts';

export type CatalogTone = 'neutral' | 'brand' | 'positive' | 'negative' | 'warning' | 'info';

export const NO_APPROVED_VERSION_TEXT = 'No approved version — not executable in pilot/production';

export function versionStatusTone(status: MetricVersionStatus): CatalogTone {
  switch (status) {
    case 'APPROVED':
      return 'positive';
    case 'PENDING_REVIEW':
      return 'warning';
    case 'REJECTED':
      return 'negative';
    case 'DRAFT':
      return 'info';
    case 'RETIRED':
    default:
      return 'neutral';
  }
}

export function mappingStatusTone(status: LineageEdge['mappingStatus']): CatalogTone {
  if (status === 'MAPPED') return 'positive';
  if (status === 'BLOCKED') return 'negative';
  return 'warning';
}

/** "PENDING_REVIEW" -> "Pending review" */
export function formatStatus(status: string): string {
  const words = status.toLowerCase().split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function describeSignRule(rule: MetricVersion['signRule']): string {
  if (rule === 'CREDIT_POSITIVE') return 'credit-positive (credits add, debits subtract)';
  if (rule === 'DEBIT_POSITIVE') return 'debit-positive (debits add, credits subtract)';
  return 'no sign rule defined';
}

/** Human-readable definition of how a version is computed. */
export function describeFormula(v: MetricVersion): string {
  if (v.kind === 'BASE') {
    return `Signed sum of ${v.accountType ?? 'unspecified'} accounts, ${describeSignRule(v.signRule)}`;
  }
  return v.expression?.trim() || 'No expression defined';
}

/** ISO date/time -> YYYY-MM-DD (deterministic, locale-free). */
export function formatDate(value: string | null | undefined): string {
  if (!value) return 'unknown date';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m?.[1] ?? value;
}

export function describeVersion(v: MetricVersion): string {
  const parts = [`Version ${v.version} (${formatStatus(v.status)})`, `effective from ${formatDate(v.effectiveFrom)}`];
  if (v.approvedBy) parts.push(`approved by ${v.approvedBy}`);
  return parts.join(' — ');
}

/** The governing version line for a catalog entry. */
export function describeActiveVersion(entry: MetricCatalogEntry): string {
  return entry.activeVersion ? describeVersion(entry.activeVersion) : NO_APPROVED_VERSION_TEXT;
}

/** True when the latest version differs from the active one (e.g. a newer version under review). */
export function hasPendingChange(entry: MetricCatalogEntry): boolean {
  return !entry.activeVersion || entry.activeVersion.id !== entry.latestVersion.id;
}

/** Case-insensitive filter on label, metricId and glossary aliases. */
export function filterCatalog(entries: MetricCatalogEntry[], query: string): MetricCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.metricId.toLowerCase().includes(q) ||
      e.aliases.some((a) => a.toLowerCase().includes(q))
  );
}
