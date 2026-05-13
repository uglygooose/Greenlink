import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { CardHead } from "./CardHead";

describe("CardHead", () => {
  test("renders title only", () => {
    render(<CardHead title="Posted journals" />);
    expect(screen.getByText(/posted journals/i)).toBeInTheDocument();
  });

  test("renders eyebrow above title", () => {
    render(<CardHead eyebrow="Last 7 days" title="Connection events" />);
    expect(screen.getByText(/last 7 days/i)).toBeInTheDocument();
    expect(screen.getByText(/connection events/i)).toBeInTheDocument();
  });

  test("renders right-slot content", () => {
    render(<CardHead title="Mapping" right={<button>Add row</button>} />);
    expect(screen.getByRole("button", { name: /add row/i })).toBeInTheDocument();
  });

  test("title uses serif class", () => {
    render(<CardHead title="Posted" />);
    expect(screen.getByText(/posted/i).className).toContain("gl-serif");
  });
});
