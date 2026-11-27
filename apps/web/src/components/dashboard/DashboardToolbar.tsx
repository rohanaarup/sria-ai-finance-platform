import React from 'react';
import {
  RefreshCw,
  Save,
  MoreHorizontal,
  Pencil,
  Copy,
  Share2,
  Download,
  SlidersHorizontal,
  GitCompareArrows,
  Eye,
  EyeOff,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Popover } from '../ui/Popover';

export interface VisibleSections {
  summary: boolean;
  charts: boolean;
  insights: boolean;
  table: boolean;
}

interface DashboardToolbarProps {
  companyCode: string;
  fiscalYear: number;
  fiscalPeriod: string;
  comparisonMode: boolean;
  isLoading: boolean;
  isStale: boolean;
  hasUnsavedChanges: boolean;
  canShare: boolean;
  visibleSections: VisibleSections;
  onNewQuery: () => void;
  onChangeCompany: (companyCode: string) => void;
  onChangeYear: (year: number) => void;
  onChangePeriod: (period: string) => void;
  onToggleComparison: () => void;
  onToggleSection: (key: keyof VisibleSections) => void;
  onRefresh: () => void;
  onSave: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
}

export const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
  companyCode,
  fiscalYear,
  fiscalPeriod,
  comparisonMode,
  isLoading,
  isStale,
  hasUnsavedChanges,
  canShare,
  visibleSections,
  onNewQuery,
  onChangeCompany,
  onChangeYear,
  onChangePeriod,
  onToggleComparison,
  onToggleSection,
  onRefresh,
  onSave,
  onRename,
  onDuplicate,
  onShare,
  onExportCsv,
  onExportJson,
}) => {
  const sectionLabels: { key: keyof VisibleSections; label: string }[] = [
    { key: 'summary', label: 'Executive Summary' },
    { key: 'charts', label: 'Visualizations' },
    { key: 'insights', label: 'Analytical Insights' },
    { key: 'table', label: 'Financial Ledger' },
  ];

  return (
    <div className="dash-toolbar" role="region" aria-label="Dashboard controls">
      <div className="dash-toolbar__filters">
        <Button
          variant="subtle"
          size="xs"
          onClick={onNewQuery}
          icon={<ArrowLeft size={12} />}
        >
          New Query
        </Button>

        <div style={{ width: 1, height: 18, background: 'var(--border)' }} aria-hidden="true" />

        <select
          aria-label="Filter company code"
          className="scope-select"
          value={companyCode}
          disabled={isLoading || comparisonMode}
          onChange={(e) => onChangeCompany(e.target.value)}
        >
          <option value="1000">Co. 1000 (HQ)</option>
          <option value="2000">Co. 2000 (Subsidiary)</option>
        </select>

        <select
          aria-label="Filter fiscal year"
          className="scope-select"
          value={String(fiscalYear)}
          disabled={isLoading}
          onChange={(e) => onChangeYear(Number(e.target.value))}
        >
          <option value="2026">FY 2026</option>
          <option value="2025">FY 2025</option>
        </select>

        <select
          aria-label="Filter fiscal period"
          className="scope-select"
          value={fiscalPeriod}
          disabled={isLoading}
          onChange={(e) => onChangePeriod(e.target.value)}
        >
          <option value="all">Full Year</option>
          <option value="01">Period 01</option>
          <option value="02">Period 02</option>
        </select>

        <Button
          variant={comparisonMode ? 'primary' : 'secondary'}
          size="xs"
          onClick={onToggleComparison}
          disabled={isLoading}
          icon={<GitCompareArrows size={12} />}
        >
          {comparisonMode ? 'Comparing 1000 vs 2000' : 'Compare'}
        </Button>

        <Popover
          trigger={({ toggle }) => (
            <Button
              variant="ghost"
              size="xs"
              onClick={toggle}
              icon={<SlidersHorizontal size={12} />}
            >
              Sections
            </Button>
          )}
        >
          {() => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)' }}>
                Visible Sections
              </div>
              {sectionLabels.map((sec) => {
                const shown = visibleSections[sec.key];
                return (
                  <button
                    key={sec.key}
                    type="button"
                    className="dropdown-item"
                    onClick={() => onToggleSection(sec.key)}
                  >
                    {shown ? (
                      <Eye size={13} style={{ color: 'var(--positive)' }} />
                    ) : (
                      <EyeOff size={13} style={{ color: 'var(--text-tertiary)' }} />
                    )}
                    <span style={{ flex: 1 }}>{sec.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Popover>
      </div>

      <div className="dash-toolbar__actions">
        {hasUnsavedChanges && (
          <Badge tone="warning" dot>
            Unsaved
          </Badge>
        )}

        <Button
          variant={isStale ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onRefresh}
          loading={isLoading}
          icon={<RefreshCw size={13} />}
          style={
            isStale
              ? {
                  background: 'var(--warning-subtle)',
                  borderColor: 'var(--warning-border)',
                  color: 'var(--warning)',
                }
              : undefined
          }
        >
          {isStale ? 'Refresh Stale' : 'Refresh'}
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={isLoading}
          icon={<Save size={13} />}
        >
          Save
        </Button>

        <Popover
          trigger={({ toggle }) => (
            <Button
              variant="secondary"
              size="sm"
              onClick={toggle}
              aria-label="More dashboard actions"
              style={{ padding: '0 9px' }}
            >
              <MoreHorizontal size={14} />
            </Button>
          )}
        >
          {(close) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  close();
                  onRename();
                }}
              >
                <Pencil size={13} />
                <span>Rename Dashboard</span>
              </button>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  close();
                  onDuplicate();
                }}
              >
                <Copy size={13} />
                <span>Duplicate Copy</span>
              </button>
              <button
                type="button"
                className="dropdown-item"
                disabled={!canShare}
                style={!canShare ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                onClick={() => {
                  close();
                  if (canShare) onShare();
                }}
              >
                <Share2 size={13} />
                <span>Share Access{!canShare ? ' (Save first)' : ''}</span>
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  close();
                  onExportCsv();
                }}
              >
                <Download size={13} />
                <span>Export Figures (CSV)</span>
              </button>
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  close();
                  onExportJson();
                }}
              >
                <Download size={13} />
                <span>Export DashboardSpec (JSON)</span>
              </button>
            </div>
          )}
        </Popover>
      </div>
    </div>
  );
};
