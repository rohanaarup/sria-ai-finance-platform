import { WorkspacePage } from './pages/WorkspacePage';

export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Enterprise Navigation Header */}
      <header
        style={{
          background: 'var(--ink)',
          color: 'var(--cream)',
          padding: '16px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              border: '1px solid var(--copper)',
              borderRadius: '8px',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              fontSize: '18px',
              color: 'var(--copper)',
              fontFamily: 'Georgia, serif'
            }}
          >
            S
          </div>
          <div>
            <div style={{ fontWeight: 700, letterSpacing: '0.04em', fontSize: '15px' }}>
              SRIA INFO TECH <span style={{ color: 'var(--copper)' }}>/</span> AI FINANCE GENERATOR
            </div>
            <div style={{ fontSize: '11px', color: '#c4b09e' }}>
              SAP S/4HANA On-Demand · Deterministic Math Engine
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px' }}>
          <span
            style={{
              border: '1px solid rgba(212,161,132,0.4)',
              padding: '4px 12px',
              borderRadius: '99px',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--copper)',
              fontWeight: 600
            }}
          >
            WORKSPACE: ACME COMMERCIAL PILOT
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#d9c7b4'
            }}
          >
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
            <span>Connected (localhost:4004)</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main style={{ flex: 1 }}>
        <WorkspacePage />
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--line)',
          padding: '20px 32px',
          fontSize: '12px',
          color: 'var(--muted)',
          textAlign: 'center',
          background: 'var(--cream)',
          marginTop: '40px'
        }}
      >
        Sria Info Tech AI Finance Dashboard Generator · Protected by SAP CAP & Deterministic Calculation Engine
      </footer>
    </div>
  );
}
