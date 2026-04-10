export type ClubMembershipRole = "CLUB_ADMIN" | "CLUB_STAFF" | "MEMBER";
export type ClubMembershipStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface PersonRecord {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  external_ref: string | null;
  notes: string | null;
  profile_metadata: Record<string, unknown>;
  linked_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipRecord {
  id: string;
  club_id: string;
  person_id: string;
  role: ClubMembershipRole;
  status: ClubMembershipStatus;
  joined_at: string;
  is_primary: boolean;
  membership_number: string | null;
  membership_metadata: Record<string, unknown>;
}

export interface AccountCustomerRecord {
  id: string;
  club_id: string;
  person_id: string;
  account_code: string;
  active: boolean;
  billing_email: string | null;
  billing_phone: string | null;
  billing_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PersonCreateInput {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
}

export interface PersonUpdateInput {
  first_name?: string;
  last_name?: string;
  email?: string | null;
  phone?: string | null;
}

export interface MembershipCreateInput {
  person_id: string;
  role: ClubMembershipRole;
  status: ClubMembershipStatus;
  joined_at?: string | null;
  membership_number?: string | null;
}

export interface MembershipUpdateInput {
  role?: ClubMembershipRole;
  status?: ClubMembershipStatus;
  joined_at?: string | null;
  membership_number?: string | null;
}

export interface AccountCustomerCreateInput {
  person_id: string;
  account_code: string;
  billing_email?: string | null;
  billing_phone?: string | null;
}

export interface ClubPersonEntry {
  person: PersonRecord;
  membership: MembershipRecord;
}
