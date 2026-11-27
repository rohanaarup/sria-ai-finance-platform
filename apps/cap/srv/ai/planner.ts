/**
 * Planner
 * Phase 7 — AI Planning, Tool Orchestration & Controlled Execution
 *
 * Generates a bounded DataPlan conforming to DataPlanSchema from @sria/contracts.
 *
 * RULES:
 *  - Strict budget: plans never exceed max allowed steps (default: 3).
 *  - Resolves data source (mock vs s4hana) using server-side configuration.
 *  - Validates all target metrics against BASELINE_METRIC_CATALOG.
 */

import { randomUUID } from 'node:crypto';
import { loadConfig } from '../lib/config/app-config.ts';
import type { EnvironmentTier } from '../lib/config/app-config.ts';
import { defaultMetricRegistry } from '../finance-metric-registry.ts';
import type { FinanceMetricRegistry } from '../finance-metric-registry.ts';
import {
  DataPlanSchema,
  BASELINE_METRIC_CATALOG
} from '@sria/contracts';
import type {
  DataPlan,
  DashboardRequest,
  MetricId,
  SupportedDimension
} from '@sria/contracts';

export interface PlannerConfig {
  maxSteps?: number;
  resolvedSource?: 'mock' | 's4hana';
  tier?: EnvironmentTier;
  registry?: FinanceMetricRegistry;
}

export class Planner {
  private readonly _maxSteps: number;
  private readonly _resolvedSource: 'mock' | 's4hana';
  private readonly _tier: EnvironmentTier;
  private readonly _registry: FinanceMetricRegistry;

  constructor(config?: PlannerConfig) {
    this._maxSteps = config?.maxSteps ?? 3;
    this._tier = config?.tier ?? loadConfig().tier;
    this._registry = config?.registry ?? defaultMetricRegistry;
    this._resolvedSource =
      config?.resolvedSource ??
      loadConfig().financeProvider;
  }

  /**
   * Builds a strictly validated DataPlan from a validated DashboardRequest.
   */
  createPlan(request: DashboardRequest): DataPlan {
    // 1. Verify metric IDs are strictly allowlisted
    for (const metric of request.metricIds) {
      if (!BASELINE_METRIC_CATALOG[metric as MetricId]) {
        throw new Error(`[Planner] Cannot plan for unknown metric: "${metric}"`);
      }
    }

    // 1b. Approval gate: the metric must be executable in the active environment tier
    this._registry.assertExecutable(request.metricIds, this._tier);

    // 2. Validate filters
    if (!request.filters?.companyCode) {
      throw new Error('[Planner] Cannot construct DataPlan: missing companyCode in filters.');
    }
    if (!request.filters?.fiscalYear) {
      throw new Error('[Planner] Cannot construct DataPlan: missing fiscalYear in filters.');
    }

    // 3. Construct single-step or multi-step execution plan
    // In MVP, data retrieval is consolidated into bounded get_finance_metrics calls
    const targetMetrics = request.metricIds as MetricId[];
    const dimensions = (request.dimensions || ['fiscal_period']) as SupportedDimension[];

    const steps = [
      {
        stepNumber: 1,
        action: 'fetch_records' as const,
        tool: 'get_finance_metrics' as const,
        targetMetrics,
        dimensions,
        filters: request.filters,
        sourceType: this._resolvedSource,
        estimatedRows: 100
      }
    ];

    if (steps.length > this._maxSteps) {
      throw new Error(
        `[Planner] Proposed plan exceeds step budget of ${this._maxSteps} (got ${steps.length}).`
      );
    }

    const planPayload = {
      planVersion: '1.0' as const,
      planId: randomUUID(),
      requestId: request.requestId,
      organizationId: request.organizationId,
      userId: request.userId,
      status: 'PLANNED' as const,
      steps,
      createdAt: new Date().toISOString(),
      resolvedSource: this._resolvedSource
    };

    // Strict validation against shared contracts schema
    return DataPlanSchema.parse(planPayload);
  }
}

