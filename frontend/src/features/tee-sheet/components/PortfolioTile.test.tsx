import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { PortfolioTile } from "./PortfolioTile";

function renderTile(overrides: Partial<React.ComponentProps<typeof PortfolioTile>> = {}) {
  const props: React.ComponentProps<typeof PortfolioTile> = {
    courseName: "The Bluff",
    utilisationPercent: 88,
    teeTimesBooked: 22,
    teeTimesTotal: 25,
    revenueAmount: 41482,
    revenueCurrency: "ZAR",
    active: false,
    onClick: vi.fn(),
    ...overrides,
  };
  const result = render(<PortfolioTile {...props} />);
  return { ...result, props };
}

describe("PortfolioTile", () => {
  test("renders course name, util%, booked/total and revenue label", () => {
    renderTile();
    expect(screen.getByText(/the bluff/i)).toBeInTheDocument();
    expect(screen.getByText(/88%/)).toBeInTheDocument();
    expect(screen.getByText("22/25 tee times")).toBeInTheDocument();
    expect(screen.getByText(/R\s41\s?482/)).toBeInTheDocument();
  });

  test("active state writes aria-selected=true and data-active=true", () => {
    renderTile({ active: true });
    const tile = screen.getByRole("tab");
    expect(tile.getAttribute("aria-selected")).toBe("true");
    expect(tile.getAttribute("data-active")).toBe("true");
  });

  test("inactive state writes aria-selected=false", () => {
    renderTile({ active: false });
    expect(screen.getByRole("tab").getAttribute("aria-selected")).toBe("false");
  });

  test("click fires onClick", () => {
    const onClick = vi.fn();
    renderTile({ onClick });
    fireEvent.click(screen.getByRole("tab"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("util > 100% clamps to 100, < 0 clamps to 0", () => {
    const { rerender } = render(
      <PortfolioTile
        courseName="C"
        utilisationPercent={140}
        teeTimesBooked={0}
        teeTimesTotal={0}
        revenueAmount={0}
        revenueCurrency="ZAR"
        active={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText(/100%/)).toBeInTheDocument();
    rerender(
      <PortfolioTile
        courseName="C"
        utilisationPercent={-20}
        teeTimesBooked={0}
        teeTimesTotal={0}
        revenueAmount={0}
        revenueCurrency="ZAR"
        active={false}
        onClick={() => {}}
      />,
    );
    expect(screen.getByText(/0%/)).toBeInTheDocument();
  });

  test("zero-data tile renders without crash", () => {
    renderTile({
      courseName: "Empty Course",
      utilisationPercent: 0,
      teeTimesBooked: 0,
      teeTimesTotal: 0,
      revenueAmount: 0,
      revenueCurrency: null,
    });
    expect(screen.getByText(/empty course/i)).toBeInTheDocument();
    expect(screen.getByText("0/0 tee times")).toBeInTheDocument();
    expect(screen.getByText(/R\s0/)).toBeInTheDocument();
  });

  test("null revenue renders as '—'", () => {
    renderTile({ revenueAmount: null });
    expect(screen.getByText(/^—$/)).toBeInTheDocument();
  });

  test("non-ZAR currency renders with the supplied code as prefix", () => {
    renderTile({ revenueAmount: 1234, revenueCurrency: "USD" });
    expect(screen.getByText(/USD\s1\s?234/)).toBeInTheDocument();
  });
});
