import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  test("renders primary variant by default with token class", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: /save/i });
    expect(btn.className).toContain("gl-btn");
    expect(btn.className).toContain("gl-btn--primary");
  });

  test("applies size as data attribute (sm/md/lg)", () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole("button").getAttribute("data-size")).toBe("sm");
    rerender(<Button size="md">Medium</Button>);
    expect(screen.getByRole("button").hasAttribute("data-size")).toBe(false);
    rerender(<Button size="lg">Large</Button>);
    expect(screen.getByRole("button").getAttribute("data-size")).toBe("lg");
  });

  test("renders secondary, tertiary and destructive variants", () => {
    const { rerender } = render(<Button variant="secondary">Cancel</Button>);
    expect(screen.getByRole("button").className).toContain("gl-btn--secondary");
    rerender(<Button variant="tertiary">View</Button>);
    expect(screen.getByRole("button").className).toContain("gl-btn--tertiary");
    rerender(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole("button").className).toContain("gl-btn--destructive");
  });

  test("disables click when loading and renders loading label", () => {
    const onClick = vi.fn();
    render(
      <Button loading loadingLabel="Saving…" onClick={onClick}>
        Save
      </Button>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.textContent).toContain("Saving…");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("respects disabled prop", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Disabled</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
