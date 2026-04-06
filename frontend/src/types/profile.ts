export interface SelfProfileResponse {
  person_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  contact_email: string | null;
  account_email: string;
  phone: string | null;
  club_name?: string | null;
}

export interface SelfProfileUpdateInput {
  first_name: string;
  last_name: string;
  contact_email?: string | null;
  phone?: string | null;
}
