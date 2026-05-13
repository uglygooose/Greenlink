import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { WaitlistRail } from "./WaitlistRail";
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

describe("WaitlistRail", () => {
  test("renders header counts (0 parties when empty)", () => {
    render(<WaitlistRail waitlist={[]} loading={false} error={null} />);
    expect(screen.getByTestId("waitlist-rail-counts")).toHaveTextContent("0 parties · 0 players");
  });

  test("renders empty-state drop hint when waitlist is empty", () => {
    render(<WaitlistRail waitlist={[]} loading={false} error={null} />);
    expect(screen.getByTestId("waitlist-rail-empty")).toBeInTheDocument();
    expect(screen.getByText(/drag any card onto a tee row/i)).toBeInTheDocument();
  });

  test("renders N cards and aggregates party + player counts in the header", () => {
    const entries: WaitlistEntry[] = [
      makeEntry({ id: "w1", party: 2, name: "Mokoena" }),
      makeEntry({ id: "w2", party: 4, name: "van Heerden" }),
      makeEntry({ id: "w3", party: 1, name: "Daniels" }),
    ];
    render(<WaitlistRail waitlist={entries} loading={false} error={null} />);
    expect(screen.getByTestId("waitlist-card-w1")).toBeInTheDocument();
    expect(screen.getByTestId("waitlist-card-w2")).toBeInTheDocument();
    expect(screen.getByTestId("waitlist-card-w3")).toBeInTheDocument();
    expect(screen.getByTestId("waitlist-rail-counts")).toHaveTextContent("3 parties · 7 players");
  });

  test("footer running total sums entries' feeAmount", () => {
    const entries: WaitlistEntry[] = [
      makeEntry({ id: "w1", feeAmount: 1100, feeCurrency: "ZAR" }),
      makeEntry({ id: "w2", feeAmount: 840, feeCurrency: "ZAR" }),
      makeEntry({ id: "w3", feeAmount: 1000, feeCurrency: "ZAR" }),
    ];
    render(<WaitlistRail waitlist={entries} loading={false} error={null} />);
    const total = screen.getByTestId("waitlist-rail-total");
    expect(total.textContent?.replace(/\s+/g, " ")).toContain("R 2 940");
  });

  test("footer total renders R 0 when waitlist is empty", () => {
    render(<WaitlistRail waitlist={[]} loading={false} error={null} />);
    expect(screen.getByTestId("waitlist-rail-total")).toHaveTextContent("R 0");
  });

  test("Add button is disabled without onAdd handler", () => {
    render(<WaitlistRail waitlist={[]} loading={false} error={null} />);
    expect(screen.getByTestId("waitlist-rail-add")).toBeDisabled();
  });

  test("Send to POS button is disabled when waitlist empty even with handler supplied", () => {
    render(
      <WaitlistRail waitlist={[]} loading={false} error={null} onSendToPos={() => {}} />,
    );
    expect(screen.getByTestId("waitlist-rail-send-pos")).toBeDisabled();
  });

  test("Send to POS button fires handler when waitlist has entries", () => {
    const onSendToPos = vi.fn();
    render(
      <WaitlistRail
        waitlist={[makeEntry()]}
        loading={false}
        error={null}
        onSendToPos={onSendToPos}
      />,
    );
    fireEvent.click(screen.getByTestId("waitlist-rail-send-pos"));
    expect(onSendToPos).toHaveBeenCalledTimes(1);
  });

  test("loading state renders skeleton list", () => {
    render(<WaitlistRail waitlist={[]} loading={true} error={null} />);
    expect(screen.getByTestId("waitlist-rail-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("waitlist-rail-empty")).toBeNull();
  });

  test("error state renders error card and retry fires onRetry", () => {
    const onRetry = vi.fn();
    render(
      <WaitlistRail
        waitlist={[]}
        loading={false}
        error={new Error("Network down")}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId("waitlist-rail-error")).toBeInTheDocument();
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
