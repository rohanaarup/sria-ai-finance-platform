/**
 * Frontend API Client
 * Connects the React UI to authenticated SAP CAP endpoints.
 *
 * Local synthetic fallback (bundled fixtures, in-browser calculation, localStorage
 * dashboards) is available ONLY in explicit demo mode:
 *   import.meta.env.VITE_DEMO_MODE === 'true' && !import.meta.env.PROD
 * (or ApiClient.setDemoMode(true), used by unit tests). Otherwise backend failures
 * surface as typed errors (ApiUnavailableError / ApiAuthError) - never fake data.
 */

import {
  BASELINE_METRIC_CATALOG,
  MetricCatalogEntrySchema,
  SYNTHETIC_FINANCE_RECORDS,
} from '@sria/contracts';
import type {
  MetricCatalogEntry,
  MetricVersion,
  DashboardRequest,
  ClarificationQuestion,
  MetricResult,
  DashboardSpec,
  MetricId,
  FinanceRecord,
  ProvenanceMetadata,
} from '@sria/contracts';

export type EnvironmentTier = 'mock' | 'local' | 'pilot' | 'production' | 'unknown';

/** Backend rejected the credentials / permissions (HTTP 401 or 403). Never triggers fallback. */
export class ApiAuthError extends Error {
  readonly status: number;
  constructor(status: number, message?: string) {
    super(message || (status === 401 ? 'Authentication required (HTTP 401).' : 'Access denied (HTTP 403).'));
    this.name = 'ApiAuthError';
    this.status = status;
  }
}

/** Backend unreachable or returned a non-auth failure while demo mode is off. */
export class ApiUnavailableError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiUnavailableError';
    this.status = status;
  }
}

export interface UnderstandResponse {
  status: 'RESOLVED' | 'CLARIFICATION_REQUIRED' | 'REJECTED';
  resolvedRequest?: DashboardRequest;
  clarifications?: ClarificationQuestion[];
  rejectionReason?: string;
  supportedMetrics?: string[];
}

export interface ExecutionResponse {
  status: 'SUCCESS' | 'FAILED';
  planJson?: string;
  resultsJson?: string;
  traceJson?: string;
  error?: string;
}

export interface SystemHealthStatus {
  backendReachable: boolean;
  service: string;
  providerMode: 'mock' | 's4hana';
  isSynthetic: boolean;
  statusMessage: string;
  aiProvider: string;
  databaseDialect: string;
  environmentTier: EnvironmentTier;
}

export interface ApprovedMetricSummary {
  metricId: string;
  label: string;
  category: string;
  formulaOrAggregation: string;
  supportedDimensions: string;
  enabled: boolean;
  approvalStatus: string;
}

export interface PeriodSeriesPoint {
  period: string;
  label: string;
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  profit_margin: number;
  isZeroDenominator: boolean;
  currency: string;
}

export interface BusinessUnitSlice {
  businessUnit: string;
  label: string;
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  currency: string;
}

export interface CompanyComparisonPoint {
  companyCode: string;
  label: string;
  results: MetricResult[];
}

const getBaseUrl = () => (typeof window !== 'undefined' ? '' : 'http://127.0.0.1:4004');
const isNodeTest = () => typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

// Demo mode: explicit opt-in, never in production builds. `import.meta.env` only exists under
// Vite, so access is guarded for plain `node --test`.
let demoOverride: boolean | null = null;
const viteEnv = (): Record<string, unknown> => (import.meta as any).env ?? {};
const isDemoMode = (): boolean => {
  if (demoOverride !== null) return demoOverride;
  const env = viteEnv();
  return env.VITE_DEMO_MODE === 'true' && !env.PROD;
};
/** In unit tests with demo mode on, skip the network entirely (deterministic, fast). */
const localOnly = () => isDemoMode() && isNodeTest();

/**
 * Decide what to do with a failed backend call. 401/403 and non-demo failures throw;
 * returning normally means "fall back to local demo data".
 */
function failOrFallback(err: unknown, what: string): void {
  if (err instanceof ApiAuthError) throw err;
  if (!isDemoMode()) {
    if (err instanceof ApiUnavailableError) throw err;
    throw new ApiUnavailableError(
      `${what}: backend unreachable (${err instanceof Error ? err.message : String(err)}).`
    );
  }
  console.warn(`[ApiClient] ${what} failed, demo-mode local fallback in use:`, err);
}

/** Throws ApiAuthError for 401/403 and ApiUnavailableError for any other non-OK status. */
function assertOk(res: Response, what: string): void {
  if (res.status === 401 || res.status === 403) throw new ApiAuthError(res.status);
  if (!res.ok) throw new ApiUnavailableError(`${what} failed with HTTP ${res.status}.`, res.status);
}

