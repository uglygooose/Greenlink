// Path: frontend/src/features/tee-sheet/use-participant-swap.ts — Phase 10 Slice 8b.
// Cross-row participant swap orchestrator. Composes two sequential
// /move calls (no atomic-swap backend endpoint exists — Slice 9b
// candidate). When the second call fails after the first succeeds, the
// orchestrator surfaces a "partial swap" state for the PartialSwapPill
// to render Retry / Restore actions.
//
// The "intermediate cell" concept in the slice spec collapses to a
// capacity check at the target slot: as long as the target row has at
// least one open cell (counted via TeeRow.buildPlayerCells on the live
// data), move A can land while B is still there. The actual cell-index
// inside the slot is backend-managed — the /move payload carries only
// slot_datetime + start_lane + tee_id + participant_id.
import { useCallback, useMemo, useReducer } from "react";

import type { UseMutationResult } from "@tanstack/react-query";

import { useMoveParticipant } from "./use-move-participant";
import type {
  MoveParticipantError,
  MoveParticipantVariables,
  UseMoveParticipantParams,
} from "./use-move-participant";
import type { BookingMoveResult } from "../../types/bookings";
import type { TeeSheetRow } from "../../types/tee-sheet";
import { buildPlayerCells } from "./components/TeeRow";

// ----------------------------- Public types -----------------------------

export interface SwapParticipant {
  bookingId: string;
  participantId: string;
  displayName: string;
  partySize: number;
  slotDatetime: string;
  rowKey: string;
}

export interface SwapInput {
  participantA: SwapParticipant;
  participantB: SwapParticipant;
}

// Discriminated state machine. Each variant is the orchestrator's
// authoritative state at one point in the swap sequence — render
// branches off `kind`.
export type SwapState =
  | { kind: "idle" }
  | { kind: "first-pending"; input: SwapInput }
  | { kind: "second-pending"; input: SwapInput; firstResult: BookingMoveResult }
  | { kind: "succeeded"; input: SwapInput }
  | {
      kind: "partial-failure-first";
      input: SwapInput;
      error: MoveParticipantError | Error;
    }
  | {
      kind: "partial-failure-second";
      input: SwapInput;
      firstResult: BookingMoveResult;
      error: MoveParticipantError | Error;
    }
  | { kind: "rejected-target-row-full"; input: SwapInput }
  | { kind: "restoring"; input: SwapInput; firstResult: BookingMoveResult }
  | {
      kind: "restore-failed";
      input: SwapInput;
      firstResult: BookingMoveResult;
      error: MoveParticipantError | Error;
    }
  | { kind: "restored"; input: SwapInput };

type SwapEvent =
  | { type: "start"; input: SwapInput }
  | { type: "first-succeeded"; result: BookingMoveResult; input: SwapInput }
  | { type: "first-failed"; error: MoveParticipantError | Error; input: SwapInput }
  | { type: "second-pending" }
  | { type: "second-succeeded"; input: SwapInput }
  | { type: "second-failed"; error: MoveParticipantError | Error; input: SwapInput }
  | { type: "reject-row-full"; input: SwapInput }
  | { type: "restore-started" }
  | { type: "restore-succeeded"; input: SwapInput }
  | { type: "restore-failed"; error: MoveParticipantError | Error }
  | { type: "reset" };

function reducer(state: SwapState, event: SwapEvent): SwapState {
  switch (event.type) {
    case "start":
      return { kind: "first-pending", input: event.input };
    case "reject-row-full":
      return { kind: "rejected-target-row-full", input: event.input };
    case "first-failed":
      return { kind: "partial-failure-first", input: event.input, error: event.error };
    case "first-succeeded":
      return { kind: "second-pending", input: event.input, firstResult: event.result };
    case "second-pending":
      return state;
    case "second-succeeded":
      return { kind: "succeeded", input: event.input };
    case "second-failed":
      if (state.kind !== "second-pending") return state;
      return {
        kind: "partial-failure-second",
        input: event.input,
        firstResult: state.firstResult,
        error: event.error,
      };
    case "restore-started":
      if (state.kind !== "partial-failure-second") return state;
      return { kind: "restoring", input: state.input, firstResult: state.firstResult };
    case "restore-succeeded":
      return { kind: "restored", input: event.input };
    case "restore-failed":
      if (state.kind !== "restoring") return state;
      return {
        kind: "restore-failed",
        input: state.input,
        firstResult: state.firstResult,
        error: event.error,
      };
    case "reset":
      return { kind: "idle" };
    default:
      return state;
  }
}

// ----------------------------- Intermediate-cell viability -----------------------------

