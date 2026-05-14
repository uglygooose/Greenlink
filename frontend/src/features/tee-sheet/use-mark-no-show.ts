// Path: frontend/src/features/tee-sheet/use-mark-no-show.ts — Phase 10 Slice 10.
// React Query mutation hook calling POST /api/golf/bookings/{booking_id}/no-show.
// Backend constructs BookingNoShowRequest from the URL + the authenticated
// user. Same shape as use-checkin-booking; invalidates the tee-sheet day
// query so the row's status updates (RESERVED → NO_SHOW).
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { markBookingNoShow } from "../../api/operations";
import type { BookingNoShowResult } from "../../types/bookings";

import { teeSheetKeys } from "./hooks";
import type { BookingRuleAppliesTo } from "../../types/operations";

export interface UseMarkNoShowParams {
  accessToken: string | null;
  selectedClubId: string | null;
  selectedDate: string;
  membershipType: BookingRuleAppliesTo;
  teeId?: string | null;
  courseId: string | null;
}

export class MarkNoShowError extends Error {
  readonly result: BookingNoShowResult;
  constructor(message: string, result: BookingNoShowResult) {
    super(message);
    this.name = "MarkNoShowError";
    this.result = result;
  }
}

export function useMarkNoShow(params: UseMarkNoShowParams) {
  const queryClient = useQueryClient();
  return useMutation<BookingNoShowResult, Error, { bookingId: string }>({
    mutationFn: async (variables) => {
      if (!params.accessToken || !params.selectedClubId) {
        throw new Error("Cannot mark no-show without an active session.");
      }
      const result = await markBookingNoShow(variables.bookingId, {
        accessToken: params.accessToken,
        selectedClubId: params.selectedClubId,
      });
      if (result.decision !== "allowed") {
        const message = result.failures[0]?.message ?? `No-show ${result.decision}`;
        throw new MarkNoShowError(message, result);
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
