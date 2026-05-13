// Path: frontend/src/features/tee-sheet/use-move-participant.ts — Phase 10 Slice 8b.
// Cross-row participant move mutation. Backend POST
// /api/golf/bookings/{booking_id}/move with participant_id triggers a
// participant split when len(participants) > 1 (per
// backend/app/services/booking_move_service.py:302-306).
//
// Failure-code categorization mirrors the verbatim codes in
// booking_move_service.py:72-275 + _check_target_capacity:524. Same-row
// rejection is short-circuited client-side BEFORE this hook fires — the
// move_is_no_op case here is a defensive fallback.
//
// Optimistic UI per ENGINEERING_STANDARDS.md §7: pre-mutation we patch
// the tee-sheet day query cache so the moved participant appears at the
// target slot and disappears from the source. Rollback on error,
// invalidate on settle (real backend state replaces the optimistic
// shape).
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { moveBooking } from "../../api/operations";
import type {
  BookingMoveFailureDetail,
  BookingMoveInput,
  BookingMoveResult,
} from "../../types/bookings";
import type { TeeSheetDayResponse } from "../../types/tee-sheet";
import type { BookingRuleAppliesTo } from "../../types/operations";

import { teeSheetKeys } from "./hooks";

export const MOVE_OPTIMISTIC_BOOKING_ID_PREFIX = "optimistic-move-";

// Categorised failure surface. The component layer maps each category to
// a short operator-facing message. The raw BookingMoveFailureDetail is
// preserved on the error so callers that need the exact code/field can
// drill in.
export type MoveParticipantFailureCategory =
  | "capacity_full"
  | "target_blocked"
  | "target_reserved"
  | "booking_not_moveable"
  | "crosses_day_boundary"
  | "no_op"
  | "target_tee_not_found"
  | "participant_not_found"
  | "booking_not_found"
  | "club_config_not_found"
  | "unknown";

export function categorizeMoveFailure(
  failure: BookingMoveFailureDetail | undefined,
): MoveParticipantFailureCategory {
  if (!failure) return "unknown";
  switch (failure.code) {
    case "target_slot_capacity_exceeded":
      return "capacity_full";
    case "target_slot_manually_blocked":
    case "target_slot_competition_controlled":
    case "target_slot_event_controlled":
    case "target_slot_externally_unavailable":
      return "target_blocked";
    case "target_slot_reserved_state_active":
      return "target_reserved";
    case "booking_status_not_moveable":
      return "booking_not_moveable";
    case "move_crosses_day_boundary":
      return "crosses_day_boundary";
    case "move_is_no_op":
      return "no_op";
    case "target_tee_not_found":
      return "target_tee_not_found";
    case "participant_not_found":
      return "participant_not_found";
    case "booking_not_found":
      return "booking_not_found";
    case "club_config_not_found":
      return "club_config_not_found";
    default:
      return "unknown";
  }
}

export class MoveParticipantError extends Error {
  readonly result: BookingMoveResult;
  readonly category: MoveParticipantFailureCategory;
  readonly failure: BookingMoveFailureDetail | undefined;
  constructor(message: string, result: BookingMoveResult) {
    super(message);
    this.name = "MoveParticipantError";
    this.result = result;
    this.failure = result.failures[0];
    this.category = categorizeMoveFailure(this.failure);
  }
}

export interface MoveParticipantVariables {
  bookingId: string;
  participantId: string;
  targetSlotDatetime: string;
  // Source coords for the optimistic patch — the hook subtracts the
  // participant from this booking at this slot.
  sourceSlotDatetime: string;
  // Display name only used to populate the optimistic transient booking
  // so the target row renders the participant during the in-flight window.
  displayName: string;
}

export interface MoveParticipantContext {
  dayQueryKey: readonly unknown[];
  previousDay: TeeSheetDayResponse | undefined;
  optimisticBookingId: string;
}

export interface UseMoveParticipantParams {
  accessToken: string | null;
  selectedClubId: string | null;
  selectedDate: string;
  membershipType: BookingRuleAppliesTo;
  teeId?: string | null;
}

export function buildMovePayload(variables: MoveParticipantVariables): BookingMoveInput {
  return {
    target_slot_datetime: variables.targetSlotDatetime,
    target_start_lane: null,
    target_tee_id: null,
    participant_id: variables.participantId,
  };
}