function normalizeTier(v: unknown): EnvironmentTier {
  return v === 'mock' || v === 'local' || v === 'pilot' || v === 'production' ? v : 'unknown';
}

const BUSINESS_UNIT_LABELS: Record<string, string> = {
  BU_COMMERCIAL: 'Commercial',
  BU_OPERATIONS: 'Operations',
  BU_ADMIN: 'Administration',
  BU_MARKETING: 'Marketing',
  BU_SHARED_SERVICES: 'Shared Services',
};

function computeFromRecords(
  records: FinanceRecord[],
  metricIds: MetricId[],
  provenance: ProvenanceMetadata
): MetricResult[] {
  let revenue = 0;
  let expenses = 0;
  const currency = records[0]?.currency || 'USD';

  for (const r of records) {
    if (r.accountType === 'REVENUE') {
      revenue += r.debitCredit === 'C' ? r.amount : -r.amount;
    } else if (r.accountType === 'EXPENSE') {
      expenses += r.debitCredit === 'D' ? r.amount : -r.amount;
    }
  }

  revenue = Math.round(revenue * 100) / 100;
  expenses = Math.round(expenses * 100) / 100;
  const netProfit = Math.round((revenue - expenses) * 100) / 100;
  const isZeroDenom = revenue === 0;
  const margin = isZeroDenom ? 0 : Math.round(((netProfit / revenue) * 100) * 100) / 100;

  const fmt = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);

  const all: MetricResult[] = [
    {
      metricId: 'total_revenue',
      label: 'Total Revenue',
      value: revenue,
      formattedValue: fmt(revenue),
      currency,
      provenance,
    },
    {
      metricId: 'total_expenses',
      label: 'Total Expenses',
      value: expenses,
      formattedValue: fmt(expenses),
      currency,
      provenance,
    },
    {
      metricId: 'net_profit',
      label: 'Net Profit',
      value: netProfit,
      formattedValue: fmt(netProfit),
      currency,
      provenance,
    },
    {
      metricId: 'profit_margin',
      label: 'Profit Margin',
      value: margin,
      formattedValue: `${margin.toFixed(2)}%`,
      currency: 'PCT',
      isZeroDenominator: isZeroDenom,
      provenance,
    },
  ];

  return all.filter((m) => metricIds.includes(m.metricId));
}

/**
 * Demo-mode-only semantic catalog built from the contract baseline. Nothing is approved
 * (activeVersion null, latest version PENDING_REVIEW); `executable` is true because the mock
 * tier allows pending metrics to run. Never used when demo mode is off.
 */
const DEMO_FORMULAS: Record<
  MetricId,
  Pick<MetricVersion, 'kind' | 'accountType' | 'signRule' | 'expression' | 'unit' | 'dependsOn'>
> = {
  total_revenue: { kind: 'BASE', accountType: 'REVENUE', signRule: 'CREDIT_POSITIVE', expression: null, unit: 'CURRENCY', dependsOn: [] },
  total_expenses: { kind: 'BASE', accountType: 'EXPENSE', signRule: 'DEBIT_POSITIVE', expression: null, unit: 'CURRENCY', dependsOn: [] },
  net_profit: {
    kind: 'DERIVED',
    accountType: null,
    signRule: null,
    expression: 'total_revenue - total_expenses',
    unit: 'CURRENCY',
    dependsOn: ['total_revenue', 'total_expenses'],
  },
  profit_margin: {
    kind: 'DERIVED',
    accountType: null,
    signRule: null,
    expression: '(net_profit / total_revenue) * 100',
    unit: 'PERCENT',
    dependsOn: ['net_profit', 'total_revenue'],
  },
};

export function buildDemoMetricCatalog(): MetricCatalogEntry[] {
  return Object.values(BASELINE_METRIC_CATALOG).map((m) => {
    const formula = DEMO_FORMULAS[m.id];
    const map = m.sapFieldMapping;
    return {
      metricId: m.id,
      label: m.label,
      category: m.category,
      description: m.description,
      owner: m.owner,
      tenantId: null,
      activeVersion: null,
      latestVersion: {
        id: `${m.id}@v1`,
        metricId: m.id,
        version: 1,
        status: 'PENDING_REVIEW',
        ...formula,
        decimals: 2,
        effectiveFrom: '2026-01-01',
        proposedBy: 'baseline-catalog',
        approvedBy: null,
        approvedAt: null,
      },
      executable: true,
      aliases: [],
      lineage: map
        ? [
            {
              metricId: m.id,
              sourceSystem: formula.kind === 'BASE' ? 'SAP S/4HANA (candidate)' : 'Derived (calculation engine)',
              entitySet: map.suggestedEntitySet,
              field: map.suggestedAmountField,
              mappingStatus: m.sourceMappingStatus,
              evidence: map.mappingEvidence,
            },
          ]
        : [],
    };
  });
}

