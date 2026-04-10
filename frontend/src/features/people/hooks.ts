import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import { reportsKeys } from "../admin-dashboard/reports-hooks";
import { financeKeys } from "../finance/hooks";
import type {
  AccountCustomerCreateInput,
  AccountCustomerRecord,
  ClubPersonEntry,
  MembershipCreateInput,
  MembershipRecord,
  MembershipUpdateInput,
  PersonCreateInput,
  PersonRecord,
  PersonUpdateInput,
} from "../../types/people";

interface PeopleQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
}

interface UpdatePersonVariables {
  personId: string;
  payload: PersonUpdateInput;
}

interface UpdateMembershipVariables {
  membershipId: string;
  payload: MembershipUpdateInput;
}

function isReady(accessToken: string | null, selectedClubId: string | null): boolean {
  return Boolean(accessToken && selectedClubId);
}

async function invalidatePeopleWorkspace(
  queryClient: ReturnType<typeof useQueryClient>,
  selectedClubId: string | null,
): Promise<void> {
  if (!selectedClubId) {
    return;
  }
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: peopleKeys.directory(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: financeKeys.accounts(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: financeKeys.outstandingSummary(selectedClubId) }),
    queryClient.invalidateQueries({ queryKey: reportsKeys.summary(selectedClubId) }),
  ]);
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
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useCreatePersonMutation({ accessToken, selectedClubId }: PeopleQueryOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PersonCreateInput) =>
      apiRequest<PersonRecord>("/api/people", {
        method: "POST",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await invalidatePeopleWorkspace(queryClient, selectedClubId);
    },
  });
}

export function useUpdatePersonMutation({ accessToken, selectedClubId }: PeopleQueryOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ personId, payload }: UpdatePersonVariables) =>
      apiRequest<PersonRecord>(`/api/people/${personId}`, {
        method: "PATCH",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await invalidatePeopleWorkspace(queryClient, selectedClubId);
    },
  });
}

export function useCreateMembershipMutation({ accessToken, selectedClubId }: PeopleQueryOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: MembershipCreateInput) =>
      apiRequest<MembershipRecord>("/api/people/memberships", {
        method: "POST",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await invalidatePeopleWorkspace(queryClient, selectedClubId);
    },
  });
}

export function useUpdateMembershipMutation({ accessToken, selectedClubId }: PeopleQueryOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ membershipId, payload }: UpdateMembershipVariables) =>
      apiRequest<MembershipRecord>(`/api/people/memberships/${membershipId}`, {
        method: "PATCH",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await invalidatePeopleWorkspace(queryClient, selectedClubId);
    },
  });
}

export function useCreateAccountCustomerMutation({ accessToken, selectedClubId }: PeopleQueryOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AccountCustomerCreateInput) =>
      apiRequest<AccountCustomerRecord>("/api/people/account-customers", {
        method: "POST",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await invalidatePeopleWorkspace(queryClient, selectedClubId);
    },
  });
}
