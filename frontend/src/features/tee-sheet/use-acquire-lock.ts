// Path: frontend/src/features/tee-sheet/use-acquire-lock.ts — Phase 10 Slice 9a.
// React Query mutation hook for POST /api/golf/tee-sheet/locks.
// 409 conflicts are returned as a typed `LockAcquireResult` (kind === "conflict"),
// NOT thrown — the orchestrator distinguishes held-by-me vs held-by-other from
// the existing_lock.holder_user_id field.
import { useMutation } from "@tanstack/react-query";

import { acquireTeeSheetLock, type LockAcquireResult } from "../../api/operations";

export interface UseAcquireLockParams {
  accessToken: string | null;
  selectedClubId: string | null;
}

export interface AcquireLockVariables {
  courseId: string;
  slotDatetime: string;
}

export function useAcquireLock({ accessToken, selectedClubId }: UseAcquireLockParams) {
  return useMutation<LockAcquireResult, Error, AcquireLockVariables>({
    mutationFn: async (variables) => {
      if (!accessToken || !selectedClubId) {
        throw new Error("Cannot acquire lock without an active session.");
      }
      return acquireTeeSheetLock(
        { course_id: variables.courseId, slot_datetime: variables.slotDatetime },
        { accessToken, selectedClubId },
      );
    },
  });
}
