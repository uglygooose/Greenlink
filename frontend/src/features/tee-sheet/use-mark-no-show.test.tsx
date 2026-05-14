// Path: frontend/src/features/tee-sheet/use-mark-no-show.test.tsx — Phase 10 Slice 10.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { MarkNoShowError, useMarkNoShow } from "./use-mark-no-show";
import type { BookingNoShowResult } from "../../types/bookings";

const mockNoShow = vi.fn();

vi.mock("../../api/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/operations")>();
  return {
    ...actual,
    markBookingNoShow: (...args: unknown[]) => mockNoShow(...args),
  };
});

function allowed(): BookingNoShowResult {
  return {
    booking_id: "b1",
    decision: "allowed",
    transition_applied: true,
    booking: null,
    failures: [],
  };
}

function buildWrapper(): (props: { children: ReactNode }) => JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useMarkNoShow", () => {
  beforeEach(() => mockNoShow.mockReset());

  test("success: calls markBookingNoShow with bookingId + auth context", async () => {
    mockNoShow.mockResolvedValueOnce(allowed());
    const { result } = renderHook(
      () =>
        useMarkNoShow({
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
    expect(mockNoShow).toHaveBeenCalledWith("b1", {
      accessToken: "tok",
      selectedClubId: "club-1",
    });
  });

  test("decision blocked → throws MarkNoShowError", async () => {
    mockNoShow.mockResolvedValueOnce({
      booking_id: "b1",
      decision: "blocked",
      transition_applied: false,
      booking: null,
      failures: [{ code: "x", message: "Already completed" }],
    } as BookingNoShowResult);
    const { result } = renderHook(
      () =>
        useMarkNoShow({
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
    expect(caught).toBeInstanceOf(MarkNoShowError);
  });

  test("rejects when no active session", async () => {
    const { result } = renderHook(
      () =>
        useMarkNoShow({
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
    expect(mockNoShow).not.toHaveBeenCalled();
  });
});
