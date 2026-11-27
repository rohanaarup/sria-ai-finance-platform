import React, { useState, useMemo } from 'react';
import {
  Search,
  FolderOpen,
  Pencil,
  Trash2,
  Share2,
  Copy,
  Clock,
  AlertTriangle,
  LayoutGrid,
  Plus,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Tabs } from '../components/ui/Tabs';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';

export interface SavedDashboardSummary {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  version: string;
  isStale: boolean;
}

interface MyDashboardsPageProps {
  dashboards: SavedDashboardSummary[];
  recentDashboards: { id: string; title: string; timestamp: string }[];
  onOpenSaved: (id: string) => void;
  onOpenRecent: (id: string) => void;
  onRename: (id: string, newTitle: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onShare: (id: string, userId: string, permission: 'READ' | 'EDIT') => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCreateNew: () => void;
}

export const MyDashboardsPage: React.FC<MyDashboardsPageProps> = ({
  dashboards,
  recentDashboards,
  onOpenSaved,
  onOpenRecent,
  onRename,
  onDuplicate,
  onShare,
  onDelete,
  onCreateNew,
}) => {
  const [tab, setTab] = useState<'saved' | 'recent'>('saved');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'title'>('newest');

  // Dialog states (replacing window.prompt / window.confirm)
  const [renameTarget, setRenameTarget] = useState<SavedDashboardSummary | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SavedDashboardSummary | null>(null);
  const [shareTarget, setShareTarget] = useState<SavedDashboardSummary | null>(null);
  const [shareUserId, setShareUserId] = useState('finance_manager');
  const [sharePerm, setSharePerm] = useState<'READ' | 'EDIT'>('READ');
  const [busy, setBusy] = useState(false);

  const filteredSaved = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = dashboards.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
    );
    if (sortBy === 'title') {
      return [...list].sort((a, b) => a.title.localeCompare(b.title));
    }
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [dashboards, search, sortBy]);

  const handleRenameConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameInput.trim()) return;
    setBusy(true);
    try {
      await onRename(renameTarget.id, renameInput.trim());
      setRenameTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const handleShareConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareTarget || !shareUserId.trim()) return;
    setBusy(true);
    try {
      await onShare(shareTarget.id, shareUserId.trim(), sharePerm);
      setShareTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workspace-container animate-fade-in">
      {/* Page Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 22,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em' }}>
            Dashboards Library
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Manage saved DashboardSpec configurations. Reopened dashboards preserve structure and mark figures stale until refreshed from SAP.
          </p>
        </div>

        <Button variant="primary" size="md" onClick={onCreateNew} icon={<Plus size={14} />}>
          New Dashboard
        </Button>
      </div>

      {/* Controls Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { id: 'saved', label: 'Saved Dashboards', count: dashboards.length, icon: <LayoutGrid size={12} /> },
            { id: 'recent', label: 'Session Recent', count: recentDashboards.length, icon: <Clock size={12} /> },
          ]}
        />

        {tab === 'saved' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                }}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search saved dashboards..."
                aria-label="Search saved dashboards"
                style={{
                  height: 32,
                  padding: '0 12px 0 30px',
                  borderRadius: 7,
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface)',
                  fontSize: 12.5,
                  color: 'var(--text-primary)',
                  width: 230,
                }}
              />
            </div>

            <select
              aria-label="Sort dashboards"
              className="scope-select"
              style={{ height: 32 }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'title')}
            >
              <option value="newest">Sort: Most Recent</option>
              <option value="title">Sort: Title (A–Z)</option>
            </select>
          </div>
        )}
      </div>

      {/* Content */}
      {tab === 'saved' ? (
        filteredSaved.length === 0 ? (
          <EmptyState
            icon={<LayoutGrid size={20} />}
            title={search ? 'No saved dashboards match your search' : 'No saved dashboards yet'}
            description={
              search
                ? 'Try clearing or broadening your search term.'
                : 'Generate a financial dashboard in the workspace and click Save to persist its specification.'
            }
            action={
              <Button variant="primary" onClick={onCreateNew} icon={<Plus size={14} />}>
                Create First Dashboard
              </Button>
            }
          />
        ) : (
          <div className="dashboards-grid">
            {filteredSaved.map((d) => (
              <div key={d.id} className="saved-dash-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: 14.5,
                        fontWeight: 650,
                        color: 'var(--text-primary)',
                        lineHeight: 1.3,
                      }}
                    >
                      {d.title}
                    </h3>
                    {d.description && (
                      <p
                        style={{
                          margin: '4px 0 0 0',
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          lineHeight: 1.45,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {d.description}
                      </p>
                    )}
                  </div>

                  {d.isStale && (
                    <Badge tone="warning">
                      <AlertTriangle size={10} />
                      <span>Stale</span>
                    </Badge>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                  }}
                >
                  <span className="font-mono">v{d.version}</span>
                  <span>·</span>
                  <span>Saved {new Date(d.createdAt).toLocaleDateString()}</span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    paddingTop: 10,
                    borderTop: '1px solid var(--border)',
                    marginTop: 'auto',
                  }}
                >
                  <Button
                    variant="primary"
                    size="xs"
                    onClick={() => onOpenSaved(d.id)}
                    icon={<FolderOpen size={12} />}
                  >
                    Open
                  </Button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Button
                      variant="ghost"
                      size="xs"
                      title="Rename"
                      onClick={() => {
                        setRenameTarget(d);
                        setRenameInput(d.title);
                      }}
                      icon={<Pencil size={12} />}
                    />
                    <Button
                      variant="ghost"
                      size="xs"
                      title="Duplicate"
                      onClick={() => onDuplicate(d.id)}
                      icon={<Copy size={12} />}
                    />
                    <Button
                      variant="ghost"
                      size="xs"
                      title="Share"
                      onClick={() => setShareTarget(d)}
                      icon={<Share2 size={12} />}
                    />
                    <Button
                      variant="ghost"
                      size="xs"
                      title="Delete"
                      style={{ color: 'var(--negative)' }}
                      onClick={() => setDeleteTarget(d)}
                      icon={<Trash2 size={12} />}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : recentDashboards.length === 0 ? (
        <EmptyState
          icon={<Clock size={20} />}
          title="No recent session dashboards"
          description="Generated or opened dashboards in this session appear here for quick switching."
        />
      ) : (
        <div className="dashboards-grid">
          {recentDashboards.map((r) => (
            <div key={r.id} className="saved-dash-card">
              <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-primary)' }}>
                {r.title}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                Generated {new Date(r.timestamp).toLocaleTimeString()}
              </div>
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => onOpenRecent(r.id)}
                  icon={<FolderOpen size={12} />}
                >
                  Open in Workspace
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rename Dialog */}
      <Dialog
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title="Rename Dashboard"
        subtitle="Updates the saved dashboard title in SAP CAP persistence."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!renameInput.trim()}
              onClick={handleRenameConfirm}
            >
              Save Title
            </Button>
          </>
        }
      >
        <form onSubmit={handleRenameConfirm}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Dashboard Title
          </label>
          <input
            type="text"
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              height: 36,
              padding: '0 12px',
              borderRadius: 7,
              border: '1px solid var(--border-strong)',
              fontSize: 13.5,
            }}
          />
        </form>
      </Dialog>

      {/* Share Dialog */}
      <Dialog
        open={shareTarget !== null}
        onClose={() => setShareTarget(null)}
        title="Share Dashboard Access"
        subtitle="Creates a tenant-scoped DashboardShares record via CAP LifecycleService."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShareTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!shareUserId.trim()}
              onClick={handleShareConfirm}
            >
              Grant Access
            </Button>
          </>
        }
      >
        <form onSubmit={handleShareConfirm} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Recipient User ID
            </label>
            <input
              type="text"
              value={shareUserId}
              onChange={(e) => setShareUserId(e.target.value)}
              placeholder="e.g. finance_manager"
              style={{
                width: '100%',
                height: 36,
                padding: '0 12px',
                borderRadius: 7,
                border: '1px solid var(--border-strong)',
                fontSize: 13.5,
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Permission
            </label>
            <select
              value={sharePerm}
              onChange={(e) => setSharePerm(e.target.value as 'READ' | 'EDIT')}
              className="scope-select"
              style={{ width: '100%', height: 36 }}
            >
              <option value="READ">READ — View only</option>
              <option value="EDIT">EDIT — View &amp; update</option>
            </select>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Archive Saved Dashboard"
        subtitle="This removes the dashboard from your active list in the database."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={handleDeleteConfirm}>
              Delete Dashboard
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget?.title}</strong>?
          Underlying SAP accounting records are never affected.
        </p>
      </Dialog>
    </div>
  );
};
