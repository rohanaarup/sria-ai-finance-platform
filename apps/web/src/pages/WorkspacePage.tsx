import React, { useState, useEffect } from 'react';
import type { DashboardSpec, ClarificationQuestion, MetricResult } from '@sria/contracts';
import { PromptInputBar } from '../components/ai/PromptInputBar';
import { ClarificationModal } from '../components/ai/ClarificationModal';
import { WorkflowProgressIndicator } from '../components/ai/WorkflowProgressIndicator';
import type { ProgressStep } from '../components/ai/WorkflowProgressIndicator';
import { DashboardRenderer } from '../components/dashboard/DashboardRenderer';
import { FollowUpPanel } from '../components/dashboard/FollowUpPanel';
import { MyDashboardsPage } from './MyDashboardsPage';
import type { SavedDashboardSummary } from './MyDashboardsPage';
import { ApiClient } from '../services/api-client';

// ─── Initial Baseline Dashboard Spec (FY2026 Commercial Pilot) ───────────────

const INITIAL_RESULTS: MetricResult[] = [
  {
    metricId: 'total_revenue',
    label: 'Total Revenue',
    value: 350000,
    formattedValue: '$350,000.00',
    currency: 'USD',
    provenance: {
      sourceType: 'mock',
      sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
      retrievedAt: new Date().toISOString(),
      calculationVersion: '1.0.0',
      isSynthetic: true,
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
    }
  },
  {
    metricId: 'total_expenses',
    label: 'Total Expenses',
    value: 230000,
    formattedValue: '$230,000.00',
    currency: 'USD',
    provenance: {
      sourceType: 'mock',
      sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
      retrievedAt: new Date().toISOString(),
      calculationVersion: '1.0.0',
      isSynthetic: true,
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
    }
  },
  {
    metricId: 'net_profit',
    label: 'Net Profit',
    value: 120000,
    formattedValue: '$120,000.00',
    currency: 'USD',
    provenance: {
      sourceType: 'mock',
      sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
      retrievedAt: new Date().toISOString(),
      calculationVersion: '1.0.0',
      isSynthetic: true,
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
    }
  },
  {
    metricId: 'profit_margin',
    label: 'Profit Margin',
    value: 34.29,
    formattedValue: '34.29%',
    currency: 'PCT',
    isZeroDenominator: false,
    provenance: {
      sourceType: 'mock',
      sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
      retrievedAt: new Date().toISOString(),
      calculationVersion: '1.0.0',
      isSynthetic: true,
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
    }
  }
];

