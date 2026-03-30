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
