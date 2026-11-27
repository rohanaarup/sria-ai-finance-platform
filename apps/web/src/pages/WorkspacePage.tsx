import React, { useState, useEffect } from 'react';
import { AlertCircle, X, ArrowRight, BarChart2 } from 'lucide-react';
import type { AgentGoal, DashboardSpec, ClarificationQuestion } from '@sria/contracts';
import { PromptComposer } from '../components/ai/PromptComposer';
import { TemplateGallery, type DashboardTemplate } from '../components/ai/TemplateGallery';
import { WorkflowProgressIndicator, type ProgressStep } from '../components/ai/WorkflowProgressIndicator';
import { ClarificationModal } from '../components/ai/ClarificationModal';
import { UnderstoodCard } from '../components/ai/UnderstoodCard';
import { DashboardToolbar, type VisibleSections } from '../components/dashboard/DashboardToolbar';
import { DashboardRenderer } from '../components/dashboard/DashboardRenderer';
import { FollowUpComposer } from '../components/dashboard/FollowUpComposer';
import { DashboardSkeleton } from '../components/ui/Skeleton';
import { Dialog } from '../components/ui/Dialog';
import { Button } from '../components/ui/Button';
import type {
  BusinessUnitSlice,
  CompanyComparisonPoint,
  PeriodSeriesPoint,
} from '../services/api-client';

interface WorkspacePageProps {
  mode: 'studio' | 'canvas';
  onSwitchMode: (mode: 'studio' | 'canvas') => void;
  currentSpec: DashboardSpec;
  periodSeries: PeriodSeriesPoint[];
  buSlices: BusinessUnitSlice[];
  comparisonData?: CompanyComparisonPoint[];
  comparisonMode: boolean;
  isLoading: boolean;
  currentStep: ProgressStep | null;
  clarifications: ClarificationQuestion[] | null;
  understood?: { goal: AgentGoal; aiMode?: 'mock' | 'replay' | 'live'; modelId?: string } | null;
  errorMessage: string | null;
  isStale: boolean;
  hasUnsavedChanges: boolean;
  activeDashboardDbId: string | null;
  visibleSections: VisibleSections;
  preferredChartMode?: 'bar' | 'line' | 'area' | 'donut';
  explanationNote?: string | null;
  renameDialogOpen: boolean;
  shareDialogOpen: boolean;
  onPromptSubmit: (prompt: string, options?: { compareEntities?: boolean }) => void;
  onSelectTemplate: (tpl: DashboardTemplate) => void;
  onClarificationOption: (paramName: string, selectedValue: string) => void;
  onCancelClarification: () => void;
  onDismissError: () => void;
  onApplyFilter: (next: {
    companyCode?: string;
    fiscalYear?: number;
    fiscalPeriod?: string;
    compare?: boolean;
  }) => void;
  onToggleSection: (key: keyof VisibleSections) => void;
  onRefresh: () => void;
  onSave: () => void;
  onOpenRename: () => void;
  onCloseRename: () => void;
  onConfirmRename: (newTitle: string) => Promise<void>;
  onDuplicate: () => void;
  onOpenShare: () => void;
  onCloseShare: () => void;
  onConfirmShare: (id: string, userId: string, permission: 'READ' | 'EDIT') => Promise<void>;
  onExportCsv: () => void;
  onExportJson: () => void;
  onFollowUp: (prompt: string) => void;
}

