import type { FinanceRecord } from '../metric-result.js';

/**
 * Notice: These fixtures are strictly SYNTHETIC and deterministic for testing and local development.
 * They do NOT represent live production accounting records from any company.
 */
export const SYNTHETIC_FIXTURE_LABEL = 'SYNTHETIC_TEST_FIXTURE_DO_NOT_USE_IN_PRODUCTION';

export const SYNTHETIC_FINANCE_RECORDS: FinanceRecord[] = [
  // --- Company Code 1000 : 2026 Period 01 ---
  {
    recordId: 'REC-1000-202601-01',
    companyCode: '1000',
    fiscalYear: 2026,
    fiscalPeriod: '01',
    postingDate: '2026-01-15',
    glAccount: '410000',
    accountType: 'REVENUE',
    amount: 160000.00,
    currency: 'USD',
    debitCredit: 'C',
    businessUnit: 'BU_COMMERCIAL'
  },
  {
    recordId: 'REC-1000-202601-02',
    companyCode: '1000',
    fiscalYear: 2026,
    fiscalPeriod: '01',
    postingDate: '2026-01-28',
    glAccount: '410000',
    accountType: 'REVENUE',
    amount: 10000.00,
    currency: 'USD',
    debitCredit: 'D', // Revenue return/deduction
    businessUnit: 'BU_COMMERCIAL'
  },
  {
    recordId: 'REC-1000-202601-03',
    companyCode: '1000',
    fiscalYear: 2026,
    fiscalPeriod: '01',
    postingDate: '2026-01-20',
    glAccount: '510000',
    accountType: 'EXPENSE',
    amount: 60000.00,
    currency: 'USD',
    debitCredit: 'D',
    businessUnit: 'BU_OPERATIONS'
  },
  {
    recordId: 'REC-1000-202601-04',
    companyCode: '1000',
    fiscalYear: 2026,
    fiscalPeriod: '01',
    postingDate: '2026-01-30',
    glAccount: '520000',
    accountType: 'EXPENSE',
    amount: 30000.00,
    currency: 'USD',
    debitCredit: 'D',
    businessUnit: 'BU_ADMIN'
  },

  // --- Company Code 1000 : 2026 Period 02 ---
  {
    recordId: 'REC-1000-202602-01',
    companyCode: '1000',
    fiscalYear: 2026,
    fiscalPeriod: '02',
    postingDate: '2026-02-14',
    glAccount: '410000',
    accountType: 'REVENUE',
    amount: 200000.00,
    currency: 'USD',
    debitCredit: 'C',
    businessUnit: 'BU_COMMERCIAL'
  },
  {
    recordId: 'REC-1000-202602-02',
    companyCode: '1000',
    fiscalYear: 2026,
    fiscalPeriod: '02',
    postingDate: '2026-02-22',
    glAccount: '510000',
    accountType: 'EXPENSE',
    amount: 80000.00,
    currency: 'USD',
    debitCredit: 'D',
    businessUnit: 'BU_OPERATIONS'
  },
  {
    recordId: 'REC-1000-202602-03',
    companyCode: '1000',
    fiscalYear: 2026,
    fiscalPeriod: '02',
    postingDate: '2026-02-27',
    glAccount: '530000',
    accountType: 'EXPENSE',
    amount: 60000.00,
    currency: 'USD',
    debitCredit: 'D',
    businessUnit: 'BU_MARKETING'
  },

  // --- Company Code 2000 : 2026 Period 01 (Zero Revenue Edge Case) ---
  {
    recordId: 'REC-2000-202601-01',
    companyCode: '2000',
    fiscalYear: 2026,
    fiscalPeriod: '01',
    postingDate: '2026-01-18',
    glAccount: '520000',
    accountType: 'EXPENSE',
    amount: 25000.00,
    currency: 'USD',
    debitCredit: 'D',
    businessUnit: 'BU_SHARED_SERVICES'
  },

  // --- Company Code 2000 : 2026 Period 02 (Operating Loss Edge Case) ---
  {
    recordId: 'REC-2000-202602-01',
    companyCode: '2000',
    fiscalYear: 2026,
    fiscalPeriod: '02',
    postingDate: '2026-02-10',
    glAccount: '410000',
    accountType: 'REVENUE',
    amount: 50000.00,
    currency: 'USD',
    debitCredit: 'C',
    businessUnit: 'BU_COMMERCIAL'
  },
  {
    recordId: 'REC-2000-202602-02',
    companyCode: '2000',
    fiscalYear: 2026,
    fiscalPeriod: '02',
    postingDate: '2026-02-25',
    glAccount: '510000',
    accountType: 'EXPENSE',
    amount: 75000.00,
    currency: 'USD',
    debitCredit: 'D',
    businessUnit: 'BU_OPERATIONS'
  }
];

/**
 * Expected Deterministic Calculation Outcomes for Validation
 */
export const EXPECTED_FINANCE_CALCULATIONS = {
  company1000_period01: {
    companyCode: '1000',
    fiscalPeriod: '01',
    currency: 'USD',
    total_revenue: 150000.00, // 160000 (C) - 10000 (D)
    total_expenses: 90000.00,  // 60000 (D) + 30000 (D)
    net_profit: 60000.00,      // 150000 - 90000
    profit_margin: 40.00       // (60000 / 150000) * 100
  },
  company1000_period02: {
    companyCode: '1000',
    fiscalPeriod: '02',
    currency: 'USD',
    total_revenue: 200000.00, // 200000 (C)
    total_expenses: 140000.00, // 80000 (D) + 60000 (D)
    net_profit: 60000.00,      // 200000 - 140000
    profit_margin: 30.00       // (60000 / 200000) * 100
  },
  company2000_period01_zero_revenue: {
    companyCode: '2000',
    fiscalPeriod: '01',
    currency: 'USD',
    total_revenue: 0.00,
    total_expenses: 25000.00,
    net_profit: -25000.00,
    profit_margin: 0.00 // Zero denominator protected
  },
  company2000_period02_net_loss: {
    companyCode: '2000',
    fiscalPeriod: '02',
    currency: 'USD',
    total_revenue: 50000.00,
    total_expenses: 75000.00,
    net_profit: -25000.00,
    profit_margin: -50.00 // (-25000 / 50000) * 100
  }
};
