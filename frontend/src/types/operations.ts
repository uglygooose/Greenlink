export type BookingRuleAppliesTo = "member" | "guest" | "staff";
export type BookingRuleType =
  | "advance_window"
  | "max_bookings_per_day"
  | "max_future_bookings"
  | "guest_limit"
  | "time_restriction";
export type PricingRuleAppliesTo = "member" | "guest";
export type PricingDayType = "weekday" | "weekend" | "public_holiday";
export type PricingTimeBand = "morning" | "afternoon" | "custom";

export interface ClubConfig {
  id: string;
  club_id: string;
  timezone: string;
  operating_hours: Record<string, unknown>;
  booking_window_days: number;
  cancellation_policy_hours: number;
  default_slot_interval_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface ClubConfigInput {
  timezone: string;
  operating_hours: Record<string, unknown>;
  booking_window_days: number;
  cancellation_policy_hours: number;
  default_slot_interval_minutes: number;
}

export interface Course {
  id: string;
  club_id: string;
  name: string;
  holes: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourseInput {
  name: string;
  holes: number;
  active: boolean;
}

export interface Tee {
  id: string;
  course_id: string;
  course_name: string;
  name: string;
  gender: string | null;
  slope_rating: number;
  course_rating: string;
  color_code: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeeInput {
  course_id: string;
  name: string;
  gender: string | null;
  slope_rating: number;
  course_rating: string;
  color_code: string;
  active: boolean;
}

export interface BookingRule {
  id: string;
  type: BookingRuleType;
  evaluation_order: number;
  config: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BookingRuleInput {
  type: BookingRuleType;
  evaluation_order?: number;
  config: Record<string, unknown>;
  active: boolean;
}

export interface BookingRuleSet {
  id: string;
  club_id: string;
  name: string;
  applies_to: BookingRuleAppliesTo;
  scope_type: "club" | "course" | "tee" | "membership_role" | "applies_to_bucket";
  scope_ref_id: string | null;
  conflict_strategy: "first_match" | "merge" | "override";
  applies_from: string | null;
  applies_until: string | null;
  priority: number;
  active: boolean;
  rules: BookingRule[];
  created_at: string;
  updated_at: string;
}

export interface BookingRuleSetInput {
  name: string;
  applies_to: BookingRuleAppliesTo;
  scope_type?: "club" | "course" | "tee" | "membership_role" | "applies_to_bucket";
  scope_ref_id?: string | null;
  conflict_strategy?: "first_match" | "merge" | "override";
  applies_from?: string | null;
  applies_until?: string | null;
  priority: number;
  active: boolean;
  rules: BookingRuleInput[];
}

export interface PricingRule {
  id: string;
  applies_to: PricingRuleAppliesTo;
  day_type: PricingDayType;
  time_band: PricingTimeBand;
  time_band_ref: string | null;
  price: string;
  currency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PricingRuleInput {
  applies_to: PricingRuleAppliesTo;
  day_type: PricingDayType;
  time_band: PricingTimeBand;
  time_band_ref?: string | null;
  price: string;
  currency: string;
  active: boolean;
}

export interface PricingMatrix {
  id: string;
  club_id: string;
  name: string;
  active: boolean;
  rules: PricingRule[];
  created_at: string;
  updated_at: string;
}

export interface PricingMatrixInput {
  name: string;
  active: boolean;
  rules: PricingRuleInput[];
}
