export type TenderType = "cash" | "card" | "member_account";

export interface PosProduct {
  id: string;
  club_id: string;
  name: string;
  description: string | null;
  price: string;
  category: string | null;
  active: boolean;
}

export interface PosTransactionItemInput {
  product_id?: string | null;
  item_name: string;
  unit_price: string;
  quantity: number;
}

export interface PosTransactionCreateInput {
  items: PosTransactionItemInput[];
  tender_type: TenderType;
  person_id?: string | null;
  notes?: string | null;
}

export interface PosTransactionItemDetail {
  id: string;
  product_id: string | null;
  item_name_snapshot: string;
  unit_price_snapshot: string;
  quantity: number;
  line_total: string;
}

export interface PosTransactionDetail {
  id: string;
  club_id: string;
  total_amount: string;
  tender_type: TenderType;
  finance_transaction_id: string | null;
  notes: string | null;
  created_by_user_id: string;
  created_at: string;
  items: PosTransactionItemDetail[];
}

export interface PosTransactionResult {
  decision: "allowed" | "blocked";
  transaction_applied: boolean;
  transaction: PosTransactionDetail | null;
  failures: string[];
}

export interface CartItem {
  product_id: string | null;
  item_name: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}
