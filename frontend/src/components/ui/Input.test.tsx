import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Input } from "./Input";

describe("Input", () => {
  test("renders label associated with the input via for/id", () => {
    render(<Input label="Email" type="email" defaultValue="a@b.co" />);
    const input = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(input.value).toBe("a@b.co");
    expect(input.className).toContain("gl-input");
  });

  test("renders helper text with aria-describedby wired up", () => {
    render(<Input label="Email" helperText="Used for password reset." />);
    const input = screen.getByLabelText(/email/i);
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    if (describedBy) {
      const help = document.getElementById(describedBy.split(" ")[0]);
      expect(help?.textContent).toMatch(/password reset/i);
    }
  });

  test("sets aria-invalid and renders error text when errorText is provided", () => {
    render(<Input label="Member" errorText="Invalid format" />);
    const input = screen.getByLabelText(/member/i);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/invalid format/i)).toBeTruthy();
  });

  test("disabled input is unfocusable and styled disabled", () => {
    render(<Input label="Slot" defaultValue="8 min" disabled />);
    const input = screen.getByLabelText(/slot/i) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
