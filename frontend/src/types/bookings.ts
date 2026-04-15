export type BookingStatus = "reserved" | "checked_in" | "cancelled" | "completed" | "no_show";
export type BookingParticipantType = "member" | "guest" | "staff";
export type StartLane = "hole_1" | "hole_10";
export type BookingPaymentStatus = "pending" | "paid" | "complimentary" | "waived";

export interface BookingCreateParticipantInput {
  participant_type: BookingParticipantType;
  person_id?: string | null;
  guest_name?: string | null;
  is_primary: boolean;
}

export interface BookingCreateInput {
  course_id: string;
  tee_id?: string | null;
  start_lane?: StartLane | null;
  slot_datetime: string;
  slot_interval_minutes?: number | null;
  holes?: number | null;
  source?: "admin" | "member_portal";
  applies_to?: "member" | "guest" | "staff" | null;
  reference_datetime?: string | null;
  cart_flag?: boolean;
  caddie_flag?: boolean;
  participants: BookingCreateParticipantInput[];
}

export interface BookingParticipantSummary {
  id?: string;
  display_name: string;
  participant_type: BookingParticipantType;
  person_id?: string | null;
  club_membership_id?: string | null;
  guest_name?: string | null;
  sort_order?: number;
  is_primary: boolean;
}

export interface BookingSummary {
  id: string;
  club_id?: string;
  course_id?: string;
  tee_id?: string | null;
  start_lane?: StartLane | null;
  slot_interval_minutes?: number;
  holes: number;
  status: BookingStatus;
  source?: string;
  party_size: number;
  primary_person_id?: string | null;
  primary_membership_id?: string | null;
  cart_flag?: boolean;
  caddie_flag?: boolean;
  fee_label?: string | null;
  fee_amount?: string | null;
  fee_currency?: string | null;
  payment_status?: BookingPaymentStatus | null;
  slot_datetime: string;
  created_at?: string;
  updated_at?: string;
  participants: BookingParticipantSummary[];
}

export interface BookingCreateFailureDetail {
  code: string;
  message: string;
  field?: string | null;
}

export interface AvailabilityPolicyTrace {
  code: string;
  reason: string;
  details: Record<string, unknown>;
}

export interface AvailabilityPolicyNotice {
  code: string;
  message: string;
}

export interface AvailabilityPolicyResult {
  applies_to: "member" | "guest" | "staff";
  availability_status: string;
  blockers: AvailabilityPolicyTrace[];
  warnings: AvailabilityPolicyNotice[];
  resolved_checks: AvailabilityPolicyTrace[];
  unresolved_checks: AvailabilityPolicyTrace[];
}

export interface BookingCreateResult {
  decision: "allowed" | "blocked" | "indeterminate";
  booking: BookingSummary | null;
  availability: AvailabilityPolicyResult | null;
  failures: BookingCreateFailureDetail[];
}

export interface BookingUpdateInput {
  participants: BookingCreateParticipantInput[];
  holes?: number | null;
  applies_to?: "member" | "guest" | "staff" | null;
  reference_datetime?: string | null;
  cart_flag?: boolean;
  caddie_flag?: boolean;
}

export interface BookingUpdateFailureDetail {
  code: string;
  message: string;
  field?: string | null;
  current_status?: BookingStatus | null;
}

export interface BookingUpdateResult {
  booking_id: string;
  decision: "allowed" | "blocked" | "indeterminate";
  booking: BookingSummary | null;
  availability: AvailabilityPolicyResult | null;
  failures: BookingUpdateFailureDetail[];
}

export interface BookingFinanceMutationFailureDetail {
  code: string;
  message: string;
  field?: string | null;
  current_status?: BookingStatus | null;
  current_payment_status?: BookingPaymentStatus | null;
}

export interface BookingFinanceTransactionDetail {
  id: string;
  club_id: string;
  account_id: string;
  amount: string;
  type: "charge" | "payment" | "adjustment" | "refund";
  source: "booking" | "order" | "pos" | "manual";
  reference_id: string | null;
  description: string;
  created_at: string;
}

