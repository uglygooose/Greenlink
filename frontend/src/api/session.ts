import { apiRequest } from "./client";
import type { SessionBootstrap } from "../types/session";

export function fetchBootstrap(accessToken: string, selectedClubId: string | null): Promise<SessionBootstrap> {
  const query = selectedClubId ? `?selected_club_id=${selectedClubId}` : "";
  return apiRequest<SessionBootstrap>(`/api/session/bootstrap${query}`, {
    method: "GET",
    accessToken,
    selectedClubId
  });
}
