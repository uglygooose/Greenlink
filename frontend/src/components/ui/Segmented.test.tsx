import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { Segmented } from "./Segmented";

const SLOT_OPTIONS = [
  { value: "6", label: "6m" },
  { value: "8", label: "8m" },
  { value: "10", label: "10m" },
  { value: "12", label: "12m" },
] as const;

describe("Segmented", () => {
  test("renders as a radiogroup with one radio per option", () => {
    render(
      <Segmented<"6" | "8" | "10" | "12">
        value="8"
        onChange={() => {}}
        options={SLOT_OPTIONS}
        label="Slot interval"
      />,
    );
    expect(screen.getByRole("radiogroup", { name: /slot interval/i })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  test("selected option carries aria-checked=true", () => {
    render(
      <Segmented<"6" | "8" | "10" | "12">
        value="8"
        onChange={() => {}}
        options={SLOT_OPTIONS}
        label="Slot"
      />,
    );
    expect(screen.getByRole("radio", { name: /^8m$/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: /^6m$/ }).getAttribute("aria-checked")).toBe("false");
  });

  test("click changes selection", () => {
    const onChange = vi.fn();
    render(
      <Segmented<"6" | "8" | "10" | "12">
        value="8"
        onChange={onChange}
        options={SLOT_OPTIONS}
        label="Slot"
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^10m$/ }));
    expect(onChange).toHaveBeenCalledWith("10");
  });

  test("disabled segmented blocks selection", () => {
    const onChange = vi.fn();
    render(
      <Segmented<"6" | "8" | "10" | "12">
        value="8"
        onChange={onChange}
        options={SLOT_OPTIONS}
        label="Slot"
        disabled
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /^10m$/ }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
