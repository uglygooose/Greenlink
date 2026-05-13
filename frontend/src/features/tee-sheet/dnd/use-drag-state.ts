// Path: frontend/src/features/tee-sheet/dnd/use-drag-state.ts — Phase 10 Slice 8a.
// Centralised drag coordination at the page level. WaitlistCard reads/writes
// `payload` on drag start/end; TeeRow reads `payload` to render the drop
// target label and reads/writes `activeTarget` to drive the visual.
//
// Single useState pair, no global store, no context — passed down via props.
// The hook also exposes a stable derived field for aria-live: the
// announcement text when a drag starts.
import { useCallback, useState } from "react";

import type { DragPayload, DropTarget } from "./types";

export interface DragState {
  payload: DragPayload | null;
  activeTarget: DropTarget | null;
}

export interface DragController {
  state: DragState;
  startDrag: (payload: DragPayload) => void;
  endDrag: () => void;
  setActiveTarget: (target: DropTarget | null) => void;
  // Polite aria-live announcement text. Empty string when no drag is active.
  announcement: string;
}

export function useDragState(): DragController {
  const [state, setState] = useState<DragState>({ payload: null, activeTarget: null });

  const startDrag = useCallback((payload: DragPayload) => {
    setState({ payload, activeTarget: null });
  }, []);

  const endDrag = useCallback(() => {
    setState({ payload: null, activeTarget: null });
  }, []);

  const setActiveTarget = useCallback((target: DropTarget | null) => {
    setState((prev) => ({ ...prev, activeTarget: target }));
  }, []);

  const announcement = announcementFor(state.payload);

  return { state, startDrag, endDrag, setActiveTarget, announcement };
}

function announcementFor(payload: DragPayload | null): string {
  if (payload === null) return "";
  if (payload.kind === "waitlist") {
    const { entry } = payload;
    const seats = entry.party === 1 ? "1 seat" : `${entry.party} seats`;
    return `Picking up ${entry.name} · ${seats}`;
  }
  return "";
}
