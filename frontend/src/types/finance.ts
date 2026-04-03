export type FinanceAccountStatus = "active" | "suspended" | "closed";
export type FinanceTransactionType = "charge" | "payment" | "adjustment" | "refund";
export type FinanceTransactionSource = "booking" | "pos" | "order" | "manual" | "settlement";
export type FinanceSummaryPeriod = "day" | "week" | "month";

export interface FinanceAccountCustomerSummary {
  id: string;
  account_code: string;
  person_id: string;
}

export interface FinanceAccountSummary {
  id: string;
  club_id: string;
  account_customer_id: string;
  account_customer: FinanceAccountCustomerSummary;
  status: FinanceAccountStatus;
  balance: string;
  transaction_count: number;
}

export interface FinanceJournalEntry {
  id: string;
  club_id: string;
  account_id: string;
  amount: string;
  type: FinanceTransactionType;
  source: FinanceTransactionSource;
  reference_id: string | null;
  description: string;
  created_at: string;
  account_customer_code: string | null;
}

export interface FinanceClubJournal {
  entries: FinanceJournalEntry[];
  total_count: number;
}

export interface FinanceSummaryWindow {
  period: FinanceSummaryPeriod;
  date_from: string;
  date_to: string;
}

export interface FinanceRevenueSourceSummary {
  source: FinanceTransactionSource;
  total_revenue: string;
  charge_count: number;
}

export interface FinanceRevenuePeriodSummary extends FinanceSummaryWindow {
  total_revenue: string;
  operational_revenue: string;
  charge_count: number;
  by_source: FinanceRevenueSourceSummary[];
}

export interface FinanceRevenueSummary {
  timezone: string;
  reference_datetime: string;
  day: FinanceRevenuePeriodSummary;
  week: FinanceRevenuePeriodSummary;
  month: FinanceRevenuePeriodSummary;
}

export interface FinanceTransactionVolumeTypeSummary {
  type: FinanceTransactionType;
  transaction_count: number;
  total_absolute_amount: string;
}

export interface FinanceTransactionVolumePeriodSummary extends FinanceSummaryWindow {
  total_transaction_count: number;
  by_type: FinanceTransactionVolumeTypeSummary[];
}

export interface FinanceTransactionVolumeSummary {
  timezone: string;
  reference_datetime: string;
  day: FinanceTransactionVolumePeriodSummary;
  week: FinanceTransactionVolumePeriodSummary;
  month: FinanceTransactionVolumePeriodSummary;
}

export interface FinanceOutstandingSummary {
  total_accounts: number;
  accounts_in_arrears: number;
  accounts_in_credit: number;
  accounts_settled: number;
  total_outstanding_amount: string;
  unpaid_order_postings_count: number;
  unpaid_order_postings_amount: string;
  pending_items_count: number;
}

export interface FinanceLedgerEntry extends FinanceJournalEntry {
  running_balance: string;
}

export interface FinanceAccountLedger {
  account_id: string;
  club_id: string;
  account_customer_id: string;
  status: FinanceAccountStatus;
  balance: string;
  transactions: FinanceLedgerEntry[];
}

export type FinanceExportProfile = "journal_basic";
export type FinanceExportBatchStatus = "draft" | "generated" | "exported" | "void";

export interface FinanceExportBatchPreviewRow {
  entry_date: string;
  transaction_id: string;
  account_customer_code: string | null;
  transaction_type: string;
  source: string;
  reference_id: string | null;
  description: string;
  amount: string;
  debit_amount: string;
  credit_amount: string;
}

export interface FinanceExportBatchSummary {
  id: string;
  club_id: string;
  export_profile: FinanceExportProfile;
  date_from: string;
  date_to: string;
  status: FinanceExportBatchStatus;
  created_by_person_id: string;
  generated_at: string;
  file_name: string;
  content_hash: string;
  transaction_count: number;
  total_debits: string;
  total_credits: string;
  metadata_json: {
    selection_timezone?: string;
    selection_window?: {
      date_from?: string;
      date_to?: string;
    };
    source_counts?: Record<string, number>;
    transaction_type_counts?: Record<string, number>;
  };
}

export interface FinanceExportBatchDetail extends FinanceExportBatchSummary {
  rows: FinanceExportBatchPreviewRow[];
}

export interface FinanceExportBatchCreateInput {
  export_profile: FinanceExportProfile;
  date_from: string;
  date_to: string;
}

export interface FinanceExportBatchCreateResult {
  created: boolean;
  batch: FinanceExportBatchDetail;
}

export interface FinanceExportBatchListResponse {
  batches: FinanceExportBatchSummary[];
  total_count: number;
}

export interface FinanceExportBatchVoidResult {
  void_applied: boolean;
  batch: FinanceExportBatchDetail;
}

export type FinanceTargetSystem = "generic_journal" | "pastel_like" | "sage_like";

export interface AccountingExportProfileTransactionMapping {
  debit_account_code: string;
  credit_account_code: string;
  description_prefix: string;
}

export interface AccountingExportProfileMappingConfig {
  reference_prefix: string;
  fallback_customer_code: string;
  transaction_mappings: Partial<Record<FinanceTransactionType, AccountingExportProfileTransactionMapping>>;
}

export interface AccountingExportProfile {
  id: string;
  club_id: string;
  code: string;
  name: string;
  target_system: string;
  is_active: boolean;
  mapping_config: AccountingExportProfileMappingConfig;
  created_by_person_id: string;
  created_at: string;
  updated_at: string;
}

export interface AccountingExportProfileInput {
  code: string;
  name: string;
  target_system: string;
  is_active: boolean;
  mapping_config: AccountingExportProfileMappingConfig;
}

export interface AccountingExportProfileListResponse {
  profiles: AccountingExportProfile[];
  total_count: number;
}

export interface AccountingMappedExportPreviewRow {
  date: string;
  reference: string;
  description: string;
  debit_account_code: string;
  credit_account_code: string;
  amount: string;
  customer_account_code: string;
  source_type: string;
}

export interface AccountingMappedExportValidationError {
  code: string;
  message: string;
  row_index: number | null;
  field: string | null;
}

export interface AccountingMappedExportPreview {
  source_batch_id: string;
  source_export_profile: FinanceExportProfile;
  accounting_profile_id: string;
  accounting_profile_code: string;
  accounting_profile_name: string;
  target_system: string;
  generated_at: string;
  file_name: string;
  content_hash: string;
  row_count: number;
  download_ready: boolean;
  metadata_json: {
    output_mode?: string;
    source_batch_content_hash?: string;
    source_batch_file_name?: string;
    column_order?: string[];
  };
  validation_errors: AccountingMappedExportValidationError[];
  rows: AccountingMappedExportPreviewRow[];
}
