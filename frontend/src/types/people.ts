export type ClubMembershipRole = "CLUB_ADMIN" | "CLUB_STAFF" | "MEMBER";
export type ClubMembershipStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface PersonRecord {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  external_ref: string | null;
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
  membership_number: string | null;
}

export interface ClubPersonEntry {
  person: PersonRecord;
  membership: MembershipRecord;
}
