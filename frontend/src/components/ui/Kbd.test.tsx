import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Kbd } from "./Kbd";

describe("Kbd", () => {
  test("renders keycap with gl-kbd class", () => {
    render(<Kbd>⌘K</Kbd>);
    const kbd = screen.getByText(/⌘K/);
    expect(kbd.tagName).toBe("KBD");
    expect(kbd.className).toContain("gl-kbd");
  });

  test("dim prop softens opacity", () => {
    render(<Kbd dim>esc</Kbd>);
    expect(screen.getByText(/esc/).style.opacity).toBe("0.55");
  });

  test("custom className composes with gl-kbd", () => {
    render(<Kbd className="extra">n</Kbd>);
    expect(screen.getByText(/^n$/).className).toBe("gl-kbd extra");
  });
});
