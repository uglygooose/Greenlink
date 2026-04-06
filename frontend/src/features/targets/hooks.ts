import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import { useSession } from "../../session/session-context";
import type {
  ClubTarget,
  ClubTargetListResponse,
  ClubTargetUpsertInput,
  TargetMetricCatalogResponse,
} from "../../types/targets";

function isReady(accessToken: string | null, selectedClubId: string | null): boolean {
  return Boolean(accessToken && selectedClubId);
}

interface TargetsQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

export const targetsKeys = {
  catalog: (clubId: string) => ["targets", clubId, "catalog"] as const,
  list: (clubId: string) => ["targets", clubId, "list"] as const,
};

export function useTargetMetricCatalogQuery({ accessToken, selectedClubId }: TargetsQueryOptions) {
  return useQuery<TargetMetricCatalogResponse>({
    queryKey: targetsKeys.catalog(selectedClubId ?? "none"),
    queryFn: () =>
      apiRequest<TargetMetricCatalogResponse>("/api/targets/metrics", {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useClubTargetsQuery({ accessToken, selectedClubId }: TargetsQueryOptions) {
  return useQuery<ClubTargetListResponse>({
    queryKey: targetsKeys.list(selectedClubId ?? "none"),
    queryFn: () =>
      apiRequest<ClubTargetListResponse>("/api/targets", {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useCreateClubTargetMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (payload: ClubTargetUpsertInput) =>
      apiRequest<ClubTarget>("/api/targets", {
        method: "POST",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      if (!selectedClubId) return;
      await queryClient.invalidateQueries({ queryKey: targetsKeys.list(selectedClubId) });
    },
  });
}

export function useUpdateClubTargetMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: ({ targetId, payload }: { targetId: string; payload: ClubTargetUpsertInput }) =>
      apiRequest<ClubTarget>(`/api/targets/${targetId}`, {
        method: "PATCH",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      if (!selectedClubId) return;
      await queryClient.invalidateQueries({ queryKey: targetsKeys.list(selectedClubId) });
    },
  });
}

export function useArchiveClubTargetMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (targetId: string) =>
      apiRequest<ClubTarget>(`/api/targets/${targetId}/archive`, {
        method: "POST",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      if (!selectedClubId) return;
      await queryClient.invalidateQueries({ queryKey: targetsKeys.list(selectedClubId) });
    },
  });
}
