// Path: frontend/src/features/tee-sheet/use-renew-lock.ts — Phase 10 Slice 9a.
// Renewal mutation hook for POST /api/golf/tee-sheet/locks/{lock_id}/renew.
// 409 (lock expired or no longer held by caller) is returned as a typed
// LockRenewResult, NOT thrown — the orchestrator decides whether to abandon
// the lock or retry.
import { useMutation } from "@tanstack/react-query";

import { renewTeeSheetLock, type LockRenewResult } from "../../api/operations";

export interface UseRenewLockParams {
  accessToken: string | null;
  selectedClubId: string | null;
}

export interface RenewLockVariables {
  lockId: string;
}

export function useRenewLock({ accessToken, selectedClubId }: UseRenewLockParams) {
  return useMutation<LockRenewResult, Error, RenewLockVariables>({
    mutationFn: async (variables) => {
      if (!accessToken || !selectedClubId) {
        throw new Error("Cannot renew lock without an active session.");
      }
      return renewTeeSheetLock(variables.lockId, { accessToken, selectedClubId });
    },
  });
}
