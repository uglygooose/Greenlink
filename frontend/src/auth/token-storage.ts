const ACCESS_TOKEN_KEY = "greenlink.accessToken";
const SELECTED_CLUB_KEY = "greenlink.selectedClubId";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token === null) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
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
