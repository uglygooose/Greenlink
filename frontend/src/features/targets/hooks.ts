import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import { useSession } from "../../session/session-context";
import type {
  ClubTarget,
  ClubTargetListResponse,
  ClubTargetUpsertInput,
  TargetMetricCatalogResponse,
} from "../../types/targets";

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDateString(value: string): Date {
  const parsed = new Date(`${value}T00:00:00`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  const now = new Date();
  return new Date(`${localDateString(now)}T00:00:00`);
}

function extractYearFromDateString(value: string): number {
  const parsedYear = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear();
}

function shiftDays(value: string, amount: number): string {
  const date = parseDateString(value);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

function deriveWeeklyTargetRange(anchorDate: string): Pick<ClubTargetUpsertInput, "period_start" | "period_end"> {
  const date = parseDateString(anchorDate);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  const period_start = localDateString(date);
  return {
    period_start,
    period_end: shiftDays(period_start, 6),
  };
}

function deriveMonthlyTargetRange(anchorDate: string): Pick<ClubTargetUpsertInput, "period_start" | "period_end"> {
  const date = parseDateString(anchorDate);
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    period_start: localDateString(start),
    period_end: localDateString(end),
  };
}

function deriveQuarterlyTargetRange(anchorDate: string): Pick<ClubTargetUpsertInput, "period_start" | "period_end"> {
  const date = parseDateString(anchorDate);
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  const start = new Date(date.getFullYear(), quarterStartMonth, 1);
  const end = new Date(date.getFullYear(), quarterStartMonth + 3, 0);
  return {
    period_start: localDateString(start),
    period_end: localDateString(end),
  };
}

function deriveDailyTargetRange(anchorDate: string): Pick<ClubTargetUpsertInput, "period_start" | "period_end"> {
  const normalizedDate = localDateString(parseDateString(anchorDate));
  return {
    period_start: normalizedDate,
    period_end: normalizedDate,
  };
}

export function normalizeTargetPeriodRange(
  periodKey: string,
  anchorDate: string,
): Pick<ClubTargetUpsertInput, "period_start" | "period_end"> {
  switch (periodKey) {
    case "daily":
      return deriveDailyTargetRange(anchorDate);
    case "weekly":
      return deriveWeeklyTargetRange(anchorDate);
    case "monthly":
      return deriveMonthlyTargetRange(anchorDate);
    case "quarterly":
      return deriveQuarterlyTargetRange(anchorDate);
    case "yearly":
      return deriveYearlyTargetRange(anchorDate);
    default:
      return deriveDailyTargetRange(anchorDate);
  }
}

export function deriveYearlyTargetRange(anchorDate: string): Pick<ClubTargetUpsertInput, "period_start" | "period_end"> {
  const year = extractYearFromDateString(anchorDate);
  return {
    period_start: `${year}-01-01`,
    period_end: `${year}-12-31`,
  };
}

function isReady(accessToken: string | null, selectedClubId: string | null): boolean {
  return Boolean(accessToken && selectedClubId);
}

interface TargetsQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

interface UseClubTargetCrudControllerOptions {
  defaultForm: () => ClubTargetUpsertInput;
  mapTargetToForm: (target: ClubTarget) => ClubTargetUpsertInput;
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

export function useClubTargetCrudController({
  defaultForm,
  mapTargetToForm,
}: UseClubTargetCrudControllerOptions) {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const catalogQuery = useTargetMetricCatalogQuery({ accessToken, selectedClubId });
  const targetsQuery = useClubTargetsQuery({ accessToken, selectedClubId });
  const createTargetMutation = useCreateClubTargetMutation();
  const updateTargetMutation = useUpdateClubTargetMutation();
  const archiveTargetMutation = useArchiveClubTargetMutation();

  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [form, setForm] = useState<ClubTargetUpsertInput>(() => defaultForm());
  const [notice, setNotice] = useState<string | null>(null);

  const selectedDomain =
    catalogQuery.data?.items.find((item) => item.domain_key === form.domain_key) ?? null;
  const availableMetrics = selectedDomain?.metrics ?? [];

  useEffect(() => {
    if (!selectedDomain || availableMetrics.some((item) => item.metric_key === form.metric_key)) {
      return;
    }
    setForm((current) => ({
      ...current,
      metric_key: availableMetrics[0]?.metric_key ?? "",
    }));
  }, [availableMetrics, form.metric_key, selectedDomain]);

  useEffect(() => {
    if (catalogQuery.data?.items.length && !form.metric_key) {
      const firstDomain = catalogQuery.data.items[0];
      setForm((current) => ({
        ...current,
        domain_key: firstDomain.domain_key,
        metric_key: firstDomain.metrics[0]?.metric_key ?? "",
      }));
    }
  }, [catalogQuery.data, form.metric_key]);

  function resetForm(): void {
    setEditingTargetId(null);
    setForm(defaultForm());
  }

  function beginCreate(): void {
    resetForm();
    setNotice(null);
  }

  function beginEdit(target: ClubTarget): void {
    setEditingTargetId(target.id);
    setForm(mapTargetToForm(target));
    setNotice(null);
  }

  async function handleSubmit(): Promise<void> {
    setNotice(null);
    if (editingTargetId) {
      await updateTargetMutation.mutateAsync({ targetId: editingTargetId, payload: form });
      setNotice("Target updated.");
    } else {
      await createTargetMutation.mutateAsync(form);
      setNotice("Target created.");
    }
    resetForm();
  }

  async function handleArchive(targetId: string): Promise<void> {
    setNotice(null);
    await archiveTargetMutation.mutateAsync(targetId);
    setNotice("Target archived.");
  }

  return {
    archiveTargetMutation,
    availableMetrics,
    beginCreate,
    beginEdit,
    catalogQuery,
    createTargetMutation,
    editingTargetId,
    form,
    handleArchive,
    handleSubmit,
    notice,
    resetForm,
    setEditingTargetId,
    setForm,
    setNotice,
    targetsQuery,
    updateTargetMutation,
  };
}
