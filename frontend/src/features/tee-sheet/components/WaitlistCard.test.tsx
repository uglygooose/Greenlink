import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { WaitlistCard } from "./WaitlistCard";
import { DRAG_PAYLOAD_MIME } from "../dnd/types";
import type { WaitlistEntry } from "../use-waitlist";

function makeEntry(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: "w1",
    name: "K. Mokoena",
    party: 2,
    since: "06:14",
    note: "Members · happy to fill any open slot",
    source: "walkin",
    feeAmount: 1100,
    feeCurrency: "ZAR",
    suggestion: null,
    ...overrides,
  };
}

describe("WaitlistCard", () => {
  test("renders party name, source badge, and since-time", () => {
    render(<WaitlistCard entry={makeEntry()} />);
    expect(screen.getByText("K. Mokoena")).toBeInTheDocument();
    expect(screen.getByText("Walk-in")).toBeInTheDocument();
    expect(screen.getByTestId("waitlist-card-since-w1")).toHaveTextContent("06:14");
  });

  test("renders party body line with party size and note", () => {
    render(<WaitlistCard entry={makeEntry()} />);
    expect(screen.getByText(/party of/i).textContent).toContain("2");
    expect(screen.getByText(/happy to fill any open slot/i)).toBeInTheDocument();
  });

  test("source=memberapp renders 'Member app' badge", () => {
    render(<WaitlistCard entry={makeEntry({ source: "memberapp" })} />);
    expect(screen.getByText("Member app")).toBeInTheDocument();
  });

  test("renders suggestion strip when suggestion is provided", () => {
    render(
      <WaitlistCard
        entry={makeEntry({
          suggestion: { slotLabel: "06:46 · 2 slots" },
        })}
      />,
    );
    expect(screen.getByTestId("waitlist-card-suggestion-w1")).toBeInTheDocument();
    expect(screen.getByText(/06:46 · 2 slots/)).toBeInTheDocument();
    expect(screen.getByTestId("waitlist-card-place-w1")).toBeInTheDocument();
  });

  test("omits suggestion strip when suggestion is null (FROZEN backend gap path)", () => {
    render(<WaitlistCard entry={makeEntry({ suggestion: null })} />);
    expect(screen.queryByTestId("waitlist-card-suggestion-w1")).toBeNull();
  });

  test("Place button fires onPlace with the entry", () => {
    const onPlace = vi.fn();
    const entry = makeEntry({ suggestion: { slotLabel: "06:46 · 2 slots" } });
    render(<WaitlistCard entry={entry} onPlace={onPlace} />);
    fireEvent.click(screen.getByTestId("waitlist-card-place-w1"));
    expect(onPlace).toHaveBeenCalledWith(entry);
  });

  test("Place button is disabled when onPlace is not supplied (Slice-7 stub state)", () => {
    render(
      <WaitlistCard entry={makeEntry({ suggestion: { slotLabel: "06:46 · 2 slots" } })} />,
    );
    expect(screen.getByTestId("waitlist-card-place-w1")).toBeDisabled();
  });

  test("card carries draggable=true (visual affordance for Slice 8a)", () => {
    render(<WaitlistCard entry={makeEntry()} />);
    expect(screen.getByTestId("waitlist-card-w1").getAttribute("draggable")).toBe("true");
  });

  test("dragStart writes the payload into dataTransfer and fires onDragStart", () => {
    const onDragStart = vi.fn();
    const entry = makeEntry({ party: 3 });
    render(<WaitlistCard entry={entry} onDragStart={onDragStart} />);
    const card = screen.getByTestId("waitlist-card-w1");
    const setData = vi.fn();
    fireEvent.dragStart(card, {
      dataTransfer: { setData, types: [], items: [], files: [] },
    });
    expect(setData).toHaveBeenCalledWith(DRAG_PAYLOAD_MIME, expect.any(String));
    const written = JSON.parse(setData.mock.calls[0][1] as string);
    expect(written).toEqual({ kind: "waitlist", entry });
    expect(onDragStart).toHaveBeenCalledWith({ kind: "waitlist", entry });
    expect(card.getAttribute("data-dragging")).toBe("true");
  });

  test("dragEnd clears the data-dragging attribute and fires onDragEnd", () => {
    const onDragEnd = vi.fn();
    render(<WaitlistCard entry={makeEntry()} onDragEnd={onDragEnd} />);
    const card = screen.getByTestId("waitlist-card-w1");
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn() } });
    fireEvent.dragEnd(card);
    expect(card.hasAttribute("data-dragging")).toBe(false);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
  });

  test("isOptimisticallyRemoved dims the card and exposes the data attribute", () => {
    render(<WaitlistCard entry={makeEntry()} isOptimisticallyRemoved />);
    const card = screen.getByTestId("waitlist-card-w1");
    expect(card.getAttribute("data-optimistic-removed")).toBe("true");
    expect(card.style.opacity).toBe("0.45");
  });
});
