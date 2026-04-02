export type FinanceAccountStatus = "active" | "suspended" | "closed";
export type FinanceTransactionType = "charge" | "payment" | "adjustment" | "refund";
export type FinanceTransactionSource = "booking" | "pos" | "order" | "manual" | "settlement";

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
