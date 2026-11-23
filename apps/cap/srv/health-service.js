import cds from '@sap/cds';

export default class HealthService extends cds.ApplicationService {
  init() {
    this.on('getStatus', () => {
      return {
        status: 'UP',
        service: 'sria-cap-backend',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        database: 'sqlite',
        provider: process.env.FINANCE_DATA_PROVIDER || 'mock'
      };
    });

    return super.init();
  }
}

