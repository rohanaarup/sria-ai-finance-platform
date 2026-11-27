/**
 * Pure presentation helpers for data provenance (G2-02): source, freshness and quality.
 * Type-only imports so this module runs under plain `node --test`.
 */
import type { MetricResult, ProvenanceMetadata, ProvenanceV2, QualityFlag } from '@sria/contracts';

export type ProvenanceTone = 'neutral' | 'positive' | 'warning' | 'info';
export type MetricDataState = 'AVAILABLE' | 'ZERO_VALUE' | 'MISSING_DATA';

export const NO_DATA_TEXT = 'No data';

/**
 * Flags relevant to a widget: global flags (no metricId) plus flags scoped to one of the
 * widget's metrics. Without metricIds (dashboard header) every flag applies.
 */
export function flagsForMetrics(flags: QualityFlag[] | undefined, metricIds?: readonly string[]): QualityFlag[] {
  const list = flags ?? [];
  if (!metricIds) return list;
  return list.filter((f) => !f.metricId || metricIds.includes(f.metricId));
}

export interface SeveritySummary {
  warnings: number;
  infos: number;
  tone: ProvenanceTone;
  /** Short text, e.g. "2 warnings", "1 note", "No issues". */
  label: string;
}

/** Warnings drive the tone; info-only flags stay neutral. */
export function summarizeSeverity(flags: QualityFlag[]): SeveritySummary {
  const warnings = flags.filter((f) => f.severity === 'warning').length;
  const infos = flags.length - warnings;
  if (warnings > 0) {
    return { warnings, infos, tone: 'warning', label: `${warnings} warning${warnings === 1 ? '' : 's'}` };
  }
  if (infos > 0) {
    return { warnings, infos, tone: 'neutral', label: `${infos} note${infos === 1 ? '' : 's'}` };
  }
  return { warnings, infos, tone: 'positive', label: 'No issues' };
}

/** Local wall-clock HH:MM for an ISO timestamp ("—" when unparseable). */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "retrieved 12:03 · fresh" / "retrieved 12:03 · stale". */
export function freshnessText(v2: Pick<ProvenanceV2, 'retrievedAt' | 'freshness'>): string {
  return `retrieved ${formatClock(v2.retrievedAt)} · ${v2.freshness.stale ? 'stale' : 'fresh'}`;
}

/** "age 42s / ttl 300s"; a ttl of 0 means the result is not cached. */
export function freshnessDetail(v2: Pick<ProvenanceV2, 'freshness'>): string {
  const { ageSeconds, ttlSeconds, stale } = v2.freshness;
  const ttl = ttlSeconds > 0 ? `ttl ${ttlSeconds}s` : 'not cached';
  return `${stale ? 'Stale' : 'Fresh'} · age ${ageSeconds}s / ${ttl}`;
}

/** First 8 and last 4 hex chars of a query hash, e.g. "3f9a0c1b…77e2". */
export function shortHash(hash: string, head = 8, tail = 4): string {
  if (!hash) return '—';
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

/** "Synthetic" for mock/synthetic data, otherwise "Live SAP". */
export function sourceLabel(p: Pick<ProvenanceMetadata, 'sourceType' | 'isSynthetic' | 'v2'> | undefined): string {
  if (!p) return 'Unknown source';
  const synthetic = p.v2 ? p.v2.isSynthetic || p.v2.sourceType === 'mock' : p.isSynthetic || p.sourceType === 'mock';
  return synthetic ? 'Synthetic' : 'Live SAP';
}

/** Human-readable scope of a flag: "Company 1000 · P03 · total_revenue" or "All results". */
export function flagScope(flag: QualityFlag): string {
  const parts: string[] = [];
  if (flag.companyCode) parts.push(`Company ${flag.companyCode}`);
  if (flag.fiscalPeriod) parts.push(`P${flag.fiscalPeriod}`);
  if (flag.metricId) parts.push(flag.metricId);
  return parts.length > 0 ? parts.join(' · ') : 'All results';
}

/** metricId → version entries, restricted to the given metrics when provided. */
export function metricVersionEntries(
  v2: Pick<ProvenanceV2, 'metricVersions'>,
  metricIds?: readonly string[]
): Array<[string, string]> {
  return Object.entries(v2.metricVersions).filter(([id]) => !metricIds || metricIds.includes(id));
}

/**
 * Data state of a metric, derived from its provenance v2 quality flags (the API client
 * records per-metric `dataState` from the backend as a metric-scoped flag).
 */
export function metricDataState(result: Pick<MetricResult, 'metricId' | 'provenance'>): MetricDataState {
  const flags = result.provenance?.v2?.qualityFlags ?? [];
  const mine = flags.filter((f) => f.metricId === result.metricId);
  if (mine.some((f) => f.code === 'MISSING_DATA')) return 'MISSING_DATA';
  if (mine.some((f) => f.code === 'ZERO_VALUE')) return 'ZERO_VALUE';
  return 'AVAILABLE';
}

/** Version used for a metric, e.g. "total_revenue@v1", if known. */
export function metricVersionOf(result: Pick<MetricResult, 'metricId' | 'provenance'>): string | undefined {
  return result.provenance?.v2?.metricVersions[result.metricId];
}

/**
 * Display value for a metric: "No data" when the source had no records (never a fake 0),
 * `zeroDenominatorText` for a zero-denominator ratio, otherwise the formatted value.
 */
export function displayMetricValue(
  result: Pick<MetricResult, 'metricId' | 'provenance' | 'formattedValue' | 'isZeroDenominator'>,
  zeroDenominatorText = 'N/A'
): string {
  if (metricDataState(result) === 'MISSING_DATA') return NO_DATA_TEXT;
  if (result.isZeroDenominator) return zeroDenominatorText;
  return result.formattedValue;
}
