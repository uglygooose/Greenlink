const ACCESS_TOKEN_KEY = "greenlink.accessToken";
const SELECTED_CLUB_KEY = "greenlink.selectedClubId";
export const AUTH_TOKEN_CHANGED_EVENT = "greenlink:auth-token-changed";
export const SESSION_EXPIRED_EVENT = "greenlink:session-expired";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token === null) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  } else {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_TOKEN_CHANGED_EVENT, { detail: { token } }));
  }
}

export function getSelectedClubId(): string | null {
  return localStorage.getItem(SELECTED_CLUB_KEY);
}

export function setSelectedClubId(clubId: string | null): void {
  if (clubId === null) {
    localStorage.removeItem(SELECTED_CLUB_KEY);
    return;
  }
  localStorage.setItem(SELECTED_CLUB_KEY, clubId);
}

export function emitSessionExpired(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}
