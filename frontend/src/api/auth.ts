import { apiRequest } from "./client";
import type { SessionUser, TokenResponse } from "../types/session";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface InvitationAcceptPayload {
  token: string;
  password: string;
  display_name: string;
}

export interface InvitationActivatePayload {
  token: string;
}

export interface InvitationActivateResponse {
  invitation_id: string;
  club_id: string;
  membership_id: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  membership_status: "active" | "invited" | "suspended" | "inactive";
}

export function login(payload: LoginPayload): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function acceptInvitation(payload: InvitationAcceptPayload): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/api/auth/invitations/accept", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function activateInvitation(payload: InvitationActivatePayload): Promise<InvitationActivateResponse> {
  return apiRequest<InvitationActivateResponse>("/api/auth/invitations/activate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function refresh(): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/api/auth/refresh", {
    method: "POST"
  });
}

export function logout(accessToken: string | null): Promise<void> {
  return apiRequest<void>("/api/auth/logout", {
    method: "POST",
    accessToken
  });
}

export function fetchMe(accessToken: string): Promise<SessionUser> {
  return apiRequest<SessionUser>("/api/auth/me", {
    method: "GET",
    accessToken
  });
}
