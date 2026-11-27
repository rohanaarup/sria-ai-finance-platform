/**
 * Orchestrator
 * Phase 7 — AI Planning, Tool Orchestration & Controlled Execution
 *
 * Drives the bounded state machine workflow:
 *   INTERPRET → VALIDATE_REQUEST → PLAN → AUTHORIZE_PLAN → EXECUTE → VALIDATE_RESULT → RESPOND
 *
 * SAFEGUARDS:
 *  - Enforces step budget (maxSteps).
 *  - Timeout & cancellation support.
 *  - Duplicate tool-call prevention (idempotent call hashing).
 *  - Server-side authorization check before every tool execution.
 *  - Generates structured execution trace without raw financial data.
 */

import { randomUUID } from 'node:crypto';
import type { DashboardRequest, DataPlan } from '@sria/contracts';
import { WorkflowStateMachine } from './workflow-state.ts';
import type { WorkflowState } from './workflow-state.ts';
import { ToolRegistry } from './tool-registry.ts';
import type { ExecutionContext } from './tool-registry.ts';
import { createGetFinanceMetricsTool } from './tools/get-finance-metrics.ts';
import type { GetFinanceMetricsResult } from './tools/get-finance-metrics.ts';
import { Planner } from './planner.ts';

// ─── Execution Trace & Result Types ───────────────────────────────────────────

export interface ToolCallTrace {
  tool: string;
  stepNumber: number;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
}

export interface ExecutionTrace {
  traceId: string;
  planId: string;
  organizationId: string;
  userId: string;
  startTime: string;
  endTime: string;
  totalDurationMs: number;
  stepsExecuted: number;
  statesVisited: WorkflowState[];
  toolCalls: ToolCallTrace[];
}

export interface OrchestratorResult {
  status: 'SUCCESS' | 'FAILED';
  plan: DataPlan;
  results: GetFinanceMetricsResult[];
  trace: ExecutionTrace;
  error?: string;
}

export interface OrchestratorOptions {
  maxSteps?: number;
  timeoutMs?: number;
  toolRegistry?: ToolRegistry;
  planner?: Planner;
}

export class Orchestrator {
  private readonly _maxSteps: number;
  private readonly _timeoutMs: number;
  private readonly _registry: ToolRegistry;
  private readonly _planner: Planner;

  constructor(options?: OrchestratorOptions) {
    this._maxSteps = options?.maxSteps ?? 5;
    this._timeoutMs = options?.timeoutMs ?? 10000;
    this._planner = options?.planner ?? new Planner({ maxSteps: this._maxSteps });

    if (options?.toolRegistry) {
      this._registry = options.toolRegistry;
    } else {
      this._registry = new ToolRegistry();
      this._registry.register(createGetFinanceMetricsTool());
    }
  }

