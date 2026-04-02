import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "../../api/client";
import { useSession } from "../../session/session-context";
import type {
  NewsPost,
  NewsPostCreateInput,
  NewsPostListResponse,
  NewsPostStatus,
  NewsPostUpdateInput,
} from "../../types/comms";

export const commsKeys = {
  posts: (clubId: string, status?: NewsPostStatus | null) =>
    ["comms", clubId, "posts", status ?? "all"] as const,
  feed: (clubId: string) => ["comms", clubId, "feed"] as const,
};

function isReady(accessToken: string | null, selectedClubId: string | null): boolean {
  return Boolean(accessToken && selectedClubId);
}

interface CommsQueryOptions {
  accessToken: string | null;
  selectedClubId: string | null;
  status?: NewsPostStatus | null;
}

export function useNewsPostsQuery({ accessToken, selectedClubId, status }: CommsQueryOptions) {
  const params = status ? `?status=${status}` : "";
  return useQuery<NewsPostListResponse>({
    queryKey: commsKeys.posts(selectedClubId ?? "none", status),
    queryFn: () =>
      apiRequest<NewsPostListResponse>(`/api/comms/posts${params}`, {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function usePublishedNewsFeedQuery({
  accessToken,
  selectedClubId,
}: Omit<CommsQueryOptions, "status">) {
  return useQuery<NewsPostListResponse>({
    queryKey: commsKeys.feed(selectedClubId ?? "none"),
    queryFn: () =>
      apiRequest<NewsPostListResponse>("/api/comms/feed", {
        method: "GET",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    enabled: isReady(accessToken, selectedClubId),
  });
}

export function useCreateNewsPostMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (payload: NewsPostCreateInput) =>
      apiRequest<NewsPost>("/api/comms/posts", {
        method: "POST",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      if (!selectedClubId) return;
      await queryClient.invalidateQueries({ queryKey: ["comms", selectedClubId] });
    },
  });
}

export function useUpdateNewsPostMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: ({ postId, payload }: { postId: string; payload: NewsPostUpdateInput }) =>
      apiRequest<NewsPost>(`/api/comms/posts/${postId}`, {
        method: "PATCH",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      if (!selectedClubId) return;
      await queryClient.invalidateQueries({ queryKey: ["comms", selectedClubId] });
    },
  });
}

export function useDeleteNewsPostMutation() {
  const queryClient = useQueryClient();
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  return useMutation({
    mutationFn: (postId: string) =>
      apiRequest<void>(`/api/comms/posts/${postId}`, {
        method: "DELETE",
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async () => {
      if (!selectedClubId) return;
      await queryClient.invalidateQueries({ queryKey: ["comms", selectedClubId] });
    },
  });
}
