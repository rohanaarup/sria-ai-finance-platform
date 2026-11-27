/**
 * AiService Handler
 * Phase 6 — AI Request Understanding & Clarification Engine
 *
 * Implements the CAP action handler for AiService.UnderstandRequest.
 * Enforces server-side authentication context via AuthGuard.
 */

import cds from '@sap/cds';
import type { Request } from '@sap/cds';
import { AuthGuard } from './lib/auth/auth-guard.ts';
import { IntentService } from './ai/intent-service.ts';
import { ensureSemanticLoaded } from './semantic/runtime.ts';

/** G2-04: the AgentGoal and the AI mode travel alongside the legacy fields (null when the legacy path produced the result). */
function goalFields(r: { goal?: unknown; aiMode?: string; modelId?: string }) {
  return { agentGoalJson: r.goal ? JSON.stringify(r.goal) : null, aiMode: r.aiMode ?? null, modelId: r.modelId ?? null };
}

export default class AiServiceHandler extends cds.ApplicationService {
  private _intentService!: IntentService;

  async init() {
    this._intentService = new IntentService();
    this.on('UnderstandRequest', this.handleUnderstandRequest.bind(this));
    return super.init();
  }

  private async handleUnderstandRequest(req: Request) {
    await ensureSemanticLoaded();
    // 1. Verified identity from the token (fail closed: no defaults)
    const verified = AuthGuard.tenantContext(req, 'FinanceAnalyst');
    const userCtx = { organizationId: verified.organizationId, userId: verified.userId };

    const { prompt } = req.data as { prompt: string };

    if (!prompt || typeof prompt !== 'string') {
      return req.error(400, 'prompt string is required');
    }

    // 2. Process prompt with IntentService
    const result = await this._intentService.processPrompt(prompt, userCtx);

    if (result.status === 'RESOLVED') {
      const dashboardReq = this._intentService.buildDashboardRequest(result, userCtx);
      return {
        status: 'RESOLVED',
        resolvedRequest: JSON.stringify(dashboardReq),
        clarificationJson: null,
        rejectionReason: null,
        supportedMetrics: [],
        ...goalFields(result)
      };
    }

    if (result.status === 'CLARIFICATION_REQUIRED') {
      return {
        status: 'CLARIFICATION_REQUIRED',
        resolvedRequest: null,
        clarificationJson: JSON.stringify(result.questions),
        rejectionReason: null,
        supportedMetrics: [],
        ...goalFields(result)
      };
    }

    // REJECTED
    return {
      status: 'REJECTED',
      resolvedRequest: null,
      clarificationJson: null,
      rejectionReason: result.reason,
      supportedMetrics: result.supportedMetrics,
      ...goalFields(result)
    };
  }
}
