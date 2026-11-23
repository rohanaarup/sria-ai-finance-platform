import test from 'node:test';
import assert from 'node:assert/strict';
import type { HealthStatusResponse } from '@sria/contracts';

test('CAP Health Service contract check', () => {
  const healthResponse: HealthStatusResponse = {
    status: 'UP',
    service: 'sria-cap-backend',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    environment: 'development',
    components: {
      capService: { status: 'UP', profile: 'development' },
      database: { status: 'UP', dialect: 'sqlite' },
      dataProvider: { status: 'UP', mode: 'mock' },
      aiEngine: { status: 'UP', provider: 'mock' }
    }
  };

  assert.equal(healthResponse.status, 'UP');
  assert.equal(healthResponse.service, 'sria-cap-backend');
  assert.equal(healthResponse.components.database.dialect, 'sqlite');
  assert.equal(healthResponse.components.dataProvider.mode, 'mock');
});
