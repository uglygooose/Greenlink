export type BookingStatus = "reserved" | "checked_in" | "cancelled" | "completed" | "no_show";
export type BookingParticipantType = "member" | "guest" | "staff";

export interface BookingCreateParticipantInput {
  participant_type: BookingParticipantType;
  person_id?: string | null;
  guest_name?: string | null;
  is_primary: boolean;
}

export interface BookingCreateInput {
  course_id: string;
  tee_id?: string | null;
  slot_datetime: string;
  slot_interval_minutes?: number | null;
  source?: "admin";
  applies_to?: "member" | "staff" | null;
  reference_datetime?: string | null;
  participants: BookingCreateParticipantInput[];
}

export interface BookingParticipantSummary {
  display_name: string;
  participant_type: BookingParticipantType;
  is_primary: boolean;
}

export interface BookingSummary {
  id: string;
  club_id?: string;
  course_id?: string;
  tee_id?: string | null;
  slot_interval_minutes?: number;
  status: BookingStatus;
  source?: string;
  party_size: number;
  primary_person_id?: string | null;
  primary_membership_id?: string | null;
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
