import type { MembershipRole, MembershipStatus } from "./session";

export type ClubOnboardingState =
  | "onboarding_started"
  | "data_pending"
  | "setup_in_progress"
  | "ready_for_go_live"
  | "live";

export type ClubOnboardingStep = "basic_info" | "finance" | "rules" | "modules";
export type ClubRegistryStatus = "active" | "onboarding" | "paused";
export type OnboardingStepStatus = "complete" | "current" | "upcoming";

export interface SuperadminClubSummary {
  id: string;
  name: string;
  slug: string;
  location: string;
  timezone: string;
  active: boolean;
  onboarding_state: ClubOnboardingState;
  onboarding_current_step: ClubOnboardingStep;
  registry_status: ClubRegistryStatus;
  finance_ready: boolean;
  finance_profile_count: number;
  active_assignment_count: number;
  created_at: string;
  updated_at: string;
}

export interface SuperadminClubListResponse {
  items: SuperadminClubSummary[];
  total_count: number;
}

export interface SuperadminFinanceProfileSummary {
  id: string;
  code: string;
  name: string;
  target_system: string;
  is_active: boolean;
}

export interface SuperadminFinanceSetupSummary {
  selected_accounting_profile_id: string | null;
  selected_accounting_profile_name: string | null;
  profile_count: number;
  active_profile_count: number;
  setup_complete: boolean;
  mapping_ready: boolean;
  profiles: SuperadminFinanceProfileSummary[];
}

export interface SuperadminRulesSetupSummary {
  rule_set_count: number;
  pricing_matrix_count: number;
  setup_complete: boolean;
}

export interface SuperadminModuleSetupSummary {
  enabled_module_keys: string[];
  setup_complete: boolean;
}

export interface SuperadminAssignedUserSummary {
  membership_id: string;
  user_id: string;
  person_id: string;
  display_name: string;
  email: string;
  role: MembershipRole;
  status: MembershipStatus;
  is_primary: boolean;
}

export interface SuperadminAssignmentCandidate {
  user_id: string;
  person_id: string;
  display_name: string;
  email: string;
}

export interface SuperadminAssignmentCandidateListResponse {
  items: SuperadminAssignmentCandidate[];
  total_count: number;
}

export interface SuperadminOnboardingStep {
  key: ClubOnboardingStep;
  label: string;
  status: OnboardingStepStatus;
  ready: boolean;
}

export interface SuperadminClubOnboardingDetail {
  club: SuperadminClubSummary;
  progress_percent: number;
  steps: SuperadminOnboardingStep[];
  finance: SuperadminFinanceSetupSummary;
  rules: SuperadminRulesSetupSummary;
  modules: SuperadminModuleSetupSummary;
  assignments: SuperadminAssignedUserSummary[];
}

export interface SuperadminClubCreateInput {
  name: string;
  location: string;
  timezone: string;
}

export interface SuperadminClubOnboardingUpdateInput {
  name?: string;
  location?: string;
  timezone?: string;
  onboarding_state?: ClubOnboardingState;
  onboarding_current_step?: ClubOnboardingStep;
  preferred_accounting_profile_id?: string | null;
}

export interface SuperadminClubAssignmentInput {
  person_id: string;
  role: Extract<MembershipRole, "club_admin" | "club_staff">;
}

export interface SuperadminClubAssignmentResponse {
  membership_id: string;
  club_id: string;
  person_id: string;
  role: Extract<MembershipRole, "club_admin" | "club_staff">;
  status: MembershipStatus;
  is_primary: boolean;
}