export const WorkspacePage: React.FC<WorkspacePageProps> = ({
  mode,
  onSwitchMode,
  currentSpec,
  periodSeries,
  buSlices,
  comparisonData,
  comparisonMode,
  isLoading,
  currentStep,
  clarifications,
  understood,
  errorMessage,
  isStale,
  hasUnsavedChanges,
  activeDashboardDbId,
  visibleSections,
  preferredChartMode,
  explanationNote,
  renameDialogOpen,
  shareDialogOpen,
  onPromptSubmit,
  onSelectTemplate,
  onClarificationOption,
  onCancelClarification,
  onDismissError,
  onApplyFilter,
  onToggleSection,
  onRefresh,
  onSave,
  onOpenRename,
  onCloseRename,
  onConfirmRename,
  onDuplicate,
  onOpenShare,
  onCloseShare,
  onConfirmShare,
  onExportCsv,
  onExportJson,
  onFollowUp,
}) => {
  const [titleInput, setTitleInput] = useState(currentSpec.title);
  const [shareUser, setShareUser] = useState('finance_manager');
  const [sharePerm, setSharePerm] = useState<'READ' | 'EDIT'>('READ');

  useEffect(() => {
    setTitleInput(currentSpec.title);
  }, [currentSpec.title, renameDialogOpen]);

  const filters = currentSpec.dataProvenance?.appliedFilters || {};
  const companyCode = String(filters['companyCode'] || '1000');
  const fiscalYear = Number(filters['fiscalYear'] || 2026);
  const fiscalPeriod = filters['periodFrom'] ? String(filters['periodFrom']) : 'all';

  return (
    <>
      {mode === 'studio' ? (
        <div className="studio-container animate-fade-in">
          <div className="studio-hero">
            <div>
              <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
                Create a Financial Dashboard
              </h1>
              <p style={{ margin: '5px 0 0 0', fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: '58ch' }}>
                Ask a plain-English question or pick a verified template below. Calculations run deterministically on SAP CAP.
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => onSwitchMode('canvas')}
              icon={<BarChart2 size={14} />}
            >
              <span>View Active Dashboard</span>
              <ArrowRight size={13} />
            </Button>
          </div>

          <PromptComposer onSubmit={onPromptSubmit} isLoading={isLoading} />

          {currentStep && <WorkflowProgressIndicator currentStep={currentStep} />}

          {understood && <UnderstoodCard goal={understood.goal} aiMode={understood.aiMode} modelId={understood.modelId} />}

          {errorMessage && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 10,
                background: 'var(--negative-subtle)',
                border: '1px solid var(--negative-border)',
                color: 'var(--negative)',
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={onDismissError}
                aria-label="Dismiss error"
                style={{ background: 'none', border: 'none', color: 'inherit', padding: 2 }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          <TemplateGallery onSelectTemplate={onSelectTemplate} isLoading={isLoading} />
        </div>
      ) : (
        <div className="workspace-container animate-fade-in">
          {currentStep && <WorkflowProgressIndicator currentStep={currentStep} />}

          {understood && (
            <div style={{ marginBottom: 18 }}>
              <UnderstoodCard goal={understood.goal} aiMode={understood.aiMode} modelId={understood.modelId} />
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 10,
                background: 'var(--negative-subtle)',
                border: '1px solid var(--negative-border)',
                color: 'var(--negative)',
                fontSize: 13,
                marginBottom: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={onDismissError}
                aria-label="Dismiss error"
                style={{ background: 'none', border: 'none', color: 'inherit', padding: 2 }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <DashboardToolbar
              companyCode={companyCode}
              fiscalYear={fiscalYear}
              fiscalPeriod={fiscalPeriod}
              comparisonMode={comparisonMode}
              isLoading={isLoading}
              isStale={isStale}
              hasUnsavedChanges={hasUnsavedChanges}
              canShare={Boolean(activeDashboardDbId)}
              visibleSections={visibleSections}
              onNewQuery={() => onSwitchMode('studio')}
              onChangeCompany={(cc) => onApplyFilter({ companyCode: cc })}
              onChangeYear={(yr) => onApplyFilter({ fiscalYear: yr })}
              onChangePeriod={(p) => onApplyFilter({ fiscalPeriod: p })}
              onToggleComparison={() => onApplyFilter({ compare: !comparisonMode })}
              onToggleSection={onToggleSection}
              onRefresh={onRefresh}
              onSave={onSave}
              onRename={onOpenRename}
              onDuplicate={onDuplicate}
              onShare={onOpenShare}
              onExportCsv={onExportCsv}
              onExportJson={onExportJson}
            />

            {isLoading && currentStep ? (
              <DashboardSkeleton />
            ) : (
              <DashboardRenderer
                spec={currentSpec}
                periodSeries={periodSeries}
                buSlices={buSlices}
                comparisonData={comparisonData}
                comparisonMode={comparisonMode}
                isStale={isStale}
                visibleSections={visibleSections}
                preferredChartMode={preferredChartMode}
                explanationNote={explanationNote}
              />
            )}

            <FollowUpComposer onFollowUp={onFollowUp} isLoading={isLoading} />
          </div>
        </div>
      )}

      {clarifications && (
        <ClarificationModal
          questions={clarifications}
          onSelectOption={onClarificationOption}
          onCancel={onCancelClarification}
        />
      )}

      <Dialog
        open={renameDialogOpen}
        onClose={onCloseRename}
        title="Rename Dashboard"
        subtitle="Update the dashboard title without modifying validated calculation data."
        footer={
          <>
            <Button variant="ghost" onClick={onCloseRename}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!titleInput.trim()}
              onClick={async () => {
                await onConfirmRename(titleInput.trim());
                onCloseRename();
              }}
            >
              Update Title
            </Button>
          </>
        }
      >
        <input
          type="text"
          value={titleInput}
          onChange={(e) => setTitleInput(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            height: 38,
            padding: '0 12px',
            borderRadius: 8,
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-subtle)',
            color: 'var(--text-primary)',
            fontSize: 13.5,
          }}
        />
      </Dialog>

      <Dialog
        open={shareDialogOpen}
        onClose={onCloseShare}
        title="Share Saved Dashboard"
        subtitle="Grant read or edit access within your tenant."
        footer={
          <>
            <Button variant="ghost" onClick={onCloseShare}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!shareUser.trim() || !activeDashboardDbId}
              onClick={async () => {
                if (activeDashboardDbId) {
                  await onConfirmShare(activeDashboardDbId, shareUser.trim(), sharePerm);
                  onCloseShare();
                }
              }}
            >
              Share Dashboard
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
              Recipient User ID
            </label>
            <input
              type="text"
              value={shareUser}
              onChange={(e) => setShareUser(e.target.value)}
              style={{
                width: '100%',
                height: 38,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid var(--border-strong)',
                background: 'var(--surface-subtle)',
                color: 'var(--text-primary)',
                fontSize: 13.5,
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>
              Permission
            </label>
            <select
              value={sharePerm}
              onChange={(e) => setSharePerm(e.target.value as 'READ' | 'EDIT')}
              className="scope-select"
              style={{ width: '100%', height: 38 }}
            >
              <option value="READ">READ — View only</option>
              <option value="EDIT">EDIT — View &amp; update</option>
            </select>
          </div>
        </div>
      </Dialog>
    </>
  );
};
