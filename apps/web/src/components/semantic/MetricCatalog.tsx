import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { BookMarked, ChevronDown, Lock, RefreshCw, Search, ServerOff, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { MetricCatalogEntry } from '@sria/contracts';
import { ApiAuthError, ApiClient } from '../../services/api-client';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import {
  describeActiveVersion,
  describeFormula,
  describeVersion,
  filterCatalog,
  formatStatus,
  hasPendingChange,
  mappingStatusTone,
  versionStatusTone,
} from './catalog-format';

interface MetricCatalogProps {
  open: boolean;
  onClose: () => void;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; entries: MetricCatalogEntry[] }
  | { kind: 'error'; auth: boolean; message: string };

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Metric catalog & glossary drawer (G2-01): definition, owner, version/approval state,
 * executability in the current environment, glossary aliases and source lineage.
 */
export const MetricCatalog: React.FC<MetricCatalogProps> = ({ open, onClose }) => {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [reloadKey, setReloadKey] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descId = useId();
  // Keep the latest onClose without re-running the focus effect on every parent render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Load whenever the drawer opens (or Retry is pressed).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    ApiClient.getMetricCatalog()
      .then((entries) => {
        if (!cancelled) setState({ kind: 'ready', entries });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          auth: err instanceof ApiAuthError,
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, reloadKey]);

  // Reset transient UI state when closed.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setExpanded(new Set());
    }
  }, [open]);

  // Focus management: focus search on open, trap Tab inside, Escape closes, restore focus on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    (searchRef.current ?? panelRef.current)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visible = useMemo(
    () => (state.kind === 'ready' ? filterCatalog(state.entries, query) : []),
    [state, query]
  );

  if (!open) return null;

  return (
    <div
      className="drawer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
      >
        <div className="dialog-header">
          <div>
            <h3 id={titleId} className="dialog-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookMarked size={16} style={{ color: 'var(--accent)' }} aria-hidden="true" />
              Metric catalog &amp; glossary
            </h3>
            <p id={descId} style={{ margin: '3px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
              Governed finance metric definitions, versions, approval status and source lineage
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close metric catalog"
            className="btn btn--ghost btn--xs"
            style={{ width: 28, height: 28, padding: 0 }}
          >
            <X size={15} />
          </button>
        </div>

        <div className="drawer-toolbar">
          <label htmlFor={`${titleId}-search`} className="sr-only-text">
            Search metrics by name or alias
          </label>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 11,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-tertiary)',
              }}
            />
            <input
              id={`${titleId}-search`}
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by metric name, id or alias..."
              className="catalog-search"
              autoComplete="off"
            />
          </div>
          {state.kind === 'ready' && (
            <div role="status" aria-live="polite" style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
              {visible.length} of {state.entries.length} metrics
            </div>
          )}
        </div>

        <div className="drawer-body">
          {state.kind === 'loading' && (
            <div aria-busy="true" aria-label="Loading metric catalog" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="catalog-card" style={{ padding: 14, gap: 8, display: 'flex', flexDirection: 'column' }}>
                  <Skeleton width="45%" height={14} />
                  <Skeleton width="80%" height={11} />
                  <Skeleton width="60%" height={11} />
                </div>
              ))}
            </div>
          )}

          {state.kind === 'error' && (
            <div role="alert">
              <EmptyState
                icon={state.auth ? <Lock size={18} /> : <ServerOff size={18} />}
                title={state.auth ? 'Not authorized to view the metric catalog' : 'Metric catalog unavailable'}
                description={
                  state.auth
                    ? `${state.message} Sign in with a role that can read the semantic layer.`
                    : `${state.message} The catalog is served by the CAP semantic service; no local data is shown outside demo mode.`
                }
                action={
                  state.auth ? undefined : (
                    <Button size="xs" icon={<RefreshCw size={12} />} onClick={() => setReloadKey((k) => k + 1)}>
                      Retry
                    </Button>
                  )
                }
              />
            </div>
          )}

          {state.kind === 'ready' && state.entries.length === 0 && (
            <EmptyState
              icon={<BookMarked size={18} />}
              title="No metrics defined"
              description="The semantic layer returned an empty catalog. Metric definitions must be proposed and approved before they appear here."
            />
          )}

          {state.kind === 'ready' && state.entries.length > 0 && visible.length === 0 && (
            <EmptyState
              icon={<Search size={18} />}
              title="No matching metrics"
              description={`No metric label, id or alias matches "${query.trim()}".`}
              action={
                <Button size="xs" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              }
            />
          )}

          {state.kind === 'ready' && visible.length > 0 && (
            <ul className="catalog-list" aria-label="Finance metrics">
              {visible.map((entry) => (
                <li key={entry.metricId}>
                  <MetricCard
                    entry={entry}
                    expanded={expanded.has(entry.metricId)}
                    onToggle={() => toggle(entry.metricId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ entry: MetricCatalogEntry; expanded: boolean; onToggle: () => void }> = ({
  entry,
  expanded,
  onToggle,
}) => {
  const detailId = useId();
  const latest = entry.latestVersion;
  const shown = entry.activeVersion ?? latest;

  return (
    <div className={clsx('catalog-card', expanded && 'catalog-card--open')}>
      <button
        type="button"
        className="catalog-card__head"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-primary)' }}>{entry.label}</div>
          <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {entry.metricId}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Badge tone={versionStatusTone(latest.status)} dot>
            {formatStatus(latest.status)}
          </Badge>
          <Badge tone={entry.executable ? 'positive' : 'negative'}>
            {entry.executable ? 'Executable here' : 'Not executable here'}
          </Badge>
          <ChevronDown
            size={15}
            aria-hidden="true"
            style={{
              color: 'var(--text-tertiary)',
              transform: expanded ? 'rotate(180deg)' : undefined,
              transition: 'transform 0.15s ease',
            }}
          />
        </div>
      </button>

      {expanded && (
        <div id={detailId} className="catalog-card__body">
          <dl className="catalog-facts">
            <dt>Owner</dt>
            <dd>{entry.owner}</dd>
            <dt>Category</dt>
            <dd>{entry.category}</dd>
            <dt>Governing version</dt>
            <dd style={entry.activeVersion ? undefined : { color: 'var(--warning)', fontWeight: 600 }}>
              {describeActiveVersion(entry)}
            </dd>
            {hasPendingChange(entry) && (
              <>
                <dt>Latest version</dt>
                <dd>
                  {describeVersion(latest)}
                  {latest.proposedBy ? ` — proposed by ${latest.proposedBy}` : ''}
                </dd>
              </>
            )}
            {entry.tenantId && (
              <>
                <dt>Tenant</dt>
                <dd className="font-mono">{entry.tenantId}</dd>
              </>
            )}
          </dl>

          <section aria-label="Definition">
            <div className="catalog-section-label">Definition</div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {entry.description}
            </p>
          </section>

          <section aria-label="Formula">
            <div className="catalog-section-label">
              {shown.kind === 'BASE' ? 'Aggregation' : 'Expression'}
              {!entry.activeVersion && ' (proposed, not approved)'}
            </div>
            <code className="catalog-formula">{describeFormula(shown)}</code>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Unit: {shown.unit.toLowerCase()} · {shown.decimals} decimals
              {shown.dependsOn.length > 0 && ` · depends on ${shown.dependsOn.join(', ')}`}
            </div>
          </section>

          <section aria-label="Glossary aliases">
            <div className="catalog-section-label">Glossary aliases</div>
            {entry.aliases.length > 0 ? (
              <ul className="catalog-chips">
                {entry.aliases.map((a) => (
                  <li key={a} className="catalog-chip">
                    {a}
                  </li>
                ))}
              </ul>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No aliases registered.</span>
            )}
          </section>

          <section aria-label="Lineage">
            <div className="catalog-section-label">Lineage</div>
            {entry.lineage.length > 0 ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
                <table className="finance-table catalog-lineage">
                  <caption className="sr-only-text">Source lineage for {entry.label}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Source system</th>
                      <th scope="col">Entity set</th>
                      <th scope="col">Field</th>
                      <th scope="col">Mapping</th>
                      <th scope="col">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lineage.map((l, i) => (
                      <tr key={`${l.entitySet}-${l.field}-${i}`}>
                        <td>{l.sourceSystem}</td>
                        <td className="font-mono">{l.entitySet}</td>
                        <td className="font-mono">{l.field}</td>
                        <td>
                          <Badge tone={mappingStatusTone(l.mappingStatus)}>{formatStatus(l.mappingStatus)}</Badge>
                        </td>
                        <td>{l.evidence ?? 'No evidence recorded'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No lineage recorded.</span>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
