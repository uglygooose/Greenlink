// Path: frontend/src/features/tee-sheet/use-create-walkin-booking.test.ts — Phase 10 Slice 8a.
// Walk-in booking mutation hook tests: payload builder + React Query lifecycle
// (success, decision !== "allowed", optimistic patch + rollback).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  BookingCreateError,
  OPTIMISTIC_BOOKING_ID_PREFIX,
  buildWalkinBookingPayload,
  isOptimisticBookingId,
  useCreateWalkinBooking,
} from "./use-create-walkin-booking";
import { teeSheetKeys } from "./hooks";
import type { WaitlistEntry } from "./use-waitlist";
import type { BookingCreateResult } from "../../types/bookings";
import type { TeeSheetDayResponse } from "../../types/tee-sheet";

const mockCreateBooking = vi.fn();

vi.mock("../../api/operations", () => ({
  createBooking: (...args: unknown[]) => mockCreateBooking(...args),
}));

function makeEntry(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: "w1",
    name: "K. Mokoena",
    party: 2,
    since: "06:14",
    note: "Members",
    source: "walkin",
    feeAmount: 1100,
    feeCurrency: "ZAR",
    suggestion: null,
    ...overrides,
  };
}

function allowedResult(): BookingCreateResult {
  return {
    decision: "allowed",
    booking: {
      id: "real-booking-id",
      holes: 18,
      status: "reserved",
      party_size: 2,
      slot_datetime: "2026-05-12T06:30:00+02:00",
      participants: [],
    },
    availability: null,
    failures: [],
  };
}

function blockedResult(message = "Slot full"): BookingCreateResult {
  return {
    decision: "blocked",
    booking: null,
    availability: null,
    failures: [{ code: "capacity_exceeded", message }],
  };
}

