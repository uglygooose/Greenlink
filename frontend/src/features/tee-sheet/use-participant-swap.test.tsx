// Path: frontend/src/features/tee-sheet/use-participant-swap.test.tsx — Phase 10 Slice 8b.
// Sequential swap orchestrator tests: sequencing, success, partial failures,
// row-full rejection, restore.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  type SwapInput,
  targetRowHasIntermediateSpace,
  useParticipantSwap,
} from "./use-participant-swap";
import type { BookingMoveResult } from "../../types/bookings";
import type { TeeSheetRow } from "../../types/tee-sheet";

const mockMoveBooking = vi.fn();

vi.mock("../../api/operations", () => ({
  moveBooking: (...args: unknown[]) => mockMoveBooking(...args),
}));

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function buildWrapper(client: QueryClient): (props: { children: ReactNode }) => JSX.Element {
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function makeRowWithSpace(): TeeSheetRow {
  return {
    row_key: "06:38",
    tee_id: null,
    start_lane: "hole_1",
    label: "06:38",
    color_code: null,
    slots: [
      {
        slot_datetime: "2026-05-12T06:38:00+02:00",
        local_time: "06:38:00",
        display_status: "reserved",
        state_flags: {},
        occupancy: {
          player_capacity: 4,
          occupied_player_count: 1,
          reserved_player_count: 1,
          confirmed_booking_count: 1,
          reserved_booking_count: 1,
          remaining_player_capacity: 3,
        },
        party_summary: {
          member_count: 1,
          guest_count: 0,
          staff_count: 0,
          total_players: 1,
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
            id: "booking-b",
            status: "reserved",
            party_size: 1,
            holes: 18,
            slot_datetime: "2026-05-12T06:38:00+02:00",
            participants: [
              { id: "p-B", display_name: "T. Botha", participant_type: "member", is_primary: true },
            ],
          },
        ],
      },
    ],
  };
}

function makeRowFullyOccupied(): TeeSheetRow {
  const row = makeRowWithSpace();
  row.slots[0].bookings[0].party_size = 4;
  row.slots[0].bookings[0].participants = [
    { id: "p-B", display_name: "T. Botha", participant_type: "member", is_primary: true },
    { id: "p-x1", display_name: "X1", participant_type: "member", is_primary: false },
    { id: "p-x2", display_name: "X2", participant_type: "member", is_primary: false },
    { id: "p-x3", display_name: "X3", participant_type: "member", is_primary: false },
  ];
  return row;
}

function buildSwapInput(): SwapInput {
  return {
    participantA: {
      bookingId: "booking-a",
      participantId: "p-A",
      displayName: "M. Dlamini",
      partySize: 2,
      slotDatetime: "2026-05-12T06:30:00+02:00",
      rowKey: "06:30",
    },
    participantB: {
      bookingId: "booking-b",
      participantId: "p-B",
      displayName: "T. Botha",
      partySize: 1,
      slotDatetime: "2026-05-12T06:38:00+02:00",
      rowKey: "06:38",
    },
  };
}

function allowedMoveResult(bookingId: string): BookingMoveResult {
  return {
    booking_id: bookingId,
    decision: "allowed",
    transition_applied: true,
    booking: {
      id: `${bookingId}-after`,
      status: "reserved",
      party_size: 1,
      holes: 18,
      slot_datetime: "2026-05-12T00:00:00+02:00",
      participants: [],
    },
    failures: [],
  };
}

function blockedMoveResult(): BookingMoveResult {
  return {
    booking_id: "booking-a",
    decision: "blocked",
    transition_applied: false,
    booking: null,
    failures: [{ code: "target_slot_capacity_exceeded", message: "Slot full" }],
  };
}

describe("targetRowHasIntermediateSpace", () => {
  test("returns true when the target row has at least one open cell at the target slot", () => {
    expect(
      targetRowHasIntermediateSpace(makeRowWithSpace(), "2026-05-12T06:38:00+02:00"),
    ).toBe(true);
  });
  test("returns false when the target row is fully occupied at the target slot", () => {
    expect(
      targetRowHasIntermediateSpace(makeRowFullyOccupied(), "2026-05-12T06:38:00+02:00"),
    ).toBe(false);
  });
  test("returns false when the target row has no slot at the target_slot_datetime", () => {
    expect(
      targetRowHasIntermediateSpace(makeRowWithSpace(), "2026-05-12T99:99:99+02:00"),
    ).toBe(false);
  });
});

