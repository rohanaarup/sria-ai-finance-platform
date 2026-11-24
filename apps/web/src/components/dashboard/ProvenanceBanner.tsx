import React from 'react';
import type { ProvenanceMetadata } from '@sria/contracts';

interface ProvenanceBannerProps {
  provenance: ProvenanceMetadata;
  freshnessNotice?: string;
}

export const ProvenanceBanner: React.FC<ProvenanceBannerProps> = ({
  provenance,
  freshnessNotice
}) => {
  const isSynthetic = provenance.isSynthetic || provenance.sourceType === 'mock';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderRadius: '10px',
        background: isSynthetic ? '#fff8f2' : '#f0f9f1',
        border: `1px solid ${isSynthetic ? '#e8d5c4' : '#c3e6cb'}`,
        marginBottom: '24px',
        fontSize: '13px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            padding: '4px 8px',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '11px',
            letterSpacing: '0.04em',
            background: isSynthetic ? '#a65340' : '#28a745',
            color: '#ffffff'
          }}
        >
          {isSynthetic ? 'MOCK / SYNTHETIC DATA' : 'LIVE SAP S/4HANA'}
        </span>
        <span style={{ color: 'var(--ink)', fontWeight: 500 }}>
          {freshnessNotice || `System: ${provenance.sourceSystem} · Calculation v${provenance.calculationVersion}`}
        </span>
      </div>

      <div style={{ color: 'var(--muted)', fontSize: '12px' }}>
        Retrieved: {new Date(provenance.retrievedAt).toLocaleTimeString()}
      </div>
    </div>
  );
};
