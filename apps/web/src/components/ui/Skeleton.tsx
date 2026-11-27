import React from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = 16, style }) => (
  <div className="skeleton" style={{ width, height, ...style }} aria-hidden="true" />
);

export const DashboardSkeleton: React.FC = () => (
  <div className="dashboard-section" aria-label="Loading financial dashboard">
    <div className="kpi-band-asymmetric">
      <div className="kpi-hero" style={{ gap: 14 }}>
        <Skeleton width="45%" height={12} />
        <Skeleton width="70%" height={34} />
        <Skeleton width="60%" height={12} />
      </div>
      <div className="kpi-hero" style={{ gap: 14 }}>
        <Skeleton width="45%" height={12} />
        <Skeleton width="65%" height={34} />
        <Skeleton width="55%" height={12} />
      </div>
      <div className="kpi-compact-stack">
        <div className="kpi-compact">
          <Skeleton width="45%" height={14} />
          <Skeleton width="30%" height={20} />
        </div>
        <div className="kpi-compact">
          <Skeleton width="45%" height={14} />
          <Skeleton width="30%" height={20} />
        </div>
      </div>
    </div>
    <div className="layout-grid-7-5">
      <div className="chart-panel" style={{ gap: 16 }}>
        <Skeleton width="40%" height={16} />
        <Skeleton width="100%" height={230} />
      </div>
      <div className="chart-panel" style={{ gap: 16 }}>
        <Skeleton width="45%" height={16} />
        <Skeleton width="100%" height={230} />
      </div>
    </div>
  </div>
);