describe("useParticipantSwap", () => {
  beforeEach(() => {
    mockMoveBooking.mockReset();
  });

  test("idle → initiate: rejects when target row has no intermediate space", () => {
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useParticipantSwap({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );
    act(() => result.current.initiate(buildSwapInput(), makeRowFullyOccupied()));
    expect(result.current.state.kind).toBe("rejected-target-row-full");
    expect(mockMoveBooking).not.toHaveBeenCalled();
  });

  test("two-call success: state machine reaches succeeded after both calls allow", async () => {
    mockMoveBooking.mockResolvedValueOnce(allowedMoveResult("booking-a"));
    mockMoveBooking.mockResolvedValueOnce(allowedMoveResult("booking-b"));
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useParticipantSwap({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );

    act(() => result.current.initiate(buildSwapInput(), makeRowWithSpace()));

    await waitFor(() => expect(result.current.state.kind).toBe("succeeded"));
    expect(mockMoveBooking).toHaveBeenCalledTimes(2);

    const firstCall = mockMoveBooking.mock.calls[0];
    const secondCall = mockMoveBooking.mock.calls[1];
    // Move A: A's bookingId, target = B's slot
    expect(firstCall[0]).toBe("booking-a");
    expect(firstCall[1]).toMatchObject({
      target_slot_datetime: "2026-05-12T06:38:00+02:00",
      participant_id: "p-A",
    });
    // Move B: B's bookingId, target = A's old slot
    expect(secondCall[0]).toBe("booking-b");
    expect(secondCall[1]).toMatchObject({
      target_slot_datetime: "2026-05-12T06:30:00+02:00",
      participant_id: "p-B",
    });
  });

  test("partial-failure-first: first call fails, state machine reflects clean failure", async () => {
    mockMoveBooking.mockResolvedValueOnce(blockedMoveResult());
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useParticipantSwap({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );

    act(() => result.current.initiate(buildSwapInput(), makeRowWithSpace()));

    await waitFor(() => expect(result.current.state.kind).toBe("partial-failure-first"));
    expect(mockMoveBooking).toHaveBeenCalledTimes(1);
  });

  test("partial-failure-second: first allowed, second blocked → state machine renders Pill path", async () => {
    mockMoveBooking.mockResolvedValueOnce(allowedMoveResult("booking-a"));
    mockMoveBooking.mockResolvedValueOnce(blockedMoveResult());
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useParticipantSwap({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );

    act(() => result.current.initiate(buildSwapInput(), makeRowWithSpace()));
    await waitFor(() => expect(result.current.state.kind).toBe("partial-failure-second"));
  });

  test("retrySecond from partial-failure-second: re-fires move B with the same payload", async () => {
    mockMoveBooking.mockResolvedValueOnce(allowedMoveResult("booking-a"));
    mockMoveBooking.mockResolvedValueOnce(blockedMoveResult());
    mockMoveBooking.mockResolvedValueOnce(allowedMoveResult("booking-b"));
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useParticipantSwap({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );

    act(() => result.current.initiate(buildSwapInput(), makeRowWithSpace()));
    await waitFor(() => expect(result.current.state.kind).toBe("partial-failure-second"));

    act(() => result.current.retrySecond());
    await waitFor(() => expect(result.current.state.kind).toBe("succeeded"));
    expect(mockMoveBooking).toHaveBeenCalledTimes(3);
    expect(mockMoveBooking.mock.calls[2][0]).toBe("booking-b");
  });

  test("restoreFirst from partial-failure-second: fires reverse move with A's NEW booking id", async () => {
    // Move A returns booking.id = "booking-a-after" (post-split).
    const aResult: BookingMoveResult = {
      ...allowedMoveResult("booking-a"),
      booking: {
        id: "booking-a-split",
        status: "reserved",
        party_size: 1,
        holes: 18,
        slot_datetime: "2026-05-12T06:38:00+02:00",
        participants: [],
      },
    };
    mockMoveBooking.mockResolvedValueOnce(aResult);
    mockMoveBooking.mockResolvedValueOnce(blockedMoveResult());
    mockMoveBooking.mockResolvedValueOnce(allowedMoveResult("booking-a-split"));
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useParticipantSwap({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );

    act(() => result.current.initiate(buildSwapInput(), makeRowWithSpace()));
    await waitFor(() => expect(result.current.state.kind).toBe("partial-failure-second"));

    act(() => result.current.restoreFirst());
    await waitFor(() => expect(result.current.state.kind).toBe("restored"));
    expect(mockMoveBooking).toHaveBeenCalledTimes(3);
    const restoreCall = mockMoveBooking.mock.calls[2];
    // Uses the NEW booking_id from move A's response (split id).
    expect(restoreCall[0]).toBe("booking-a-split");
    // Targets A's original source slot.
    expect(restoreCall[1]).toMatchObject({
      target_slot_datetime: "2026-05-12T06:30:00+02:00",
      participant_id: "p-A",
    });
  });

  test("reset returns the state machine to idle", () => {
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useParticipantSwap({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );
    act(() => result.current.initiate(buildSwapInput(), makeRowFullyOccupied()));
    expect(result.current.state.kind).toBe("rejected-target-row-full");
    act(() => result.current.reset());
    expect(result.current.state.kind).toBe("idle");
  });
});
