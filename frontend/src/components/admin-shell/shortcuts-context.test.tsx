import { render, screen, fireEvent } from "@testing-library/react";
import { useEffect, useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { AdminTopBar } from "./AdminTopBar";
import { ShortcutsProvider, useShortcuts } from "./shortcuts-context";

function TopbarHarness(): JSX.Element {
  const { openShortcuts, hasOpenHandler } = useShortcuts();
  return (
    <AdminTopBar
      title="Test"
      onOpenShortcuts={hasOpenHandler ? openShortcuts : undefined}
    />
  );
}

describe("ShortcutsProvider + AdminTopBar bridge", () => {
  test("topbar ? button is disabled when no page has registered a handler", () => {
    render(
      <ShortcutsProvider>
        <TopbarHarness />
      </ShortcutsProvider>,
    );
    const btn = screen.getByTestId("admin-topbar-shortcuts");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("aria-label")).toMatch(/not available/i);
  });

  test("page registering a handler enables the topbar ? button and click invokes it", () => {
    const handler = vi.fn();
    function PageProbe(): JSX.Element {
      const { setOpenHandler } = useShortcuts();
      useEffect(() => {
        setOpenHandler(handler);
        return () => setOpenHandler(null);
      }, [setOpenHandler]);
      return <div data-testid="page-probe" />;
    }
    render(
      <ShortcutsProvider>
        <TopbarHarness />
        <PageProbe />
      </ShortcutsProvider>,
    );
    const btn = screen.getByTestId("admin-topbar-shortcuts");
    expect(btn).not.toBeDisabled();
    expect(btn.getAttribute("aria-label")).toMatch(/open keyboard shortcuts/i);
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test("page unmount clears the handler and re-disables the button", () => {
    function PageProbe(): JSX.Element {
      const { setOpenHandler } = useShortcuts();
      useEffect(() => {
        setOpenHandler(() => {});
        return () => setOpenHandler(null);
      }, [setOpenHandler]);
      return <div />;
    }
    function App(): JSX.Element {
      const [mounted, setMounted] = useState(true);
      return (
        <ShortcutsProvider>
          <TopbarHarness />
          {mounted ? <PageProbe /> : null}
          <button data-testid="toggle" type="button" onClick={() => setMounted(false)}>
            unmount
          </button>
        </ShortcutsProvider>
      );
    }
    render(<App />);
    expect(screen.getByTestId("admin-topbar-shortcuts")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("toggle"));
    expect(screen.getByTestId("admin-topbar-shortcuts")).toBeDisabled();
  });

  test("useShortcuts outside a provider returns no-op values (safe default)", () => {
    const captured: { hasOpenHandler: boolean } = { hasOpenHandler: true };
    function Probe(): JSX.Element {
      const ctx = useShortcuts();
      captured.hasOpenHandler = ctx.hasOpenHandler;
      return <span data-testid="probe-ran" />;
    }
    render(<Probe />);
    expect(captured.hasOpenHandler).toBe(false);
  });
});
