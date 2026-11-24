import React, { useState } from 'react';
import type { DashboardSpec, ClarificationQuestion, MetricResult } from '@sria/contracts';
import { PromptInputBar } from '../components/ai/PromptInputBar';
import { ClarificationModal } from '../components/ai/ClarificationModal';
import { WorkflowProgressIndicator } from '../components/ai/WorkflowProgressIndicator';
import type { ProgressStep } from '../components/ai/WorkflowProgressIndicator';
import { DashboardRenderer } from '../components/dashboard/DashboardRenderer';
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

  const handlePromptSubmit = async (promptText: string) => {
    setIsLoading(true);
    setErrorMessage(null);
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
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsLoading(false);
      setCurrentStep(null);
    }
  };

  const handleClarificationOption = (paramName: string, selectedValue: string) => {
    // Append the clarified parameter to the prompt and re-submit
    const updatedPrompt = `${pendingPrompt} (${paramName}: ${selectedValue})`;
    setClarifications(null);
    handlePromptSubmit(updatedPrompt);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '32px auto', padding: '0 24px' }}>
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
    </div>
  );
};
