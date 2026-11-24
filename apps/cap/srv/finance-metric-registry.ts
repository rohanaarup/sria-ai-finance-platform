import {
  BASELINE_METRIC_CATALOG,
  MetricIdEnum,
  SupportedDimensionEnum
} from '@sria/contracts';
import type {
  MetricId,
  MetricDefinition,
  SupportedDimension
} from '@sria/contracts';

/**
 * Validation Result Interface
 */
export interface MetricValidationResult {
  valid: boolean;
  errors: string[];
  validatedIds: MetricId[];
}

export interface DimensionValidationResult {
  valid: boolean;
  errors: string[];
  validatedDimensions: SupportedDimension[];
}

/**
 * Enterprise Finance Metric Registry
 * Enforces business glossary allowlists and approval gates.
 */
export class FinanceMetricRegistry {
  private catalog: Map<MetricId, MetricDefinition>;

  constructor(initialCatalog: Record<MetricId, MetricDefinition> = BASELINE_METRIC_CATALOG) {
    this.catalog = new Map(Object.entries(initialCatalog) as [MetricId, MetricDefinition][]);
  }

  /**
   * Return all registered candidate metrics
   */
  public getAllMetrics(): MetricDefinition[] {
    return Array.from(this.catalog.values());
  }

  /**
   * Return only enabled & approved metrics
   */
  public getEnabledMetrics(): MetricDefinition[] {
    return Array.from(this.catalog.values()).filter((m) => m.enabled && m.approvalStatus === 'APPROVED');
  }

  /**
   * Lookup a specific metric by ID
   */
  public getMetric(id: MetricId): MetricDefinition | undefined {
    return this.catalog.get(id);
  }

  /**
   * Check if a metric is both approved and enabled for execution
   */
  public isMetricExecutable(id: MetricId): boolean {
    const metric = this.catalog.get(id);
    return Boolean(metric && metric.enabled && metric.approvalStatus === 'APPROVED');
  }

  /**
   * Validate a list of user/AI requested metric IDs against allowlist
   */
  public validateMetrics(metricNames: string[]): MetricValidationResult {
    const errors: string[] = [];
    const validatedIds: MetricId[] = [];

    for (const name of metricNames) {
      const parsed = MetricIdEnum.safeParse(name);
      if (!parsed.success) {
        errors.push(`Metric '${name}' is not in the approved Finance Metric Registry allowlist.`);
      } else {
        const def = this.catalog.get(parsed.data);
        if (!def) {
          errors.push(`Metric '${name}' is not found in the registry.`);
        } else if (!def.enabled) {
          errors.push(`Metric '${name}' is currently DISABLED (Approval: ${def.approvalStatus}, Mapping: ${def.sourceMappingStatus}).`);
        } else {
          validatedIds.push(parsed.data);
        }
      }
    }

    return {
      valid: errors.length === 0 && validatedIds.length > 0,
      errors,
      validatedIds
    };
  }

  /**
   * Validate a list of requested dimension names
   */
  public validateDimensions(dimensionNames: string[]): DimensionValidationResult {
    const errors: string[] = [];
    const validatedDimensions: SupportedDimension[] = [];

    for (const dim of dimensionNames) {
      const parsed = SupportedDimensionEnum.safeParse(dim);
      if (!parsed.success) {
        errors.push(`Dimension '${dim}' is not supported in the MVP pilot.`);
      } else {
        validatedDimensions.push(parsed.data);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      validatedDimensions
    };
  }

  /**
   * Reviewer approval hook: Enable a metric once business definition and source mapping are signed off
   */
  public approveAndEnableMetric(id: MetricId, reviewerName: string): boolean {
    const def = this.catalog.get(id);
    if (!def) return false;

    def.approvalStatus = 'APPROVED';
    def.sourceMappingStatus = 'MAPPED';
    def.enabled = true;
    def.owner = reviewerName;
    return true;
  }
}

/**
 * Singleton instance initialized with the baseline catalog
 */
export const defaultMetricRegistry = new FinanceMetricRegistry();
