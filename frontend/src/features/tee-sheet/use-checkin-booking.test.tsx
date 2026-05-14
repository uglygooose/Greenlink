// Path: frontend/src/features/tee-sheet/use-checkin-booking.test.tsx — Phase 10 Slice 10.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { CheckInBookingError, useCheckInBooking } from "./use-checkin-booking";
import type { BookingCheckInResult } from "../../types/bookings";

const mockCheckIn = vi.fn();

vi.mock("../../api/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/operations")>();
  return {
    ...actual,
    checkInBooking: (...args: unknown[]) => mockCheckIn(...args),
  };
});

function allowed(): BookingCheckInResult {
  return {
    booking_id: "b1",
    decision: "allowed",
    transition_applied: true,
    booking: null,
    failures: [],
  };
}

function blocked(message: string): BookingCheckInResult {
  return {
    booking_id: "b1",
    decision: "blocked",
    transition_applied: false,
    booking: null,
    failures: [{ code: "x", message }],
  };
}

function buildWrapper(): (props: { children: ReactNode }) => JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useCheckInBooking", () => {
  beforeEach(() => mockCheckIn.mockReset());

  test("success: calls checkInBooking with bookingId + auth context", async () => {
    mockCheckIn.mockResolvedValueOnce(allowed());
    const { result } = renderHook(
      () =>
        useCheckInBooking({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
          courseId: "course-1",
        }),
      { wrapper: buildWrapper() },
    );
    await act(async () => {
      await result.current.mutateAsync({ bookingId: "b1" });
    });
    expect(mockCheckIn).toHaveBeenCalledWith("b1", {
      accessToken: "tok",
      selectedClubId: "club-1",
    });
  });

  test("decision blocked → throws CheckInBookingError", async () => {
    mockCheckIn.mockResolvedValueOnce(blocked("Already checked in"));
    const { result } = renderHook(
      () =>
        useCheckInBooking({
          accessToken: "tok",
          selectedClubId: "club-1",
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
          courseId: "course-1",
        }),
      { wrapper: buildWrapper() },
    );
    let caught: unknown = null;
    try {
      await act(async () => {
        await result.current.mutateAsync({ bookingId: "b1" });
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CheckInBookingError);
    expect((caught as CheckInBookingError).message).toBe("Already checked in");
  });

  test("rejects when no active session", async () => {
    const { result } = renderHook(
      () =>
        useCheckInBooking({
          accessToken: null,
          selectedClubId: null,
          selectedDate: "2026-05-12",
          membershipType: "staff",
          teeId: null,
          courseId: "course-1",
        }),
      { wrapper: buildWrapper() },
    );
    await expect(result.current.mutateAsync({ bookingId: "b1" })).rejects.toThrow(
      /active session/i,
    );
    expect(mockCheckIn).not.toHaveBeenCalled();
  });
});
