import { z } from 'zod';

/**
 * Allowlisted Metric Identifiers for MVP
 */
export const MetricIdEnum = z.enum([
  'total_revenue',
  'total_expenses',
  'net_profit',
  'profit_margin'
]);
export type MetricId = z.infer<typeof MetricIdEnum>;

/**
 * Allowlisted Dimension Identifiers for MVP
 */
export const SupportedDimensionEnum = z.enum([
  'fiscal_period',
  'month',
  'company_code',
  'business_unit'
]);
export type SupportedDimension = z.infer<typeof SupportedDimensionEnum>;

/**
 * Governance Approval & Mapping Statuses
 */
export const ApprovalStatusEnum = z.enum(['APPROVED', 'PENDING_REVIEW', 'REJECTED']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusEnum>;

export const SourceMappingStatusEnum = z.enum(['MAPPED', 'UNCONFIRMED', 'BLOCKED']);
export type SourceMappingStatus = z.infer<typeof SourceMappingStatusEnum>;

export const MetricCategoryEnum = z.enum(['REVENUE', 'EXPENSE', 'PROFIT', 'RATIO']);
export type MetricCategory = z.infer<typeof MetricCategoryEnum>;

/**
 * Finance Metric Definition Contract
 */
export const MetricDefinitionSchema = z.object({
  id: MetricIdEnum,
  label: z.string().min(1),
  category: MetricCategoryEnum,
  description: z.string().min(1),
  formulaOrAggregation: z.string().min(1),
  supportedDimensions: z.array(SupportedDimensionEnum).min(1),
  sourceMappingStatus: SourceMappingStatusEnum,
  approvalStatus: ApprovalStatusEnum,
  owner: z.string().min(1),
  enabled: z.boolean(),
  sapFieldMapping: z.object({
    suggestedEntitySet: z.string(),
    suggestedAmountField: z.string(),
    debitCreditIndicatorField: z.string().optional(),
    signConventionRule: z.string(),
    mappingEvidence: z.string(),
    notes: z.string()
  }).optional()
});
export type MetricDefinition = z.infer<typeof MetricDefinitionSchema>;

/**
 * Baseline Metric Registry Catalog (Contract Baseline)
 * Note: enabled is strictly false until formal Finance Reviewer sign-off.
 */
export const BASELINE_METRIC_CATALOG: Record<MetricId, MetricDefinition> = {
  total_revenue: {
    id: 'total_revenue',
    label: 'Total Revenue',
    category: 'REVENUE',
    description: 'Gross recognized revenue in the accounting period from sales and services.',
    formulaOrAggregation: 'SUM(CreditAmount - DebitAmount) for Revenue GL Accounts (P&L account type R)',
    supportedDimensions: ['fiscal_period', 'month', 'company_code', 'business_unit'],
    sourceMappingStatus: 'UNCONFIRMED',
    approvalStatus: 'PENDING_REVIEW',
    owner: 'Finance Subject-Matter Reviewer',
    enabled: false,
    sapFieldMapping: {
      suggestedEntitySet: 'I_JournalEntryItemBasic (Candidate)',
      suggestedAmountField: 'AmountInCompanyCodeCurrency',
      debitCreditIndicatorField: 'DebitCreditCode',
      signConventionRule: 'Credit is revenue addition; Debit is revenue reversal/deduction',
      mappingEvidence: 'Pending live S/4HANA OData metadata confirmation in Phase 05',
      notes: 'Must verify account type filter and functional area mapping with accounting owner.'
    }
  },
  total_expenses: {
    id: 'total_expenses',
    label: 'Total Expenses',
    category: 'EXPENSE',
    description: 'Operating and administrative expenses incurred during the accounting period.',
    formulaOrAggregation: 'SUM(DebitAmount - CreditAmount) for Expense GL Accounts (P&L account type X/E)',
    supportedDimensions: ['fiscal_period', 'month', 'company_code', 'business_unit'],
    sourceMappingStatus: 'UNCONFIRMED',
    approvalStatus: 'PENDING_REVIEW',
    owner: 'Finance Subject-Matter Reviewer',
    enabled: false,
    sapFieldMapping: {
      suggestedEntitySet: 'I_JournalEntryItemBasic (Candidate)',
      suggestedAmountField: 'AmountInCompanyCodeCurrency',
      debitCreditIndicatorField: 'DebitCreditCode',
      signConventionRule: 'Debit is expense addition; Credit is expense deduction',
      mappingEvidence: 'Pending live S/4HANA OData metadata confirmation in Phase 05',
      notes: 'Tax expense and COGS allocation rules subject to Finance reviewer approval.'
    }
  },
  net_profit: {
    id: 'net_profit',
    label: 'Net Profit',
    category: 'PROFIT',
    description: 'Operating profit derived deterministically as total revenue minus total expenses.',
    formulaOrAggregation: 'total_revenue - total_expenses',
    supportedDimensions: ['fiscal_period', 'month', 'company_code', 'business_unit'],
    sourceMappingStatus: 'UNCONFIRMED',
    approvalStatus: 'PENDING_REVIEW',
    owner: 'Finance Subject-Matter Reviewer',
    enabled: false,
    sapFieldMapping: {
      suggestedEntitySet: 'Derived in backend computation engine',
      suggestedAmountField: 'Computed (total_revenue - total_expenses)',
      signConventionRule: 'Positive = Net Income; Negative = Net Loss',
      mappingEvidence: 'Mathematical derivation; requires valid revenue and expense records',
      notes: 'No raw SAP field; computed deterministically.'
    }
  },
  profit_margin: {
    id: 'profit_margin',
    label: 'Profit Margin (%)',
    category: 'RATIO',
    description: 'Percentage ratio of net profit to total revenue.',
    formulaOrAggregation: '(net_profit / total_revenue) * 100',
    supportedDimensions: ['fiscal_period', 'month', 'company_code', 'business_unit'],
    sourceMappingStatus: 'UNCONFIRMED',
    approvalStatus: 'PENDING_REVIEW',
    owner: 'Finance Subject-Matter Reviewer',
    enabled: false,
    sapFieldMapping: {
      suggestedEntitySet: 'Derived in backend computation engine',
      suggestedAmountField: 'Computed ((net_profit / total_revenue) * 100)',
      signConventionRule: 'Zero denominator results in 0.00% with warning flag',
      mappingEvidence: 'Mathematical derivation; zero-division safe',
      notes: 'Displays as percentage with 2 decimal precision.'
    }
  }
};