export interface BookingPaymentStatusUpdateInput {
  payment_status: BookingPaymentStatus;
}

export interface BookingPaymentStatusUpdateResult {
  booking_id: string;
  decision: "allowed" | "blocked";
  update_applied: boolean;
  booking: BookingSummary | null;
  failures: BookingFinanceMutationFailureDetail[];
}

export interface BookingChargePostInput {
  amount?: string | null;
  description?: string | null;
}

export interface BookingChargePostResult {
  booking_id: string;
  decision: "allowed" | "blocked";
  posting_applied: boolean;
  booking: BookingSummary | null;
  transaction: BookingFinanceTransactionDetail | null;
  balance: string | null;
  failures: BookingFinanceMutationFailureDetail[];
}

export interface BookingPaymentRecordResult {
  booking_id: string;
  decision: "allowed" | "blocked";
  settlement_applied: boolean;
  booking: BookingSummary | null;
  transaction: BookingFinanceTransactionDetail | null;
  balance: string | null;
  failures: BookingFinanceMutationFailureDetail[];
}

export interface BookingRefundInput {
  amount?: string | null;
  description?: string | null;
}

export interface BookingRefundResult {
  booking_id: string;
  decision: "allowed" | "blocked";
  refund_applied: boolean;
  booking: BookingSummary | null;
  transaction: BookingFinanceTransactionDetail | null;
  balance: string | null;
  failures: BookingFinanceMutationFailureDetail[];
}

export interface BookingLifecycleMutationFailureDetail {
  code: string;
  message: string;
  field?: string | null;
  current_status?: BookingStatus | null;
}

export interface BookingLifecycleMutationResult {
  booking_id: string;
  decision: "allowed" | "blocked";
  transition_applied: boolean;
  booking: BookingSummary | null;
  failures: BookingLifecycleMutationFailureDetail[];
}

export interface BookingCancelFailureDetail extends BookingLifecycleMutationFailureDetail {}

export interface BookingCancelResult extends BookingLifecycleMutationResult {
  failures: BookingCancelFailureDetail[];
}

export interface BookingCheckInFailureDetail extends BookingLifecycleMutationFailureDetail {}

export interface BookingCheckInResult extends BookingLifecycleMutationResult {
  failures: BookingCheckInFailureDetail[];
}

export interface BookingCompleteFailureDetail extends BookingLifecycleMutationFailureDetail {}

export interface BookingCompleteResult extends BookingLifecycleMutationResult {
  failures: BookingCompleteFailureDetail[];
}

export interface BookingNoShowFailureDetail extends BookingLifecycleMutationFailureDetail {}

export interface BookingNoShowResult extends BookingLifecycleMutationResult {
  failures: BookingNoShowFailureDetail[];
}

export interface BookingMoveFailureDetail {
  code: string;
  message: string;
  field?: string | null;
  current_status?: BookingStatus | null;
}

export interface BookingMoveInput {
  target_slot_datetime: string;
  target_start_lane?: StartLane | null;
  target_tee_id?: string | null;
  participant_id?: string | null;
}

export interface BookingMoveResult {
  booking_id: string;
  decision: "allowed" | "blocked";
  transition_applied: boolean;
  booking: BookingSummary | null;
  failures: BookingMoveFailureDetail[];
}

export interface PlayerBookingReadModelItem {
  id: string;
  status: BookingStatus;
  source: "admin" | "member_portal";
  slot_datetime: string;
  holes: number;
  local_date: string;
  local_time: string;
  course_name: string;
  tee_name?: string | null;
  start_lane?: StartLane | null;
  party_size: number;
  primary_participant_name?: string | null;
  participant_names: string[];
  fee_label?: string | null;
  fee_amount?: string | null;
  fee_currency?: string | null;
  payment_status?: BookingPaymentStatus | null;
}

export interface PlayerBookingReadModelResponse {
  timezone: string;
  reference_datetime: string;
  upcoming: PlayerBookingReadModelItem[];
  history: PlayerBookingReadModelItem[];
}
