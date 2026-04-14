import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  createCourse,
  createPricingMatrix,
  createRuleSet,
  createTee,
  fetchClubConfig,
  fetchCourses,
  fetchGolfSettingsReadiness,
  fetchPricingMatrices,
  fetchRuleSets,
  fetchTees,
  publishGolfPricingMatrix,
  publishGolfRuleSet,
  rollbackGolfPricingMatrix,
  rollbackGolfRuleSet,
  updateClubConfig,
  updatePricingMatrix,
  updateRuleSet,
} from "../../api/operations";
import { useSession } from "../../session/session-context";
import type {
  BookingRuleSet,
  BookingRuleSetInput,
  ClubConfig,
  ClubConfigInput,
  Course,
  CourseInput,
  GolfSettingsReadiness,
  PricingMatrix,
  PricingMatrixInput,
  Tee,
  TeeInput,
} from "../../types/operations";

export const operationsKeys = {
  clubConfig: (clubId: string) => ["operations", clubId, "club-config"] as const,
  courses: (clubId: string) => ["operations", clubId, "courses"] as const,
  tees: (clubId: string) => ["operations", clubId, "tees"] as const,
  rules: (clubId: string) => ["operations", clubId, "rules"] as const,
  pricing: (clubId: string) => ["operations", clubId, "pricing"] as const,
  readiness: (clubId: string) => ["operations", clubId, "golf-settings-readiness"] as const,
};

interface QueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

function isReady(accessToken: string | null, selectedClubId: string | null): accessToken is string {
  return Boolean(accessToken && selectedClubId);
}