export function useMoveParticipant({
  accessToken,
  selectedClubId,
  selectedDate,
  membershipType,
  teeId,
}: UseMoveParticipantParams) {
  const queryClient = useQueryClient();

  return useMutation<
    BookingMoveResult,
    MoveParticipantError | Error,
    MoveParticipantVariables,
    MoveParticipantContext
  >({
    mutationFn: async (variables) => {
      if (!accessToken || !selectedClubId) {
        throw new Error("Cannot move participant without an active session.");
      }
      const payload = buildMovePayload(variables);
      const result = await moveBooking(variables.bookingId, payload, {
        accessToken,
        selectedClubId,
      });
      if (result.decision !== "allowed") {
        const failure = result.failures[0];
        throw new MoveParticipantError(
          failure?.message ?? `Move ${result.decision}`,
          result,
        );
      }
      return result;
    },

    onMutate: async (variables): Promise<MoveParticipantContext> => {
      const dayQueryKey = teeSheetKeys.day(
        selectedClubId ?? "none",
        // courseId is encoded in the query key but not directly available
        // here — we pull the existing query data and patch it in place,
        // so the key is derived from the queries cache instead.
        "*",
        selectedDate,
        membershipType,
        teeId ?? null,
      );
      // Find the actual day query in the cache. Since courseId is part of
      // the key, scan for any tee-sheet day query whose data matches the
      // selected date. The first match is the active grid.
      const cache = queryClient.getQueryCache();
      const dayQuery = cache.findAll({ predicate: matchesDayKey(selectedDate, membershipType) })[0];
      const optimisticBookingId = `${MOVE_OPTIMISTIC_BOOKING_ID_PREFIX}${Date.now()}`;
      if (!dayQuery) {
        return { dayQueryKey, previousDay: undefined, optimisticBookingId };
      }
      const realKey = dayQuery.queryKey as readonly unknown[];
      await queryClient.cancelQueries({ queryKey: realKey });
      const previousDay = queryClient.getQueryData<TeeSheetDayResponse>(realKey);
      if (previousDay) {
        queryClient.setQueryData<TeeSheetDayResponse>(
          realKey,
          patchDayWithMove(previousDay, variables, optimisticBookingId),
        );
      }
      return { dayQueryKey: realKey, previousDay, optimisticBookingId };
    },

    onError: (_error, _variables, context) => {
      if (context?.previousDay !== undefined) {
        queryClient.setQueryData(context.dayQueryKey, context.previousDay);
      }
    },

    onSettled: (_data, _error, _variables, context) => {
      if (context?.dayQueryKey) {
        void queryClient.invalidateQueries({ queryKey: context.dayQueryKey });
      }
    },
  });
}

export function isMoveOptimisticBookingId(id: string): boolean {
  return id.startsWith(MOVE_OPTIMISTIC_BOOKING_ID_PREFIX);
}

// Matches teeSheetKeys.day shape: ["tee-sheet", clubId, courseId, day, membershipType, teeId].
function matchesDayKey(
  selectedDate: string,
  membershipType: BookingRuleAppliesTo,
): (query: { queryKey: readonly unknown[] }) => boolean {
  return (query) => {
    const k = query.queryKey;
    return (
      Array.isArray(k) &&
      k[0] === "tee-sheet" &&
      k[3] === selectedDate &&
      k[4] === membershipType
    );
  };
}

function patchDayWithMove(
  day: TeeSheetDayResponse,
  variables: MoveParticipantVariables,
  optimisticBookingId: string,
): TeeSheetDayResponse {
  type SlotBooking = TeeSheetDayResponse["rows"][number]["slots"][number]["bookings"][number];
  const optimisticBooking: SlotBooking = {
    id: optimisticBookingId,
    status: "reserved",
    party_size: 1,
    holes: 18,
    slot_datetime: variables.targetSlotDatetime,
    cart_flag: false,
    caddie_flag: false,
    payment_status: null,
    participants: [
      {
        id: `${optimisticBookingId}-p0`,
        display_name: variables.displayName,
        participant_type: "guest",
        is_primary: true,
      },
    ],
  };
  return {
    ...day,
    rows: day.rows.map((row) => ({
      ...row,
      slots: row.slots.map((slot) => {
        if (slot.slot_datetime === variables.sourceSlotDatetime) {
          // Remove the moved participant from the source booking.
          return {
            ...slot,
            bookings: slot.bookings
              .map((booking) => {
                if (booking.id !== variables.bookingId) return booking;
                const remaining = booking.participants.filter(
                  (p) => p.id !== variables.participantId,
                );
                if (remaining.length === 0) return null;
                return {
                  ...booking,
                  party_size: Math.max(1, booking.party_size - 1),
                  participants: remaining,
                };
              })
              .filter((b): b is SlotBooking => b !== null),
          };
        }
        if (slot.slot_datetime === variables.targetSlotDatetime) {
          // Add the optimistic transient booking at the target slot.
          return { ...slot, bookings: [...slot.bookings, optimisticBooking] };
        }
        return slot;
      }),
    })),
  };
}
