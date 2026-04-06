export type UserType = "superadmin" | "user";
export type MembershipRole = "club_admin" | "club_staff" | "member";
export type MembershipStatus = "active" | "invited" | "suspended" | "inactive";
export type RoleShell = "admin" | "player" | "superadmin" | null;
export type SessionMenuShell = "admin" | "player" | "superadmin";

export interface SessionUser {
  id: string;
  email: string;
  display_name: string;
  user_type: UserType;
}

export interface AvailableClub {
  club_id: string;
  club_name: string;
  club_slug: string;
  membership_role: MembershipRole | null;
  membership_status: MembershipStatus | null;
  selectable: boolean;
  is_primary_hint: boolean;
}

export interface SelectedClub {
  id: string;
  name: string;
  slug: string;
  location: string;
  timezone: string;
  branding: {
    logo_object_key: string | null;
    name: string | null;
  };
}

export interface SessionMenuItem {
  key: string;
  label: string;
  path: string;
  shell: SessionMenuShell;
  domain: string;
  module_key: string | null;
}

export interface SessionBootstrap {
  user: SessionUser;
  available_clubs: AvailableClub[];
  selected_club_id: string | null;
  selected_club: SelectedClub | null;
  club_selection_required: boolean;
  role_shell: RoleShell;
  default_workspace: string | null;
  landing_path: string;
  module_flags: Record<string, boolean>;
  menu_items?: SessionMenuItem[];
  permissions: string[];
  feature_flags: Record<string, boolean>;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in_seconds: number;
  user: SessionUser;
}
