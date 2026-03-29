import { apiRequest } from "./client";
import type { SessionUser, TokenResponse } from "../types/session";

export interface LoginPayload {
  email: string;
  password: string;
}

export function login(payload: LoginPayload): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/api/auth/login", {
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
