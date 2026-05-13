// Path: frontend/src/features/tee-sheet/dnd/types.ts — Phase 10 Slice 8a.
// Drag-and-drop type definitions for the tee-sheet surface. Native HTML5
// DnD API (no library). Slice 8a introduces the "waitlist" drag kind and
// the "slot" drop kind. Slice 8b will extend the unions for player drags.
import type { WaitlistEntry } from "../use-waitlist";

export interface WaitlistDragPayload {
  kind: "waitlist";
  entry: WaitlistEntry;
}

// Discriminated union — Slice 8b adds e.g. `{ kind: "player"; ... }`.
export type DragPayload = WaitlistDragPayload;

export interface SlotDropTarget {
  kind: "slot";
  slot_datetime: string;
  row_key: string;
}

export type DropTarget = SlotDropTarget;

// MIME type used by dataTransfer.setData / getData. Browsers preserve
// custom MIME types within the page; we don't need a real registered type.
export const DRAG_PAYLOAD_MIME = "application/x-greenlink-drag-payload+json";
