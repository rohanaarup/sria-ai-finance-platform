namespace sria.finance;

@path: '/api/v1/health'
service HealthService {
  type HealthReport {
    status      : String;
    service     : String;
    version     : String;
    timestamp   : String;
    environment : String;
    database    : String;
    provider    : String;
  };

  function getStatus() returns HealthReport;
}

