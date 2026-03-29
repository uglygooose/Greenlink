import { useQuery, type QueryClient } from "@tanstack/react-query";

import {
  fetchClubConfig,
  fetchCourses,
  fetchPricingMatrices,
  fetchRuleSets,
  fetchTees,
} from "../../api/operations";
import type { BookingRuleSet, ClubConfig, Course, PricingMatrix, Tee } from "../../types/operations";

export const operationsKeys = {
  clubConfig: (clubId: string) => ["operations", clubId, "club-config"] as const,
  courses: (clubId: string) => ["operations", clubId, "courses"] as const,
  tees: (clubId: string) => ["operations", clubId, "tees"] as const,
  rules: (clubId: string) => ["operations", clubId, "rules"] as const,
  pricing: (clubId: string) => ["operations", clubId, "pricing"] as const,
};

interface QueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

function isReady(accessToken: string | null, selectedClubId: string | null): accessToken is string {
  return Boolean(accessToken && selectedClubId);
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
  ]);
}
