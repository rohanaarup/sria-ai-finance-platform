import React from 'react';
import { FlaskConical } from 'lucide-react';

/**
 * Persistent, non-dismissible banner rendered on every page while demo mode is active.
 * Demo mode = synthetic data computed in the browser, not connected to the backend.
 */
export const DemoModeBanner: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    data-testid="demo-mode-banner"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '7px 16px',
      fontSize: 12.5,
      fontWeight: 600,
      background: 'var(--warning-subtle)',
      color: 'var(--warning)',
      borderBottom: '1px solid var(--warning-border)',
      textAlign: 'center',
    }}
  >
    <FlaskConical size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
    <span>Demo mode — synthetic data, computed in your browser. Not connected to the backend.</span>
  </div>
);
