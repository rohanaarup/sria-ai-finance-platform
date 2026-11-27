/**
 * SemanticCatalog — an immutable snapshot of the semantic layer (G2-01).
 *
 * Built from rows (seed CSV files or the database). Pure and synchronous so the planner,
 * tool, intent service and calculator can consult it without I/O. The SemanticService
 * replaces the runtime snapshot after every approved change (see runtime.ts).
 */
import type { MetricCatalogEntry, MetricVersion, LineageEdge, TermResolution, FormulaNode } from '@sria/contracts';
import type { EnvironmentTier } from '../lib/config/app-config.ts';
import { parseFormula, formulaRefs, findCycle } from './formula.ts';

export const GLOBAL = 'GLOBAL';

export interface DefinitionRow { metricId: string; tenantId: string; label: string; category: string; description: string; owner: string }
export interface VersionRow {
  ID: string; metricId: string; tenantId: string; version: number; status: string; kind: string;
  accountType: string | null; signRule: string | null; expression: string | null; unit: string; decimals: number;
  effectiveFrom: string; proposedBy: string | null; approvedBy: string | null; approvedAt: string | null;
}
export interface DependencyRow { ID: string; version_ID: string; dependsOn: string }
export interface GlossaryRow { ID: string; term: string; metricId: string | null; status: string; tenantId: string; note: string | null }
export interface MappingRow { ID: string; metricId: string; tenantId: string; sourceSystem: string; entitySet: string; field: string; mappingStatus: string; evidence: string | null }
export interface DimensionRow { dimensionId: string; label: string; description: string | null }
export interface MemberRow { ID: string; dimension_dimensionId: string; memberId: string; label: string; parentMemberId: string | null; tenantId: string }
export interface CalendarRow { calendarId: string; description: string; periodsPerYear: number; specialPeriods: number; startMonth: number }
export interface PeriodRow { ID: string; calendar_calendarId: string; fiscalYear: number; period: string; startDate: string; endDate: string; isSpecial: boolean }

export interface SemanticRows {
  definitions: DefinitionRow[]; versions: VersionRow[]; dependencies: DependencyRow[]; glossary: GlossaryRow[];
  mappings: MappingRow[]; dimensions: DimensionRow[]; members: MemberRow[]; calendars: CalendarRow[]; periods: PeriodRow[];
}

export class MetricNotExecutableError extends Error {
  readonly metrics: string[];
  readonly tier: EnvironmentTier;
  constructor(metrics: string[], tier: EnvironmentTier) {
    super(`Metric(s) not approved and effective for the '${tier}' environment: ${metrics.join(', ')}`);
    this.name = 'MetricNotExecutableError';
    this.metrics = metrics;
    this.tier = tier;
  }
}

export class SemanticValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'SemanticValidationError'; }
}

/** Resolved, executable view of one metric version. */
export interface ResolvedMetric {
  metricId: string; label: string; version: MetricVersion; formula: FormulaNode | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const visible = (rowTenant: string, tenant: string) => rowTenant === GLOBAL || rowTenant === tenant;

export class SemanticCatalog {
  readonly rows: SemanticRows;
  constructor(rows: SemanticRows) { this.rows = rows; }

  // ─── versions ──────────────────────────────────────────────────────────────

  private versionsOf(metricId: string, tenant: string): MetricVersion[] {
    const own = this.rows.versions.filter((v) => v.metricId === metricId && v.tenantId === tenant);
    const global = this.rows.versions.filter((v) => v.metricId === metricId && v.tenantId === GLOBAL);
    // A tenant's own approved version overrides the global definition for that tenant.
    const useOwn = tenant !== GLOBAL && own.some((v) => v.status === 'APPROVED');
    const chosen = useOwn ? own : (global.length ? global : own);
    return chosen.map((v) => this.toVersion(v)).sort((a, b) => b.version - a.version);
  }

  private toVersion(v: VersionRow): MetricVersion {
    return {
      id: v.ID, metricId: v.metricId, version: Number(v.version), status: v.status as MetricVersion['status'],
      kind: v.kind as MetricVersion['kind'], accountType: v.accountType || null, signRule: (v.signRule || null) as MetricVersion['signRule'],
      expression: v.expression || null, unit: v.unit as MetricVersion['unit'], decimals: Number(v.decimals),
      effectiveFrom: String(v.effectiveFrom).slice(0, 10), proposedBy: v.proposedBy || null, approvedBy: v.approvedBy || null,
      approvedAt: v.approvedAt ? String(v.approvedAt) : null,
      dependsOn: this.rows.dependencies.filter((d) => d.version_ID === v.ID).map((d) => d.dependsOn)
    };
  }

  /** Latest APPROVED version whose effectiveFrom is on or before asOf. */
  activeVersion(metricId: string, tenant = GLOBAL, asOf = today()): MetricVersion | null {
    return this.versionsOf(metricId, tenant).find((v) => v.status === 'APPROVED' && v.effectiveFrom <= asOf) ?? null;
  }

