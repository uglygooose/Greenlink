import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Wordmark } from "./Wordmark";

describe("Wordmark", () => {
  test("renders Green + link parts with aria-label", () => {
    render(<Wordmark />);
    const wm = screen.getByRole("img", { name: /greenlink/i });
    expect(wm.textContent).toContain("Green");
    expect(wm.textContent).toContain("link");
  });

  test("respects custom size prop", () => {
    render(<Wordmark size={32} ariaLabel="GreenLink" />);
    const wm = screen.getByRole("img", { name: /greenlink/i });
    const greenSpan = wm.querySelector("span");
    expect(greenSpan).toBeTruthy();
  });
});
