namespace sria.finance;

@path: '/api/v1/health'
@requires: 'any'   // intentionally public: liveness only, reveals no secrets
service HealthService {
  type HealthReport {
    status      : String;
    service     : String;
    version     : String;
    timestamp   : String;
    environment : String;
    database    : String;
    provider    : String;
    environmentTier : String;
  };

  function getStatus() returns HealthReport;
}

