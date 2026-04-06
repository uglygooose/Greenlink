import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchSelfProfile, updateSelfProfile } from "../../api/operations";
import type { SelfProfileResponse, SelfProfileUpdateInput } from "../../types/profile";

export const profileKeys = {
  self: (clubId: string) => ["profile", clubId, "self"] as const,
};

interface ProfileQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

function isReady(accessToken: string | null, selectedClubId: string | null): boolean {
  return Boolean(accessToken && selectedClubId);
}

export function useSelfProfileQuery({ accessToken, selectedClubId }: ProfileQueryOptions) {
  return useQuery<SelfProfileResponse>({
    queryKey: profileKeys.self(selectedClubId ?? "none"),
    queryFn: () =>
      fetchSelfProfile({
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useUpdateSelfProfileMutation({ accessToken, selectedClubId }: ProfileQueryOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SelfProfileUpdateInput) =>
      updateSelfProfile(payload, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      if (!selectedClubId) {
        return;
      }
      await queryClient.invalidateQueries({ queryKey: profileKeys.self(selectedClubId) });
    },
  });
}
