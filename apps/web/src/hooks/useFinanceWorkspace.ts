import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { DashboardSpec, ClarificationQuestion, MetricResult, MetricId } from '@sria/contracts';
import type { AppNavView } from '../components/layout/AppShell';
import type { ProgressStep } from '../components/ai/WorkflowProgressIndicator';
import type { DashboardTemplate } from '../components/ai/TemplateGallery';
import type { VisibleSections } from '../components/dashboard/DashboardToolbar';
import type { SavedDashboardSummary } from '../pages/MyDashboardsPage';
import {
  ApiClient,
  buildSpecDataProvenance,
  type ApprovedMetricSummary,
  type BusinessUnitSlice,
  type CompanyComparisonPoint,
  type PeriodSeriesPoint,
  type SystemHealthStatus,
} from '../services/api-client';
import {
  buildExecutiveNarrative,
  exportSpecAsCsv,
  exportSpecAsJson,
} from '../services/dashboard-intelligence';

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
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 },
    },
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
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 },
    },
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
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 },
    },
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
      appliedFilters: { companyCode: '1000', fiscalYear: 2026 },
    },
  },
];

const INITIAL_SPEC: DashboardSpec = {
  version: '1.0',
  dashboardId: '00000000-0000-4000-8000-000000000001',
  title: 'Executive Financial Overview: Company 1000 (FY 2026)',
  description:
    'Deterministic revenue, operating expenses, net profit, and margin computed from validated SAP accounting records.',
  organizationId: 'ORG_ACME_PILOT',
  createdAt: new Date().toISOString(),
  generatedBy: 'finance_analyst',
  widgets: [
    { id: 'w1', type: 'kpi_card', title: 'Total Revenue', metricIds: ['total_revenue'] },
    { id: 'w2', type: 'kpi_card', title: 'Total Expenses', metricIds: ['total_expenses'] },
    { id: 'w3', type: 'kpi_card', title: 'Net Profit', metricIds: ['net_profit'] },
    { id: 'w4', type: 'kpi_card', title: 'Profit Margin', metricIds: ['profit_margin'] },
    { id: 'w5', type: 'bar_chart', title: 'Comparative Aggregates', metricIds: ['total_revenue', 'total_expenses', 'net_profit'] },
    { id: 'w6', type: 'line_chart', title: 'Period Trend Analysis', metricIds: ['total_revenue', 'total_expenses'] },
    { id: 'w7', type: 'table', title: 'Accounting Ledger Breakdown', metricIds: ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'] },
  ],
  results: INITIAL_RESULTS,
  dataProvenance: {
    sourceType: 'mock',
    sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
    retrievedAt: new Date().toISOString(),
    calculationVersion: '1.0.0',
    isSynthetic: true,
    appliedFilters: { companyCode: '1000', fiscalYear: 2026 },
  },
  freshnessNotice: 'Source: Synthetic Test Fixtures [Mock Dev Mode] · Deterministic Calculation Engine v1.0.0',
};

export interface RecentDashboardEntry {
  id: string;
  title: string;
  timestamp: string;
  spec: DashboardSpec;
  comparisonMode: boolean;
}

export function useFinanceWorkspace() {
  const [currentView, setCurrentView] = useState<AppNavView>('studio');
  const [currentSpec, setCurrentSpec] = useState<DashboardSpec>(INITIAL_SPEC);
  const [periodSeries, setPeriodSeries] = useState<PeriodSeriesPoint[]>([]);
  const [buSlices, setBuSlices] = useState<BusinessUnitSlice[]>([]);
  const [comparisonData, setComparisonData] = useState<CompanyComparisonPoint[] | undefined>(undefined);
  const [comparisonMode, setComparisonMode] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<ProgressStep | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationQuestion[] | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isStale, setIsStale] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeDashboardDbId, setActiveDashboardDbId] = useState<string | null>(null);
  const [savedDashboards, setSavedDashboards] = useState<SavedDashboardSummary[]>([]);
  const [recentDashboards, setRecentDashboards] = useState<RecentDashboardEntry[]>([
    {
      id: INITIAL_SPEC.dashboardId,
      title: INITIAL_SPEC.title,
      timestamp: INITIAL_SPEC.createdAt,
      spec: INITIAL_SPEC,
      comparisonMode: false,
    },
  ]);

  const [systemStatus, setSystemStatus] = useState<SystemHealthStatus | null>(null);
  const [approvedMetrics, setApprovedMetrics] = useState<ApprovedMetricSummary[]>([]);
  const [preferredChartMode, setPreferredChartMode] = useState<'bar' | 'line' | 'area' | 'donut' | undefined>(undefined);
  const [explanationNote, setExplanationNote] = useState<string | null>(null);
  const [visibleSections, setVisibleSections] = useState<VisibleSections>({
    summary: true,
    charts: true,
    insights: true,
    table: true,
  });

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const loadSupplementalBreakdowns = useCallback(
    async (
      companyCode: string,
      fiscalYear: number,
      fiscalPeriod: string | undefined,
      metricIds: MetricId[],
      enableComparison: boolean
    ) => {
      const [periods, bu, cmp] = await Promise.all([
        ApiClient.fetchPeriodBreakdown(companyCode, fiscalYear),
        ApiClient.fetchBusinessUnitBreakdown(companyCode, fiscalYear, fiscalPeriod),
        enableComparison
          ? ApiClient.fetchCompanyComparison(fiscalYear, metricIds, fiscalPeriod)
          : Promise.resolve(undefined),
      ]);

      setPeriodSeries(
        fiscalPeriod ? periods.filter((p) => p.period === fiscalPeriod) : periods
      );
      setBuSlices(bu);
      setComparisonData(cmp);
    },
    []
  );

  const loadSavedDashboards = useCallback(async () => {
    try {
      const list = await ApiClient.listDashboards();
      setSavedDashboards(list);
    } catch {
      // Safe fallback
    }
  }, []);

  useEffect(() => {
    ApiClient.getSystemStatus().then(setSystemStatus);
    ApiClient.getApprovedMetrics().then(setApprovedMetrics);
    loadSavedDashboards();
    loadSupplementalBreakdowns(
      '1000',
      2026,
      undefined,
      ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'],
      false
    );
  }, [loadSavedDashboards, loadSupplementalBreakdowns]);

  const recordRecent = useCallback((spec: DashboardSpec, cmpMode: boolean) => {
    setRecentDashboards((prev) => {
      const filtered = prev.filter((item) => item.id !== spec.dashboardId);
      return [
        {
          id: spec.dashboardId,
          title: spec.title,
          timestamp: new Date().toISOString(),
          spec,
          comparisonMode: cmpMode,
        },
        ...filtered,
      ].slice(0, 6);
    });
  }, []);

  const buildTitleForMetrics = (
    requestedMetrics: MetricId[],
    companyCode: string,
    fiscalYear: number,
    isComparison: boolean
  ) => {
    if (isComparison) {
      return `Entity Comparison: Company 1000 vs 2000 (FY ${fiscalYear})`;
    }
    if (requestedMetrics.length === 1 && requestedMetrics[0] === 'total_revenue') {
      return `Revenue Intelligence: Company ${companyCode} (FY ${fiscalYear})`;
    }
    if (requestedMetrics.length === 1 && requestedMetrics[0] === 'total_expenses') {
      return `Expense Analysis: Company ${companyCode} (FY ${fiscalYear})`;
    }
    if (
      requestedMetrics.length <= 2 &&
      (requestedMetrics.includes('net_profit') || requestedMetrics.includes('profit_margin')) &&
      !requestedMetrics.includes('total_revenue')
    ) {
      return `Profitability Analysis: Company ${companyCode} (FY ${fiscalYear})`;
    }
    if (requestedMetrics.length >= 3) {
      return `Executive Financial Overview: Company ${companyCode} (FY ${fiscalYear})`;
    }
    return `Finance Dashboard: Company ${companyCode} (FY ${fiscalYear})`;
  };

  const handlePromptSubmit = async (
    promptText: string,
    options?: { compareEntities?: boolean }
  ) => {
    setIsLoading(true);
    setErrorMessage(null);
    setClarifications(null);
    setExplanationNote(null);
    setPendingPrompt(promptText);

    const wantsComparison =
      Boolean(options?.compareEntities) ||
      (promptText.toLowerCase().includes('compare') &&
        promptText.includes('1000') &&
        promptText.includes('2000'));

    try {
      setCurrentStep('INTERPRETING');
      const understand = await ApiClient.understandPrompt(promptText);

      if (understand.status === 'CLARIFICATION_REQUIRED' && understand.clarifications) {
        setClarifications(understand.clarifications);
        setIsLoading(false);
        setCurrentStep(null);
        return;
      }

      if (understand.status === 'REJECTED') {
        const msg = understand.rejectionReason || 'Request rejected by metric governance.';
        setErrorMessage(msg);
        toast.error(msg);
        setIsLoading(false);
        setCurrentStep(null);
        return;
      }

      setCurrentStep('PLANNING');
      const resolved = understand.resolvedRequest!;
      const companyCode = resolved.filters?.companyCode || '1000';
      const fiscalYear = resolved.filters?.fiscalYear || 2026;
      const periodFrom = resolved.filters?.periodFrom;
      const requestedMetrics = resolved.metricIds;

      setCurrentStep('RETRIEVING_DATA');
      const execResult = await ApiClient.executeRequest(resolved);

      setCurrentStep('CALCULATING');
      await loadSupplementalBreakdowns(
        companyCode,
        fiscalYear,
        periodFrom,
        requestedMetrics,
        wantsComparison
      );

      setCurrentStep('COMPILING');
      const dashboardTitle = buildTitleForMetrics(
        requestedMetrics,
        companyCode,
        fiscalYear,
        wantsComparison
      );

      const widgets: DashboardSpec['widgets'] = [
        ...requestedMetrics.map((m, idx) => ({
          id: `kpi-${idx}`,
          type: 'kpi_card' as const,
          title: m,
          metricIds: [m],
        })),
        ...(requestedMetrics.length >= 2
          ? [{ id: 'chart-1', type: 'bar_chart' as const, title: 'Comparative Aggregates', metricIds: requestedMetrics }]
          : []),
        { id: 'chart-2', type: 'line_chart' as const, title: 'Period Trend Analysis', metricIds: requestedMetrics },
        { id: 'table-1', type: 'table' as const, title: 'Accounting Ledger Breakdown', metricIds: requestedMetrics },
      ];

      const newSpec: DashboardSpec = {
        version: '1.0',
        dashboardId: crypto.randomUUID ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString().slice(-12)}`,
        title: dashboardTitle,
        description: `Generated from prompt: "${promptText}". Computed deterministically with full provenance.`,
        organizationId: resolved.organizationId || 'ORG_ACME_PILOT',
        createdAt: new Date().toISOString(),
        generatedBy: resolved.userId || 'finance_analyst',
        widgets,
        results: execResult.results,
        dataProvenance: buildSpecDataProvenance(execResult, resolved.filters as Record<string, unknown>),
        freshnessNotice: execResult.isSynthetic
          ? 'Source: Synthetic Test Fixtures [Mock Dev Mode] · Deterministic Math'
          : 'Source: SAP S/4HANA OData [Live System] · Deterministic Math',
      };

      setCurrentSpec(newSpec);
      setComparisonMode(wantsComparison);
      setPreferredChartMode(undefined);
      setIsStale(false);
      setActiveDashboardDbId(null);
      setHasUnsavedChanges(true);
      recordRecent(newSpec, wantsComparison);
      setCurrentView('canvas');
      toast.success('Dashboard compiled from verified SAP metrics');
    } catch (err) {
      const msg = (err as Error).message;
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
      setCurrentStep(null);
    }
  };

  const handleSelectTemplate = (tpl: DashboardTemplate) => {
    handlePromptSubmit(tpl.prompt, { compareEntities: tpl.compareEntities });
  };

  const handleClarificationOption = (paramName: string, selectedValue: string) => {
    const updatedPrompt = `${pendingPrompt} (${paramName}: ${selectedValue})`;
    setClarifications(null);
    handlePromptSubmit(updatedPrompt);
  };

  const applyFilterChange = async (next: {
    companyCode?: string;
    fiscalYear?: number;
    fiscalPeriod?: string;
    compare?: boolean;
  }) => {
    const currentFilters = currentSpec.dataProvenance.appliedFilters || {};
    const companyCode = next.companyCode ?? String(currentFilters['companyCode'] || '1000');
    const fiscalYear = next.fiscalYear ?? Number(currentFilters['fiscalYear'] || 2026);
    const fiscalPeriod =
      next.fiscalPeriod !== undefined
        ? next.fiscalPeriod === 'all'
          ? undefined
          : next.fiscalPeriod
        : (currentFilters['periodFrom'] as string | undefined);
    const nextCompare = next.compare ?? comparisonMode;

    const metricIds: MetricId[] =
      (currentSpec.results?.map((r) => r.metricId as MetricId) || []).length > 0
        ? (currentSpec.results!.map((r) => r.metricId as MetricId))
        : ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'];

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const exec = await ApiClient.executeRequest({
        version: '1.0',
        rawPrompt: `Filter update: Company ${companyCode} FY ${fiscalYear}${fiscalPeriod ? ` P${fiscalPeriod}` : ''}`,
        metricIds,
        dimensions: ['fiscal_period'],
        filters: {
          companyCode,
          fiscalYear,
          ...(fiscalPeriod ? { periodFrom: fiscalPeriod, periodTo: fiscalPeriod } : {}),
        },
        organizationId: currentSpec.organizationId,
        userId: currentSpec.generatedBy,
      });

      await loadSupplementalBreakdowns(companyCode, fiscalYear, fiscalPeriod, metricIds, nextCompare);

      const updatedSpec: DashboardSpec = {
        ...currentSpec,
        title: buildTitleForMetrics(metricIds, companyCode, fiscalYear, nextCompare),
        results: exec.results,
        dataProvenance: buildSpecDataProvenance(exec, {
          companyCode,
          fiscalYear,
          ...(fiscalPeriod ? { periodFrom: fiscalPeriod, periodTo: fiscalPeriod } : {}),
        }),
      };

      setCurrentSpec(updatedSpec);
      setComparisonMode(nextCompare);
      setIsStale(false);
      setHasUnsavedChanges(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollowUp = async (promptText: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const outcome = await ApiClient.processFollowUp(promptText, currentSpec);
      if (outcome.type === 'UNSUPPORTED') {
        setErrorMessage(outcome.message);
        toast.error(outcome.message);
        return;
      }

      if (outcome.type === 'PRESENTATION_ONLY') {
        if (outcome.explainRequested) {
          const explanation = buildExecutiveNarrative(currentSpec, periodSeries, comparisonData);
          setExplanationNote(
            explanation
              ? `Deterministic Explanation: ${explanation}`
              : 'All figures above are derived directly from validated accounting postings.'
          );
          toast.success(outcome.message);
          return;
        }
        if (outcome.spec) {
          setCurrentSpec(outcome.spec);
          if (outcome.preferredChartMode) {
            setPreferredChartMode(outcome.preferredChartMode);
          }
          setHasUnsavedChanges(true);
          toast.success(outcome.message);
          return;
        }
      }

      await handlePromptSubmit(promptText);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      if (activeDashboardDbId) {
        const refreshed = await ApiClient.refreshDashboard(activeDashboardDbId);
        setCurrentSpec(refreshed.spec);
        setIsStale(false);
        setHasUnsavedChanges(false);
        const f = refreshed.spec.dataProvenance.appliedFilters || {};
        await loadSupplementalBreakdowns(
          String(f['companyCode'] || '1000'),
          Number(f['fiscalYear'] || 2026),
          f['periodFrom'] as string | undefined,
          (refreshed.spec.results?.map((r) => r.metricId as MetricId)) || ['total_revenue'],
          comparisonMode
        );
        toast.success(`Figures refreshed at ${new Date(refreshed.refreshedAt).toLocaleTimeString()}`);
      } else {
        await applyFilterChange({});
        toast.success('Figures refreshed from active data provider');
      }
    } catch (err) {
      const f = currentSpec.dataProvenance.appliedFilters || {};
      await applyFilterChange({
        companyCode: String(f['companyCode'] || '1000'),
        fiscalYear: Number(f['fiscalYear'] || 2026),
      });
      toast.info((err as Error).message + ' Re-executed locally.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const res = await ApiClient.saveDashboard(currentSpec.title, currentSpec);
      setActiveDashboardDbId(res.dashboardId);
      setHasUnsavedChanges(false);
      await loadSavedDashboards();
      toast.success(`Dashboard saved (${res.dashboardId.slice(0, 8)}…)`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDuplicateCurrent = async () => {
    const copyTitle = `${currentSpec.title} (Copy)`;
    const res = await ApiClient.saveDashboard(copyTitle, { ...currentSpec, title: copyTitle });
    await loadSavedDashboards();
    toast.success(`Saved duplicate "${copyTitle}" (${res.dashboardId.slice(0, 8)}…)`);
  };

  const handleOpenSaved = async (id: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await ApiClient.reopenDashboard(id);
      setCurrentSpec(data.spec);
      setIsStale(data.isStale);
      setHasUnsavedChanges(false);
      setActiveDashboardDbId(id);
      setCurrentView('canvas');

      const f = data.spec.dataProvenance.appliedFilters || {};
      const isCmp = data.spec.title.toLowerCase().includes('comparison');
      setComparisonMode(isCmp);
      await loadSupplementalBreakdowns(
        String(f['companyCode'] || '1000'),
        Number(f['fiscalYear'] || 2026),
        f['periodFrom'] as string | undefined,
        (data.spec.results?.map((r) => r.metricId as MetricId)) || ['total_revenue'],
        isCmp
      );
      recordRecent(data.spec, isCmp);
      toast.info('Saved dashboard opened — figures marked stale until refreshed.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenRecent = async (id: string) => {
    const match = recentDashboards.find((r) => r.id === id);
    if (!match) return;
    setCurrentSpec(match.spec);
    setComparisonMode(match.comparisonMode);
    setIsStale(false);
    setCurrentView('canvas');
    const f = match.spec.dataProvenance.appliedFilters || {};
    await loadSupplementalBreakdowns(
      String(f['companyCode'] || '1000'),
      Number(f['fiscalYear'] || 2026),
      f['periodFrom'] as string | undefined,
      (match.spec.results?.map((r) => r.metricId as MetricId)) || ['total_revenue'],
      match.comparisonMode
    );
  };

  const handleRenameDashboard = async (id: string, newTitle: string) => {
    await ApiClient.renameDashboard(id, newTitle);
    await loadSavedDashboards();
    if (activeDashboardDbId === id) {
      setCurrentSpec((prev) => ({ ...prev, title: newTitle }));
    }
    toast.success(`Renamed to "${newTitle}"`);
  };

  const handleRenameCurrent = async (newTitle: string) => {
    if (activeDashboardDbId) {
      await handleRenameDashboard(activeDashboardDbId, newTitle);
    } else {
      setCurrentSpec((prev) => ({ ...prev, title: newTitle }));
      setHasUnsavedChanges(true);
      toast.success(`Updated title to "${newTitle}"`);
    }
  };

  const handleDuplicateSaved = async (id: string) => {
    const data = await ApiClient.reopenDashboard(id);
    const copyTitle = `${data.spec.title} (Copy)`;
    await ApiClient.saveDashboard(copyTitle, { ...data.spec, title: copyTitle });
    await loadSavedDashboards();
    toast.success(`Duplicated "${copyTitle}"`);
  };

  const handleShareDashboard = async (
    id: string,
    userId: string,
    permission: 'READ' | 'EDIT'
  ) => {
    try {
      await ApiClient.shareDashboard(id, userId, permission);
      toast.success(`Shared with ${userId} (${permission})`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteDashboard = async (id: string) => {
    await ApiClient.deleteDashboard(id);
    await loadSavedDashboards();
    if (activeDashboardDbId === id) {
      setActiveDashboardDbId(null);
    }
    toast.success('Dashboard archived');
  };

  return {
    currentView,
    setCurrentView,
    currentSpec,
    periodSeries,
    buSlices,
    comparisonData,
    comparisonMode,
    isLoading,
    currentStep,
    clarifications,
    setClarifications,
    errorMessage,
    setErrorMessage,
    isStale,
    hasUnsavedChanges,
    activeDashboardDbId,
    savedDashboards,
    recentDashboards,
    systemStatus,
    approvedMetrics,
    preferredChartMode,
    explanationNote,
    visibleSections,
    toggleSection: (key: keyof VisibleSections) =>
      setVisibleSections((prev) => ({ ...prev, [key]: !prev[key] })),
    renameDialogOpen,
    setRenameDialogOpen,
    shareDialogOpen,
    setShareDialogOpen,
    handlePromptSubmit,
    handleSelectTemplate,
    handleClarificationOption,
    applyFilterChange,
    handleFollowUp,
    handleRefresh,
    handleSave,
    handleDuplicateCurrent,
    handleOpenSaved,
    handleOpenRecent,
    handleRenameDashboard,
    handleRenameCurrent,
    handleDuplicateSaved,
    handleShareDashboard,
    handleDeleteDashboard,
    exportCsv: () => {
      exportSpecAsCsv(currentSpec);
      toast.success('Exported CSV figures');
    },
    exportJson: () => {
      exportSpecAsJson(currentSpec);
      toast.success('Exported DashboardSpec JSON');
    },
  };
}
