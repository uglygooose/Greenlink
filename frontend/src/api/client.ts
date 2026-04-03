import { apiBaseUrl } from "../lib/env";
import {
  emitSessionExpired,
  getAccessToken,
  getSelectedClubId,
  setAccessToken,
} from "../auth/token-storage";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions extends RequestInit {
  accessToken?: string | null;
  selectedClubId?: string | null;
}

interface TokenResponseBody {
  access_token: string;
}

type ErrorBody = {
  message?: string;
  detail?:
    | string
    | Array<{
        loc?: Array<string | number>;
        msg?: string;
      }>;
};

function extractErrorMessage(body: ErrorBody | null): string {
  if (!body) {
    return "Request failed";
  }
  if (typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }
  if (typeof body.detail === "string" && body.detail.trim()) {
    return body.detail;
  }
  if (Array.isArray(body.detail) && body.detail.length > 0) {
    const firstIssue = body.detail[0];
    const field = firstIssue.loc?.[firstIssue.loc.length - 1];
    if (firstIssue.msg && typeof field === "string") {
      return `${field}: ${firstIssue.msg}`;
    }
    if (firstIssue.msg) {
      return firstIssue.msg;
    }
  }
  return "Request failed";
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        setAccessToken(null);
        emitSessionExpired();
        return null;
      }
      const body = (await response.json()) as TokenResponseBody;
      setAccessToken(body.access_token);
      return body.access_token;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}, allowRefresh = true): Promise<T> {
  const token = getAccessToken() ?? options.accessToken ?? null;
  const selectedClubId = options.selectedClubId ?? getSelectedClubId();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (selectedClubId) {
    headers.set("X-Club-Id", selectedClubId);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  if (!response.ok) {
    if (response.status === 401 && allowRefresh && path !== "/api/auth/login" && path !== "/api/auth/logout" && path !== "/api/auth/refresh") {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        return apiRequest<T>(path, { ...options, accessToken: refreshedToken, selectedClubId }, false);
      }
      throw new ApiError(401, "Session expired. Please sign in again.");
    }
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, extractErrorMessage(body));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
