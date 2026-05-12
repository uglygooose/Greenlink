import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Icon } from "./Icon";

describe("Icon", () => {
  test("renders Material Symbols span with the symbol name", () => {
    const { container } = render(<Icon name="check" />);
    const span = container.querySelector(".material-symbols-outlined");
    expect(span).toBeTruthy();
    expect(span?.textContent).toBe("check");
  });

  test("is aria-hidden by default", () => {
    const { container } = render(<Icon name="search" />);
    expect(container.querySelector(".material-symbols-outlined")?.getAttribute("aria-hidden")).toBe("true");
  });

  test("exposes role=img and aria-label when ariaLabel provided", () => {
    render(<Icon name="error" ariaLabel="Error" />);
    const el = screen.getByRole("img", { name: /error/i });
    expect(el.textContent).toBe("error");
  });
});
