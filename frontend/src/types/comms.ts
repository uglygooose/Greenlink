export type NewsPostVisibility = "public" | "members_only" | "internal";
export type NewsPostStatus = "draft" | "published";

export interface NewsPostAuthor {
  person_id: string;
  full_name: string;
}

export interface NewsPost {
  id: string;
  club_id: string;
  title: string;
  body: string;
  visibility: NewsPostVisibility;
  status: NewsPostStatus;
  pinned: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author: NewsPostAuthor | null;
}

export interface NewsPostListResponse {
  posts: NewsPost[];
  total_count: number;
}

export interface NewsPostCreateInput {
  title: string;
  body: string;
  visibility: NewsPostVisibility;
  pinned: boolean;
  publish: boolean;
}

export interface NewsPostUpdateInput {
  title?: string;
  body?: string;
  visibility?: NewsPostVisibility;
  pinned?: boolean;
  publish?: boolean;
  unpublish?: boolean;
}

// ── Communication Blasts ──────────────────────────────────────────────────────

export type BlastTargetSegment = "all" | "members" | "staff" | "admin";
export type BlastChannel = "in_app" | "email";
export type BlastStatus = "draft" | "sent" | "failed";

export interface BlastAuthor {
  person_id: string;
  full_name: string;
}

export interface CommunicationBlast {
  id: string;
  club_id: string;
  subject: string;
  body: string;
  target_segment: BlastTargetSegment;
  channel: BlastChannel;
  status: BlastStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number | null;
  delivery_note: string | null;
  created_at: string;
  updated_at: string;
  created_by: BlastAuthor | null;
}

export interface BlastListResponse {
  blasts: CommunicationBlast[];
  total_count: number;
}

export interface BlastCreateInput {
  subject: string;
  body: string;
  target_segment: BlastTargetSegment;
  channel: BlastChannel;
}

export interface BlastSendResponse {
  id: string;
  status: BlastStatus;
  recipient_count: number;
  delivery_note: string;
}
