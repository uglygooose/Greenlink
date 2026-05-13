// Path: frontend/src/components/admin-shell/shortcuts-context.tsx — Phase 10 Slice 6.
// Bridges page-owned shortcut help state to the shell's "?" affordance in
// AdminTopBar. The page owns the ShortcutHelpModal state + render; this
// context lets the topbar's "?" button reach into the page's open-handler
// without prop drilling through AdminLayout → AdminShell → AdminTopBar
// for a value AdminLayout's static route meta can't carry.
//
// Pages register their open-handler in a useEffect on mount; the chrome
// reads `hasOpenHandler` to decide whether the button is interactive.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export interface ShortcutsContextValue {
  setOpenHandler: (handler: (() => void) | null) => void;
  openShortcuts: () => void;
  hasOpenHandler: boolean;
}

const NOOP_CONTEXT: ShortcutsContextValue = {
  setOpenHandler: () => {},
  openShortcuts: () => {},
  hasOpenHandler: false,
};

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

export function ShortcutsProvider({ children }: { children: ReactNode }): JSX.Element {
  // Handler stays in a ref so rotating it doesn't cause downstream
  // re-renders. The boolean tracks availability separately so the chrome's
  // disabled-state reflects whether any page has registered.
  const handlerRef = useRef<(() => void) | null>(null);
  const [hasOpenHandler, setHasOpenHandler] = useState(false);

  const setOpenHandler = useCallback((handler: (() => void) | null): void => {
    handlerRef.current = handler;
    setHasOpenHandler(handler !== null);
  }, []);

  const openShortcuts = useCallback((): void => {
    handlerRef.current?.();
  }, []);

  const value = useMemo<ShortcutsContextValue>(
    () => ({ setOpenHandler, openShortcuts, hasOpenHandler }),
    [setOpenHandler, openShortcuts, hasOpenHandler],
  );

  return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>;
}

// Hook returns a no-op shape when used outside a provider (e.g. isolated
// unit tests) — that keeps consumers ergonomic without requiring a wrapper.
export function useShortcuts(): ShortcutsContextValue {
  return useContext(ShortcutsContext) ?? NOOP_CONTEXT;
}