  latestVersion(metricId: string, tenant = GLOBAL): MetricVersion | null {
    return this.versionsOf(metricId, tenant)[0] ?? null;
  }

  allVersions(metricId: string, tenant = GLOBAL): MetricVersion[] {
    return this.versionsOf(metricId, tenant);
  }

  /**
   * The version that runs in a tier (decision D-02):
   *  - pilot / production: the active APPROVED, effective version only;
   *  - mock / local (synthetic data): the active approved version if there is one, otherwise the
   *    latest PENDING_REVIEW version, so development works before Finance signs off.
   *    REJECTED, RETIRED and DRAFT versions never run.
   */
  runnableVersion(metricId: string, tier: EnvironmentTier, tenant = GLOBAL, asOf = today()): MetricVersion | null {
    const active = this.activeVersion(metricId, tenant, asOf);
    if (active) return active;
    if (tier === 'pilot' || tier === 'production') return null;
    return this.versionsOf(metricId, tenant).find((v) => v.status === 'PENDING_REVIEW' && v.effectiveFrom <= asOf) ?? null;
  }

  definition(metricId: string, tenant = GLOBAL): DefinitionRow | null {
    return this.rows.definitions.find((d) => d.metricId === metricId && d.tenantId === tenant)
      ?? this.rows.definitions.find((d) => d.metricId === metricId && d.tenantId === GLOBAL) ?? null;
  }

  metricIds(tenant = GLOBAL): string[] {
    return [...new Set(this.rows.definitions.filter((d) => visible(d.tenantId, tenant)).map((d) => d.metricId))];
  }

  /** Executable = a runnable version exists for the metric and, recursively, for every dependency. */
  isExecutableInTier(metricId: string, tier: EnvironmentTier, tenant = GLOBAL, seen: Set<string> = new Set()): boolean {
    if (seen.has(metricId)) return false;
    seen.add(metricId);
    const v = this.runnableVersion(metricId, tier, tenant);
    if (!v) return false;
    return v.dependsOn.every((d) => this.isExecutableInTier(d, tier, tenant, new Set(seen)));
  }

  assertExecutable(ids: readonly string[], tier: EnvironmentTier, tenant = GLOBAL): void {
    const blocked = ids.filter((id) => !this.isExecutableInTier(id, tier, tenant));
    if (blocked.length) throw new MetricNotExecutableError(blocked, tier);
  }

  listExecutable(tier: EnvironmentTier, tenant = GLOBAL): string[] {
    return this.metricIds(tenant).filter((m) => this.isExecutableInTier(m, tier, tenant));
  }

  /** Requested metrics plus all dependencies, in dependency order (dependencies first). */
  resolveForExecution(ids: readonly string[], tier: EnvironmentTier, tenant = GLOBAL): ResolvedMetric[] {
    this.assertExecutable(ids, tier, tenant);
    const order: ResolvedMetric[] = [];
    const done = new Set<string>();
    const visit = (id: string) => {
      if (done.has(id)) return;
      const v = this.runnableVersion(id, tier, tenant)!;
      v.dependsOn.forEach(visit);
      done.add(id);
      order.push({ metricId: id, label: this.definition(id, tenant)?.label ?? id, version: v, formula: v.kind === 'DERIVED' && v.expression ? parseFormula(v.expression) : null });
    };
    ids.forEach(visit);
    return order;
  }

  // ─── write-time validation ─────────────────────────────────────────────────

  /**
   * Validate a proposed version before it is stored: formula parses, references match the declared
   * dependencies, every dependency exists, and the dependency graph stays acyclic (DAG).
   */
  validateProposal(p: { metricId: string; kind: string; expression?: string | null; accountType?: string | null; signRule?: string | null }, tenant: string): string[] {
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(p.metricId)) throw new SemanticValidationError(`Invalid metric id "${p.metricId}"`);
    if (p.kind === 'BASE') {
      if (!p.accountType || !p.signRule) throw new SemanticValidationError('BASE metrics need accountType and signRule');
      if (!['CREDIT_POSITIVE', 'DEBIT_POSITIVE'].includes(p.signRule)) throw new SemanticValidationError(`Invalid signRule "${p.signRule}"`);
      return [];
    }
    if (p.kind !== 'DERIVED' || !p.expression) throw new SemanticValidationError('DERIVED metrics need an expression');
    const deps = [...formulaRefs(parseFormula(p.expression))];
    if (!deps.length) throw new SemanticValidationError('A DERIVED formula must reference at least one metric');
    const known = new Set(this.metricIds(tenant));
    const unknown = deps.filter((d) => d !== p.metricId && !known.has(d));
    if (unknown.length) throw new SemanticValidationError(`Unknown metric(s) in formula: ${unknown.join(', ')}`);
    const graph = new Map<string, string[]>();
    for (const id of known) graph.set(id, this.latestVersion(id, tenant)?.dependsOn ?? []);
    graph.set(p.metricId, deps);
    const cycle = findCycle(graph);
    if (cycle) throw new SemanticValidationError(`Formula creates a dependency cycle: ${cycle.join(' → ')}`);
    return deps;
  }

