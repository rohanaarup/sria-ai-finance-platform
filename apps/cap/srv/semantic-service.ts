/**
 * SemanticService handler (G2-01). See semantic-service.cds.
 */
import cds from '@sap/cds';
import { randomUUID } from 'node:crypto';
import { AuthGuard } from './lib/auth/auth-guard.ts';
import { loadConfig } from './lib/config/app-config.ts';
import { getSemanticCatalog, refreshFromDb, ensureSemanticLoaded } from './semantic/runtime.ts';
import { GLOBAL, SemanticValidationError } from './semantic/catalog.ts';
import { FormulaError } from './semantic/formula.ts';

const E = 'sria.finance.';

export default class SemanticService extends cds.ApplicationService {
  async init() {
    this.before('*', () => ensureSemanticLoaded());
    const reader = (req: any) => AuthGuard.tenantContext(req, 'FinanceAnalyst');

    this.on('getCatalog', (req: any) => {
      const ctx = reader(req);
      return JSON.stringify(getSemanticCatalog().catalogEntries(loadConfig().tier, ctx.organizationId));
    });

    this.on('resolveTerm', (req: any) => {
      const ctx = reader(req);
      const term = String(req.data.term ?? '').slice(0, 100);
      if (!term.trim()) return req.error(400, 'term is required');
      return getSemanticCatalog().resolveTerm(term, ctx.organizationId);
    });

    this.on('listExecutable', (req: any) => {
      const ctx = reader(req);
      return getSemanticCatalog().listExecutable(loadConfig().tier, ctx.organizationId);
    });

    this.on('getMetric', (req: any) => {
      const ctx = reader(req);
      const c = getSemanticCatalog();
      const def = c.definition(String(req.data.metricId ?? ''), ctx.organizationId);
      if (!def || (def.tenantId !== GLOBAL && def.tenantId !== ctx.organizationId)) return req.error(404, 'Metric not found');
      return JSON.stringify({ definition: def, versions: c.allVersions(def.metricId, ctx.organizationId) });
    });

    this.on('getLineage', (req: any) => {
      const ctx = reader(req);
      return JSON.stringify(getSemanticCatalog().lineage(String(req.data.metricId ?? ''), ctx.organizationId));
    });

    this.on('getDimensions', (req: any) => JSON.stringify(getSemanticCatalog().dimensions(reader(req).organizationId)));

    this.on('getFiscalCalendar', (req: any) => {
      reader(req);
      const cal = getSemanticCatalog().fiscalCalendar(String(req.data.calendarId || 'K4'));
      return cal ? JSON.stringify(cal) : req.error(404, 'Fiscal calendar not found');
    });

    // ─── propose (always tenant-scoped, PENDING_REVIEW) ──────────────────────
    this.on('proposeMetricVersion', async (req: any) => {
      const ctx = reader(req);
      const d = req.data;
      const catalog = getSemanticCatalog();
      if (!['BASE', 'DERIVED'].includes(d.kind)) return req.error(400, 'kind must be BASE or DERIVED');
      if (!['CURRENCY', 'PERCENT'].includes(d.unit)) return req.error(400, 'unit must be CURRENCY or PERCENT');
      const decimals = d.decimals ?? 2;
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) return req.error(400, 'decimals must be 0–6');

      let dependsOn: string[];
      try {
        dependsOn = catalog.validateProposal(d, ctx.organizationId);
      } catch (e) {
        if (e instanceof SemanticValidationError || e instanceof FormulaError) return req.error(400, e.message);
        throw e;
      }

      const db = await cds.connect.to('db');
      const existingDef = catalog.definition(d.metricId, ctx.organizationId);
      if (!existingDef) {
        if (!d.label || !d.category || !d.description) return req.error(400, 'A new metric needs label, category and description');
        await db.run(INSERT.into(E + 'MetricDefinitions').entries({
          metricId: d.metricId, tenantId: ctx.organizationId, label: d.label, category: d.category, description: d.description, owner: ctx.userId
        }));
      }
      const prior = await db.run(SELECT.from(E + 'MetricVersions').columns('version').where({ metricId: d.metricId }));
      const version = Math.max(0, ...prior.map((r: any) => Number(r.version))) + 1;
      const versionId = randomUUID();
      await db.run(INSERT.into(E + 'MetricVersions').entries({
        ID: versionId, metricId: d.metricId, tenantId: ctx.organizationId, version, status: 'PENDING_REVIEW', kind: d.kind,
        accountType: d.kind === 'BASE' ? d.accountType : null, signRule: d.kind === 'BASE' ? d.signRule : null,
        expression: d.kind === 'DERIVED' ? d.expression : null, unit: d.unit, decimals,
        effectiveFrom: d.effectiveFrom || new Date().toISOString().slice(0, 10), proposedBy: ctx.userId
      }));
      if (dependsOn.length) {
        await db.run(INSERT.into(E + 'MetricDependencies').entries(dependsOn.map((dep) => ({ ID: randomUUID(), version_ID: versionId, dependsOn: dep }))));
      }
      await audit(db, ctx, 'PROPOSE_METRIC_VERSION', versionId, `${d.metricId}@v${version}`, `kind=${d.kind}`);
      await refreshFromDb(db);
      return { versionId, metricId: d.metricId, version, status: 'PENDING_REVIEW', dependsOn };
    });