const INITIAL_SPEC: DashboardSpec = {
  version: '1.0',
  dashboardId: 'pilot-dashboard-default',
  title: 'Executive Financial Overview: Company 1000 (FY 2026)',
  description: 'Verified executive dashboard showing deterministic revenue, operating expenses, net income and margin.',
  organizationId: 'ORG_ACME_PILOT',
  createdAt: new Date().toISOString(),
  generatedBy: 'finance_controller',
  widgets: [
    { id: 'w1', type: 'kpi_card', title: 'Total Revenue', metricIds: ['total_revenue'] },
    { id: 'w2', type: 'kpi_card', title: 'Total Expenses', metricIds: ['total_expenses'] },
    { id: 'w3', type: 'kpi_card', title: 'Net Profit', metricIds: ['net_profit'] },
    { id: 'w4', type: 'kpi_card', title: 'Profit Margin', metricIds: ['profit_margin'] },
    { id: 'w5', type: 'bar_chart', title: 'Comparative Aggregates', metricIds: ['total_revenue', 'total_expenses', 'net_profit'] },
    { id: 'w6', type: 'line_chart', title: 'Period Trend Analysis', metricIds: ['total_revenue', 'total_expenses'] },
    { id: 'w7', type: 'table', title: 'Accounting Ledger Breakdown', metricIds: ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'] }
  ],
  results: INITIAL_RESULTS,
  dataProvenance: {
    sourceType: 'mock',
    sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
    retrievedAt: new Date().toISOString(),
    calculationVersion: '1.0.0',
    isSynthetic: true,
    appliedFilters: { companyCode: '1000', fiscalYear: 2026 }
  },
  freshnessNotice: 'Source: Synthetic Test Fixtures [Mock Dev Mode] · Deterministic Calculation Engine v1.0.0'
};

export const WorkspacePage: React.FC = () => {
  const [currentSpec, setCurrentSpec] = useState<DashboardSpec>(INITIAL_SPEC);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<ProgressStep | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationQuestion[] | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Lifecycle & Stale States (Phase 10)
  const [isStale, setIsStale] = useState<boolean>(false);
  const [activeDashboardDbId, setActiveDashboardDbId] = useState<string | null>(null);
  const [isMyDashboardsOpen, setIsMyDashboardsOpen] = useState<boolean>(false);
  const [savedDashboards, setSavedDashboards] = useState<SavedDashboardSummary[]>([]);

  // Load saved dashboards on initial mount
  useEffect(() => {
    loadSavedDashboards();
  }, []);

  const loadSavedDashboards = async () => {
    try {
      const list = await ApiClient.listDashboards();
      setSavedDashboards(list);
    } catch {
      // Ignored in offline mock mode
    }
  };

  const handlePromptSubmit = async (promptText: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    setClarifications(null);
    setPendingPrompt(promptText);

    try {
      // Step 1: Interpret
      setCurrentStep('INTERPRETING');
      await new Promise(r => setTimeout(r, 200));

      const understand = await ApiClient.understandPrompt(promptText);

      if (understand.status === 'CLARIFICATION_REQUIRED' && understand.clarifications) {
        setClarifications(understand.clarifications);
        setIsLoading(false);
        setCurrentStep(null);
        return;
      }

      if (understand.status === 'REJECTED') {
        setErrorMessage(`Request rejected: ${understand.rejectionReason}`);
        setIsLoading(false);
        setCurrentStep(null);
        return;
      }

      // Step 2 & 3: Validate & Plan
      setCurrentStep('PLANNING');
      await new Promise(r => setTimeout(r, 200));

      // Step 4 & 5: Authorize & Query Data
      setCurrentStep('RETRIEVING_DATA');
      const execResult = await ApiClient.executeRequest(understand.resolvedRequest!);

      // Step 6: Deterministic Calculations
      setCurrentStep('CALCULATING');
      await new Promise(r => setTimeout(r, 200));

      const companyCode = understand.resolvedRequest?.filters?.companyCode || '1000';
      const fiscalYear = understand.resolvedRequest?.filters?.fiscalYear || 2026;

      const newSpec: DashboardSpec = {
        version: '1.0',
        dashboardId: `dash-${Date.now()}`,
        title: `Finance Dashboard: Company ${companyCode} (FY ${fiscalYear})`,
        description: `Generated from request: "${promptText}". Computed deterministically with provenance.`,
        organizationId: 'ORG_ACME_PILOT',
        createdAt: new Date().toISOString(),
        generatedBy: 'finance_analyst',
        widgets: [
          ...understand.resolvedRequest!.metricIds.map((m, idx) => ({
            id: `kpi-${idx}`,
            type: 'kpi_card' as const,
            title: m,
            metricIds: [m]
          })),
          { id: 'chart-1', type: 'bar_chart' as const, title: 'Comparative Aggregates', metricIds: understand.resolvedRequest!.metricIds },
          { id: 'chart-2', type: 'line_chart' as const, title: 'Period Trend Analysis', metricIds: understand.resolvedRequest!.metricIds },
          { id: 'table-1', type: 'table' as const, title: 'Accounting Ledger Breakdown', metricIds: understand.resolvedRequest!.metricIds }
        ],
        results: execResult.results,
        dataProvenance: {
          sourceType: execResult.sourceType,
          sourceSystem: execResult.isSynthetic ? 'SAP_SYNTHETIC_OFFLINE_FIXTURE' : 'SAP_S4HANA_LIVE',
          retrievedAt: new Date().toISOString(),
          calculationVersion: '1.0.0',
          isSynthetic: execResult.isSynthetic,
          appliedFilters: understand.resolvedRequest?.filters
        },
        freshnessNotice: execResult.isSynthetic
          ? 'Source: Synthetic Test Fixtures [Mock Dev Mode] · Deterministic Math'
          : 'Source: SAP S/4HANA OData [Live System] · Deterministic Math'
      };

      setCurrentSpec(newSpec);
      setIsStale(false);
      setActiveDashboardDbId(null);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsLoading(false);
      setCurrentStep(null);
    }
  };

  const handleClarificationOption = (paramName: string, selectedValue: string) => {
    const updatedPrompt = `${pendingPrompt} (${paramName}: ${selectedValue})`;
    setClarifications(null);
    handlePromptSubmit(updatedPrompt);
  };

  // ─── Conversational Follow-up Handler ───────────────────────────────────────

  const handleFollowUp = async (promptText: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const outcome = await ApiClient.processFollowUp(promptText, currentSpec);

      if (outcome.type === 'UNSUPPORTED') {
        setErrorMessage(outcome.message);
        return;
      }

      if (outcome.type === 'PRESENTATION_ONLY' && outcome.spec) {
        // Instant visual update without backend data retrieval!
        setCurrentSpec(outcome.spec);
        setNoticeMessage(outcome.message);
        return;
      }

      // Data-changing or Refresh: run standard pipeline
      await handlePromptSubmit(promptText);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Refresh Data Handler ───────────────────────────────────────────────────

  const handleRefresh = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      if (activeDashboardDbId) {
        const refreshed = await ApiClient.refreshDashboard(activeDashboardDbId);
        setCurrentSpec(refreshed.spec);
        setIsStale(false);
        setNoticeMessage(`Figures refreshed on-demand at ${new Date(refreshed.refreshedAt).toLocaleTimeString()}.`);
      } else {
        // Refresh active live spec by re-executing query
        const filters = currentSpec.dataProvenance.appliedFilters || {};
        const companyCode = filters['companyCode'] || '1000';
        const fiscalYear = filters['fiscalYear'] || 2026;
        await handlePromptSubmit(`Show financial metrics for Company ${companyCode} FY ${fiscalYear}`);
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Save to Database Handler ───────────────────────────────────────────────

  const handleSave = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const res = await ApiClient.saveDashboard(currentSpec.title, currentSpec);
      setActiveDashboardDbId(res.dashboardId);
      setNoticeMessage(`Dashboard saved successfully to database (ID: ${res.dashboardId.slice(0, 8)}...).`);
      await loadSavedDashboards();
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Saved Dashboard Lifecycle Handlers ─────────────────────────────────────

  const handleOpenDashboard = async (id: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const data = await ApiClient.reopenDashboard(id);
      setCurrentSpec(data.spec);
      setIsStale(data.isStale);
      setActiveDashboardDbId(id);
      setIsMyDashboardsOpen(false);
      setNoticeMessage('Saved dashboard opened. Data is marked stale until a fresh query is refreshed.');
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRenameDashboard = async (id: string, currentTitle: string) => {
    const newTitle = window.prompt('Enter new dashboard title:', currentTitle);
    if (!newTitle || !newTitle.trim() || newTitle === currentTitle) return;

    try {
      await ApiClient.renameDashboard(id, newTitle.trim());
      await loadSavedDashboards();
      if (activeDashboardDbId === id) {
        setCurrentSpec((prev) => ({ ...prev, title: newTitle.trim() }));
      }
      setNoticeMessage(`Dashboard renamed to "${newTitle.trim()}".`);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleDeleteDashboard = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this dashboard from database?')) return;

    try {
      await ApiClient.deleteDashboard(id);
      await loadSavedDashboards();
      if (activeDashboardDbId === id) {
        setActiveDashboardDbId(null);
      }
      setNoticeMessage('Dashboard deleted from database.');
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '32px auto', padding: '0 24px' }}>
      {/* Top Workspace Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={() => {
              loadSavedDashboards();
              setIsMyDashboardsOpen(true);
            }}
            style={{
              background: 'var(--paper)',
              border: '1px solid var(--line)',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              color: 'var(--ink)'
            }}
          >
            📁 My Dashboards ({savedDashboards.length})
          </button>
          {isStale && (
            <span
              style={{
                fontSize: '12px',
                color: '#856404',
                background: '#fff3cd',
                padding: '4px 10px',
                borderRadius: '6px',
                fontWeight: 600,
                border: '1px solid #ffeeba'
              }}
            >
              ⚠️ Reopened Configuration (Stale Figures)
            </span>
          )}
        </div>

        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
          Pilot Tenant: <strong>ORG_ACME_PILOT</strong> · Source: <strong>I_JournalEntryItemBasic</strong>
        </div>
      </div>

      {/* Prompt Input Box */}
      <PromptInputBar onSubmit={handlePromptSubmit} isLoading={isLoading} />

      {/* Live State Machine Progress */}
      {currentStep && <WorkflowProgressIndicator currentStep={currentStep} />}

      {/* Clarification Modal Dialog */}
      {clarifications && (
        <ClarificationModal
          questions={clarifications}
          onSelectOption={handleClarificationOption}
          onCancel={() => setClarifications(null)}
        />
      )}

      {/* Notice / Success Feedback */}
      {noticeMessage && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            background: '#e8f5e9',
            border: '1px solid #c8e6c9',
            color: '#1b5e20',
            fontSize: '13px',
            marginBottom: '20px'
          }}
        >
          {noticeMessage}
        </div>
      )}

      {/* Error Notice */}
      {errorMessage && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            background: '#fdf2f0',
            border: '1px solid #f2cfc9',
            color: '#842018',
            fontSize: '14px',
            marginBottom: '24px'
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Rendered Live Dashboard */}
      <DashboardRenderer spec={currentSpec} />

      {/* Conversational Follow-up Panel */}
      <FollowUpPanel
        onFollowUp={handleFollowUp}
        onRefresh={handleRefresh}
        onSave={handleSave}
        isLoading={isLoading}
        isStale={isStale}
      />

      {/* Saved Dashboards Modal */}
      {isMyDashboardsOpen && (
        <MyDashboardsPage
          dashboards={savedDashboards}
          onOpen={handleOpenDashboard}
          onRename={handleRenameDashboard}
          onDelete={handleDeleteDashboard}
          onClose={() => setIsMyDashboardsOpen(false)}
        />
      )}
    </div>
  );
};
