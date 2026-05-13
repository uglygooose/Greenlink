// Path: frontend/src/features/tee-sheet/dnd/types.ts — Phase 10 Slices 8a–8b.
// Drag-and-drop type definitions for the tee-sheet surface. Native HTML5
// DnD API (no library). Slice 8a introduced the "waitlist" drag kind and
// the "slot" drop kind. Slice 8b adds the "participant" drag kind for
// cross-row participant moves.
import type { WaitlistEntry } from "../use-waitlist";

export interface WaitlistDragPayload {
  kind: "waitlist";
  entry: WaitlistEntry;
}

// Cross-row participant move. The payload carries everything needed to
// (a) decide same-row rejection at the drop site (row_key comparison),
// (b) emit a /move POST with the participant_id, and (c) reconstruct the
// source coordinates if the swap orchestrator needs to fire a Restore.
export interface ParticipantDragPayload {
  kind: "participant";
  booking_id: string;
  participant_id: string;
  display_name: string;
  party_size: number;
  source_slot_datetime: string;
  source_row_key: string;
  source_cell_index: number;
}

export type DragPayload = WaitlistDragPayload | ParticipantDragPayload;

// SlotDropTarget is shared by both drag kinds — same-row rejection
// compares source_row_key (carried on the participant payload) with the
// target row_key, so cell_index on the drop target itself is not needed.
export interface SlotDropTarget {
  kind: "slot";
  slot_datetime: string;
  row_key: string;
}

export type DropTarget = SlotDropTarget;

// Slice 8b — when a participant drops onto a FILLED cell, the page needs
// to know the cell's occupant to drive the swap orchestrator. Empty
// cells pass `null`. CellOccupant is purposely a flat record of
// identifiers — the swap orchestrator looks up nothing else.
export interface CellOccupant {
  booking_id: string;
  participant_id: string;
  display_name: string;
  party_size: number;
}

// MIME type used by dataTransfer.setData / getData. Browsers preserve
// custom MIME types within the page; we don't need a real registered type.
export const DRAG_PAYLOAD_MIME = "application/x-greenlink-drag-payload+json";
