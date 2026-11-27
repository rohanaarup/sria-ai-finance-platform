import React from 'react';

interface SriaLogoProps {
  collapsed?: boolean;
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md';
}

/**
 * Sria Info Tech / Sria Analytics Brand Lockup
 * Uses the supplied official Sria Analytics logo asset while preserving aspect ratio.
 */
export const SriaLogo: React.FC<SriaLogoProps> = ({
  collapsed = false,
  variant = 'dark',
  size = 'md',
}) => {
  const fullHeight = size === 'sm' ? 30 : 36;
  const markSize = size === 'sm' ? 26 : 30;

  if (collapsed) {
    return (
      <div className="sria-logo" aria-label="Sria Analytics — Sria Info Tech">
        <img
          src="/sria-analytics-mark.png"
          alt="Sria Analytics"
          width={markSize}
          height={markSize}
          style={{
            width: markSize,
            height: markSize,
            objectFit: 'contain',
            display: 'block',
            flexShrink: 0,
          }}
        />
      </div>
    );
  }

  if (variant === 'light') {
    return (
      <div className="sria-logo" aria-label="Sria Analytics — Sria Info Tech">
        <img
          src="/sria-analytics-mark.png"
          alt=""
          aria-hidden="true"
          width={markSize}
          height={markSize}
          style={{
            width: markSize,
            height: markSize,
            objectFit: 'contain',
            display: 'block',
            flexShrink: 0,
          }}
        />
        <div className="sria-logo__text">
          <span className="sria-logo__name" style={{ color: 'var(--text-primary)' }}>
            Sria Analytics
          </span>
          <span className="sria-logo__tag" style={{ color: 'var(--text-tertiary)' }}>
            Sria Info Tech
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="sria-logo"
      aria-label="Sria Analytics — Sria Info Tech"
      title="Sria Analytics — Sria Info Tech"
      style={{ padding: '2px 0' }}
    >
      <img
        src="/sria-analytics-logo.png"
        alt="Sria Analytics"
        style={{
          height: fullHeight,
          width: 'auto',
          maxWidth: '154px',
          objectFit: 'contain',
          display: 'block',
          flexShrink: 0,
        }}
      />
    </div>
  );
};