function buildDayResponse(slotDatetime: string): TeeSheetDayResponse {
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
            slot_datetime: slotDatetime,
            local_time: "06:30:00",
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
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function buildWrapper(client: QueryClient): (props: { children: ReactNode }) => JSX.Element {
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("buildWalkinBookingPayload", () => {
  test("party-of-1 produces ONE participant (primary, shared guest_name)", () => {
    const payload = buildWalkinBookingPayload({
      entry: makeEntry({ party: 1 }),
      slotDatetime: "2026-05-12T06:30:00+02:00",
      courseId: "course-1",
    });
    expect(payload.source).toBe("walk_in");
    expect(payload.applies_to).toBe("guest");
    expect(payload.participants).toHaveLength(1);
    expect(payload.participants[0]).toEqual({
      participant_type: "guest",
      guest_name: "K. Mokoena",
      is_primary: true,
    });
  });

  test("party-of-4 produces 4 participants — all share guest_name, only first is_primary", () => {
    const payload = buildWalkinBookingPayload({
      entry: makeEntry({ party: 4 }),
      slotDatetime: "2026-05-12T06:30:00+02:00",
      courseId: "course-1",
    });
    expect(payload.participants).toHaveLength(4);
    expect(payload.participants.every((p) => p.guest_name === "K. Mokoena")).toBe(true);
    expect(payload.participants.every((p) => p.participant_type === "guest")).toBe(true);
    expect(payload.participants.map((p) => p.is_primary)).toEqual([true, false, false, false]);
  });

  test("payload includes course_id, slot_datetime, cart=false, caddie=false", () => {
    const payload = buildWalkinBookingPayload({
      entry: makeEntry({ party: 2 }),
      slotDatetime: "2026-05-12T07:00:00+02:00",
      courseId: "course-42",
    });
    expect(payload.course_id).toBe("course-42");
    expect(payload.slot_datetime).toBe("2026-05-12T07:00:00+02:00");
    expect(payload.cart_flag).toBe(false);
    expect(payload.caddie_flag).toBe(false);
  });

  test("party<1 clamps up to 1 participant (defensive)", () => {
    const payload = buildWalkinBookingPayload({
      entry: makeEntry({ party: 0 }),
      slotDatetime: "2026-05-12T06:30:00+02:00",
      courseId: "course-1",
    });
    expect(payload.participants).toHaveLength(1);
  });
});

describe("isOptimisticBookingId", () => {
  test("recognises ids that start with the optimistic prefix", () => {
    expect(isOptimisticBookingId(`${OPTIMISTIC_BOOKING_ID_PREFIX}123`)).toBe(true);
    expect(isOptimisticBookingId("real-booking-id")).toBe(false);
  });
});

describe("useCreateWalkinBooking", () => {
  beforeEach(() => {
    mockCreateBooking.mockReset();
  });

  test("success: calls createBooking with the built payload and returns the result", async () => {
    mockCreateBooking.mockResolvedValueOnce(allowedResult());
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useCreateWalkinBooking({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );

    await act(async () => {
      await result.current.mutateAsync({
        entry: makeEntry({ party: 2 }),
        slotDatetime: "2026-05-12T06:30:00+02:00",
        courseId: "course-1",
      });
    });

    expect(mockCreateBooking).toHaveBeenCalledTimes(1);
    const [payload, ctx] = mockCreateBooking.mock.calls[0];
    expect(payload).toMatchObject({
      course_id: "course-1",
      slot_datetime: "2026-05-12T06:30:00+02:00",
      source: "walk_in",
      participants: expect.arrayContaining([
        expect.objectContaining({ guest_name: "K. Mokoena", is_primary: true }),
      ]),
    });
    expect(ctx).toEqual({ accessToken: "tok", selectedClubId: "club-1" });
  });

  test("missing session: rejects without calling createBooking", async () => {
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useCreateWalkinBooking({
          accessToken: null,
          selectedClubId: null,
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );

    await expect(
      result.current.mutateAsync({
        entry: makeEntry(),
        slotDatetime: "2026-05-12T06:30:00+02:00",
        courseId: "course-1",
      }),
    ).rejects.toThrow(/active session/i);
    expect(mockCreateBooking).not.toHaveBeenCalled();
  });

  test("decision !== allowed: throws BookingCreateError carrying the result", async () => {
    const blocked = blockedResult("Capacity full");
    mockCreateBooking.mockResolvedValueOnce(blocked);
    const client = buildQueryClient();
    const { result } = renderHook(
      () =>
        useCreateWalkinBooking({
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
        await result.current.mutateAsync({
          entry: makeEntry(),
          slotDatetime: "2026-05-12T06:30:00+02:00",
          courseId: "course-1",
        });
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BookingCreateError);
    expect((caught as BookingCreateError).result).toBe(blocked);
    expect((caught as BookingCreateError).message).toBe("Capacity full");
  });

  test("optimistic patch: adds a transient booking with optimistic prefix to the day cache", async () => {
    const slotDatetime = "2026-05-12T06:30:00+02:00";
    const client = buildQueryClient();
    const queryKey = teeSheetKeys.day("club-1", "course-1", "2026-05-12", "staff", null);
    client.setQueryData<TeeSheetDayResponse>(queryKey, buildDayResponse(slotDatetime));

    // Stall the mock so we can observe the optimistic patch while in flight.
    let resolveCreate: (value: BookingCreateResult) => void = () => {};
    mockCreateBooking.mockReturnValueOnce(
      new Promise<BookingCreateResult>((r) => {
        resolveCreate = r;
      }),
    );

    const { result } = renderHook(
      () =>
        useCreateWalkinBooking({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
        }),
      { wrapper: buildWrapper(client) },
    );

    act(() => {
      result.current.mutate({
        entry: makeEntry({ party: 3 }),
        slotDatetime,
        courseId: "course-1",
      });
    });

    await waitFor(() => {
      const patched = client.getQueryData<TeeSheetDayResponse>(queryKey);
      const bookings = patched?.rows[0]?.slots[0]?.bookings ?? [];
      expect(bookings).toHaveLength(1);
      expect(bookings[0]?.id.startsWith(OPTIMISTIC_BOOKING_ID_PREFIX)).toBe(true);
      expect(bookings[0]?.party_size).toBe(3);
      expect(bookings[0]?.participants).toHaveLength(3);
    });

    // Resolve so React Query settles & we don't leak the in-flight mutation.
    await act(async () => {
      resolveCreate(allowedResult());
      await result.current.mutateAsync; // touch to allow async settle
    });
  });

  test("error rollback: restores the previous day cache after a failed mutation", async () => {
    const slotDatetime = "2026-05-12T06:30:00+02:00";
    const client = buildQueryClient();
    const queryKey = teeSheetKeys.day("club-1", "course-1", "2026-05-12", "staff", null);
    const baseline = buildDayResponse(slotDatetime);
    client.setQueryData<TeeSheetDayResponse>(queryKey, baseline);

    mockCreateBooking.mockRejectedValueOnce(new Error("Network down"));

    const { result } = renderHook(
      () =>
        useCreateWalkinBooking({
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
        await result.current.mutateAsync({
          entry: makeEntry({ party: 2 }),
          slotDatetime,
          courseId: "course-1",
        });
      } catch {
        // swallow — we only care about cache state
      }
    });

    const after = client.getQueryData<TeeSheetDayResponse>(queryKey);
    expect(after?.rows[0]?.slots[0]?.bookings).toHaveLength(0);
  });
});