// Returns true when the target row has at least one open cell available
// for participant A to land in while participant B is still there. The
// backend will accept the move-A call iff this is true; the frontend
// check short-circuits before the network round-trip.
export function targetRowHasIntermediateSpace(
  targetRow: TeeSheetRow,
  targetSlotDatetime: string,
): boolean {
  const slot = targetRow.slots.find((s) => s.slot_datetime === targetSlotDatetime);
  if (!slot) return false;
  return buildPlayerCells(slot).some((cell) => cell.kind === "open");
}

// ----------------------------- Hook -----------------------------

export interface UseParticipantSwapResult {
  state: SwapState;
  initiate: (input: SwapInput, targetRow: TeeSheetRow) => void;
  retrySecond: () => void;
  restoreFirst: () => void;
  reset: () => void;
  moveMutation: UseMutationResult<
    BookingMoveResult,
    MoveParticipantError | Error,
    MoveParticipantVariables,
    unknown
  >;
}

export function useParticipantSwap(
  params: UseMoveParticipantParams,
): UseParticipantSwapResult {
  const [state, dispatch] = useReducer(reducer, { kind: "idle" });
  const moveMutation = useMoveParticipant(params);

  // Stash the live firstResult (post move-A's response) outside reducer
  // so retry/restore handlers can read it without re-deriving from the
  // state machine narrative. Captured in dispatched events too — this is
  // for handler convenience, not as a parallel source of truth.

  const initiate = useCallback(
    (input: SwapInput, targetRow: TeeSheetRow) => {
      if (!targetRowHasIntermediateSpace(targetRow, input.participantB.slotDatetime)) {
        dispatch({ type: "reject-row-full", input });
        return;
      }
      dispatch({ type: "start", input });
      moveMutation.mutate(
        {
          bookingId: input.participantA.bookingId,
          participantId: input.participantA.participantId,
          targetSlotDatetime: input.participantB.slotDatetime,
          sourceSlotDatetime: input.participantA.slotDatetime,
          displayName: input.participantA.displayName,
        },
        {
          onSuccess: (firstResult) => {
            dispatch({ type: "first-succeeded", result: firstResult, input });
            moveMutation.mutate(
              {
                bookingId: input.participantB.bookingId,
                participantId: input.participantB.participantId,
                targetSlotDatetime: input.participantA.slotDatetime,
                sourceSlotDatetime: input.participantB.slotDatetime,
                displayName: input.participantB.displayName,
              },
              {
                onSuccess: () => dispatch({ type: "second-succeeded", input }),
                onError: (error) => dispatch({ type: "second-failed", error, input }),
              },
            );
          },
          onError: (error) => dispatch({ type: "first-failed", error, input }),
        },
      );
    },
    [moveMutation],
  );

  const retrySecond = useCallback(() => {
    if (state.kind !== "partial-failure-second") return;
    const { input } = state;
    dispatch({ type: "first-succeeded", result: state.firstResult, input });
    moveMutation.mutate(
      {
        bookingId: input.participantB.bookingId,
        participantId: input.participantB.participantId,
        targetSlotDatetime: input.participantA.slotDatetime,
        sourceSlotDatetime: input.participantB.slotDatetime,
        displayName: input.participantB.displayName,
      },
      {
        onSuccess: () => dispatch({ type: "second-succeeded", input }),
        onError: (error) => dispatch({ type: "second-failed", error, input }),
      },
    );
  }, [moveMutation, state]);

  const restoreFirst = useCallback(() => {
    if (state.kind !== "partial-failure-second") return;
    const { input, firstResult } = state;
    // Move A's NEW booking_id after the split (if any). When move A
    // didn't split (sole participant in source booking), this equals the
    // original bookingId.
    const aCurrentBookingId = firstResult.booking?.id ?? input.participantA.bookingId;
    dispatch({ type: "restore-started" });
    moveMutation.mutate(
      {
        bookingId: aCurrentBookingId,
        participantId: input.participantA.participantId,
        targetSlotDatetime: input.participantA.slotDatetime,
        sourceSlotDatetime: input.participantB.slotDatetime,
        displayName: input.participantA.displayName,
      },
      {
        onSuccess: () => dispatch({ type: "restore-succeeded", input }),
        onError: (error) => dispatch({ type: "restore-failed", error }),
      },
    );
  }, [moveMutation, state]);

  const reset = useCallback(() => dispatch({ type: "reset" }), []);

  return useMemo(
    () => ({ state, initiate, retrySecond, restoreFirst, reset, moveMutation }),
    [state, initiate, retrySecond, restoreFirst, reset, moveMutation],
  );
}
