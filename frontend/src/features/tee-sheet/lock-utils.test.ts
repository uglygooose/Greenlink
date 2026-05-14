// Path: frontend/src/features/tee-sheet/lock-utils.test.ts — Phase 10 Slice 9b.
import { describe, expect, test } from "vitest";

import { buildLocksBySlot } from "./lock-utils";
import type { TeeSheetLockResponse } from "../../types/tee-sheet-locks";

function lock(overrides: Partial<TeeSheetLockResponse> = {}): TeeSheetLockResponse {
  return {
    id: "lock-1",
    club_id: "club-1",
    course_id: "course-1",
    slot_datetime: "2026-05-12T06:30:00+02:00",
    holder_user_id: "user-1",
    holder_display_name: "Operator A",
    acquired_at: "2026-05-12T06:29:00+02:00",
    expires_at: "2026-05-12T06:30:00+02:00",
    remaining_seconds: 60,
    ...overrides,
  };
}

describe("buildLocksBySlot", () => {
  test("empty input returns an empty Map", () => {
    const map = buildLocksBySlot([], "user-1");
    expect(map.size).toBe(0);
  });

  test("filters out the current user's locks", () => {
    const map = buildLocksBySlot(
      [
        lock({ id: "lock-own", holder_user_id: "user-1", slot_datetime: "2026-05-12T06:30:00+02:00" }),
        lock({ id: "lock-other", holder_user_id: "user-2", slot_datetime: "2026-05-12T06:38:00+02:00" }),
      ],
      "user-1",
    );
    expect(map.size).toBe(1);
    expect(map.get("2026-05-12T06:38:00+02:00")?.id).toBe("lock-other");
    expect(map.get("2026-05-12T06:30:00+02:00")).toBeUndefined();
  });

  test("indexes by slot_datetime", () => {
    const map = buildLocksBySlot(
      [
        lock({ id: "a", holder_user_id: "user-2", slot_datetime: "2026-05-12T06:30:00+02:00" }),
        lock({ id: "b", holder_user_id: "user-3", slot_datetime: "2026-05-12T06:38:00+02:00" }),
      ],
      "user-1",
    );
    expect(map.get("2026-05-12T06:30:00+02:00")?.id).toBe("a");
    expect(map.get("2026-05-12T06:38:00+02:00")?.id).toBe("b");
  });

  test("currentUserId null → no filtering (every lock is rendered as other-operator)", () => {
    const map = buildLocksBySlot(
      [lock({ id: "x", holder_user_id: "user-1", slot_datetime: "2026-05-12T06:30:00+02:00" })],
      null,
    );
    expect(map.size).toBe(1);
  });
});
