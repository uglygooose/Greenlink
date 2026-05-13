// Path: frontend/src/features/tee-sheet/use-move-participant.test.tsx — Phase 10 Slice 8b.
// Cross-row participant move mutation tests: payload builder, success path,
// failure-category mapping, optimistic patch + rollback against the
// tee-sheet day cache.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  MOVE_OPTIMISTIC_BOOKING_ID_PREFIX,
  MoveParticipantError,
  buildMovePayload,
  categorizeMoveFailure,
  isMoveOptimisticBookingId,
  useMoveParticipant,
} from "./use-move-participant";
import { teeSheetKeys } from "./hooks";
import type { BookingMoveResult } from "../../types/bookings";
import type { TeeSheetDayResponse } from "../../types/tee-sheet";

const mockMoveBooking = vi.fn();

vi.mock("../../api/operations", () => ({
  moveBooking: (...args: unknown[]) => mockMoveBooking(...args),
}));

function variables(overrides: Partial<Parameters<typeof buildMovePayload>[0]> = {}) {
  return {
    bookingId: "booking-a",
    participantId: "p1",
    targetSlotDatetime: "2026-05-12T06:38:00+02:00",
    sourceSlotDatetime: "2026-05-12T06:30:00+02:00",
    displayName: "M. Dlamini",
    ...overrides,
  };
}

function allowedMoveResult(): BookingMoveResult {
  return {
    booking_id: "booking-a",
    decision: "allowed",
    transition_applied: true,
    booking: {
      id: "booking-a-split",
      status: "reserved",
      party_size: 1,
      holes: 18,
      slot_datetime: "2026-05-12T06:38:00+02:00",
      participants: [],
    },
    failures: [],
  };
}

function blockedMoveResult(code: string, message = "Blocked"): BookingMoveResult {
  return {
    booking_id: "booking-a",
    decision: "blocked",
    transition_applied: false,
    booking: null,
    failures: [{ code, message }],
  };
}

