// Path: frontend/src/types/tee-sheet-locks.ts — Phase 10 Slice 9a.
// TeeSheetLock payload types mirroring the backend schemas in
// backend/app/schemas/tee_sheet_locks.py. Locks are slot-level advisory
// locks for tee-sheet UI coordination; booking endpoints do NOT consult
// them (Slice 8.5 backend report).

export interface TeeSheetLockAcquireRequest {
  course_id: string;
  slot_datetime: string;
}

export interface TeeSheetLockResponse {
  id: string;
  club_id: string;
  course_id: string;
  slot_datetime: string;
  holder_user_id: string;
  holder_display_name: string;
  acquired_at: string;
  expires_at: string;
  // Server-computed at serialisation time. Clients re-derive from
  // expires_at + Date.now() for the countdown ticker so the UI stays in
  // sync without polling.
  remaining_seconds: number;
}

export interface TeeSheetLockConflictDetail {
  existing_lock: TeeSheetLockResponse;
  message: string;
}

export interface TeeSheetLockListResponse {
  locks: TeeSheetLockResponse[];
}

// The 409 body shape FastAPI returns is `{ detail: TeeSheetLockConflictDetail }`.
// `ApiError.body` carries that wrapping object on 409 responses; the
// lock client helpers below unwrap it.
export interface TeeSheetLockConflict409Body {
  detail: TeeSheetLockConflictDetail;
}