    // ─── approve / reject (four-eyes) ─────────────────────────────────────────
    const decide = async (req: any, decision: 'APPROVED' | 'REJECTED') => {
      const ctx = AuthGuard.assertAuthenticated(req);
      const db = await cds.connect.to('db');
      const v = await db.run(SELECT.one.from(E + 'MetricVersions').where({ ID: req.data.versionId }));
      // Tenant scoping: another tenant's version is reported as not found (no existence leak).
      if (!v || (v.tenantId !== GLOBAL && v.tenantId !== ctx.tenant)) return req.error(404, 'Metric version not found');
      if (v.status !== 'PENDING_REVIEW') return req.error(409, `Only PENDING_REVIEW versions can be decided (status is ${v.status})`);
      if (v.proposedBy && v.proposedBy === ctx.id) return req.error(403, 'Four-eyes rule: the proposer cannot approve or reject their own version');
      const now = new Date().toISOString();
      await db.run(UPDATE(E + 'MetricVersions').set(
        decision === 'APPROVED' ? { status: 'APPROVED', approvedBy: ctx.id, approvedAt: now } : { status: 'REJECTED', approvedBy: ctx.id, approvedAt: now }
      ).where({ ID: v.ID, status: 'PENDING_REVIEW' }));
      await audit(db, { organizationId: ctx.tenant, userId: ctx.id }, decision === 'APPROVED' ? 'APPROVE_METRIC_VERSION' : 'REJECT_METRIC_VERSION',
        v.ID, `${v.metricId}@v${v.version}`, decision === 'REJECTED' ? String(req.data.reason ?? '').slice(0, 500) : '');
      await refreshFromDb(db);
      return { v, now };
    };

    this.on('approveMetricVersion', async (req: any) => {
      const r = await decide(req, 'APPROVED');
      if (!r || !('v' in r)) return r;
      return { versionId: r.v.ID, metricId: r.v.metricId, version: r.v.version, status: 'APPROVED', approvedBy: req.user.id };
    });
    this.on('rejectMetricVersion', async (req: any) => {
      const r = await decide(req, 'REJECTED');
      if (!r || !('v' in r)) return r;
      return { versionId: r.v.ID, status: 'REJECTED' };
    });

    return super.init();
  }
}

async function audit(db: any, ctx: { organizationId: string; userId: string }, action: string, targetId: string, metricVersion: string, details: string) {
  await db.run(INSERT.into(E + 'AuditEvents').entries({
    ID: randomUUID(), organizationId: ctx.organizationId, workspaceId: 'SEMANTIC', userId: ctx.userId,
    action, targetId, sourceSystem: 'SEMANTIC_LAYER', metricVersion, details
  }));
}
