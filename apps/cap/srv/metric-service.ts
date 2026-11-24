import cds from '@sap/cds';
import { defaultMetricRegistry } from './finance-metric-registry.ts';

export default class MetricCatalogService extends cds.ApplicationService {
  init() {
    this.on('getApprovedMetrics', () => {
      const allMetrics = defaultMetricRegistry.getAllMetrics();
      return allMetrics.map((m) => ({
        metricId: m.id,
        label: m.label,
        category: m.category,
        formulaOrAggregation: m.formulaOrAggregation,
        supportedDimensions: m.supportedDimensions.join(', '),
        enabled: m.enabled,
        approvalStatus: m.approvalStatus
      }));
    });

    return super.init();
  }
}