export class ApiClient {
  /** Enable/disable demo mode (null = revert to the VITE_DEMO_MODE build flag). */
  static setDemoMode(value: boolean | null): void {
    demoOverride = value;
  }

  static isDemoMode(): boolean {
    return isDemoMode();
  }

  /**
   * Health-check
   */
  static async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${getBaseUrl()}/health`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Rich system health and data provider status
   */
  static async getSystemStatus(): Promise<SystemHealthStatus> {
    if (localOnly()) {
      return {
        backendReachable: false,
        service: 'offline-test',
        providerMode: 'mock',
        isSynthetic: true,
        statusMessage: 'Test runtime - synthetic fixtures active.',
        aiProvider: 'mock',
        databaseDialect: 'sqlite',
        environmentTier: 'unknown',
      };
    }

    try {
      const [healthRes, providerRes] = await Promise.allSettled([
        fetch(`${getBaseUrl()}/health`, { signal: AbortSignal.timeout(1500) }),
        fetch(`${getBaseUrl()}/api/finance/GetProviderStatus()`, {
          signal: AbortSignal.timeout(1500),
        }),
      ]);

      const healthOk = healthRes.status === 'fulfilled' && healthRes.value.ok;
      const healthData = healthOk ? await healthRes.value.json() : null;
      const providerOk = providerRes.status === 'fulfilled' && providerRes.value.ok;
      const providerData = providerOk ? await providerRes.value.json() : null;

      return {
        backendReachable: healthOk,
        service: healthData?.service || 'sria-cap-backend',
        providerMode:
          providerData?.providerType === 's4hana' ||
          healthData?.components?.dataProvider?.mode === 's4hana'
            ? 's4hana'
            : 'mock',
        isSynthetic: providerData?.isSynthetic ?? true,
        statusMessage:
          providerData?.statusMessage ||
          (healthOk
            ? 'Connected to SAP CAP runtime.'
            : isDemoMode()
            ? 'CAP backend offline - demo mode, local synthetic data.'
            : 'CAP backend unreachable.'),
        aiProvider: healthData?.components?.aiEngine?.provider || 'mock',
        databaseDialect: healthData?.components?.database?.dialect || 'sqlite',
        environmentTier: normalizeTier(healthData?.environmentTier),
      };
    } catch {
      return {
        backendReachable: false,
        service: isDemoMode() ? 'offline-fallback' : 'unreachable',
        providerMode: 'mock',
        isSynthetic: true,
        statusMessage: isDemoMode()
          ? 'CAP backend unreachable - demo mode, local synthetic data.'
          : 'CAP backend unreachable.',
        aiProvider: 'mock',
        databaseDialect: isDemoMode() ? 'localStorage' : 'unknown',
        environmentTier: 'unknown',
      };
    }
  }

  /**
   * Approved Metric Catalog from CAP MetricCatalogService
   */
  static async getApprovedMetrics(): Promise<ApprovedMetricSummary[]> {
    if (!localOnly()) {
      try {
        const res = await fetch(`${getBaseUrl()}/api/v1/metrics/getApprovedMetrics()`, {
          signal: AbortSignal.timeout(3000),
        });
        assertOk(res, 'Approved metric catalog');
        const data = await res.json();
        const list = data.value || data;
        if (Array.isArray(list) && list.length > 0) return list;
        throw new ApiUnavailableError('Approved metric catalog returned no entries.');
      } catch (err) {
        failOrFallback(err, 'Approved metric catalog');
      }
    }

    return Object.values(BASELINE_METRIC_CATALOG).map((m) => ({
      metricId: m.id,
      label: m.label,
      category: m.category,
      formulaOrAggregation: m.formulaOrAggregation,
      supportedDimensions: m.supportedDimensions.join(', '),
      enabled: m.enabled,
      approvalStatus: m.approvalStatus,
    }));
  }

  /**
   * Semantic layer metric catalog & glossary (G2-01): versions, approval status,
   * executability for the server's tier, aliases and lineage. The OData function returns
   * `{ value: "<JSON string>" }`; the parsed array is validated against the shared contract.
   */
  static async getMetricCatalog(): Promise<MetricCatalogEntry[]> {
    if (!localOnly()) {
      try {
        const res = await fetch(`${getBaseUrl()}/api/v1/semantic/getCatalog()`, {
          signal: AbortSignal.timeout(3000),
        });
        assertOk(res, 'Metric catalog');
        const data = await res.json();
        const raw = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value;
        const parsed = MetricCatalogEntrySchema.array().safeParse(raw);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          throw new ApiUnavailableError(
            `Metric catalog returned an invalid payload${issue ? ` (${issue.path.join('.') || 'root'}: ${issue.message})` : ''}.`
          );
        }
        return parsed.data;
      } catch (err) {
        failOrFallback(err, 'Metric catalog');
      }
    }
    return buildDemoMetricCatalog();
  }

  /**
   * Natural Language Intent Understanding
   */
  static async understandPrompt(prompt: string): Promise<UnderstandResponse> {
    if (localOnly()) {
      return this._localMockUnderstand(prompt);
    }
    try {
      const res = await fetch(`${getBaseUrl()}/api/ai/UnderstandRequest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(2000),
      });

      assertOk(res, 'UnderstandRequest');

      const data = await res.json();
      if (data.status === 'RESOLVED' && data.resolvedRequest) {
        return {
          status: 'RESOLVED',
          resolvedRequest: JSON.parse(data.resolvedRequest),
        };
      }
      if (data.status === 'CLARIFICATION_REQUIRED' && data.clarificationJson) {
        return {
          status: 'CLARIFICATION_REQUIRED',
          clarifications: JSON.parse(data.clarificationJson),
        };
      }
      return {
        status: 'REJECTED',
        rejectionReason: data.rejectionReason || 'Request could not be understood.',
        supportedMetrics: data.supportedMetrics || [],
      };
    } catch (err) {
      failOrFallback(err, 'UnderstandRequest');
      return this._localMockUnderstand(prompt);
    }
  }

  /**
   * Execute Plan & Retrieve Calculated Metrics
   */
  static async executeRequest(request: DashboardRequest): Promise<{
    results: MetricResult[];
    sourceType: 'mock' | 's4hana';
    isSynthetic: boolean;
  }> {
    if (localOnly()) {
      return this._localMockExecution(request);
    }
    try {
      const res = await fetch(`${getBaseUrl()}/api/orchestration/ExecutePlan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestJson: JSON.stringify(request) }),
        signal: AbortSignal.timeout(2500),
      });

      assertOk(res, 'ExecutePlan');
      {
        const data = await res.json();
        if (data.status !== 'SUCCESS' || !data.resultsJson) {
          throw new ApiUnavailableError(data.error || 'ExecutePlan did not return results.');
        }
        {
          const rawResults = JSON.parse(data.resultsJson);
          const firstBatch = rawResults[0];
          const sourceType: 'mock' | 's4hana' = firstBatch?.sourceType || 'mock';
          const isSynthetic: boolean = firstBatch?.isSynthetic ?? true;
          const provenance: ProvenanceMetadata = {
            sourceType,
            sourceSystem: isSynthetic ? 'SAP_SYNTHETIC_OFFLINE_FIXTURE' : 'SAP_S4HANA_LIVE',
            retrievedAt: firstBatch?.calculatedAt || new Date().toISOString(),
            calculationVersion: '1.0.0',
            isSynthetic,
            appliedFilters: request.filters as Record<string, unknown>,
          };

          const metrics: MetricResult[] = (firstBatch?.metrics || []).map((m: any) => ({
            metricId: m.metricId as MetricId,
            label: m.label,
            value: Number(m.value),
            formattedValue: m.formattedValue,
            currency: m.currency,
            isZeroDenominator: m.isZeroDenominator,
            provenance: m.provenance || provenance,
          }));

          return {
            results: metrics,
            sourceType,
            isSynthetic,
          };
        }
      }
    } catch (err) {
      failOrFallback(err, 'ExecutePlan');
    }

    return this._localMockExecution(request);
  }

  /**
   * Fetch genuine period-by-period figures from CAP FinanceDataService (or synthetic records offline)
   * Avoids fabricated trend splits.
   */
  static async fetchPeriodBreakdown(
    companyCode: string,
    fiscalYear: number
  ): Promise<PeriodSeriesPoint[]> {
    const periods = ['01', '02'];
    const points: PeriodSeriesPoint[] = [];

    for (const period of periods) {
      const data = await this._fetchFinanceSlice({ companyCode, fiscalYear, fiscalPeriod: period });
      if (data && (data.total_revenue !== 0 || data.total_expenses !== 0)) {
        points.push({
          period,
          label: `FY${fiscalYear} P${period}`,
          ...data,
        });
      }
    }

    return points;
  }

  /**
   * Fetch genuine Business Unit breakdown using FinanceDataService.GetFinanceMetrics
   */
  static async fetchBusinessUnitBreakdown(
    companyCode: string,
    fiscalYear: number,
    fiscalPeriod?: string
  ): Promise<BusinessUnitSlice[]> {
    const units = Object.keys(BUSINESS_UNIT_LABELS);
    const slices: BusinessUnitSlice[] = [];

    const responses = await Promise.all(
      units.map(async (bu) => ({
        bu,
        data: await this._fetchFinanceSlice({
          companyCode,
          fiscalYear,
          fiscalPeriod,
          businessUnit: bu,
        }),
      }))
    );

    for (const { bu, data } of responses) {
      if (data && (data.total_revenue !== 0 || data.total_expenses !== 0)) {
        slices.push({
          businessUnit: bu,
          label: BUSINESS_UNIT_LABELS[bu] || bu,
          total_revenue: data.total_revenue,
          total_expenses: data.total_expenses,
          net_profit: data.net_profit,
          currency: data.currency,
        });
      }
    }

    return slices;
  }

  /**
   * Fetch comparison metrics across Company 1000 and Company 2000
   */
  static async fetchCompanyComparison(
    fiscalYear: number,
    metricIds: MetricId[],
    fiscalPeriod?: string
  ): Promise<CompanyComparisonPoint[]> {
    const companies = [
      { code: '1000', label: 'Company 1000 (HQ)' },
      { code: '2000', label: 'Company 2000 (Subsidiary)' },
    ];

    const out = await Promise.all(
      companies.map(async (co) => {
        const exec = await this.executeRequest({
          version: '1.0',
          rawPrompt: `Comparison for company ${co.code} FY ${fiscalYear}`,
          metricIds,
          dimensions: ['company_code'],
          filters: {
            companyCode: co.code,
            fiscalYear,
            ...(fiscalPeriod ? { periodFrom: fiscalPeriod, periodTo: fiscalPeriod } : {}),
          },
          organizationId: 'ORG_ACME_PILOT',
          userId: 'finance_analyst',
        });
        return {
          companyCode: co.code,
          label: co.label,
          results: exec.results,
        };
      })
    );

    return out;
  }

  private static async _fetchFinanceSlice(params: {
    companyCode: string;
    fiscalYear: number;
    fiscalPeriod?: string;
    businessUnit?: string;
  }): Promise<{
    total_revenue: number;
    total_expenses: number;
    net_profit: number;
    profit_margin: number;
    isZeroDenominator: boolean;
    currency: string;
  } | null> {
    if (!localOnly()) {
      try {
        const res = await fetch(`${getBaseUrl()}/api/finance/GetFinanceMetrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(2000),
        });
        assertOk(res, 'GetFinanceMetrics');
        {
          const data = await res.json();
          const metrics: any[] = data.metrics || [];
          const find = (id: string) => metrics.find((m) => m.metricId === id);
          const rev = find('total_revenue');
          const exp = find('total_expenses');
          const prof = find('net_profit');
          const marg = find('profit_margin');
          return {
            total_revenue: Number(rev?.value ?? 0),
            total_expenses: Number(exp?.value ?? 0),
            net_profit: Number(prof?.value ?? 0),
            profit_margin: Number(marg?.value ?? 0),
            isZeroDenominator: Boolean(marg?.isZeroDenominator),
            currency: rev?.currency || exp?.currency || 'USD',
          };
        }
      } catch (err) {
        failOrFallback(err, 'GetFinanceMetrics');
      }
    }

    const matched = SYNTHETIC_FINANCE_RECORDS.filter((r) => {
      if (r.companyCode !== params.companyCode) return false;
      if (r.fiscalYear !== params.fiscalYear) return false;
      if (params.fiscalPeriod && r.fiscalPeriod !== params.fiscalPeriod) return false;
      if (params.businessUnit && r.businessUnit !== params.businessUnit) return false;
      return true;
    });

    if (matched.length === 0) return null;

    const provenance: ProvenanceMetadata = {
      sourceType: 'mock',
      sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
      retrievedAt: new Date().toISOString(),
      calculationVersion: '1.0.0',
      isSynthetic: true,
    };

    const computed = computeFromRecords(
      matched,
      ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'],
      provenance
    );
    const get = (id: MetricId) => computed.find((m) => m.metricId === id);

    return {
      total_revenue: get('total_revenue')?.value ?? 0,
      total_expenses: get('total_expenses')?.value ?? 0,
      net_profit: get('net_profit')?.value ?? 0,
      profit_margin: get('profit_margin')?.value ?? 0,
      isZeroDenominator: Boolean(get('profit_margin')?.isZeroDenominator),
      currency: get('total_revenue')?.currency || 'USD',
    };
  }

  // ─── Lifecycle & Follow-up API Methods ──────────────────────────────────────

  /**
   * Save active dashboard configuration to database
   */
  static async saveDashboard(
    title: string,
    spec: DashboardSpec,
    description?: string
  ): Promise<{ dashboardId: string; status: string }> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/SaveDashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || spec.description,
          specJson: JSON.stringify(spec),
        }),
      });
      assertOk(res, 'SaveDashboard');
      const data = await res.json();
      return { dashboardId: data.dashboardId, status: data.status };
    } catch (err) {
      failOrFallback(err, 'SaveDashboard');
    }

    const localId = `local-${Date.now()}`;
    const localStore = JSON.parse(localStorage.getItem('sria_saved_dashboards') || '[]');
    localStore.push({
      id: localId,
      title,
      description: description || spec.description,
      createdAt: new Date().toISOString(),
      version: '1.0',
      isStale: true,
      spec,
    });
    localStorage.setItem('sria_saved_dashboards', JSON.stringify(localStore));
    return { dashboardId: localId, status: 'SAVED' };
  }

  /**
   * List saved dashboards from database
   */
  static async listDashboards(): Promise<
    Array<{
      id: string;
      title: string;
      description?: string;
      createdAt: string;
      version: string;
      isStale: boolean;
    }>
  > {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/ListDashboards()`);
      assertOk(res, 'ListDashboards');
      const data = await res.json();
      const items = data.value || data;
      if (!Array.isArray(items)) throw new ApiUnavailableError('ListDashboards returned an unexpected payload.');
      return items.map((item: any) => ({
        id: item.ID || item.id,
        title: item.title,
        description: item.description,
        createdAt: item.createdAt || new Date().toISOString(),
        version: '1.0',
        isStale: item.isStale ?? true,
      }));
    } catch (err) {
      failOrFallback(err, 'ListDashboards');
    }

    const localStore = JSON.parse(localStorage.getItem('sria_saved_dashboards') || '[]');
    return localStore.map((d: any) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      createdAt: d.createdAt,
      version: d.version,
      isStale: true,
    }));
  }

  /**
   * Reopen a saved dashboard specification
   */
  static async reopenDashboard(
    dashboardId: string
  ): Promise<{ spec: DashboardSpec; isStale: boolean }> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/ReopenDashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId }),
      });
      assertOk(res, 'ReopenDashboard');
      const data = await res.json();
      return {
        spec: JSON.parse(data.specJson),
        isStale: data.isStale ?? true,
      };
    } catch (err) {
      failOrFallback(err, 'ReopenDashboard');
    }

    const localStore = JSON.parse(localStorage.getItem('sria_saved_dashboards') || '[]');
    const match = localStore.find((d: any) => d.id === dashboardId);
    if (match && match.spec) {
      return { spec: match.spec, isStale: true };
    }
    throw new Error(`Dashboard ${dashboardId} not found.`);
  }

  /**
   * Rename a dashboard
   */
  static async renameDashboard(dashboardId: string, newTitle: string): Promise<boolean> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/RenameDashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId, newTitle }),
      });
      assertOk(res, 'RenameDashboard');
      return true;
    } catch (err) {
      failOrFallback(err, 'RenameDashboard');
    }

    const localStore = JSON.parse(localStorage.getItem('sria_saved_dashboards') || '[]');
    const match = localStore.find((d: any) => d.id === dashboardId);
    if (match) {
      match.title = newTitle;
      if (match.spec) match.spec.title = newTitle;
      localStorage.setItem('sria_saved_dashboards', JSON.stringify(localStore));
      return true;
    }
    return false;
  }

  /**
   * Share a saved dashboard with another user via CAP ShareDashboard
   */
  static async shareDashboard(
    dashboardId: string,
    sharedWithUserId: string,
    permission: 'READ' | 'EDIT'
  ): Promise<{ status: string; sharedWithUserId: string; permission: string }> {
    const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/ShareDashboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardId, sharedWithUserId, permission }),
    });
    assertOk(res, 'ShareDashboard');
    const data = await res.json();
    return {
      status: data.status || 'SHARED',
      sharedWithUserId: data.sharedWithUserId || sharedWithUserId,
      permission: data.permission || permission,
    };
  }

  /**
   * Delete a dashboard
   */
  static async deleteDashboard(dashboardId: string): Promise<boolean> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/DeleteDashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId }),
      });
      assertOk(res, 'DeleteDashboard');
      return true;
    } catch (err) {
      failOrFallback(err, 'DeleteDashboard');
    }

    let localStore = JSON.parse(localStorage.getItem('sria_saved_dashboards') || '[]');
    localStore = localStore.filter((d: any) => d.id !== dashboardId);
    localStorage.setItem('sria_saved_dashboards', JSON.stringify(localStore));
    return true;
  }

  /**
   * Refresh a dashboard's financial data on demand
   */
  static async refreshDashboard(
    dashboardId: string
  ): Promise<{ spec: DashboardSpec; refreshedAt: string }> {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v1/lifecycle/RefreshDashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboardId }),
      });
      assertOk(res, 'RefreshDashboard');
      const data = await res.json();
      return {
        spec: JSON.parse(data.refreshedSpecJson),
        refreshedAt: data.refreshedAt,
      };
    } catch (err) {
      if (err instanceof ApiAuthError || err instanceof ApiUnavailableError) throw err;
      throw new ApiUnavailableError(
        `RefreshDashboard: backend unreachable (${err instanceof Error ? err.message : String(err)}).`
      );
    }
  }

  /**
   * Process a conversational follow-up request
   */
  static async processFollowUp(
    prompt: string,
    currentSpec: DashboardSpec
  ): Promise<{
    spec?: DashboardSpec;
    reusedExistingData: boolean;
    message: string;
    type: 'PRESENTATION_ONLY' | 'DATA_CHANGING' | 'REFRESH' | 'UNSUPPORTED';
    preferredChartMode?: 'bar' | 'line' | 'area' | 'donut';
    explainRequested?: boolean;
  }> {
    const lower = prompt.toLowerCase().trim();

    // 1. Guardrail / Unsupported
    if (
      lower.includes('predict') ||
      lower.includes('forecast') ||
      lower.includes('stock price') ||
      lower.includes('ebitda') ||
      lower.includes('drop') ||
      lower.includes('delete from') ||
      lower.includes('cash flow') ||
      lower.includes('arr') ||
      lower.includes('cogs')
    ) {
      return {
        type: 'UNSUPPORTED',
        reusedExistingData: true,
        message:
          'Unsupported follow-up: Predictive forecasting, unapproved metrics, and direct DB commands are blocked.',
      };
    }

    // 2. Explanation request (deterministic summary of validated figures)
    if (lower.includes('explain') || lower.includes('summarize') || lower.includes('why')) {
      return {
        type: 'PRESENTATION_ONLY',
        reusedExistingData: true,
        explainRequested: true,
        message: 'Generated deterministic explanation from existing validated figures.',
      };
    }

    // 3. Presentation Only (chart switches or rename)
    if (
      lower.includes('bar') ||
      lower.includes('line') ||
      lower.includes('area') ||
      lower.includes('donut') ||
      lower.includes('table') ||
      lower.includes('rename') ||
      lower.includes('title')
    ) {
      let targetType: 'bar_chart' | 'line_chart' | 'table' | undefined;
      let preferredChartMode: 'bar' | 'line' | 'area' | 'donut' | undefined;
      if (lower.includes('area')) {
        targetType = 'line_chart';
        preferredChartMode = 'area';
      } else if (lower.includes('donut') || lower.includes('pie')) {
        preferredChartMode = 'donut';
      } else if (lower.includes('bar')) {
        targetType = 'bar_chart';
        preferredChartMode = 'bar';
      } else if (lower.includes('line')) {
        targetType = 'line_chart';
        preferredChartMode = 'line';
      } else if (lower.includes('table')) {
        targetType = 'table';
      }

      let updatedTitle = currentSpec.title;
      const quoted = prompt.match(/["']([^"']+)["']/);
      if (quoted?.[1]) {
        updatedTitle = quoted[1].trim();
      } else {
        const titleMatch = prompt.match(/(?:rename(?:\s+dashboard)?|title)\s*(?:to|as|=)?\s*[:=]?\s*(.+)$/i);
        if (titleMatch?.[1] && titleMatch[1].trim().length > 0 && !titleMatch[1].toLowerCase().includes('this dashboard')) {
          updatedTitle = titleMatch[1].trim();
        }
      }

      const updatedWidgets = currentSpec.widgets.map((w) => {
        if (targetType && (w.type === 'bar_chart' || w.type === 'line_chart')) {
          return { ...w, type: targetType };
        }
        return w;
      });

      const updatedSpec: DashboardSpec = {
        ...currentSpec,
        title: updatedTitle,
        widgets: updatedWidgets,
      };

      return {
        type: 'PRESENTATION_ONLY',
        spec: updatedSpec,
        preferredChartMode,
        reusedExistingData: true,
        message: 'Presentation updated. Validated calculation figures reused without re-querying SAP.',
      };
    }

    // 4. Data-Changing or Refresh -> Route through understand/execute flow
    return {
      type: 'DATA_CHANGING',
      reusedExistingData: false,
      message: 'Data scope change detected. Triggering fresh authorized retrieval.',
    };
  }

  // ─── Local Fallback for Seamless Offline Demo ───────────────────────────────

  private static _localMockUnderstand(prompt: string): UnderstandResponse {
    const lower = prompt.toLowerCase().trim();

    if (
      lower.includes('ignore previous') ||
      lower.includes('system prompt') ||
      lower.includes('drop table') ||
      lower.includes('delete from') ||
      lower.includes('<script') ||
      lower.includes('union select')
    ) {
      return {
        status: 'REJECTED',
        rejectionReason:
          'The request contains disallowed commands or instructions that violate security policy.',
        supportedMetrics: ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'],
      };
    }

    const unsupportedList = [
      'ebitda',
      'arr',
      'mrr',
      'churn',
      'headcount',
      'stock price',
      'cogs',
      'cash flow',
    ];
    for (const badMetric of unsupportedList) {
      if (lower.includes(badMetric)) {
        return {
          status: 'REJECTED',
          rejectionReason: `Metric "${badMetric.toUpperCase()}" is not supported in the approved SAP S/4HANA metric catalog. Approved metrics: Total Revenue, Total Expenses, Net Profit, Profit Margin.`,
          supportedMetrics: ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'],
        };
      }
    }

    const metricIds: MetricId[] = [];
    if (lower.includes('revenue') || lower.includes('sales')) metricIds.push('total_revenue');
    if (lower.includes('expense') || lower.includes('cost') || lower.includes('spend')) {
      metricIds.push('total_expenses');
    }
    if (lower.includes('profit margin') || lower.includes('margin')) {
      if (!metricIds.includes('profit_margin')) metricIds.push('profit_margin');
    }
    if (
      (lower.includes('profit') || lower.includes('income') || lower.includes('net profit')) &&
      !lower.includes('profit margin')
    ) {
      if (!metricIds.includes('net_profit')) metricIds.push('net_profit');
    }

    const isOverviewIntent =
      lower.includes('overview') ||
      lower.includes('performance') ||
      lower.includes('financial') ||
      lower.includes('all metrics') ||
      lower.includes('complete') ||
      lower.includes('compare') ||
      lower.includes('comparison');

    if (metricIds.length === 0 && isOverviewIntent) {
      metricIds.push('total_revenue', 'total_expenses', 'net_profit', 'profit_margin');
    }

    if (metricIds.length === 0) {
      return {
        status: 'REJECTED',
        rejectionReason: `"${prompt}" is not recognized as a financial reporting request. Supported metrics: Total Revenue, Total Expenses, Net Profit, and Profit Margin (e.g. "Show total revenue for company 1000 in FY 2026").`,
        supportedMetrics: ['total_revenue', 'total_expenses', 'net_profit', 'profit_margin'],
      };
    }

    const hasCompany = lower.includes('1000') || lower.includes('2000') || lower.includes('company');
    if (!hasCompany) {
      return {
        status: 'CLARIFICATION_REQUIRED',
        clarifications: [
          {
            questionId: 'clarify-company-code',
            parameterName: 'companyCode',
            prompt: 'Which SAP company code would you like to view?',
            reason: 'Company code is required to identify the legal reporting entity.',
            options: ['1000', '2000'],
            suggestedDefault: '1000',
          },
        ],
      };
    }

    const companyCode = lower.includes('2000') && !lower.includes('1000') ? '2000' : '1000';
    const yearMatch = prompt.match(/\b(202[0-9])\b/);
    const fiscalYear = yearMatch?.[1] ? parseInt(yearMatch[1], 10) : 2026;

    const periodMatch = prompt.match(/\bperiod\s*(\d{1,2})\b/i);
    const periodFrom = periodMatch?.[1] ? periodMatch[1].padStart(2, '0') : undefined;

    return {
      status: 'RESOLVED',
      resolvedRequest: {
        version: '1.0',
        rawPrompt: prompt,
        metricIds,
        dimensions: ['fiscal_period'],
        filters: {
          companyCode,
          fiscalYear,
          ...(periodFrom ? { periodFrom, periodTo: periodFrom } : {}),
        },
        organizationId: 'ORG_ACME_PILOT',
        userId: 'finance_analyst',
      },
    };
  }

  private static _localMockExecution(request: DashboardRequest) {
    const companyCode = request.filters?.companyCode || '1000';
    const fiscalYear = request.filters?.fiscalYear || 2026;
    const periodFrom = request.filters?.periodFrom;

    const matched = SYNTHETIC_FINANCE_RECORDS.filter((r) => {
      if (r.companyCode !== companyCode) return false;
      if (r.fiscalYear !== fiscalYear) return false;
      if (periodFrom && r.fiscalPeriod !== periodFrom) return false;
      return true;
    });

    const provenance: ProvenanceMetadata = {
      sourceType: 'mock',
      sourceSystem: 'SAP_SYNTHETIC_OFFLINE_FIXTURE',
      retrievedAt: new Date().toISOString(),
      calculationVersion: '1.0.0',
      isSynthetic: true,
      appliedFilters: request.filters as Record<string, unknown>,
    };

    const results = computeFromRecords(matched, request.metricIds, provenance);

    return {
      results,
      sourceType: 'mock' as const,
      isSynthetic: true,
    };
  }
}
