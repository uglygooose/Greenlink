import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Pill } from "./Pill";

describe("Pill", () => {
  test("renders neutral by default", () => {
    render(<Pill>Member</Pill>);
    expect(screen.getByText(/member/i).getAttribute("data-kind")).toBe("neutral");
  });

  test("renders every declared kind via data-kind", () => {
    const kinds = ["ok", "warn", "err", "info", "brand", "neutral", "accent"] as const;
    for (const k of kinds) {
      const { unmount } = render(<Pill kind={k}>{k}</Pill>);
      expect(screen.getByText(k).getAttribute("data-kind")).toBe(k);
      unmount();
    }
  });

  test("renders icon when provided", () => {
    render(<Pill kind="ok" icon={<span data-testid="pill-icon">i</span>}>Posted</Pill>);
    expect(screen.getByTestId("pill-icon")).toBeInTheDocument();
  });

  test("soft variant uses color-mix background; solid variant uses raw token", () => {
    const { container, rerender } = render(<Pill kind="err">A</Pill>);
    expect((container.firstChild as HTMLElement).style.background).toContain("color-mix");
    rerender(<Pill kind="err" soft={false}>A</Pill>);
    expect((container.firstChild as HTMLElement).style.background).not.toContain("color-mix");
  });
});
