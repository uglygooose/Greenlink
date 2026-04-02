import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import { apiBaseUrl } from "../../lib/env";
import { useSession } from "../../session/session-context";
import type {
  FinanceAccountLedger,
  FinanceAccountSummary,
  FinanceClubJournal,
  FinanceExportBatchCreateInput,
  FinanceExportBatchCreateResult,
  FinanceExportBatchDetail,
  FinanceExportBatchListResponse,
  FinanceExportBatchVoidResult,
} from "../../types/finance";

function isReady(accessToken: string | null, selectedClubId: string | null): boolean {
  return Boolean(accessToken && selectedClubId);
}

interface FinanceQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

export const financeKeys = {
  accounts: (clubId: string) => ["finance", clubId, "accounts"] as const,
  journal: (clubId: string) => ["finance", clubId, "journal"] as const,
  ledger: (clubId: string, accountId: string) => ["finance", clubId, "ledger", accountId] as const,
  exportBatches: (clubId: string) => ["finance", clubId, "export-batches"] as const,
  exportBatchDetail: (clubId: string, batchId: string) =>
    ["finance", clubId, "export-batch-detail", batchId] as const,
};

export function useFinanceAccountsQuery({ accessToken, selectedClubId }: FinanceQueryOptions) {
  return useQuery<FinanceAccountSummary[]>({
    queryKey: financeKeys.accounts(selectedClubId ?? "none"),
    queryFn: () =>
      apiRequest<FinanceAccountSummary[]>("/api/finance/accounts", {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useFinanceJournalQuery({ accessToken, selectedClubId }: FinanceQueryOptions) {
  return useQuery<FinanceClubJournal>({
    queryKey: financeKeys.journal(selectedClubId ?? "none"),
    queryFn: () =>
      apiRequest<FinanceClubJournal>("/api/finance/journal", {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

interface LedgerQueryOptions extends FinanceQueryOptions {
  accountId: string | null;
}

export function useFinanceAccountLedgerQuery({ accessToken, selectedClubId, accountId }: LedgerQueryOptions) {
  return useQuery<FinanceAccountLedger>({
    queryKey: financeKeys.ledger(selectedClubId ?? "none", accountId ?? "none"),
    queryFn: () =>
      apiRequest<FinanceAccountLedger>(`/api/finance/accounts/${accountId}/ledger`, {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId) && Boolean(accountId),
  });
}

export function useFinanceExportBatchesQuery({ accessToken, selectedClubId }: FinanceQueryOptions) {
  return useQuery<FinanceExportBatchListResponse>({
    queryKey: financeKeys.exportBatches(selectedClubId ?? "none"),
    queryFn: () =>
      apiRequest<FinanceExportBatchListResponse>("/api/finance/export-batches", {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

interface ExportBatchDetailOptions extends FinanceQueryOptions {
  batchId: string | null;
}

export function useFinanceExportBatchDetailQuery({
  accessToken,
  selectedClubId,
  batchId,
}: ExportBatchDetailOptions) {
  return useQuery<FinanceExportBatchDetail>({
    queryKey: financeKeys.exportBatchDetail(selectedClubId ?? "none", batchId ?? "none"),
    queryFn: () =>
      apiRequest<FinanceExportBatchDetail>(`/api/finance/export-batches/${batchId}`, {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId) && Boolean(batchId),
  });
}

export function useCreateFinanceExportBatchMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (payload: FinanceExportBatchCreateInput) =>
      apiRequest<FinanceExportBatchCreateResult>("/api/finance/export-batches", {
        method: "POST",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async (result) => {
      if (!selectedClubId) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: financeKeys.exportBatches(selectedClubId),
      });
      queryClient.setQueryData(
        financeKeys.exportBatchDetail(selectedClubId, result.batch.id),
        result.batch,
      );
    },
  });
}

export function useVoidFinanceExportBatchMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (batchId: string) =>
      apiRequest<FinanceExportBatchVoidResult>(`/api/finance/export-batches/${batchId}/void`, {
        method: "POST",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify({}),
      }),
    onSuccess: async (result) => {
      if (!selectedClubId) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: financeKeys.exportBatches(selectedClubId),
      });
      queryClient.setQueryData(
        financeKeys.exportBatchDetail(selectedClubId, result.batch.id),
        result.batch,
      );
    },
  });
}

interface DownloadFinanceExportBatchOptions {
  accessToken: string;
  selectedClubId: string;
  batchId: string;
}

function fileNameFromDisposition(contentDisposition: string | null, fallback: string): string {
  const match = contentDisposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? fallback;
}

export async function downloadFinanceExportBatch({
  accessToken,
  selectedClubId,
  batchId,
}: DownloadFinanceExportBatchOptions): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/finance/export-batches/${batchId}/download`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Club-Id": selectedClubId,
    },
    credentials: "include",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "Download failed");
  }

  const blob = await response.blob();
  const fileName = fileNameFromDisposition(
    response.headers.get("Content-Disposition"),
    `finance-export-${batchId}.csv`,
  );
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(objectUrl);
  return fileName;
}
