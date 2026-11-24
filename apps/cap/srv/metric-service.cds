using { sria.finance as my } from '../db/schema';

@path: '/api/v1/metrics'
service MetricCatalogService {
  @readonly entity MetricConfigurations as projection on my.MetricConfigurations;

  type MetricSummary {
    metricId             : String(50);
    label                : String(100);
    category             : String(20);
    formulaOrAggregation : String(500);
    supportedDimensions  : String(255);
    enabled              : Boolean;
    approvalStatus       : String(20);
  };

  function getApprovedMetrics() returns array of MetricSummary;
}

