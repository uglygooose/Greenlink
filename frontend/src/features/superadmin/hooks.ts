import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import { useSession } from "../../session/session-context";
import type {
  SuperadminAccountingProfileSummary,
  SuperadminAccountingProfileActivationInput,
  SuperadminAccountingProfileBindInput,
  SuperadminAccountingProfileCreateInput,
  SuperadminAccountingProfileListResponse,
  SuperadminAccountingSampleLayout,
  SuperadminAccountingTemplateParseResult,
  SuperadminAssignmentCandidateListResponse,
  SuperadminClubAssignmentInput,
  SuperadminClubCreateInput,
  SuperadminClubAssignmentResponse,
  SuperadminClubInvitationCreateInput,
  SuperadminClubInvitationListResponse,
  SuperadminClubInvitationResponse,
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
  accountingProfiles: (clubId: string | null) =>
    ["superadmin", "accounting-profiles", clubId ?? "all"] as const,
  accountingSampleLayout: (targetSystem: string) =>
    ["superadmin", "accounting-profiles", "sample-layout", targetSystem] as const,
  onboarding: (clubId: string) => ["superadmin", "clubs", clubId, "onboarding"] as const,
  invitations: (clubId: string) => ["superadmin", "clubs", clubId, "invitations"] as const,
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

interface AccountingProfilesOptions extends SuperadminOptions {
  clubId: string | null;
}

export function useSuperadminAccountingProfilesQuery({
  accessToken,
  clubId,
}: AccountingProfilesOptions) {
  return useQuery<SuperadminAccountingProfileListResponse>({
    queryKey: superadminKeys.accountingProfiles(clubId),
    queryFn: () =>
      apiRequest<SuperadminAccountingProfileListResponse>(
        `/api/superadmin/accounting-profiles${clubId ? `?club_id=${encodeURIComponent(clubId)}` : ""}`,
        {
          method: "GET",
          accessToken: accessToken as string,
        },
      ),
    enabled: isReady(accessToken),
  });
}

interface AccountingSampleLayoutOptions extends SuperadminOptions {
  targetSystem: string;
}

export function useSuperadminAccountingSampleLayoutQuery({
  accessToken,
  targetSystem,
}: AccountingSampleLayoutOptions) {
  return useQuery<SuperadminAccountingSampleLayout>({
    queryKey: superadminKeys.accountingSampleLayout(targetSystem),
    queryFn: () =>
      apiRequest<SuperadminAccountingSampleLayout>(
        `/api/superadmin/accounting-profiles/sample-layout?target_system=${encodeURIComponent(targetSystem)}`,
        {
          method: "GET",
          accessToken: accessToken as string,
        },
      ),
    enabled: isReady(accessToken) && targetSystem.trim().length > 0,
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

export function useSuperadminClubInvitationsQuery({ accessToken, clubId }: OnboardingOptions) {
  return useQuery<SuperadminClubInvitationListResponse>({
    queryKey: superadminKeys.invitations(clubId ?? "none"),
    queryFn: () =>
      apiRequest<SuperadminClubInvitationListResponse>(`/api/superadmin/clubs/${clubId}/invitations`, {
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

export function useCreateSuperadminAccountingProfileMutation() {
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  return useMutation({
    mutationFn: (payload: SuperadminAccountingProfileCreateInput) =>
      apiRequest<SuperadminAccountingProfileSummary>(
        "/api/superadmin/accounting-profiles",
        {
          method: "POST",
          accessToken: accessToken as string,
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: superadminKeys.accountingProfiles(null) });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.accountingProfiles(result.club_id) });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.clubs });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.onboarding(result.club_id) });
    },
  });
}

export function useUpdateSuperadminAccountingProfileActiveMutation() {
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  return useMutation({
    mutationFn: ({
      profileId,
      payload,
    }: {
      profileId: string;
      payload: SuperadminAccountingProfileActivationInput;
    }) =>
      apiRequest<SuperadminAccountingProfileSummary>(
        `/api/superadmin/accounting-profiles/${profileId}/active`,
        {
          method: "PATCH",
          accessToken: accessToken as string,
          body: JSON.stringify(payload),
        },
      ),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: superadminKeys.accountingProfiles(null) });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.accountingProfiles(result.club_id) });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.clubs });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.onboarding(result.club_id) });
    },
  });
}

export function useBindSuperadminAccountingProfileMutation() {
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: string; payload: SuperadminAccountingProfileBindInput }) =>
      apiRequest<SuperadminClubOnboardingDetail>(`/api/superadmin/clubs/${clubId}/onboarding/finance/bind-profile`, {
        method: "POST",
        accessToken: accessToken as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async (result, variables) => {
      queryClient.setQueryData(superadminKeys.onboarding(variables.clubId), result);
      await queryClient.invalidateQueries({ queryKey: superadminKeys.accountingProfiles(null) });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.accountingProfiles(variables.clubId) });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.clubs });
    },
  });
}

export function useParseSuperadminAccountingTemplateMutation() {
  const { accessToken } = useSession();

  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiRequest<SuperadminAccountingTemplateParseResult>("/api/superadmin/accounting-profiles/parse-template", {
        method: "POST",
        accessToken: accessToken as string,
        body: formData,
      });
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

export function useCreateSuperadminClubInvitationMutation() {
  const queryClient = useQueryClient();
  const { accessToken } = useSession();

  return useMutation({
    mutationFn: ({ clubId, payload }: { clubId: string; payload: SuperadminClubInvitationCreateInput }) =>
      apiRequest<SuperadminClubInvitationResponse>(`/api/superadmin/clubs/${clubId}/invitations`, {
        method: "POST",
        accessToken: accessToken as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: superadminKeys.invitations(variables.clubId) });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.onboarding(variables.clubId) });
      await queryClient.invalidateQueries({ queryKey: superadminKeys.clubs });
    },
  });
}
