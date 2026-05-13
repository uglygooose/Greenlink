// Path: frontend/src/features/tee-sheet/use-create-walkin-booking.ts — Phase 10 Slice 8a.
// Mutation hook for the waitlist→row drop. Emits POST /api/golf/bookings
// with source="walk_in" and N GUEST participants (all sharing guest_name
// per Deliverable 4a option i — the waitlist card carries one party name,
// inventing N-1 names is invention).
//
// Optimistic UI per ENGINEERING_STANDARDS.md §7: pre-mutation we patch the
// tee-sheet day query cache to add a transient booking at the dropped slot.
// On error we roll back. On success React Query's invalidation triggers a
// refetch and the real booking replaces the optimistic one. The optimistic
// booking carries an "optimistic-..." id prefix that consumers can detect
// for the "Posting…" visual treatment.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createBooking } from "../../api/operations";
import type {
  BookingCreateInput,
  BookingCreateParticipantInput,
  BookingCreateResult,
} from "../../types/bookings";
import type { TeeSheetDayResponse } from "../../types/tee-sheet";

// TeeSheetBookingSummary is structurally defined as an inline list-item
// type on TeeSheetSlotView.bookings in types/tee-sheet.ts. The alias lets
// the optimistic patch construct booking objects with the same shape
// without forcing a new named export.
type TeeSheetBookingSummary = TeeSheetDayResponse["rows"][number]["slots"][number]["bookings"][number];
import type { BookingRuleAppliesTo } from "../../types/operations";

import { teeSheetKeys } from "./hooks";
import type { WaitlistEntry } from "./use-waitlist";

export const OPTIMISTIC_BOOKING_ID_PREFIX = "optimistic-";

export interface CreateWalkinBookingVariables {
  entry: WaitlistEntry;
  slotDatetime: string;
  courseId: string;
}

export interface CreateWalkinBookingContext {
  // React Query rollback bundle — snapshots the cache state before our patch.
  dayQueryKey: readonly unknown[];
  previousDay: TeeSheetDayResponse | undefined;
  optimisticBookingId: string;
}

export interface UseCreateWalkinBookingParams {
  accessToken: string | null;
  selectedClubId: string | null;
  selectedDate: string;
  membershipType: BookingRuleAppliesTo;
  teeId?: string | null;
}

export function buildWalkinBookingPayload(
  variables: CreateWalkinBookingVariables,
): BookingCreateInput {
  const participants: BookingCreateParticipantInput[] = Array.from(
    { length: Math.max(1, variables.entry.party) },
    (_, index): BookingCreateParticipantInput => ({
      participant_type: "guest",
      // Per Deliverable 4a option i: all N participants share the party
      // name. The waitlist card has ONE party name; inventing N-1 names
      // (suffixes, placeholders) is invention. See PHASE_LOG Slice 8a.
      guest_name: variables.entry.name,
      is_primary: index === 0,
    }),
  );
  return {
    course_id: variables.courseId,
    slot_datetime: variables.slotDatetime,
    source: "walk_in",
    applies_to: "guest",
    cart_flag: false,
    caddie_flag: false,
    participants,
  };
}

export function useCreateWalkinBooking({
  accessToken,
  selectedClubId,
  selectedDate,
  membershipType,
  teeId,
}: UseCreateWalkinBookingParams) {
  const queryClient = useQueryClient();

  return useMutation<
    BookingCreateResult,
    Error,
    CreateWalkinBookingVariables,
    CreateWalkinBookingContext
  >({
    mutationFn: async (variables) => {
      if (!accessToken || !selectedClubId) {
        throw new Error("Cannot create booking without an active session.");
      }
      const payload = buildWalkinBookingPayload(variables);
      const result = await createBooking(payload, { accessToken, selectedClubId });
      if (result.decision !== "allowed") {
        const message =
          result.failures[0]?.message ??
          result.availability?.blockers[0]?.reason ??
          `Booking ${result.decision}`;
        throw new BookingCreateError(message, result);
      }
      return result;
    },

    onMutate: async (variables): Promise<CreateWalkinBookingContext> => {
      const dayQueryKey = teeSheetKeys.day(
        selectedClubId ?? "none",
        variables.courseId,
        selectedDate,
        membershipType,
        teeId ?? null,
      );
      await queryClient.cancelQueries({ queryKey: dayQueryKey });
      const previousDay = queryClient.getQueryData<TeeSheetDayResponse>(dayQueryKey);
      const optimisticBookingId = `${OPTIMISTIC_BOOKING_ID_PREFIX}${Date.now()}`;

      if (previousDay) {
        queryClient.setQueryData<TeeSheetDayResponse>(
          dayQueryKey,
          patchDayWithOptimisticBooking(previousDay, variables, optimisticBookingId),
        );
      }
      return { dayQueryKey, previousDay, optimisticBookingId };
    },

    onError: (_error, _variables, context) => {
      if (context?.previousDay !== undefined) {
        queryClient.setQueryData(context.dayQueryKey, context.previousDay);
      }
    },

    onSettled: (_data, _error, _variables, context) => {
      if (context) {
        void queryClient.invalidateQueries({ queryKey: context.dayQueryKey });
      }
      // Waitlist refetch too — Slice 8a-relevant for when the suggestion
      // engine lands and a placement should clear the waitlist entry.
      void queryClient.invalidateQueries({ queryKey: ["waitlist"] });
    },
  });
}

// Custom error preserving the BookingCreateResult so callers can surface
// the structured failures (blockers, capacity-exceeded, etc.) to the UI.
export class BookingCreateError extends Error {
  readonly result: BookingCreateResult;
  constructor(message: string, result: BookingCreateResult) {
    super(message);
    this.name = "BookingCreateError";
    this.result = result;
  }
}

function patchDayWithOptimisticBooking(
  day: TeeSheetDayResponse,
  variables: CreateWalkinBookingVariables,
  optimisticBookingId: string,
): TeeSheetDayResponse {
  const optimisticBooking: TeeSheetBookingSummary = {
    id: optimisticBookingId,
    status: "reserved",
    party_size: variables.entry.party,
    holes: 18,
    slot_datetime: variables.slotDatetime,
    cart_flag: false,
    caddie_flag: false,
    payment_status: null,
    participants: Array.from({ length: variables.entry.party }, (_, index) => ({
      id: `${optimisticBookingId}-p${index}`,
      display_name: variables.entry.name,
      participant_type: "guest" as const,
      is_primary: index === 0,
    })),
  };
  return {
    ...day,
    rows: day.rows.map((row) => ({
      ...row,
      slots: row.slots.map((slot) =>
        slot.slot_datetime === variables.slotDatetime
          ? { ...slot, bookings: [...slot.bookings, optimisticBooking] }
          : slot,
      ),
    })),
  };
}

// Helper for callers to detect an optimistic booking on render.
export function isOptimisticBookingId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_BOOKING_ID_PREFIX);
}
