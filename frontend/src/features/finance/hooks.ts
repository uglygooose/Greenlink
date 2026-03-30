import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import type { FinanceAccountLedger, FinanceAccountSummary, FinanceClubJournal } from "../../types/finance";

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
