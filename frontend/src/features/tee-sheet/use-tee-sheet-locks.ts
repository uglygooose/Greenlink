// Path: frontend/src/features/tee-sheet/use-tee-sheet-locks.ts — Phase 10 Slice 9b.
// Polling query for GET /api/golf/tee-sheet/locks. Active while the
// tee-sheet page is mounted; refreshes every 15s (half the 60s lock
// TTL → operators see at most 15s lag between another operator's
// release and the badge disappearing).
//
// Slice 9a's holder-side state is a different observer of the same
// backend data — the two are deliberately independent. Slice 9b does
// NOT thread its polled data into Slice 9a's state machine.
import { useQuery } from "@tanstack/react-query";

import { listTeeSheetLocks } from "../../api/operations";
import type { TeeSheetLockListResponse } from "../../types/tee-sheet-locks";

export const TEE_SHEET_LOCKS_REFETCH_INTERVAL = 15_000;

export const teeSheetLocksKeys = {
  list: (clubId: string, courseId: string, date: string) =>
    ["tee-sheet-locks", clubId, courseId, date] as const,
};

export interface UseTeeSheetLocksParams {
  accessToken: string | null;
  clubId: string | null;
  courseId: string | null;
  date: string | null;
}

export function useTeeSheetLocks({
  accessToken,
  clubId,
  courseId,
  date,
}: UseTeeSheetLocksParams) {
  const enabled = Boolean(accessToken && clubId && courseId && date);
  return useQuery<TeeSheetLockListResponse>({
    queryKey: teeSheetLocksKeys.list(clubId ?? "none", courseId ?? "none", date ?? "none"),
    queryFn: () =>
      listTeeSheetLocks(
        { courseId: courseId as string, date: date as string },
        { accessToken: accessToken as string, selectedClubId: clubId as string },
      ),
    enabled,
    refetchInterval: TEE_SHEET_LOCKS_REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: TEE_SHEET_LOCKS_REFETCH_INTERVAL,
  });
}
