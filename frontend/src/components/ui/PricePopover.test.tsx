import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PricePopover, type PriceBreakdown } from "./PricePopover";

function makeAnchor(rect: Partial<DOMRect> = {}): HTMLElement {
  const el = document.createElement("button");
  el.setAttribute("data-role", "row-price-button");
  el.getBoundingClientRect = (): DOMRect =>
    ({
      top: 200,
      bottom: 220,
      left: 800,
      right: 880,
      width: 80,
      height: 20,
      x: 800,
      y: 200,
      toJSON: () => ({}),
      ...rect,
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const ALL_KINDS_BREAKDOWN: PriceBreakdown = {
  channel: "Direct",
  total: "R 1 234",
  lines: [
    { kind: "base", label: "Base", source: "Matrix · row 1", value: "R 600" },
    { kind: "premium", label: "Premium", source: "Override · weekend AM", value: "+ R 100" },
    { kind: "discount", label: "Discount", source: "Early bird", value: "− R 30" },
    { kind: "addon", label: "Add-on", source: "Cart × 1", value: "+ R 70" },
    { kind: "channel", label: "Channel", source: "Direct par", value: "R 0" },
    { kind: "demand", label: "Demand", source: "× 1.05", value: "+ R 30" },
    { kind: "override", label: "Override", source: "Tournament", value: "+ R 200" },
    { kind: "blackout", label: "Blackout", source: "Aeration", value: "R 0" },
  ],
};

const SIMPLE_BREAKDOWN: PriceBreakdown = {
  channel: "—",
  total: "R 870",
  lines: [{ kind: "base", label: "Booking fee", source: "Booking · M. Dlamini", value: "R 870" }],
};

describe("PricePopover", () => {
  let anchor: HTMLElement;

  beforeEach(() => {
    anchor = makeAnchor();
  });

  afterEach(() => {
    // Don't nuke body — RTL's cleanup removes its own container and the
    // portal child. Just sweep the standalone anchors we appended.
    document.querySelectorAll('[data-role="row-price-button"]').forEach((el) => el.remove());
    vi.restoreAllMocks();
  });

  test("renders title, currency, channel pill and total when breakdown is provided", () => {
    render(
      <PricePopover
        anchorEl={anchor}
        title="06:30 · 1st Tee"
        currency="ZAR"
        breakdown={SIMPLE_BREAKDOWN}
        loading={false}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: /price breakdown/i })).toBeInTheDocument();
    expect(screen.getByText("06:30 · 1st Tee")).toBeInTheDocument();
    expect(screen.getByText("ZAR")).toBeInTheDocument();
    expect(screen.getByText(/Channel · —/)).toBeInTheDocument();
    expect(screen.getByTestId("price-popover-total")).toHaveTextContent("R 870");
  });

  test("renders all 8 kind dots with the right token colour", () => {
    const expected: Record<string, string> = {
      base: "var(--gl-heritage-500)",
      premium: "var(--gl-honey)",
      discount: "var(--gl-state-checkedin)",
      addon: "var(--gl-waterway)",
      channel: "var(--gl-flamingo)",
      demand: "var(--gl-honey)",
      override: "var(--gl-caddie)",
      blackout: "var(--gl-slate)",
    };
    render(
      <PricePopover
        anchorEl={anchor}
        title="All kinds"
        currency="ZAR"
        breakdown={ALL_KINDS_BREAKDOWN}
        loading={false}
        error={null}
        onDismiss={() => {}}
      />,
    );
    for (const [kind, color] of Object.entries(expected)) {
      const dot = screen.getByTestId(`price-popover-dot-${kind}`);
      expect(dot.style.background).toBe(color);
    }
  });

  test("loading state renders skeleton placeholder", () => {
    render(
      <PricePopover
        anchorEl={anchor}
        title="Loading slot"
        currency="ZAR"
        breakdown={null}
        loading={true}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByTestId("price-popover-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("price-popover-lines")).toBeNull();
  });

  test("error state renders error card and retry calls onRetry", () => {
    const onRetry = vi.fn();
    render(
      <PricePopover
        anchorEl={anchor}
        title="Errored slot"
        currency="ZAR"
        breakdown={null}
        loading={false}
        error={new Error("Network down")}
        onDismiss={() => {}}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId("price-popover-error")).toBeInTheDocument();
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("outside-click fires onDismiss", () => {
    const onDismiss = vi.fn();
    render(
      <PricePopover
        anchorEl={anchor}
        title="t"
        currency="ZAR"
        breakdown={SIMPLE_BREAKDOWN}
        loading={false}
        error={null}
        onDismiss={onDismiss}
      />,
    );
    // Click on an element outside the popover that is NOT a price button
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    fireEvent.mouseDown(outside);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("click on another row's price button does NOT dismiss (anchor swap path)", () => {
    const onDismiss = vi.fn();
    render(
      <PricePopover
        anchorEl={anchor}
        title="t"
        currency="ZAR"
        breakdown={SIMPLE_BREAKDOWN}
        loading={false}
        error={null}
        onDismiss={onDismiss}
      />,
    );
    const otherPriceButton = document.createElement("button");
    otherPriceButton.setAttribute("data-role", "row-price-button");
    document.body.appendChild(otherPriceButton);
    fireEvent.mouseDown(otherPriceButton);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test("esc keydown fires onDismiss", () => {
    const onDismiss = vi.fn();
    render(
      <PricePopover
        anchorEl={anchor}
        title="t"
        currency="ZAR"
        breakdown={SIMPLE_BREAKDOWN}
        loading={false}
        error={null}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("Edit rules + Override buttons render and fire their stub handlers", () => {
    const onEditRules = vi.fn();
    const onOverride = vi.fn();
    render(
      <PricePopover
        anchorEl={anchor}
        title="t"
        currency="ZAR"
        breakdown={SIMPLE_BREAKDOWN}
        loading={false}
        error={null}
        onDismiss={() => {}}
        onEditRules={onEditRules}
        onOverride={onOverride}
      />,
    );
    fireEvent.click(screen.getByTestId("price-popover-edit-rules"));
    expect(onEditRules).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("price-popover-override"));
    expect(onOverride).toHaveBeenCalledTimes(1);
  });

  test("positions BELOW the anchor when there's room (data-flipped=false)", () => {
    // Default 768 viewport; anchor at top 200 / bottom 220; popover ~200 high.
    // 220 + 4 + 200 = 424 < 768, so below.
    render(
      <PricePopover
        anchorEl={anchor}
        title="t"
        currency="ZAR"
        breakdown={SIMPLE_BREAKDOWN}
        loading={false}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByTestId("price-popover").getAttribute("data-flipped")).toBe("false");
  });

  test("flips ABOVE the anchor when the popover would overflow the viewport bottom", () => {
    // Anchor near bottom of viewport (jsdom innerHeight default 768).
    const lowAnchor = makeAnchor({ top: 740, bottom: 760, left: 800, right: 880 });
    render(
      <PricePopover
        anchorEl={lowAnchor}
        title="t"
        currency="ZAR"
        breakdown={SIMPLE_BREAKDOWN}
        loading={false}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByTestId("price-popover").getAttribute("data-flipped")).toBe("true");
  });

  test("returns null when no anchor is provided", () => {
    const { container } = render(
      <PricePopover
        anchorEl={null}
        title="t"
        currency="ZAR"
        breakdown={SIMPLE_BREAKDOWN}
        loading={false}
        error={null}
        onDismiss={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog", { name: /price breakdown/i })).toBeNull();
  });
});
