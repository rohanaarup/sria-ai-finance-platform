/**
 * System Health Response Contract
 */
export interface HealthStatusResponse {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  service: string;
  version: string;
  timestamp: string;
  environment: string;
  components: {
    capService: {
      status: 'UP' | 'DOWN';
      profile: string;
    };
    database: {
      status: 'UP' | 'DOWN';
      dialect: 'sqlite' | 'hana' | 'memory';
    };
    dataProvider: {
      status: 'UP' | 'DOWN';
      mode: 'mock' | 's4hana';
    };
    aiEngine: {
      status: 'UP' | 'DOWN';
      provider: string;
    };
  };
}

