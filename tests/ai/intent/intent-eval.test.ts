/**
 * Comprehensive Evaluation Matrix Runner
 * Phase 6 — AI Request Understanding & Clarification Engine
 *
 * Runs every test case in tests/fixtures/ai/intent-cases.json
 * Validates classification accuracy across 5 categories:
 *  - Clear requests (extraction accuracy)
 *  - Ambiguous requests (clarification generation)
 *  - Unsupported requests (safe rejection)
 *  - Adversarial requests (guardrail enforcement)
 *  - Malformed requests (input validation)
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntentService } from '../../../apps/cap/srv/ai/intent-service.ts';
import { MockLLMProvider } from '../../../apps/cap/srv/ai/mock-llm-provider.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesPath = path.resolve(__dirname, '../../fixtures/ai/intent-cases.json');
const testSuite = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

const MOCK_CTX = {
  organizationId: 'org-test',
  userId: 'evaluator-user'
};

describe('AI Intent Understanding Evaluation Matrix', () => {
  const service = new IntentService(new MockLLMProvider());

  // 1. Clear Requests
  describe('Category: Clear Requests', () => {
    for (const testCase of testSuite.categories.clear_requests) {
      it(`[${testCase.id}] ${testCase.prompt.slice(0, 45)}...`, async () => {
        const result = await service.processPrompt(testCase.prompt, MOCK_CTX);
        assert.equal(result.status, testCase.expectedStatus);
        if (result.status === 'RESOLVED') {
          for (const expectedMetric of testCase.expectedMetrics) {
            assert.ok(
              result.metricIds.includes(expectedMetric),
              `Expected metric ${expectedMetric} to be extracted`
            );
          }
          if (testCase.expectedFilters.companyCode) {
            assert.equal(result.filters.companyCode, testCase.expectedFilters.companyCode);
          }
          if (testCase.expectedFilters.fiscalYear) {
            assert.equal(result.filters.fiscalYear, testCase.expectedFilters.fiscalYear);
          }
        }
      });
    }
  });

  // 2. Ambiguous Requests
  describe('Category: Ambiguous Requests', () => {
    for (const testCase of testSuite.categories.ambiguous_requests) {
      it(`[${testCase.id}] ${testCase.prompt}`, async () => {
        const result = await service.processPrompt(testCase.prompt, MOCK_CTX);
        assert.equal(result.status, testCase.expectedStatus);
        if (result.status === 'CLARIFICATION_REQUIRED') {
          const q = result.questions.find(
            item => item.parameterName === testCase.expectedMissingParam
          );
          assert.ok(
            q,
            `Expected clarification for missing parameter: ${testCase.expectedMissingParam}`
          );
        }
      });
    }
  });

  // 3. Unsupported Requests
  describe('Category: Unsupported Requests', () => {
    for (const testCase of testSuite.categories.unsupported_requests) {
      it(`[${testCase.id}] ${testCase.prompt.slice(0, 45)}...`, async () => {
        const result = await service.processPrompt(testCase.prompt, MOCK_CTX);
        assert.equal(result.status, testCase.expectedStatus);
      });
    }
  });

  // 4. Adversarial Requests
  describe('Category: Adversarial Requests', () => {
    for (const testCase of testSuite.categories.adversarial_requests) {
      it(`[${testCase.id}] ${testCase.prompt.slice(0, 45)}...`, async () => {
        const result = await service.processPrompt(testCase.prompt, MOCK_CTX);
        assert.equal(result.status, testCase.expectedStatus);
      });
    }
  });

  // 5. Malformed Requests
  describe('Category: Malformed Requests', () => {
    for (const testCase of testSuite.categories.malformed_requests) {
      it(`[${testCase.id}] prompt length ${testCase.prompt.length}`, async () => {
        const result = await service.processPrompt(testCase.prompt, MOCK_CTX);
        assert.equal(result.status, testCase.expectedStatus);
      });
    }
  });
});

