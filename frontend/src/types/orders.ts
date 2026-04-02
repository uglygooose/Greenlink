export type OrderSource = "player_app" | "staff";
export type OrderStatus = "placed" | "preparing" | "ready" | "collected" | "cancelled";
export type TenderType = "cash" | "card" | "member_account";

export interface OrderMenuItem {
  product_id: string;
  item_name: string;
  description: string;
  unit_price: string;
}

export interface OrderCreateItemInput {
  product_id?: string | null;
  item_name: string;
  unit_price: string;
  quantity: number;
}

export interface OrderCreateInput {
  person_id?: string | null;
  booking_id?: string | null;
  source: OrderSource;
  items: OrderCreateItemInput[];
}

export interface OrderPersonSummary {
  id: string;
  full_name: string;
}

export interface OrderItemSnapshot {
  id: string;
  order_id: string;
  product_id: string | null;
  item_name_snapshot: string;
  unit_price_snapshot: string;
  quantity: number;
  created_at: string;
}

export interface OrderSummary {
  id: string;
  club_id: string;
  person_id: string;
  person: OrderPersonSummary;
  booking_id: string | null;
  finance_charge_transaction_id: string | null;
  finance_charge_posted: boolean;
  finance_payment_transaction_id?: string | null;
  finance_payment_posted?: boolean;
  finance_tender_record_id?: string | null;
  tender_recorded?: boolean;
  payment_tender_type?: TenderType | null;
  source: OrderSource;
  status: OrderStatus;
  created_at: string;
  item_count: number;
  item_summary: string;
}

export interface OrderDetail extends OrderSummary {
  items: OrderItemSnapshot[];
}

export interface OrderCreateResult {
  order: OrderDetail;
  created: boolean;
}

export interface OrderLifecycleMutationFailureDetail {
  code: string;
  message: string;
  field?: string | null;
  current_status?: OrderStatus | null;
}

export interface OrderLifecycleMutationResult {
  order_id: string;
  decision: "allowed" | "blocked";
  transition_applied: boolean;
  order: OrderDetail | null;
  failures: OrderLifecycleMutationFailureDetail[];
}

export interface OrderPreparingResult extends OrderLifecycleMutationResult {}

export interface OrderReadyResult extends OrderLifecycleMutationResult {}

export interface OrderCollectedResult extends OrderLifecycleMutationResult {}

export interface OrderCancelResult extends OrderLifecycleMutationResult {}

export interface OrderChargePostFailureDetail {
  code: string;
  message: string;
  field?: string | null;
  current_status?: OrderStatus | null;
}

export interface OrderChargePostResult {
  order_id: string;
  decision: "allowed" | "blocked";
  posting_applied: boolean;
  order: OrderDetail | null;
  transaction: {
    id: string;
    club_id: string;
    account_id: string;
    amount: string;
    type: "charge" | "payment" | "adjustment";
    source: "booking" | "order" | "pos" | "manual";
    reference_id: string | null;
    description: string;
    created_at: string;
  } | null;
  balance: string | null;
  failures: OrderChargePostFailureDetail[];
}

export interface OrderSettlementRequestInput {
  tender_type: TenderType;
}

export interface OrderSettlementResult {
  decision: "allowed" | "blocked";
  settlement_applied: boolean;
  order: OrderDetail | null;
  tender: {
    id: string;
    club_id: string;
    account_id: string;
    source: "booking" | "order" | "pos" | "manual";
    reference_id: string | null;
    tender_type: TenderType;
    amount: string;
    charge_transaction_id: string | null;
    settlement_transaction_id: string | null;
    description: string;
    created_at: string;
    settlement_applied: boolean;
  } | null;
  transaction: {
    id: string;
    club_id: string;
    account_id: string;
    amount: string;
    type: "charge" | "payment" | "adjustment";
    source: "booking" | "order" | "pos" | "manual";
    reference_id: string | null;
    description: string;
    created_at: string;
    tender_type: TenderType | null;
  } | null;
  balance: string | null;
  failures: string[];
}
