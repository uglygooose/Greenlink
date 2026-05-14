// Path: frontend/src/features/tee-sheet/use-selection-lock.ts — Phase 10 Slice 9a.
// Selection-driven optimistic-lock orchestrator. Selection is the trigger:
// when the operator selects a tee row, we acquire a lock; when selection
// clears (or shifts), we release. A single 1-second interval drives both
// the countdown re-render and the auto-renewal at 30s remaining.
//
// State machine (verbatim discriminated union below):
//   idle          — no selection, no lock.
//   acquiring     — selection set, acquire mutation pending.
//   held-by-me    — acquire succeeded (or 409 with same user_id reuse).
//   held-by-other — 409 from a different user.
//   releasing     — selection cleared, release in flight.
//   error         — unexpected failure (network, 500, TTL elapsed without renewal).
//
// Stale-call coordination: every mutation callback re-checks the live
// selectedSlotKey before applying its result. If the selection has moved
// on, late responses are discarded — and if a stale call succeeded in
// acquiring a lock for an abandoned slot, the orchestrator fires a
// release for that lock so the operator's earlier slot doesn't stay
// held.
import { useCallback, useEffect, useRef, useState } from "react";

import { useAcquireLock } from "./use-acquire-lock";
import { useRenewLock } from "./use-renew-lock";
import { useReleaseLock } from "./use-release-lock";
import type { TeeSheetLockResponse } from "../../types/tee-sheet-locks";

const RENEWAL_THRESHOLD_SECONDS = 30;

export type SelectionLockState =
  | { kind: "idle" }
  | { kind: "acquiring" }
  | { kind: "held-by-me"; lock: TeeSheetLockResponse }
  | { kind: "held-by-other"; lock: TeeSheetLockResponse }
  | { kind: "releasing" }
  | { kind: "error"; message: string };

export interface UseSelectionLockParams {
  accessToken: string | null;
  selectedClubId: string | null;
  courseId: string | null;
  selectedSlotKey: string | null;
  currentUserId: string | null;
}

export interface UseSelectionLockResult {
  state: SelectionLockState;
  secondsRemaining: number;
  holderDisplayName: string | null;
}

