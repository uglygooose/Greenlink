// Path: frontend/src/features/tee-sheet/components/PartialSwapPill.test.tsx — Phase 10 Slice 8b.
// Visual/action contract tests for the partial-swap action banner.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { PartialSwapPill } from "./PartialSwapPill";

describe("PartialSwapPill", () => {
  test("renders the partial-swap copy with both participant names", () => {
    render(
      <PartialSwapPill
        participantAName="M. Dlamini"
        participantBName="T. Botha"
        isRetrying={false}
        isRestoring={false}
        onRetry={() => {}}
        onRestore={() => {}}
      />,
    );
    expect(screen.getByTestId("partial-swap-pill")).toBeInTheDocument();
    expect(screen.getByText("M. Dlamini")).toBeInTheDocument();
    expect(screen.getByText("T. Botha")).toBeInTheDocument();
    expect(screen.getByText(/partial swap/i)).toBeInTheDocument();
    expect(screen.getByText(/still pending/i)).toBeInTheDocument();
  });

  test("Retry move button fires onRetry", () => {
    const onRetry = vi.fn();
    render(
      <PartialSwapPill
        participantAName="A"
        participantBName="B"
        isRetrying={false}
        isRestoring={false}
        onRetry={onRetry}
        onRestore={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("partial-swap-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("Restore button fires onRestore", () => {
    const onRestore = vi.fn();
    render(
      <PartialSwapPill
        participantAName="A"
        participantBName="B"
        isRetrying={false}
        isRestoring={false}
        onRetry={() => {}}
        onRestore={onRestore}
      />,
    );
    fireEvent.click(screen.getByTestId("partial-swap-restore"));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  test("isRetrying=true: Retry button reads 'Retrying…' and both buttons are disabled", () => {
    render(
      <PartialSwapPill
        participantAName="A"
        participantBName="B"
        isRetrying
        isRestoring={false}
        onRetry={() => {}}
        onRestore={() => {}}
      />,
    );
    expect(screen.getByTestId("partial-swap-retry")).toHaveTextContent(/retrying/i);
    expect(screen.getByTestId("partial-swap-retry")).toBeDisabled();
    expect(screen.getByTestId("partial-swap-restore")).toBeDisabled();
  });

  test("isRestoring=true: Restore button reads 'Restoring…' and both buttons are disabled", () => {
    render(
      <PartialSwapPill
        participantAName="A"
        participantBName="B"
        isRetrying={false}
        isRestoring
        onRetry={() => {}}
        onRestore={() => {}}
      />,
    );
    expect(screen.getByTestId("partial-swap-restore")).toHaveTextContent(/restoring/i);
    expect(screen.getByTestId("partial-swap-retry")).toBeDisabled();
    expect(screen.getByTestId("partial-swap-restore")).toBeDisabled();
  });
});
