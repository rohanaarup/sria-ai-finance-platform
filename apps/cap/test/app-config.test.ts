/** AppConfig: one validated source of configuration; invalid values fail at startup (G2-00). */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError } from '../srv/lib/config/app-config.ts';

describe('AppConfig', () => {
  it('defaults to a safe local, synthetic configuration', () => {
    const c = loadConfig({});
    assert.equal(c.tier, 'local');
    assert.equal(c.financeProvider, 'mock');
    assert.equal(c.aiProvider, 'mock');
    assert.equal(c.isSynthetic, true);
    assert.deepEqual(c.corsAllowedOrigins, ['http://localhost:5173', 'http://127.0.0.1:5173']);
  });

  it('rejects unknown provider values instead of silently falling back', () => {
    assert.throws(() => loadConfig({ FINANCE_DATA_PROVIDER: 'sap' }), ConfigError);
    assert.throws(() => loadConfig({ AI_RUNTIME_PROVIDER: 'whatever' }), ConfigError);
    assert.throws(() => loadConfig({ APP_ENV_TIER: 'staging' }), ConfigError);
  });

  it('requires an explicit pilot/production tier when NODE_ENV=production', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /APP_ENV_TIER must be set/);
    assert.throws(() => loadConfig({ NODE_ENV: 'production', APP_ENV_TIER: 'local' }), ConfigError);
    assert.equal(loadConfig({ NODE_ENV: 'production', APP_ENV_TIER: 'pilot' }).tier, 'pilot');
  });

  it('forbids mock providers in the production tier', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production', APP_ENV_TIER: 'production' }), /cannot use the mock/);
  });

  it('requires a destination for s4hana and credentials for a real AI provider', () => {
    assert.throws(() => loadConfig({ FINANCE_DATA_PROVIDER: 's4hana' }), /FINANCE_S4HANA_DESTINATION_NAME/);
    assert.throws(() => loadConfig({ AI_RUNTIME_PROVIDER: 'openai' }), /AI_RUNTIME_API_KEY/);
    const ok = loadConfig({ FINANCE_DATA_PROVIDER: 's4hana', FINANCE_S4HANA_DESTINATION_NAME: 'DEST', AI_RUNTIME_PROVIDER: 'openai', AI_PROVIDER_APPROVED: 'true', AI_RUNTIME_MODEL: 'some-model', AI_RUNTIME_API_KEY: 'k', AI_RUNTIME_ENDPOINT: 'https://example.invalid/v1' });
    assert.equal(ok.isSynthetic, false);
  });

  it('CORS is an explicit allow-list: wildcard is refused and pilot defaults to none', () => {
    assert.throws(() => loadConfig({ CORS_ALLOWED_ORIGINS: '*' }), ConfigError);
    assert.deepEqual(loadConfig({ NODE_ENV: 'production', APP_ENV_TIER: 'pilot' }).corsAllowedOrigins, []);
    assert.deepEqual(loadConfig({ CORS_ALLOWED_ORIGINS: 'https://a.example, https://b.example' }).corsAllowedOrigins, ['https://a.example', 'https://b.example']);
  });

  it('blank values are treated as unset', () => {
    assert.equal(loadConfig({ FINANCE_DATA_PROVIDER: '', APP_ENV_TIER: '' }).financeProvider, 'mock');
  });
});
