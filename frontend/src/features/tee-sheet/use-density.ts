// Path: frontend/src/features/tee-sheet/use-density.ts — Phase 10 Slice 11.
// Three-mode density cycle for the tee-sheet surface. Keyboard-only
// access via the `v` shortcut (Slice 10 wires this); no visible chrome
// toggle. Preference persists via localStorage (`gl.tee-sheet.density`)
// per user, across sessions. Frontend-only — no backend persistence in
// v1.
//
// The hook writes the chosen value to `document.documentElement` as
// `data-density="…"` so tokens.css's [data-density] selectors take
// effect across the whole app (not just the tee-sheet page). When the
// value is `default`, the attribute is removed so the unscoped :root
// values win.
import { useCallback, useEffect, useRef, useState } from "react";

export type Density = "compact" | "default" | "comfortable";

const DENSITY_STORAGE_KEY = "gl.tee-sheet.density";

// Slice 11 spec: default density is `compact` per the Slice 1 token
// reconciliation. localStorage absence → start in compact.
const DEFAULT_DENSITY: Density = "compact";

const CYCLE_ORDER: Density[] = ["compact", "default", "comfortable"];

function readStoredDensity(): Density {
  if (typeof window === "undefined") return DEFAULT_DENSITY;
  try {
    const raw = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    if (raw === "compact" || raw === "default" || raw === "comfortable") {
      return raw;
    }
  } catch {
    // localStorage may throw in private-browsing modes or jsdom variants.
  }
  return DEFAULT_DENSITY;
}

function writeStoredDensity(value: Density): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, value);
  } catch {
    // Ignore storage failures — the in-memory state still drives the UI
    // for this session.
  }
}

function applyDensityAttribute(value: Density): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (value === "default") {
    root.removeAttribute("data-density");
  } else {
    root.setAttribute("data-density", value);
  }
}

export interface UseDensityResult {
  density: Density;
  cycleDensity: () => Density;
}

export function useDensity(onCycle?: (next: Density) => void): UseDensityResult {
  const [density, setDensity] = useState<Density>(() => readStoredDensity());
  // Synchronous mirror of the current density. React 18 batches
  // setDensity updates so the state-setter's updater isn't guaranteed
  // to have run by the time cycleDensity returns; this ref tracks the
  // "logical" current value so consecutive cycleDensity() calls advance
  // correctly within a single tick.
  const currentDensityRef = useRef<Density>(density);
  // Keep onCycle in a ref so cycleDensity stays stable across renders —
  // shortcut handler dependencies don't need to thrash on each call.
  const onCycleRef = useRef(onCycle);
  onCycleRef.current = onCycle;

  // Apply the initial density on mount + whenever it changes.
  useEffect(() => {
    applyDensityAttribute(density);
    currentDensityRef.current = density;
  }, [density]);

  const cycleDensity = useCallback((): Density => {
    const idx = CYCLE_ORDER.indexOf(currentDensityRef.current);
    const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
    currentDensityRef.current = next; // sync for next call within the same tick
    writeStoredDensity(next);
    setDensity(next);
    if (onCycleRef.current) onCycleRef.current(next);
    return next;
  }, []);

  return { density, cycleDensity };
}

export const __INTERNAL = { DENSITY_STORAGE_KEY, CYCLE_ORDER, DEFAULT_DENSITY };
