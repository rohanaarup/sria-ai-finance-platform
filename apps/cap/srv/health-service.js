import cds from '@sap/cds';
import { getConfig } from './lib/config/app-config.ts';

export default class HealthService extends cds.ApplicationService {
  init() {
    this.on('getStatus', () => {
      return {
        status: 'UP',
        service: 'sria-cap-backend',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        environment: getConfig().nodeEnv,
        database: 'sqlite',
        provider: getConfig().financeProvider,
        environmentTier: getConfig().tier
      };
    });

    return super.init();
  }
}

