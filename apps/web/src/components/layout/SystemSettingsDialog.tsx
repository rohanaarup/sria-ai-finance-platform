import React from 'react';
import { CheckCircle2, Database, Server, Shield } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import type { ApprovedMetricSummary, SystemHealthStatus } from '../../services/api-client';

interface SystemSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  systemStatus: SystemHealthStatus | null;
  metrics: ApprovedMetricSummary[];
}

export const SystemSettingsDialog: React.FC<SystemSettingsDialogProps> = ({
  open,
  onClose,
  systemStatus,
  metrics,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Metric Catalog & Platform Governance"
      subtitle="Live configuration read from SAP CAP MetricCatalogService & HealthService"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Runtime Connectivity Summary */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 10,
          }}
        >
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              <Server size={12} />
              <span>CAP Service</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {systemStatus?.backendReachable ? 'Online (localhost:4004)' : 'Offline Fallback'}
            </div>
          </div>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              <Database size={12} />
              <span>Finance Provider</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {systemStatus?.providerMode === 's4hana' ? 'SAP S/4HANA OData' : 'Mock Synthetic Provider'}
            </div>
          </div>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
              <Shield size={12} />
              <span>Calculation Mode</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Deterministic TS Engine</div>
          </div>
        </div>

        {/* Approved Metric Registry Table */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-primary)' }}>
              Registered Finance Metrics ({metrics.length})
            </span>
            <Badge tone="neutral">Allowlisted MVP Catalog</Badge>
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Category</th>
                  <th>Formula</th>
                  <th>Dimensions</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.metricId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.label}</div>
                      <div className="font-mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {m.metricId}
                      </div>
                    </td>
                    <td>
                      <Badge tone="neutral">{m.category}</Badge>
                    </td>
                    <td className="font-mono" style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 240 }}>
                      {m.formulaOrAggregation}
                    </td>
                    <td style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                      {m.supportedDimensions}
                    </td>
                    <td>
                      <Badge tone={m.enabled ? 'positive' : 'warning'}>
                        <CheckCircle2 size={11} />
                        {m.approvalStatus}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Dialog>
  );
};

