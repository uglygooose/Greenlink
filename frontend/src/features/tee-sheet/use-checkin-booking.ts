// Path: frontend/src/features/tee-sheet/use-checkin-booking.ts — Phase 10 Slice 10.
// React Query mutation hook calling POST /api/golf/bookings/{booking_id}/check-in.
// Backend constructs BookingCheckInRequest from the URL + the authenticated
// user (acting_user_id = current_user.id), so the client sends an empty body.
// On success: invalidates the tee-sheet day query so the row's status
// updates (RESERVED → CHECKED_IN). Errors are surfaced as the structured
// BookingCheckInResult so callers can branch on decision/failures.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { checkInBooking } from "../../api/operations";
import type { BookingCheckInResult } from "../../types/bookings";

import { teeSheetKeys } from "./hooks";
import type { BookingRuleAppliesTo } from "../../types/operations";

export interface UseCheckInBookingParams {
  accessToken: string | null;
  selectedClubId: string | null;
  selectedDate: string;
  membershipType: BookingRuleAppliesTo;
  teeId?: string | null;
  courseId: string | null;
}

export class CheckInBookingError extends Error {
  readonly result: BookingCheckInResult;
  constructor(message: string, result: BookingCheckInResult) {
    super(message);
    this.name = "CheckInBookingError";
    this.result = result;
  }
}

export function useCheckInBooking(params: UseCheckInBookingParams) {
  const queryClient = useQueryClient();
  return useMutation<BookingCheckInResult, Error, { bookingId: string }>({
    mutationFn: async (variables) => {
      if (!params.accessToken || !params.selectedClubId) {
        throw new Error("Cannot check in booking without an active session.");
      }
      const result = await checkInBooking(variables.bookingId, {
        accessToken: params.accessToken,
        selectedClubId: params.selectedClubId,
      });
      if (result.decision !== "allowed") {
        const message = result.failures[0]?.message ?? `Check-in ${result.decision}`;
        throw new CheckInBookingError(message, result);
      }
      return result;
    },
    onSettled: () => {
      if (!params.selectedClubId || !params.courseId) return;
      void queryClient.invalidateQueries({
        queryKey: teeSheetKeys.day(
          params.selectedClubId,
          params.courseId,
          params.selectedDate,
          params.membershipType,
          params.teeId ?? null,
        ),
      });
    },
  });
}
