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

export default class AiServiceHandler extends cds.ApplicationService {
  private _intentService!: IntentService;

  async init() {
    this._intentService = new IntentService();
    this.on('UnderstandRequest', this.handleUnderstandRequest.bind(this));
    return super.init();
  }

  private async handleUnderstandRequest(req: Request) {
    // 1. Authenticate context (requires FinanceAnalyst scope or local fallback)
    const user = AuthGuard.resolveUser(req);
    const userCtx = {
      organizationId: user?.tenant || (req.user as unknown as Record<string, string>)?.['tenant'] || 'local-org',
      userId: user?.id || req.user?.id || 'USER_DEFAULT'
    };

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
        supportedMetrics: []
      };
    }

    if (result.status === 'CLARIFICATION_REQUIRED') {
      return {
        status: 'CLARIFICATION_REQUIRED',
        resolvedRequest: null,
        clarificationJson: JSON.stringify(result.questions),
        rejectionReason: null,
        supportedMetrics: []
      };
    }

    // REJECTED
    return {
      status: 'REJECTED',
      resolvedRequest: null,
      clarificationJson: null,
      rejectionReason: result.reason,
      supportedMetrics: result.supportedMetrics
    };
  }
}
