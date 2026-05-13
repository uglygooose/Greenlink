import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { Slider } from "./Slider";

describe("Slider", () => {
  test("renders with role=slider and aria-valuenow", () => {
    render(<Slider value={75} min={50} max={100} onChange={() => {}} label="Floor" />);
    const slider = screen.getByRole("slider", { name: /floor/i });
    expect(slider.getAttribute("aria-valuenow")).toBe("75");
    expect(slider.getAttribute("aria-valuemin")).toBe("50");
    expect(slider.getAttribute("aria-valuemax")).toBe("100");
  });

  test("emits number on change", () => {
    const onChange = vi.fn();
    render(<Slider value={50} min={0} max={100} onChange={onChange} label="Test" />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "72" } });
    expect(onChange).toHaveBeenCalledWith(72);
  });

  test("disabled slider rejects interaction", () => {
    const onChange = vi.fn();
    render(<Slider value={10} min={0} max={100} onChange={onChange} label="Locked" disabled />);
    const slider = screen.getByRole("slider");
    expect(slider).toBeDisabled();
    fireEvent.change(slider, { target: { value: "50" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("custom step is forwarded", () => {
    render(<Slider value={5} min={0} max={10} step={0.5} onChange={() => {}} label="Half" />);
    expect(screen.getByRole("slider").getAttribute("step")).toBe("0.5");
  });
});
