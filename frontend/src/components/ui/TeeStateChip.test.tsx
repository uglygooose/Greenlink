import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { TeeStateChip } from "./TeeStateChip";

describe("TeeStateChip", () => {
  const allStates = ["open", "booked", "checkedin", "atrisk", "noshow", "blocked"] as const;

  test("renders all six declared states with deuteranopia-safe label", () => {
    const labels = ["Open", "Booked", "Checked in", "At-risk", "No-show", "Blocked"];
    for (let i = 0; i < allStates.length; i += 1) {
      const { unmount } = render(<TeeStateChip state={allStates[i]} />);
      expect(screen.getByText(labels[i])).toBeInTheDocument();
      unmount();
    }
  });

  test("exposes state via data-state for downstream styling", () => {
    for (const state of allStates) {
      const { container, unmount } = render(<TeeStateChip state={state} />);
      expect((container.firstChild as HTMLElement).getAttribute("data-state")).toBe(state);
      unmount();
    }
  });

  test("compact size shrinks padding and font", () => {
    const { container } = render(<TeeStateChip state="booked" compact />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.padding).toBe("1px 6px");
    expect(span.style.fontSize).toBe("10px");
  });

  test("open state is the only bordered chip", () => {
    const { container, rerender } = render(<TeeStateChip state="open" />);
    expect((container.firstChild as HTMLElement).style.border).toContain("1px solid");
    rerender(<TeeStateChip state="booked" />);
    expect((container.firstChild as HTMLElement).style.border).toBe("");
  });
});