function buildDayResponse(): TeeSheetDayResponse {
  return {
    club_id: "club-1",
    course_id: "course-1",
    course_name: "North",
    date: "2026-05-12",
    timezone: "Africa/Johannesburg",
    interval_minutes: 8,
    membership_type: "staff",
    reference_datetime: "2026-05-12T05:00:00+02:00",
    rows: [
      {
        row_key: "06:30",
        tee_id: null,
        start_lane: "hole_1",
        label: "06:30",
        color_code: null,
        slots: [
          {
            slot_datetime: "2026-05-12T06:30:00+02:00",
            local_time: "06:30:00",
            display_status: "reserved",
            state_flags: {},
            occupancy: {
              player_capacity: 4,
              occupied_player_count: 2,
              reserved_player_count: 2,
              confirmed_booking_count: 1,
              reserved_booking_count: 1,
              remaining_player_capacity: 2,
            },
            party_summary: {
              member_count: 2,
              guest_count: 0,
              staff_count: 0,
              total_players: 2,
              has_activity: true,
            },
            policy_summary: {
              applies_to: "staff",
              availability_status: "available",
              blocker_count: 0,
              unresolved_count: 0,
              warning_count: 0,
            },
            blockers: [],
            unresolved_checks: [],
            warnings: [],
            bookings: [
              {
                id: "booking-a",
                status: "reserved",
                party_size: 2,
                holes: 18,
                slot_datetime: "2026-05-12T06:30:00+02:00",
                participants: [
                  { id: "p1", display_name: "M. Dlamini", participant_type: "member", is_primary: true },
                  { id: "p2", display_name: "T. Botha", participant_type: "member", is_primary: false },
                ],
              },
            ],
          },
          {
            slot_datetime: "2026-05-12T06:38:00+02:00",
            local_time: "06:38:00",
            display_status: "available",
            state_flags: {},
            occupancy: {
              player_capacity: 4,
              occupied_player_count: 0,
              reserved_player_count: 0,
              confirmed_booking_count: 0,
              reserved_booking_count: 0,
              remaining_player_capacity: 4,
            },
            party_summary: {
              member_count: 0,
              guest_count: 0,
              staff_count: 0,
              total_players: 0,
              has_activity: false,
            },
            policy_summary: {
              applies_to: "staff",
              availability_status: "available",
              blocker_count: 0,
              unresolved_count: 0,
              warning_count: 0,
            },
            blockers: [],
            unresolved_checks: [],
            warnings: [],
            bookings: [],
          },
        ],
      },
    ],
    warnings: [],
  };
}

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function buildWrapper(client: QueryClient): (props: { children: ReactNode }) => JSX.Element {
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("buildMovePayload", () => {
  test("emits a cross-row move payload matching the BookingMoveInput schema", () => {
    const payload = buildMovePayload(variables());
    expect(payload).toEqual({
      target_slot_datetime: "2026-05-12T06:38:00+02:00",
      target_start_lane: null,
      target_tee_id: null,
      participant_id: "p1",
    });
  });
});

describe("categorizeMoveFailure", () => {
  test.each([
    ["target_slot_capacity_exceeded", "capacity_full"],
    ["target_slot_manually_blocked", "target_blocked"],
    ["target_slot_competition_controlled", "target_blocked"],
    ["target_slot_event_controlled", "target_blocked"],
    ["target_slot_externally_unavailable", "target_blocked"],
    ["target_slot_reserved_state_active", "target_reserved"],
    ["booking_status_not_moveable", "booking_not_moveable"],
    ["move_crosses_day_boundary", "crosses_day_boundary"],
    ["move_is_no_op", "no_op"],
    ["target_tee_not_found", "target_tee_not_found"],
    ["participant_not_found", "participant_not_found"],
    ["booking_not_found", "booking_not_found"],
    ["club_config_not_found", "club_config_not_found"],
    ["something_unrecognised", "unknown"],
  ])("%s → %s", (code, expected) => {
    expect(categorizeMoveFailure({ code, message: "" })).toBe(expected);
  });
  test("undefined failure → unknown", () => {
    expect(categorizeMoveFailure(undefined)).toBe("unknown");
  });
});

describe("isMoveOptimisticBookingId", () => {
  test("recognises move-optimistic ids only", () => {
    expect(isMoveOptimisticBookingId(`${MOVE_OPTIMISTIC_BOOKING_ID_PREFIX}123`)).toBe(true);
    expect(isMoveOptimisticBookingId("optimistic-456")).toBe(false);
    expect(isMoveOptimisticBookingId("real-booking-id")).toBe(false);
  });
});

describe("useMoveParticipant", () => {
  beforeEach(() => {
    mockMoveBooking.mockReset();
  });

  test("success: calls moveBooking with the canonical payload and returns the result", async () => {
    mockMoveBooking.mockResolvedValueOnce(allowedMoveResult());
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useMoveParticipant({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );

    await act(async () => {
      await result.current.mutateAsync(variables());
    });

    expect(mockMoveBooking).toHaveBeenCalledTimes(1);
    const [bookingId, payload, ctx] = mockMoveBooking.mock.calls[0];
    expect(bookingId).toBe("booking-a");
    expect(payload).toEqual({
      target_slot_datetime: "2026-05-12T06:38:00+02:00",
      target_start_lane: null,
      target_tee_id: null,
      participant_id: "p1",
    });
    expect(ctx).toEqual({ accessToken: "tok", selectedClubId: "club-1" });
  });

  test("missing session: rejects without calling moveBooking", async () => {
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useMoveParticipant({
          accessToken: null,
          selectedClubId: null,
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );
    await expect(result.current.mutateAsync(variables())).rejects.toThrow(/active session/i);
    expect(mockMoveBooking).not.toHaveBeenCalled();
  });

  test("decision blocked: throws MoveParticipantError with category capacity_full", async () => {
    mockMoveBooking.mockResolvedValueOnce(blockedMoveResult("target_slot_capacity_exceeded", "Slot full"));
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useMoveParticipant({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );
    let caught: unknown = null;
    try {
      await act(async () => {
        await result.current.mutateAsync(variables());
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MoveParticipantError);
    expect((caught as MoveParticipantError).category).toBe("capacity_full");
    expect((caught as MoveParticipantError).failure?.code).toBe("target_slot_capacity_exceeded");
  });

  test("optimistic patch: removes participant from source, adds optimistic transient at target", async () => {
    const client = buildQueryClient();
    const queryKey = teeSheetKeys.day("club-1", "course-1", "2026-05-12", "staff", null);
    client.setQueryData<TeeSheetDayResponse>(queryKey, buildDayResponse());

    let resolveMove: (value: BookingMoveResult) => void = () => {};
    mockMoveBooking.mockReturnValueOnce(
      new Promise<BookingMoveResult>((r) => {
        resolveMove = r;
      }),
    );

    const { result } = renderHook(
      () =>
        useMoveParticipant({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );

    act(() => {
      result.current.mutate(variables());
    });

    await waitFor(() => {
      const patched = client.getQueryData<TeeSheetDayResponse>(queryKey);
      const sourceSlot = patched?.rows[0]?.slots[0];
      const targetSlot = patched?.rows[0]?.slots[1];
      // Source booking's participant list shrinks
      expect(sourceSlot?.bookings[0]?.participants).toHaveLength(1);
      expect(sourceSlot?.bookings[0]?.participants[0]?.id).toBe("p2");
      // Target gets an optimistic transient
      expect(targetSlot?.bookings).toHaveLength(1);
      expect(targetSlot?.bookings[0]?.id.startsWith(MOVE_OPTIMISTIC_BOOKING_ID_PREFIX)).toBe(true);
    });

    await act(async () => {
      resolveMove(allowedMoveResult());
      await result.current.mutateAsync;
    });
  });

  test("error rollback: previous day cache is restored after a failed mutation", async () => {
    const client = buildQueryClient();
    const queryKey = teeSheetKeys.day("club-1", "course-1", "2026-05-12", "staff", null);
    client.setQueryData<TeeSheetDayResponse>(queryKey, buildDayResponse());

    mockMoveBooking.mockRejectedValueOnce(new Error("Network down"));

    const { result } = renderHook(
      () =>
        useMoveParticipant({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );

    await act(async () => {
      try {
        await result.current.mutateAsync(variables());
      } catch {
        // swallow
      }
    });

    const after = client.getQueryData<TeeSheetDayResponse>(queryKey);
    expect(after?.rows[0]?.slots[0]?.bookings[0]?.participants).toHaveLength(2);
    expect(after?.rows[0]?.slots[1]?.bookings).toHaveLength(0);
  });
});
