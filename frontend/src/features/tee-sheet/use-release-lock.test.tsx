// Path: frontend/src/features/tee-sheet/use-release-lock.test.tsx — Phase 10 Slice 9a.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useReleaseLock } from "./use-release-lock";

const mockRelease = vi.fn();

vi.mock("../../api/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/operations")>();
  return {
    ...actual,
    releaseTeeSheetLock: (...args: unknown[]) => mockRelease(...args),
  };
});

function buildWrapper(): (props: { children: ReactNode }) => JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useReleaseLock", () => {
  beforeEach(() => mockRelease.mockReset());

  test("calls /locks/{id} DELETE on the right id", async () => {
    mockRelease.mockResolvedValueOnce(undefined);
    const { result } = renderHook(
      () => useReleaseLock({ accessToken: "tok", selectedClubId: "club-1" }),
      { wrapper: buildWrapper() },
    );
    await act(async () => {
      await result.current.mutateAsync({ lockId: "lock-1" });
    });
    expect(mockRelease).toHaveBeenCalledWith("lock-1", {
      accessToken: "tok",
      selectedClubId: "club-1",
    });
  });

  test("missing session → no network call, no throw", async () => {
    const { result } = renderHook(
      () => useReleaseLock({ accessToken: null, selectedClubId: null }),
      { wrapper: buildWrapper() },
    );
    await act(async () => {
      await result.current.mutateAsync({ lockId: "lock-1" });
    });
    expect(mockRelease).not.toHaveBeenCalled();
  });

  test("operations.releaseTeeSheetLock swallows errors — the hook resolves cleanly", async () => {
    mockRelease.mockResolvedValueOnce(undefined); // operations.ts catches internally
    const { result } = renderHook(
      () => useReleaseLock({ accessToken: "tok", selectedClubId: "club-1" }),
      { wrapper: buildWrapper() },
    );
    await act(async () => {
      await result.current.mutateAsync({ lockId: "lock-1" });
    });
    expect(result.current.isError).toBe(false);
  });
});