  /**
   * Execute the end-to-end plan execution flow.
   */
  async executeRequest(
    request: DashboardRequest,
    ctx: ExecutionContext
  ): Promise<OrchestratorResult> {
    // G2-02: one in-memory cache per run so repeated identical data-product queries are reused (never persisted)
    ctx = { ...ctx, runCache: ctx.runCache ?? new Map() };
    const fsm = new WorkflowStateMachine();
    const traceId = randomUUID();
    const startTime = Date.now();
    const toolCallTraces: ToolCallTrace[] = [];
    const executionResults: GetFinanceMetricsResult[] = [];
    const seenCallSignatures = new Set<string>();

    let plan!: DataPlan;

    try {
      // 1. VALIDATE_REQUEST
      fsm.transitionTo('PLANNING', 'Request validated, generating plan');

      // 2. PLAN
      plan = this._planner.createPlan(request);
      plan.status = 'VALIDATED';

      // 3. AUTHORIZE_PLAN
      fsm.transitionTo('AUTHORIZING_PLAN', 'Validating server permissions for plan');
      this._authorizeContext(ctx);

      // 4. EXECUTE_TOOLS
      fsm.transitionTo('EXECUTING_TOOLS', 'Executing planned tool steps');
      plan.status = 'EXECUTING';

      if (plan.steps.length > this._maxSteps) {
        throw new Error(
          `[Orchestrator] Step budget exceeded: plan has ${plan.steps.length} steps (max allowed: ${this._maxSteps})`
        );
      }

      for (const step of plan.steps) {
        const stepStart = Date.now();

        // Check overall timeout
        if (Date.now() - startTime > this._timeoutMs) {
          throw new Error(`[Orchestrator] Execution exceeded timeout of ${this._timeoutMs}ms.`);
        }

        // Prepare tool parameters from step
        const toolParams = {
          companyCode: step.filters?.companyCode || '',
          fiscalYear: step.filters?.fiscalYear || 2026,
          ...(step.filters?.periodFrom ? { fiscalPeriod: step.filters.periodFrom } : {}),
          metrics: step.targetMetrics
        };

        // Duplicate call protection
        const callSig = `${step.tool}:${JSON.stringify(toolParams)}`;
        if (seenCallSignatures.has(callSig)) {
          throw new Error(
            `[Orchestrator] Duplicate tool call detected in same plan: ${step.tool}`
          );
        }
        seenCallSignatures.add(callSig);

        try {
          const result = (await this._registry.execute(
            step.tool,
            toolParams,
            ctx
          )) as GetFinanceMetricsResult;

          executionResults.push(result);

          toolCallTraces.push({
            tool: step.tool,
            stepNumber: step.stepNumber,
            durationMs: Date.now() - stepStart,
            status: 'SUCCESS'
          });
        } catch (toolErr) {
          toolCallTraces.push({
            tool: step.tool,
            stepNumber: step.stepNumber,
            durationMs: Date.now() - stepStart,
            status: 'FAILED',
            error: (toolErr as Error).message
          });
          throw toolErr;
        }
      }

      // 5. VALIDATING_RESULTS
      fsm.transitionTo('VALIDATING_RESULTS', 'Checking bounds and integrity of tool results');
      this._validateResults(executionResults);

      // 6. COMPLETED
      fsm.transitionTo('COMPLETED', 'All steps executed successfully');
      plan.status = 'COMPLETED';

      const endTime = Date.now();
      const trace: ExecutionTrace = {
        traceId,
        planId: plan.planId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        totalDurationMs: endTime - startTime,
        stepsExecuted: executionResults.length,
        statesVisited: fsm.transitions.map((t) => t.to),
        toolCalls: toolCallTraces
      };

      return {
        status: 'SUCCESS',
        plan,
        results: executionResults,
        trace
      };
    } catch (err) {
      if (fsm.currentState !== 'FAILED') {
        fsm.transitionTo('FAILED', (err as Error).message);
      }
      if (plan) {
        plan.status = 'FAILED';
        plan.rejectionReason = (err as Error).message;
      }

      const endTime = Date.now();
      const trace: ExecutionTrace = {
        traceId,
        planId: plan?.planId || 'UNPLANNED',
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        totalDurationMs: endTime - startTime,
        stepsExecuted: executionResults.length,
        statesVisited: fsm.transitions.map((t) => t.to),
        toolCalls: toolCallTraces
      };

      return {
        status: 'FAILED',
        plan,
        results: executionResults,
        trace,
        error: (err as Error).message
      };
    }
  }

  // ─── Private Verification Guards ────────────────────────────────────────────

  private _authorizeContext(ctx: ExecutionContext): void {
    if (!ctx.organizationId || ctx.organizationId.trim() === '') {
      throw new Error('[Orchestrator] Security violation: missing trusted organization context.');
    }
    if (!ctx.userId || ctx.userId.trim() === '') {
      throw new Error('[Orchestrator] Security violation: missing trusted user context.');
    }
    // Scope hierarchy verification
    const allowedRoles = ['FinanceAnalyst', 'FinanceManager', 'TenantAdmin'];
    const hasRole = ctx.userRoles?.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      throw new Error(
        `[Orchestrator] Authorization failure: user lacks Finance permissions. Roles: [${ctx.userRoles?.join(', ')}]`
      );
    }
  }

  private _validateResults(results: GetFinanceMetricsResult[]): void {
    if (results.length === 0) {
      throw new Error('[Orchestrator] Tool execution yielded zero metric results.');
    }
    for (const r of results) {
      for (const m of r.metrics) {
        if (Number.isNaN(m.value) || !Number.isFinite(m.value)) {
          throw new Error(`[Orchestrator] Metric "${m.metricId}" returned non-finite value: ${m.value}`);
        }
      }
    }
  }
}

