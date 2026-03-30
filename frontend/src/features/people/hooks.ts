import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import type { ClubPersonEntry } from "../../types/people";

interface PeopleQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

export const peopleKeys = {
  directory: (clubId: string) => ["people", clubId, "directory"] as const,
};

export function useClubDirectoryQuery({ accessToken, selectedClubId }: PeopleQueryOptions) {
  return useQuery<ClubPersonEntry[]>({
    queryKey: peopleKeys.directory(selectedClubId ?? "none"),
    queryFn: () =>
      apiRequest<ClubPersonEntry[]>("/api/people/club-directory", {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: Boolean(accessToken && selectedClubId),
  });
}
