import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Database, Info } from 'lucide-react';
import type { ProvenanceMetadata } from '@sria/contracts';
import { Badge } from '../ui/Badge';
import { Popover } from '../ui/Popover';
import { Tooltip } from '../ui/Tooltip';
import {
  flagScope,
  flagsForMetrics,
  formatClock,
  freshnessDetail,
  freshnessText,
  metricVersionEntries,
  shortHash,
  sourceLabel,
  summarizeSeverity,
} from './provenance-format';

interface ProvenanceBadgeProps {
  provenance: ProvenanceMetadata | undefined;
  /** Metrics shown by the widget; quality flags are filtered to these (plus global flags). Omit for all. */
  metricIds?: readonly string[];
  /** compact = small per-widget chip; full = dashboard header. */
  variant?: 'compact' | 'full';
  /** Popover alignment relative to the trigger. */
  align?: 'left' | 'right';
  /** Saved snapshot opened without refresh. */
  staleSnapshot?: boolean;
  /** Optional context label for the accessible name, e.g. the widget title. */
  contextLabel?: string;
  /** Short visible prefix, e.g. "Co. 1000" when a widget shows several results. */
  prefix?: string;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <dt className="prov-dl__term">{label}</dt>
    <dd className="prov-dl__desc">{children}</dd>
  </>
);

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  provenance,
  metricIds,
  variant = 'compact',
  align = 'right',
  staleSnapshot = false,
  contextLabel,
  prefix,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  if (!provenance) return null;

  const v2 = provenance.v2;
  const source = sourceLabel(provenance);
  const synthetic = source === 'Synthetic';
  const flags = v2 ? flagsForMetrics(v2.qualityFlags, metricIds) : [];
  const summary = summarizeSeverity(flags);
  const stale = staleSnapshot || Boolean(v2?.freshness.stale);
  const freshness = v2 ? freshnessText(v2) : `retrieved ${formatClock(provenance.retrievedAt)}`;
  const compact = variant === 'compact';

  const ariaLabel = [
    `Data provenance${contextLabel ? ` for ${contextLabel}` : ''}:`,
    source,
    freshness,
    staleSnapshot ? 'saved snapshot' : null,
    v2 ? `quality ${summary.label}` : 'provenance v1',
  ]
    .filter(Boolean)
    .join(', ');

  const copyHash = async () => {
    if (!v2) return;
    try {
      await navigator.clipboard.writeText(v2.queryHash);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const qualityIcon =
    summary.tone === 'warning' ? <AlertTriangle size={11} /> : summary.tone === 'positive' ? <CheckCircle2 size={11} /> : <Info size={11} />;

  return (
    <Popover
      wide
      align={align}
      trigger={({ open, toggle }) => (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            setCopyState('idle');
            toggle();
          }}
          className={`prov-badge prov-badge--${compact ? 'compact' : 'full'}${summary.warnings > 0 ? ' prov-badge--warn' : ''}`}
          aria-label={ariaLabel}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <Database
            size={compact ? 11 : 13}
            style={{ color: stale || synthetic ? 'var(--warning)' : 'var(--positive)' }}
            aria-hidden
          />
          {prefix && <span className="prov-badge__sep">{prefix}</span>}
          <span>{source}</span>
          {!compact && (
            <>
              <span className="prov-badge__sep" aria-hidden>·</span>
              <span>{staleSnapshot ? `${freshness} · snapshot` : freshness}</span>
            </>
          )}
          {compact && stale && <span className="prov-badge__stale">stale</span>}
          {v2 ? (
            summary.warnings > 0 || !compact ? (
              <span className={`prov-badge__quality prov-badge__quality--${summary.tone}`}>
                {qualityIcon}
                <span>{compact ? summary.warnings : summary.label}</span>
              </span>
            ) : null
          ) : (
            !compact && <span className="prov-badge__v1">provenance v1</span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div
          role="dialog"
          aria-label={`Data provenance${contextLabel ? ` for ${contextLabel}` : ''}`}
          className="prov-panel"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
              buttonRef.current?.focus();
            }
          }}
        >
          <div className="prov-panel__head">
            <span className="prov-panel__title">Data provenance{contextLabel ? ` · ${contextLabel}` : ''}</span>
            <Badge tone={synthetic ? 'warning' : 'positive'}>{synthetic ? 'Synthetic' : 'Live SAP'}</Badge>
          </div>

          {!v2 ? (
            <>
              <dl className="prov-dl">
                <Row label="Source">
                  <span className="font-mono">{provenance.sourceSystem}</span>
                </Row>
                <Row label="Retrieved">{new Date(provenance.retrievedAt).toLocaleString()}</Row>
              </dl>
              <p className="prov-panel__note">
                provenance v1 — freshness, query hash and quality flags are not available for this result.
              </p>
            </>
          ) : (
            <>
              <dl className="prov-dl">
                <Row label="Source system">
                  <span className="font-mono">{v2.sourceSystem}</span>
                </Row>
                <Row label="API">
                  <span className="font-mono">
                    {v2.apiName} v{v2.apiVersion}
                  </span>
                </Row>
                <Row label="Retrieved">{new Date(v2.retrievedAt).toLocaleString()}</Row>
                <Row label="Freshness">
                  <span style={{ color: v2.freshness.stale ? 'var(--warning)' : undefined }}>{freshnessDetail(v2)}</span>
                  {v2.reusedFromRunCache && <span className="prov-panel__muted"> · reused from run cache</span>}
                </Row>
                <Row label="Records">{v2.recordCount.toLocaleString()}</Row>
                <Row label="Environment">{v2.environmentTier}</Row>
                <Row label="Query hash">
                  <span className="prov-hash">
                    <Tooltip content={<span className="font-mono">{v2.queryHash}</span>}>
                      <span className="font-mono" tabIndex={0}>
                        {shortHash(v2.queryHash)}
                      </span>
                    </Tooltip>
                    <button
                      type="button"
                      className="btn btn--ghost btn--xs"
                      onClick={copyHash}
                      aria-label="Copy full query hash"
                    >
                      <Copy size={11} aria-hidden />
                      <span>{copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}</span>
                    </button>
                  </span>
                </Row>
                {staleSnapshot && <Row label="Snapshot">Saved dashboard — refresh to re-query</Row>}
              </dl>

              <div>
                <div className="prov-panel__section">Metric versions</div>
                {metricVersionEntries(v2, metricIds).length === 0 ? (
                  <div className="prov-panel__muted">None recorded</div>
                ) : (
                  <ul className="prov-list">
                    {metricVersionEntries(v2, metricIds).map(([id, version]) => (
                      <li key={id} className="font-mono">
                        {version}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="prov-panel__section">
                  Quality flags <span className="prov-panel__muted">({summary.label})</span>
                </div>
                {flags.length === 0 ? (
                  <div className="prov-panel__muted">No quality flags for this result.</div>
                ) : (
                  <ul className="prov-list prov-list--flags">
                    {flags.map((f, i) => (
                      <li key={`${f.code}-${f.metricId ?? ''}-${f.companyCode ?? ''}-${f.fiscalPeriod ?? ''}-${i}`}>
                        <div className="prov-flag__head">
                          <Badge tone={f.severity === 'warning' ? 'warning' : 'neutral'}>
                            {f.severity === 'warning' ? <AlertTriangle size={10} aria-hidden /> : <Info size={10} aria-hidden />}
                            <span>{f.severity}</span>
                          </Badge>
                          <span className="font-mono prov-flag__code">{f.code}</span>
                        </div>
                        <div className="prov-flag__msg">{f.message}</div>
                        <div className="prov-panel__muted">Scope: {flagScope(f)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  );
};
