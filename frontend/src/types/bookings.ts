export type BookingStatus = "reserved" | "checked_in" | "cancelled" | "completed" | "no_show";
export type BookingParticipantType = "member" | "guest" | "staff";

export interface BookingParticipantSummary {
  display_name: string;
  participant_type: BookingParticipantType;
  is_primary: boolean;
}

export interface BookingSummary {
  id: string;
  status: BookingStatus;
  party_size: number;
  slot_datetime: string;
  participants: BookingParticipantSummary[];
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
