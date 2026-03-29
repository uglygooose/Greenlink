import type { BookingRuleAppliesTo } from "./operations";

export type TeeSheetSlotDisplayStatus = "available" | "blocked" | "reserved" | "indeterminate" | "warning";

export interface TeeSheetTrace {
  code: string;
  reason: string;
  details: Record<string, unknown>;
}

export interface TeeSheetNotice {
  code: string;
  message: string;
}

export interface TeeSheetSlotView {
  slot_datetime: string;
  local_time: string;
  display_status: TeeSheetSlotDisplayStatus;
  state_flags: Record<string, boolean>;
  occupancy: {
    player_capacity: number | null;
    occupied_player_count: number | null;
    reserved_player_count: number | null;
    confirmed_booking_count: number | null;
    reserved_booking_count: number | null;
    remaining_player_capacity: number | null;
  };
  party_summary: {
    member_count: number | null;
    guest_count: number | null;
    staff_count: number | null;
    total_players: number | null;
    has_activity: boolean;
  };
  policy_summary: {
    applies_to: BookingRuleAppliesTo;
    availability_status: string;
    blocker_count: number;
    unresolved_count: number;
    warning_count: number;
  };
  blockers: TeeSheetTrace[];
  unresolved_checks: TeeSheetTrace[];
  warnings: TeeSheetNotice[];
}

export interface TeeSheetRow {
  row_key: string;
  tee_id: string | null;
  label: string;
  color_code: string | null;
  slots: TeeSheetSlotView[];
}

export interface TeeSheetDayResponse {
  club_id: string;
  course_id: string;
  course_name: string;
  date: string;
  timezone: string;
  interval_minutes: number;
  membership_type: BookingRuleAppliesTo;
  reference_datetime: string;
  rows: TeeSheetRow[];
  warnings: TeeSheetNotice[];
}
