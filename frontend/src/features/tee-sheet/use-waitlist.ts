// Path: frontend/src/features/tee-sheet/use-waitlist.ts — Phase 10 Slice 7.
// Phase 8's walk-in waitlist has no backend representation today. This
// hook ships an empty stub so the rail chrome can land and Slice 8a can
// build the DnD drop target against a runtime that's stable-but-inert.
//
// FROZEN — backend gap. Do not extend, branch, or duplicate.
// No Waitlist model, no /api/golf/waitlist endpoint, no
// BookingSource.WALK_IN enum value. When backend exposes these, replace
// the stub return at synthesizeStubWaitlist() with a React Query fetch
// against the real endpoint. The hook signature anticipates the swap —
// callers pass clubId / courseId / date / accessToken and consume
// { waitlist, loading, error } unchanged. See DRIFT_LOG 2026-05-13
// (Slice 7 Path 1) for the gap inventory and resolution.

export interface WaitlistEntry {
  id: string;
  name: string;
  party: number;
  since: string;       // mono-rendered HH:MM
  note: string;
  source: "walkin" | "memberapp";
  feeAmount: number | null;     // ZAR rands; used by rail footer running-total
  feeCurrency: string | null;
  suggestion: WaitlistSuggestion | null;
}

export interface WaitlistSuggestion {
  slotLabel: string;            // e.g. "06:46 · 2 slots"
}

export interface UseWaitlistParams {
  clubId: string | null;
  courseId: string | null;
  date: string;
}

export interface UseWaitlistResult {
  waitlist: WaitlistEntry[];
  loading: boolean;
  error: Error | null;
}

export function useWaitlist(params: UseWaitlistParams): UseWaitlistResult {
  // params reserved for the future React Query fetch (see swap-point below).
  // Slice 7 stub returns empty without using clubId/courseId/date.
  void params;
  return synthesizeStubWaitlist();
}

function synthesizeStubWaitlist(): UseWaitlistResult {
  // FROZEN swap-point. When the backend ships, this stub gets replaced
  // with a React Query fetch:
  //
  //   return useQuery({
  //     queryKey: ["waitlist", params.clubId, params.courseId, params.date],
  //     queryFn: () => fetchWaitlist(...),
  //     enabled: params.clubId != null && params.courseId != null,
  //   });
  //
  // Until then, an empty list keeps the rail rendering its empty-state
  // drop-hint card. No fake data — the rail is honest about backend reality.
  return { waitlist: [], loading: false, error: null };
}
