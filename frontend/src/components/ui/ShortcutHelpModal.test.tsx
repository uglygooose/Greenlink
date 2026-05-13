import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ShortcutHelpModal, type ShortcutMap } from "./ShortcutHelpModal";

const SAMPLE_SHORTCUTS: ShortcutMap = [
  {
    title: "Navigation",
    entries: [
      { keys: ["t"], label: "Jump to today" },
      { keys: ["←", "→"], label: "Previous / next day" },
      { keys: ["j", "k"], label: "Move selection up / down a slot" },
    ],
  },
  {
    title: "Booking",
    entries: [
      { keys: ["n"], label: "New booking in selected slot" },
      { keys: ["c"], label: "Check in selected flight" },
    ],
  },
  {
    title: "Help",
    entries: [
      { keys: ["?"], label: "Open this panel" },
      { keys: ["esc"], label: "Close panel · clear selection" },
    ],
  },
];

describe("ShortcutHelpModal", () => {
  test("returns null when isOpen=false", () => {
    const { container } = render(
      <ShortcutHelpModal isOpen={false} onDismiss={() => {}} title="Tee sheet shortcuts" shortcuts={SAMPLE_SHORTCUTS} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("renders all groups and rows when open", () => {
    render(<ShortcutHelpModal isOpen onDismiss={() => {}} title="Tee sheet shortcuts" shortcuts={SAMPLE_SHORTCUTS} />);
    expect(screen.getByRole("dialog", { name: /tee sheet shortcuts/i })).toBeInTheDocument();
    expect(screen.getByTestId("shortcut-help-modal-group-navigation")).toBeInTheDocument();
    expect(screen.getByTestId("shortcut-help-modal-group-booking")).toBeInTheDocument();
    expect(screen.getByTestId("shortcut-help-modal-group-help")).toBeInTheDocument();
    // Total entries: 3 + 2 + 2 = 7
    expect(screen.getByTestId("shortcut-help-modal-count").textContent).toContain("7 shortcuts");
  });

  test("filter narrows by label substring", () => {
    render(<ShortcutHelpModal isOpen onDismiss={() => {}} title="t" shortcuts={SAMPLE_SHORTCUTS} />);
    fireEvent.change(screen.getByTestId("shortcut-help-modal-filter"), { target: { value: "check" } });
    expect(screen.getByText(/check in selected flight/i)).toBeInTheDocument();
    expect(screen.queryByText(/jump to today/i)).toBeNull();
  });

  test("filter narrows by key substring", () => {
    render(<ShortcutHelpModal isOpen onDismiss={() => {}} title="t" shortcuts={SAMPLE_SHORTCUTS} />);
    fireEvent.change(screen.getByTestId("shortcut-help-modal-filter"), { target: { value: "esc" } });
    expect(screen.getByText(/close panel · clear selection/i)).toBeInTheDocument();
    expect(screen.queryByText(/jump to today/i)).toBeNull();
  });

  test("empty filter result renders the no-match card", () => {
    render(<ShortcutHelpModal isOpen onDismiss={() => {}} title="t" shortcuts={SAMPLE_SHORTCUTS} />);
    fireEvent.change(screen.getByTestId("shortcut-help-modal-filter"), { target: { value: "zzznomatch" } });
    expect(screen.getByTestId("shortcut-help-modal-empty")).toBeInTheDocument();
  });

  test("esc fires onDismiss", () => {
    const onDismiss = vi.fn();
    render(<ShortcutHelpModal isOpen onDismiss={onDismiss} title="t" shortcuts={SAMPLE_SHORTCUTS} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("backdrop click fires onDismiss", () => {
    const onDismiss = vi.fn();
    render(<ShortcutHelpModal isOpen onDismiss={onDismiss} title="t" shortcuts={SAMPLE_SHORTCUTS} />);
    const backdrop = screen.getByTestId("shortcut-help-modal-backdrop");
    fireEvent.mouseDown(backdrop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("clicking inside the modal does NOT dismiss", () => {
    const onDismiss = vi.fn();
    render(<ShortcutHelpModal isOpen onDismiss={onDismiss} title="t" shortcuts={SAMPLE_SHORTCUTS} />);
    fireEvent.mouseDown(screen.getByTestId("shortcut-help-modal"));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test("filter input has focus on open", () => {
    render(<ShortcutHelpModal isOpen onDismiss={() => {}} title="t" shortcuts={SAMPLE_SHORTCUTS} />);
    expect(screen.getByTestId("shortcut-help-modal-filter")).toHaveFocus();
  });

  test("Tab from the last focusable wraps back to the first (focus trap)", () => {
    render(
      <ShortcutHelpModal
        isOpen
        onDismiss={() => {}}
        title="t"
        shortcuts={SAMPLE_SHORTCUTS}
        onPrintCheatSheet={() => {}}
      />,
    );
    const filter = screen.getByTestId("shortcut-help-modal-filter");
    const print = screen.getByTestId("shortcut-help-modal-print");
    // Focus the last interactive element (the print button)
    print.focus();
    expect(print).toHaveFocus();
    // Tab from the last focusable cycles back to the filter input (the first)
    fireEvent.keyDown(document, { key: "Tab" });
    expect(filter).toHaveFocus();
  });

  test("Shift+Tab from the first focusable wraps to the last (focus trap)", () => {
    render(
      <ShortcutHelpModal
        isOpen
        onDismiss={() => {}}
        title="t"
        shortcuts={SAMPLE_SHORTCUTS}
        onPrintCheatSheet={() => {}}
      />,
    );
    const filter = screen.getByTestId("shortcut-help-modal-filter");
    const print = screen.getByTestId("shortcut-help-modal-print");
    expect(filter).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(print).toHaveFocus();
  });

  test("print cheat-sheet button is disabled when no handler is supplied", () => {
    render(<ShortcutHelpModal isOpen onDismiss={() => {}} title="t" shortcuts={SAMPLE_SHORTCUTS} />);
    expect(screen.getByTestId("shortcut-help-modal-print")).toBeDisabled();
  });

  test("print cheat-sheet button fires handler when supplied", () => {
    const onPrintCheatSheet = vi.fn();
    render(
      <ShortcutHelpModal isOpen onDismiss={() => {}} title="t" shortcuts={SAMPLE_SHORTCUTS} onPrintCheatSheet={onPrintCheatSheet} />,
    );
    fireEvent.click(screen.getByTestId("shortcut-help-modal-print"));
    expect(onPrintCheatSheet).toHaveBeenCalledTimes(1);
  });
});
