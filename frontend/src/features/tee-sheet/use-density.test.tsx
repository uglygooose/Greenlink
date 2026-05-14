// Path: frontend/src/features/tee-sheet/use-density.test.tsx — Phase 10 Slice 11.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { useDensity, __INTERNAL } from "./use-density";

const { DENSITY_STORAGE_KEY } = __INTERNAL;

describe("useDensity", () => {
  beforeEach(() => {
    window.localStorage.removeItem(DENSITY_STORAGE_KEY);
    document.documentElement.removeAttribute("data-density");
  });
  afterEach(() => {
    document.documentElement.removeAttribute("data-density");
  });

  test("defaults to compact when localStorage is empty", () => {
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe("compact");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });

  test("reads stored density when present", () => {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, "comfortable");
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe("comfortable");
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
  });

  test("ignores malformed stored value, falls back to compact", () => {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, "garbage");
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe("compact");
  });

  test("cycleDensity advances compact → default → comfortable → compact", () => {
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe("compact");

    act(() => {
      const next = result.current.cycleDensity();
      expect(next).toBe("default");
    });
    expect(result.current.density).toBe("default");

    act(() => {
      const next = result.current.cycleDensity();
      expect(next).toBe("comfortable");
    });
    expect(result.current.density).toBe("comfortable");

    act(() => {
      const next = result.current.cycleDensity();
      expect(next).toBe("compact");
    });
    expect(result.current.density).toBe("compact");
  });

  test("writes to localStorage on each cycle", () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current.cycleDensity());
    expect(window.localStorage.getItem(DENSITY_STORAGE_KEY)).toBe("default");
    act(() => result.current.cycleDensity());
    expect(window.localStorage.getItem(DENSITY_STORAGE_KEY)).toBe("comfortable");
    act(() => result.current.cycleDensity());
    expect(window.localStorage.getItem(DENSITY_STORAGE_KEY)).toBe("compact");
  });

  test("data-density on documentElement reflects the value; `default` removes the attribute", () => {
    const { result } = renderHook(() => useDensity());
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
    act(() => result.current.cycleDensity()); // → default
    expect(document.documentElement.getAttribute("data-density")).toBeNull();
    act(() => result.current.cycleDensity()); // → comfortable
    expect(document.documentElement.getAttribute("data-density")).toBe("comfortable");
  });

  test("onCycle callback fires with the new density", () => {
    const observed: string[] = [];
    const { result } = renderHook(() => useDensity((next) => observed.push(next)));
    act(() => result.current.cycleDensity());
    act(() => result.current.cycleDensity());
    expect(observed).toEqual(["default", "comfortable"]);
  });
});
