import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { SlotIntervalToggle } from "./SlotIntervalToggle";

describe("SlotIntervalToggle", () => {
  test("renders four buttons labelled 6m / 8m / 10m / 12m", () => {
    render(<SlotIntervalToggle selectedValue={8} onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: /slot interval/i });
    const buttons = within(group).getAllByRole("radio");
    expect(buttons).toHaveLength(4);
    expect(buttons.map((b) => b.textContent)).toEqual(["6m", "8m", "10m", "12m"]);
  });

  test("selectedValue drives aria-checked on the matching button", () => {
    const { rerender } = render(<SlotIntervalToggle selectedValue={8} onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: /slot interval/i });
    const buttons = within(group).getAllByRole("radio");
    expect(buttons.map((b) => b.getAttribute("aria-checked"))).toEqual([
      "false",
      "true",
      "false",
      "false",
    ]);

    rerender(<SlotIntervalToggle selectedValue={12} onChange={() => {}} />);
    expect(buttons.map((b) => b.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "false",
      "true",
    ]);
  });

  test("clicking a button fires onChange with the numeric value", () => {
    const onChange = vi.fn();
    render(<SlotIntervalToggle selectedValue={8} onChange={onChange} />);
    const group = screen.getByRole("radiogroup", { name: /slot interval/i });
    const [six, , ten] = within(group).getAllByRole("radio");
    fireEvent.click(six);
    fireEvent.click(ten);
    expect(onChange).toHaveBeenNthCalledWith(1, 6);
    expect(onChange).toHaveBeenNthCalledWith(2, 10);
  });

  test("group exposes aria-label \"Slot interval\"", () => {
    render(<SlotIntervalToggle selectedValue={8} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Slot interval" })).toBeInTheDocument();
  });
});
