import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import { useSession } from "../../session/session-context";
import type {
  SuperadminAssignmentCandidateListResponse,
  SuperadminClubAssignmentInput,
  SuperadminClubCreateInput,
  SuperadminClubAssignmentResponse,
  SuperadminClubListResponse,
  SuperadminClubOnboardingDetail,
  SuperadminClubOnboardingUpdateInput,
  SuperadminClubSummary,
} from "../../types/superadmin";

function isReady(accessToken: string | null): boolean {
  return Boolean(accessToken);
}

interface SuperadminOptions {
  accessToken: string | null;
}

export const superadminKeys = {
  clubs: ["superadmin", "clubs"] as const,
  onboarding: (clubId: string) => ["superadmin", "clubs", clubId, "onboarding"] as const,
  assignmentCandidates: (clubId: string, query: string) =>
    ["superadmin", "clubs", clubId, "assignment-candidates", query] as const,
};

export function useSuperadminClubsQuery({ accessToken }: SuperadminOptions) {
  return useQuery<SuperadminClubListResponse>({
    queryKey: superadminKeys.clubs,
    queryFn: () =>
      apiRequest<SuperadminClubListResponse>("/api/superadmin/clubs", {
        method: "GET",
        accessToken: accessToken as string,
      }),
    enabled: isReady(accessToken),
  });
}

interface OnboardingOptions extends SuperadminOptions {
  clubId: string | null;
}

export function useSuperadminClubOnboardingQuery({ accessToken, clubId }: OnboardingOptions) {
  return useQuery<SuperadminClubOnboardingDetail>({
    queryKey: superadminKeys.onboarding(clubId ?? "none"),
    queryFn: () =>
      apiRequest<SuperadminClubOnboardingDetail>(`/api/superadmin/clubs/${clubId}/onboarding`, {
        method: "GET",
        accessToken: accessToken as string,
      }),
    enabled: isReady(accessToken) && Boolean(clubId),
  });
}

interface AssignmentCandidateOptions extends OnboardingOptions {
  query: string;
}

export function useSuperadminAssignmentCandidatesQuery({
  accessToken,
  clubId,
  query,
}: AssignmentCandidateOptions) {
  return useQuery<SuperadminAssignmentCandidateListResponse>({
    queryKey: superadminKeys.assignmentCandidates(clubId ?? "none", query),
    queryFn: () =>
      apiRequest<SuperadminAssignmentCandidateListResponse>(
        `/api/superadmin/clubs/${clubId}/assignment-candidates?q=${encodeURIComponent(query)}`,
        {
          method: "GET",
          accessToken: accessToken as string,
        },
      ),
    enabled: isReady(accessToken) && Boolean(clubId) && query.trim().length > 0,
  });
}

export function useCreateSuperadminClubMutation() {
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  return useMutation({
    mutationFn: (payload: SuperadminClubCreateInput) =>
      apiRequest<SuperadminClubSummary>("/api/superadmin/clubs", {
        method: "POST",
        accessToken: accessToken as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: superadminKeys.clubs });
    },
  });
}

export function useUpdateSuperadminClubOnboardingMutation() {
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: string; payload: SuperadminClubOnboardingUpdateInput }) =>
      apiRequest<SuperadminClubOnboardingDetail>(`/api/superadmin/clubs/${clubId}/onboarding`, {
        method: "PUT",
        accessToken: accessToken as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async (result, variables) => {
      queryClient.setQueryData(superadminKeys.onboarding(variables.clubId), result);
      await queryClient.invalidateQueries({ queryKey: superadminKeys.clubs });
    },
  });
}

export function useUpdateSuperadminClubStatusMutation() {
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  return useMutation({
    mutationFn: ({ clubId, active }: { clubId: string; active: boolean }) =>
      apiRequest<SuperadminClubSummary>(`/api/superadmin/clubs/${clubId}/status`, {
        method: "PATCH",
        accessToken: accessToken as string,
        body: JSON.stringify({ active }),
      }),
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries({ queryKey: superadminKeys.clubs });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.onboarding(variables.clubId) });
      queryClient.setQueryData<SuperadminClubOnboardingDetail>(
        superadminKeys.onboarding(variables.clubId),
        (old) => (old ? { ...old, club: result } : old),
      );
    },
  });
}

export function useDeleteSuperadminClubMutation() {
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  return useMutation({
    mutationFn: async (clubId: string) => {
      try {
        await apiRequest<void>(`/api/superadmin/clubs/${clubId}`, {
          method: "DELETE",
          accessToken: accessToken as string,
        });
      } catch (error) {
        if (error instanceof Error && "status" in error && error.status === 404) {
          return;
        }
        throw error;
      }
    },
    onSuccess: async (_, clubId) => {
      queryClient.setQueryData<SuperadminClubListResponse | undefined>(superadminKeys.clubs, (old) => {
        if (!old) return old;
        const items = old.items.filter((club) => club.id !== clubId);
        return { ...old, items, total_count: items.length };
      });
      queryClient.removeQueries({ queryKey: superadminKeys.onboarding(clubId) });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.clubs });
    },
  });
}

export function useAssignSuperadminClubUserMutation() {
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: string; payload: SuperadminClubAssignmentInput }) =>
      apiRequest<SuperadminClubAssignmentResponse>(`/api/superadmin/clubs/${clubId}/assignments`, {
        method: "POST",
        accessToken: accessToken as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: superadminKeys.onboarding(variables.clubId) });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.clubs });
      await queryClient.invalidateQueries({
        queryKey: superadminKeys.assignmentCandidates(variables.clubId, ""),
      });
    },
  });
}
