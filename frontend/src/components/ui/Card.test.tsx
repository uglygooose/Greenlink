import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Card } from "./Card";

describe("Card", () => {
  test("renders default variant with gl-card class", () => {
    const { container } = render(<Card>Body</Card>);
    expect(container.firstChild).toHaveClass("gl-card");
  });

  test("flat variant adds gl-card--flat", () => {
    const { container } = render(<Card variant="flat">Body</Card>);
    expect(container.firstChild).toHaveClass("gl-card");
    expect(container.firstChild).toHaveClass("gl-card--flat");
  });

  test("sunken variant adds gl-card--sunken", () => {
    const { container } = render(<Card variant="sunken">Body</Card>);
    expect(container.firstChild).toHaveClass("gl-card--sunken");
  });

  test("renders as semantic section when as=section", () => {
    const { container } = render(<Card as="section">Body</Card>);
    expect((container.firstChild as HTMLElement).tagName).toBe("SECTION");
  });
});
