import { apiBaseUrl } from "../lib/env";

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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }
  if (options.selectedClubId) {
    headers.set("X-Club-Id", options.selectedClubId);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null;
    throw new ApiError(response.status, extractErrorMessage(body));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
