import React from 'react';

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
  onOpen: (id: string) => void;
  onRename: (id: string, currentTitle: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export const MyDashboardsPage: React.FC<MyDashboardsPageProps> = ({
  dashboards,
  onOpen,
  onRename,
  onDelete,
  onClose
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(43, 23, 20, 0.4)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
    >
      <div
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--line)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '750px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontFamily: 'Georgia, serif', fontSize: '20px' }}>
              Saved Application Dashboards
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
              Stored in SQLite Application Database (`apps/cap/sqlite.db`) · Configurations Only
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--muted)'
            }}
          >
            ✕
          </button>
        </div>

        {/* Dashboard List */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {dashboards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              No saved dashboards in database. Click "Save to Database" on any active dashboard!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {dashboards.map((d) => (
                <div
                  key={d.id}
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--cream)'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--ink)', marginBottom: '4px' }}>
                      {d.title}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      Version {d.version} · Saved: {new Date(d.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => onOpen(d.id)}
                      style={{
                        background: 'var(--rust)',
                        color: '#ffffff',
                        border: 'none',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Reopen
                    </button>
                    <button
                      type="button"
                      onClick={() => onRename(d.id, d.title)}
                      style={{
                        background: 'var(--paper)',
                        border: '1px solid var(--line)',
                        color: 'var(--ink)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(d.id)}
                      style={{
                        background: 'transparent',
                        border: '1px solid #f2cfc9',
                        color: 'var(--rust)',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

