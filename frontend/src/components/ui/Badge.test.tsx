import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Badge } from "./Badge";

describe("Badge", () => {
  test("renders neutral badge with gl-badge class", () => {
    render(<Badge>Member</Badge>);
    const badge = screen.getByText(/member/i);
    expect(badge.closest(".gl-badge")).toBeTruthy();
  });

  test("renders dot when dot prop is true", () => {
    const { container } = render(<Badge dot>Active</Badge>);
    expect(container.querySelector(".gl-dot")).toBeTruthy();
  });

  test("does not render dot by default", () => {
    const { container } = render(<Badge>Quiet</Badge>);
    expect(container.querySelector(".gl-dot")).toBeNull();
  });
});