  // ─── lineage, glossary, catalog ───────────────────────────────────────────

  /** Source fields feeding a metric, following DERIVED dependencies down to BASE metrics. */
  lineage(metricId: string, tenant = GLOBAL, seen: Set<string> = new Set()): LineageEdge[] {
    if (seen.has(metricId)) return [];
    seen.add(metricId);
    const v = this.latestVersion(metricId, tenant);
    if (v?.kind === 'DERIVED') return v.dependsOn.flatMap((d) => this.lineage(d, tenant, seen));
    return this.rows.mappings
      .filter((m) => m.metricId === metricId && visible(m.tenantId, tenant))
      .map((m) => ({ metricId: m.metricId, sourceSystem: m.sourceSystem, entitySet: m.entitySet, field: m.field, mappingStatus: m.mappingStatus as LineageEdge['mappingStatus'], evidence: m.evidence || null }));
  }

  aliases(metricId: string, tenant = GLOBAL): string[] {
    return this.rows.glossary.filter((g) => g.metricId === metricId && g.status === 'RESOLVES' && visible(g.tenantId, tenant)).map((g) => g.term);
  }

  /** Exact (case-insensitive) lookup of a single term. */
  resolveTerm(term: string, tenant = GLOBAL): TermResolution {
    const t = term.trim().toLowerCase();
    if (this.metricIds(tenant).includes(t)) return { status: 'RESOLVED', term, metricId: t, message: `"${term}" is the metric ${t}.` };
    const hit = this.rows.glossary.find((g) => g.term === t && visible(g.tenantId, tenant));
    if (!hit) return { status: 'UNKNOWN', term, metricId: null, message: `"${term}" is not a known finance term. Choose one of: ${this.metricIds(tenant).join(', ')}.` };
    if (hit.status === 'UNSUPPORTED') return { status: 'UNSUPPORTED', term, metricId: null, message: `"${term}" is not an approved metric yet.` };
    return { status: 'RESOLVED', term, metricId: hit.metricId, message: `"${term}" means ${hit.metricId}.` };
  }

  /**
   * Deterministic scan of free text for glossary terms, longest match first, whole words only.
   * Runs BEFORE any model call: the model never decides what "sales" means.
   */
  scanText(text: string, tenant = GLOBAL): { metricIds: string[]; unsupported: string[]; matches: Array<{ term: string; metricId: string | null }> } {
    let hay = ` ${text.toLowerCase().replace(/[^a-z0-9_%\s]/g, ' ').replace(/\s+/g, ' ')} `;
    const terms = this.rows.glossary.filter((g) => visible(g.tenantId, tenant))
      .map((g) => ({ term: g.term, metricId: g.metricId, status: g.status }))
      .concat(this.metricIds(tenant).map((m) => ({ term: m, metricId: m, status: 'RESOLVES' })))
      .sort((a, b) => b.term.length - a.term.length);
    const metricIds: string[] = [], unsupported: string[] = [], matches: Array<{ term: string; metricId: string | null }> = [];
    for (const g of terms) {
      const needle = ` ${g.term} `;
      if (!hay.includes(needle)) continue;
      hay = hay.split(needle).join(' '.repeat(needle.length)); // consume so "profit margin" does not also match "profit"
      matches.push({ term: g.term, metricId: g.metricId });
      if (g.status === 'UNSUPPORTED') unsupported.push(g.term);
      else if (g.metricId && !metricIds.includes(g.metricId)) metricIds.push(g.metricId);
    }
    return { metricIds, unsupported, matches };
  }

  catalogEntries(tier: EnvironmentTier, tenant = GLOBAL): MetricCatalogEntry[] {
    return this.metricIds(tenant).map((id) => {
      const def = this.definition(id, tenant)!;
      return {
        metricId: id, label: def.label, category: def.category, description: def.description, owner: def.owner,
        tenantId: def.tenantId === GLOBAL ? null : def.tenantId,
        activeVersion: this.activeVersion(id, tenant),
        latestVersion: this.latestVersion(id, tenant)!,
        executable: this.isExecutableInTier(id, tier, tenant),
        aliases: this.aliases(id, tenant),
        lineage: this.lineage(id, tenant)
      };
    });
  }

  dimensions(tenant = GLOBAL) {
    return this.rows.dimensions.map((d) => ({
      ...d, members: this.rows.members.filter((m) => m.dimension_dimensionId === d.dimensionId && visible(m.tenantId, tenant))
        .map((m) => ({ memberId: m.memberId, label: m.label, parentMemberId: m.parentMemberId || null }))
    }));
  }

  fiscalCalendar(calendarId = 'K4') {
    const cal = this.rows.calendars.find((c) => c.calendarId === calendarId) ?? null;
    return cal ? { ...cal, periods: this.rows.periods.filter((p) => p.calendar_calendarId === calendarId) } : null;
  }
}
