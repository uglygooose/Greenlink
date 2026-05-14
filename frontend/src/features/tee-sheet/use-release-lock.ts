// Path: frontend/src/features/tee-sheet/use-release-lock.ts — Phase 10 Slice 9a.
// Release mutation hook for DELETE /api/golf/tee-sheet/locks/{lock_id}.
// Failures are silent — the lock decays via the server-side 60s TTL if
// the release fails. Backend returns 204 on success or when the lock
// was already gone (idempotent).
import { useMutation } from "@tanstack/react-query";

import { releaseTeeSheetLock } from "../../api/operations";

export interface UseReleaseLockParams {
  accessToken: string | null;
  selectedClubId: string | null;
}

export interface ReleaseLockVariables {
  lockId: string;
}

export function useReleaseLock({ accessToken, selectedClubId }: UseReleaseLockParams) {
  return useMutation<void, Error, ReleaseLockVariables>({
    mutationFn: async (variables) => {
      if (!accessToken || !selectedClubId) {
        // No session → nothing to release server-side. Treat as a no-op.
        return;
      }
      await releaseTeeSheetLock(variables.lockId, { accessToken, selectedClubId });
    },
  });
}
