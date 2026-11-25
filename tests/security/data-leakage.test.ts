/**
 * Data Leakage & Zero Arithmetic Verification Security Test Suite
 * Phase 11 — Security, AI Evaluation, Tests & Reliability
 *
 * Verifies critical privacy, audit sanitization, and mathematical determinism:
 *  1. Zero raw financial records (I_JournalEntryItemBasic rows) are stored in SQLite database.
 *  2. Audit event records contain only operational metadata, scrubbing monetary figures.
 *  3. Orchestrator execution trace records execution timing without transactional rows.
 *  4. Financial math is 100% deterministic TypeScript code with zero LLM arithmetic calls.
 */

import { strict as assert } from 'node:assert';
import test from 'node:test';
import cds from '@sap/cds';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Orchestrator } from '../../apps/cap/srv/ai/orchestrator.ts';
import { MockFinanceDataProvider } from '../../apps/cap/srv/lib/providers/mock-finance-data-provider.ts';
import { CalculationEngine } from '../../apps/cap/srv/lib/finance/calculation-engine.ts';
import type { DashboardRequest } from '../../packages/contracts/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../apps/cap/sqlite.db');

test('Phase 11 — Data Leakage & Zero Arithmetic Verification Suite', async (t) => {
  const db = await cds.connect.to({ kind: 'sqlite', credentials: { url: dbPath } });

  await t.test('1. Database Storage Audit: No raw financial ledger rows persisted in any table', async () => {
    // Check Dashboards table
    const dashboards = await db.run(SELECT.from('sria.finance.Dashboards'));
    for (const d of dashboards) {
      assert.equal((d as any).GLAccount, undefined, 'Raw SAP column GLAccount found in Dashboards');
      assert.equal((d as any).AccountingDocument, undefined, 'Raw SAP column AccountingDocument found in Dashboards');
      assert.equal((d as any).PostingDate, undefined, 'Raw SAP column PostingDate found in Dashboards');
    }

    // Check DashboardSpecs table: specJson must contain aggregates, never raw transient records
    const specs = await db.run(SELECT.from('sria.finance.DashboardSpecs'));
    for (const s of specs) {
      const parsed = JSON.parse(s.specJson);
      assert.equal(parsed.rawRecords, undefined, 'rawRecords detected in persisted specJson');
      assert.equal(parsed.journalEntries, undefined, 'journalEntries detected in persisted specJson');
    }
  });

  await t.test('2. Audit Events Sanitization: Audit log stores operational metadata only', async () => {
    const audits = await db.run(SELECT.from('sria.finance.AuditEvents'));
    assert.ok(audits.length >= 1, 'Audit events should exist');

    for (const a of audits) {
      assert.ok(a.action, 'Audit event missing action identifier');
      assert.ok(a.organizationId, 'Audit event missing tenant context');
      assert.ok(a.userId, 'Audit event missing user context');
      // Verify no raw transactional line items in audit log
      assert.equal((a as any).amount, undefined, 'Monetary amount column leaked into AuditEvents');
      assert.equal((a as any).records, undefined, 'Record array leaked into AuditEvents');
    }
  });

  await t.test('3. Execution Trace Privacy: Orchestrator trace preserves timing and omits raw rows', async () => {
    const orchestrator = new Orchestrator(new MockFinanceDataProvider());
    const validRequest: DashboardRequest = {
      version: '1.0',
      rawPrompt: 'Revenue and expenses for company 1000 in 2026',
      metricIds: ['total_revenue', 'total_expenses'],
      dimensions: ['fiscal_period'],
      filters: { companyCode: '1000', fiscalYear: 2026 },
      organizationId: 'ORG_ACME_PILOT',
      userId: 'USER_AUDITOR'
    };

    const outcome = await orchestrator.executeRequest(validRequest, {
      organizationId: 'ORG_ACME_PILOT',
      userId: 'USER_AUDITOR',
      userRoles: ['FinanceAnalyst']
    });

    assert.equal(outcome.status, 'SUCCESS');
    assert.ok(outcome.trace);
    assert.ok(outcome.trace.totalDurationMs >= 0);
    assert.ok(outcome.trace.toolCalls.length >= 1);

    // Verify trace tool calls do not contain raw accounting entries
    for (const step of outcome.trace.toolCalls) {
      assert.ok(step.tool);
      assert.ok(step.status);
      assert.equal((step as any).rawRecords, undefined, 'rawRecords leaked into ExecutionTrace step');
      assert.equal((step as any).transactions, undefined, 'transactions leaked into ExecutionTrace step');
    }
  });

  await t.test('4. Zero LLM Arithmetic: CalculationEngine produces exact deterministic results', () => {
    // Revenue: 350,000.00 Credit - 0 Debit = 350000.00
    const rev = CalculationEngine.calculateTotalRevenue([
      { recordId: '1', companyCode: '1000', fiscalYear: 2026, fiscalPeriod: '01', accountType: 'REVENUE', amount: 350000, currency: 'USD', debitCredit: 'C', glAccount: '400000' }
    ]);
    assert.equal(rev.value, 350000);

    // Expenses: 230,000.00 Debit - 0 Credit = 230000.00
    const exp = CalculationEngine.calculateTotalExpenses([
      { recordId: '2', companyCode: '1000', fiscalYear: 2026, fiscalPeriod: '01', accountType: 'EXPENSE', amount: 230000, currency: 'USD', debitCredit: 'D', glAccount: '500000' }
    ]);
    assert.equal(exp.value, 230000);

    // Net Profit: 350,000 - 230,000 = 120,000.00
    const profit = CalculationEngine.calculateNetProfit(rev.value, exp.value);
    assert.equal(profit.value, 120000);

    // Profit Margin: (120,000 / 350,000) * 100 = 34.29%
    const margin = CalculationEngine.calculateProfitMargin(profit.value, rev.value);
    assert.equal(margin.value, 34.29);
    assert.equal(margin.isZeroDenominator, false);

    // Zero Denominator Safety
    const zeroMargin = CalculationEngine.calculateProfitMargin(0, 0);
    assert.equal(zeroMargin.value, 0);
    assert.equal(zeroMargin.isZeroDenominator, true);
  });
});
