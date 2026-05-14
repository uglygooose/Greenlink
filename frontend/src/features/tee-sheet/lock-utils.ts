// Path: frontend/src/features/tee-sheet/lock-utils.ts — Phase 10 Slice 9b.
// Pure helper: indexes the polled lock list by slot_datetime, filtering
// out the current user's own lock so the page renders badges only on
// OTHER operators' rows. The holder-side selection footer (Slice 9a)
// already handles your own lock.
import type { TeeSheetLockResponse } from "../../types/tee-sheet-locks";

export function buildLocksBySlot(
  locks: TeeSheetLockResponse[],
  currentUserId: string | null,
): Map<string, TeeSheetLockResponse> {
  const map = new Map<string, TeeSheetLockResponse>();
  for (const lock of locks) {
    if (currentUserId !== null && lock.holder_user_id === currentUserId) {
      continue;
    }
    map.set(lock.slot_datetime, lock);
  }
  return map;
}
