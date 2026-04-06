import { apiBaseUrl, appEnv } from "../lib/env";
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

let resolvedApiBaseUrl = apiBaseUrl;

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

function buildLocalApiBaseCandidates(baseUrl: string): string[] {
  const candidates = [baseUrl];

  if (appEnv !== "development" || typeof window === "undefined") {
    return candidates;
  }

  try {
    const parsed = new URL(baseUrl);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
      return candidates;
    }

    for (const port of ["8000", "8001"]) {
      if (parsed.port === port) {
        continue;
      }
      const fallback = new URL(parsed.toString());
      fallback.port = port;
      candidates.push(fallback.toString().replace(/\/$/, ""));
    }
  } catch {
    return candidates;
  }

  return candidates;
}

async function fetchWithApiBaseFallback(path: string, init: RequestInit): Promise<Response> {
  let lastError: unknown = null;

  for (const baseUrl of buildLocalApiBaseCandidates(resolvedApiBaseUrl)) {
    try {
      const response = await fetch(`${baseUrl}${path}`, init);
      resolvedApiBaseUrl = baseUrl;
      return response;
    } catch (error) {
      lastError = error;
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new TypeError("Failed to fetch");
}

export function resetApiBaseUrlForTests(nextBaseUrl?: string): void {
  resolvedApiBaseUrl = nextBaseUrl ?? apiBaseUrl;
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetchWithApiBaseFallback("/api/auth/refresh", {
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

  const response = await fetchWithApiBaseFallback(path, {
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
