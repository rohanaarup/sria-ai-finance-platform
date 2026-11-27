/**
 * OrchestrationService Handler
 * Phase 7 — AI Planning, Tool Orchestration & Controlled Execution
 *
 * Implements the CAP action handlers for PlanRequest and ExecutePlan.
 * Enforces server-side authentication context via AuthGuard.
 */

import cds from '@sap/cds';
import type { Request } from '@sap/cds';
import { AuthGuard } from './lib/auth/auth-guard.ts';
import { DashboardRequestSchema } from '@sria/contracts';
import { Planner } from './ai/planner.ts';
import { Orchestrator } from './ai/orchestrator.ts';
import { ensureSemanticLoaded } from './semantic/runtime.ts';
import type { ExecutionContext } from './ai/tool-registry.ts';

export default class OrchestrationServiceHandler extends cds.ApplicationService {
  private _planner!: Planner;
  private _orchestrator!: Orchestrator;

  async init() {
    this._planner = new Planner();
    this._orchestrator = new Orchestrator();

    this.on('PlanRequest', this.handlePlanRequest.bind(this));
    this.on('ExecutePlan', this.handleExecutePlan.bind(this));
    return super.init();
  }

  private async handlePlanRequest(req: Request) {
    await ensureSemanticLoaded();
    const ctx = AuthGuard.tenantContext(req, 'FinanceAnalyst');
    const { requestJson } = req.data as { requestJson: string };

    try {
      const parsed = JSON.parse(requestJson);
      // organizationId and userId are bound to the verified token, never to the request body
      parsed.organizationId = ctx.organizationId;
      parsed.userId = ctx.userId;

      const validReq = DashboardRequestSchema.parse(parsed);
      const plan = this._planner.createPlan(validReq);

      return {
        status: 'SUCCESS',
        planJson: JSON.stringify(plan),
        error: null
      };
    } catch (err) {
      return {
        status: 'FAILED',
        planJson: null,
        error: (err as Error).message
      };
    }
  }

  private async handleExecutePlan(req: Request) {
    await ensureSemanticLoaded();
    const verified = AuthGuard.tenantContext(req, 'FinanceAnalyst');
    const { requestJson } = req.data as { requestJson: string };

    const ctx: ExecutionContext = {
      organizationId: verified.organizationId,
      userId: verified.userId,
      userRoles: verified.roles
    };

    try {
      const parsed = JSON.parse(requestJson);
      parsed.organizationId = ctx.organizationId;
      parsed.userId = ctx.userId;

      const validReq = DashboardRequestSchema.parse(parsed);
      const outcome = await this._orchestrator.executeRequest(validReq, ctx);

      return {
        status: outcome.status,
        planJson: JSON.stringify(outcome.plan),
        resultsJson: JSON.stringify(outcome.results),
        traceJson: JSON.stringify(outcome.trace),
        error: outcome.error ?? null
      };
    } catch (err) {
      return {
        status: 'FAILED',
        planJson: null,
        resultsJson: null,
        traceJson: null,
        error: (err as Error).message
      };
    }
  }
}

