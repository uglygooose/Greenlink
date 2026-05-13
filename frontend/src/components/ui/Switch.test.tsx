import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { Switch } from "./Switch";

describe("Switch", () => {
  test("renders unchecked switch with aria-pressed=false", () => {
    render(<Switch checked={false} onCheckedChange={() => {}} label="Demand multiplier" />);
    const btn = screen.getByRole("switch", { name: /demand multiplier/i });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  test("renders checked switch with aria-pressed=true", () => {
    render(<Switch checked onCheckedChange={() => {}} label="Demand multiplier" />);
    expect(screen.getByRole("switch").getAttribute("aria-pressed")).toBe("true");
  });

  test("click toggles via onCheckedChange", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onChange} label="Toggle me" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("disabled switch ignores clicks", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onChange} label="Locked" disabled />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