async function invalidateOperationalSettingsWorkspace(
  queryClient: ReturnType<typeof useQueryClient>,
  selectedClubId: string | null,
  includeClubConfig = false,
): Promise<void> {
  if (!selectedClubId) {
    return;
  }

  const invalidations: Array<Promise<void>> = [
    queryClient.invalidateQueries({ queryKey: operationsKeys.courses(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: operationsKeys.tees(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: operationsKeys.rules(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: operationsKeys.pricing(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: operationsKeys.readiness(selectedClubId) }),
  ];

  if (includeClubConfig) {
    invalidations.push(queryClient.invalidateQueries({ queryKey: operationsKeys.clubConfig(selectedClubId) }));
  }

  await Promise.all(invalidations);
}

export function useClubConfigQuery({ accessToken, selectedClubId }: QueryOptions) {
  return useQuery<ClubConfig>({
    queryKey: operationsKeys.clubConfig(selectedClubId ?? "none"),
    queryFn: () => fetchClubConfig({ accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useCoursesQuery({ accessToken, selectedClubId }: QueryOptions) {
  return useQuery<Course[]>({
    queryKey: operationsKeys.courses(selectedClubId ?? "none"),
    queryFn: () => fetchCourses({ accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useTeesQuery({ accessToken, selectedClubId }: QueryOptions) {
  return useQuery<Tee[]>({
    queryKey: operationsKeys.tees(selectedClubId ?? "none"),
    queryFn: () => fetchTees({ accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useRuleSetsQuery({ accessToken, selectedClubId }: QueryOptions) {
  return useQuery<BookingRuleSet[]>({
    queryKey: operationsKeys.rules(selectedClubId ?? "none"),
    queryFn: () => fetchRuleSets({ accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function usePricingMatricesQuery({ accessToken, selectedClubId }: QueryOptions) {
  return useQuery<PricingMatrix[]>({
    queryKey: operationsKeys.pricing(selectedClubId ?? "none"),
    queryFn: () =>
      fetchPricingMatrices({ accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useGolfSettingsReadinessQuery({ accessToken, selectedClubId }: QueryOptions) {
  return useQuery<GolfSettingsReadiness>({
    queryKey: operationsKeys.readiness(selectedClubId ?? "none"),
    queryFn: () =>
      fetchGolfSettingsReadiness({ accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useCreateCourseMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (payload: CourseInput) =>
      createCourse(payload, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      await invalidateOperationalSettingsWorkspace(queryClient, selectedClubId);
    },
  });
}

export function useCreateTeeMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (payload: TeeInput) =>
      createTee(payload, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      await invalidateOperationalSettingsWorkspace(queryClient, selectedClubId);
    },
  });
}

export function useUpdateClubConfigMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (payload: ClubConfigInput) =>
      updateClubConfig(payload, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      await invalidateOperationalSettingsWorkspace(queryClient, selectedClubId, true);
    },
  });
}

export function useCreateRuleSetMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (payload: BookingRuleSetInput) =>
      createRuleSet(payload, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      await invalidateOperationalSettingsWorkspace(queryClient, selectedClubId);
    },
  });
}

export function useUpdateRuleSetMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: ({ ruleSetId, payload }: { ruleSetId: string; payload: BookingRuleSetInput }) =>
      updateRuleSet(ruleSetId, payload, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      await invalidateOperationalSettingsWorkspace(queryClient, selectedClubId);
    },
  });
}

export function usePublishGolfRuleSetMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (ruleSetId: string) =>
      publishGolfRuleSet(ruleSetId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      await invalidateOperationalSettingsWorkspace(queryClient, selectedClubId);
    },
  });
}

export function useRollbackGolfRuleSetMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: () =>
      rollbackGolfRuleSet({
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      await invalidateOperationalSettingsWorkspace(queryClient, selectedClubId);
    },
  });
}

export function useCreatePricingMatrixMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (payload: PricingMatrixInput) =>
      createPricingMatrix(payload, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      await invalidateOperationalSettingsWorkspace(queryClient, selectedClubId);
    },
  });
}

export function useUpdatePricingMatrixMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: ({ matrixId, payload }: { matrixId: string; payload: PricingMatrixInput }) =>
      updatePricingMatrix(matrixId, payload, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      await invalidateOperationalSettingsWorkspace(queryClient, selectedClubId);
    },
  });
}

export function usePublishGolfPricingMatrixMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (matrixId: string) =>
      publishGolfPricingMatrix(matrixId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      await invalidateOperationalSettingsWorkspace(queryClient, selectedClubId);
    },
  });
}

export function useRollbackGolfPricingMatrixMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: () =>
      rollbackGolfPricingMatrix({
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      await invalidateOperationalSettingsWorkspace(queryClient, selectedClubId);
    },
  });
}

export async function prefetchOperationalSettings(
  queryClient: QueryClient,
  accessToken: string | null,
  selectedClubId: string | null,
): Promise<void> {
  if (!isReady(accessToken, selectedClubId)) {
    return;
  }
  const clubId = selectedClubId!;
  const token = accessToken!;
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: operationsKeys.clubConfig(clubId),
      queryFn: () => fetchClubConfig({ accessToken: token, selectedClubId: clubId }),
    }),
    queryClient.prefetchQuery({
      queryKey: operationsKeys.courses(clubId),
      queryFn: () => fetchCourses({ accessToken: token, selectedClubId: clubId }),
    }),
    queryClient.prefetchQuery({
      queryKey: operationsKeys.tees(clubId),
      queryFn: () => fetchTees({ accessToken: token, selectedClubId: clubId }),
    }),
    queryClient.prefetchQuery({
      queryKey: operationsKeys.rules(clubId),
      queryFn: () => fetchRuleSets({ accessToken: token, selectedClubId: clubId }),
    }),
    queryClient.prefetchQuery({
      queryKey: operationsKeys.pricing(clubId),
      queryFn: () => fetchPricingMatrices({ accessToken: token, selectedClubId: clubId }),
    }),
    queryClient.prefetchQuery({
      queryKey: operationsKeys.readiness(clubId),
      queryFn: () => fetchGolfSettingsReadiness({ accessToken: token, selectedClubId: clubId }),
    }),
  ]);
}