export function useSelectionLock({
  accessToken,
  selectedClubId,
  courseId,
  selectedSlotKey,
  currentUserId,
}: UseSelectionLockParams): UseSelectionLockResult {
  const [state, setState] = useState<SelectionLockState>({ kind: "idle" });
  const [now, setNow] = useState<number>(() => Date.now());

  // The slot we're currently associated with — either acquiring, held,
  // or about to release. Updated synchronously with setState so per-call
  // mutation callbacks can detect stale responses by comparing
  // activeSlotRef.current against the slot they were fired for.
  const activeSlotRef = useRef<string | null>(null);
  const currentLockRef = useRef<TeeSheetLockResponse | null>(null);
  const renewalInFlightRef = useRef<boolean>(false);

  const acquireMutation = useAcquireLock({ accessToken, selectedClubId });
  const renewMutation = useRenewLock({ accessToken, selectedClubId });
  const releaseMutation = useReleaseLock({ accessToken, selectedClubId });

  // Fire-and-forget release for a specific lock id. Used both by the
  // selection-change path (release previous slot's lock) and by the
  // stale-acquire-success path (release a lock acquired for a slot the
  // user has already navigated away from).
  const fireRelease = useCallback(
    (lockId: string) => {
      releaseMutation.mutate({ lockId });
    },
    [releaseMutation],
  );

  // -------------- Selection change → acquire / release pipeline --------------
  useEffect(() => {
    // Release prior lock first if we held one. Fire-and-forget; the
    // operator's UI doesn't wait on release.
    const previousLock = currentLockRef.current;
    if (previousLock) {
      currentLockRef.current = null;
      fireRelease(previousLock.id);
    }

    activeSlotRef.current = selectedSlotKey;

    if (!selectedSlotKey || !courseId) {
      // Either user cleared selection or there's no active course.
      if (previousLock) {
        setState({ kind: "releasing" });
        // We don't await; the release fires above. Settle to idle on the
        // next event-loop tick so the footer briefly shows "Releasing…".
        Promise.resolve().then(() => setState({ kind: "idle" }));
      } else {
        setState({ kind: "idle" });
      }
      return;
    }

    setState({ kind: "acquiring" });
    acquireMutation.mutate(
      { courseId, slotDatetime: selectedSlotKey },
      {
        onSuccess: (result) => {
          // Stale check: if the selection has moved on, this response is
          // for a slot we no longer care about.
          if (activeSlotRef.current !== selectedSlotKey) {
            if (result.kind === "lock") fireRelease(result.lock.id);
            return;
          }
          if (result.kind === "lock") {
            currentLockRef.current = result.lock;
            setState({ kind: "held-by-me", lock: result.lock });
            return;
          }
          // Conflict — backend says someone holds it. If that someone is
          // the current user (duplicate calls, stale state), treat it as
          // held-by-me reusing the existing lock. Otherwise, held-by-other.
          if (currentUserId && result.existing_lock.holder_user_id === currentUserId) {
            currentLockRef.current = result.existing_lock;
            setState({ kind: "held-by-me", lock: result.existing_lock });
            return;
          }
          setState({ kind: "held-by-other", lock: result.existing_lock });
        },
        onError: (err) => {
          if (activeSlotRef.current !== selectedSlotKey) return;
          setState({ kind: "error", message: err.message });
        },
      },
    );
    // acquireMutation reference is stable enough for this dep set; we
    // explicitly omit it to avoid re-firing on every reference identity
    // change (acquireMutation is rebuilt on each render but mutates a
    // ref-backed store under the hood).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlotKey, courseId]);

  // -------------- Countdown ticker + auto-renewal --------------
  useEffect(() => {
    if (state.kind !== "held-by-me" && state.kind !== "held-by-other") return;
    const intervalId = window.setInterval(() => {
      setNow(Date.now());

      // Auto-renewal is only meaningful when we hold the lock ourselves.
      if (state.kind !== "held-by-me") return;
      const lock = currentLockRef.current;
      if (!lock) return;
      const remaining = computeRemainingSeconds(lock.expires_at, Date.now());
      if (remaining <= 0) {
        // TTL elapsed without successful renewal — escalate.
        setState({ kind: "error", message: "Lock TTL expired" });
        return;
      }
      if (
        remaining <= RENEWAL_THRESHOLD_SECONDS &&
        !renewalInFlightRef.current
      ) {
        renewalInFlightRef.current = true;
        renewMutation.mutate(
          { lockId: lock.id },
          {
            onSuccess: (result) => {
              renewalInFlightRef.current = false;
              if (result.kind === "lock") {
                currentLockRef.current = result.lock;
                setState({ kind: "held-by-me", lock: result.lock });
              } else {
                // Renewal returned a 409 — the lock is no longer ours.
                currentLockRef.current = null;
                setState({ kind: "error", message: result.message });
              }
            },
            onError: () => {
              renewalInFlightRef.current = false;
              setState({ kind: "error", message: "Renew failed" });
            },
          },
        );
      }
    }, 1000);
    return () => window.clearInterval(intervalId);
    // We intentionally only re-fire this effect when the state kind
    // changes — re-creating the interval on every render would reset
    // the cadence. renewMutation's identity changes between renders but
    // it's safe to close over (it's a mutation handle that internally
    // tracks its current state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

  // -------------- Unmount cleanup --------------
  useEffect(() => {
    return () => {
      const lock = currentLockRef.current;
      if (lock) {
        fireRelease(lock.id);
        currentLockRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------- Render-time derivations --------------
  const lockForCountdown =
    state.kind === "held-by-me" || state.kind === "held-by-other" ? state.lock : null;
  const secondsRemaining = lockForCountdown
    ? computeRemainingSeconds(lockForCountdown.expires_at, now)
    : 0;
  const holderDisplayName =
    state.kind === "held-by-other" ? state.lock.holder_display_name : null;

  return { state, secondsRemaining, holderDisplayName };
}

function computeRemainingSeconds(expiresAtIso: string, nowMs: number): number {
  const expiresMs = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(expiresMs)) return 0;
  return Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
}
