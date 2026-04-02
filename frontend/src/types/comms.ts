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
