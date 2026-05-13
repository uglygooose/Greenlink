// Path: frontend/src/features/tee-sheet/dnd/use-drag-state.test.tsx — Phase 10 Slice 8a.
// Drag-state controller hook unit tests.
import { renderHook, act } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useDragState } from "./use-drag-state";
import type { WaitlistDragPayload } from "./types";
import type { WaitlistEntry } from "../use-waitlist";

function makeEntry(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: "w1",
    name: "K. Mokoena",
    party: 2,
    since: "06:14",
    note: "Members",
    source: "walkin",
    feeAmount: 1100,
    feeCurrency: "ZAR",
    suggestion: null,
    ...overrides,
  };
}

describe("useDragState", () => {
  test("initial state has null payload and null activeTarget", () => {
    const { result } = renderHook(() => useDragState());
    expect(result.current.state.payload).toBeNull();
    expect(result.current.state.activeTarget).toBeNull();
    expect(result.current.announcement).toBe("");
  });

  test("startDrag sets the payload and announcement; endDrag clears everything", () => {
    const { result } = renderHook(() => useDragState());
    const payload: WaitlistDragPayload = { kind: "waitlist", entry: makeEntry({ party: 1 }) };
    act(() => result.current.startDrag(payload));
    expect(result.current.state.payload).toEqual(payload);
    expect(result.current.announcement).toBe("Picking up K. Mokoena · 1 seat");

    act(() => result.current.endDrag());
    expect(result.current.state.payload).toBeNull();
    expect(result.current.state.activeTarget).toBeNull();
    expect(result.current.announcement).toBe("");
  });

  test("party > 1 → announcement pluralises to 'N seats'", () => {
    const { result } = renderHook(() => useDragState());
    act(() =>
      result.current.startDrag({ kind: "waitlist", entry: makeEntry({ party: 4 }) }),
    );
    expect(result.current.announcement).toBe("Picking up K. Mokoena · 4 seats");
  });

  test("setActiveTarget updates only the activeTarget, leaves payload intact", () => {
    const { result } = renderHook(() => useDragState());
    const payload: WaitlistDragPayload = { kind: "waitlist", entry: makeEntry() };
    act(() => result.current.startDrag(payload));
    act(() =>
      result.current.setActiveTarget({
        kind: "slot",
        slot_datetime: "2026-05-12T06:30:00+02:00",
        row_key: "06:30",
      }),
    );
    expect(result.current.state.payload).toEqual(payload);
    expect(result.current.state.activeTarget).toEqual({
      kind: "slot",
      slot_datetime: "2026-05-12T06:30:00+02:00",
      row_key: "06:30",
    });

    act(() => result.current.setActiveTarget(null));
    expect(result.current.state.payload).toEqual(payload);
    expect(result.current.state.activeTarget).toBeNull();
  });
});
