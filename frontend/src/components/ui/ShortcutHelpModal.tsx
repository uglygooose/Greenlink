// Path: frontend/src/components/ui/ShortcutHelpModal.tsx — Phase 10 Slice 6 (shared primitive).
// 720-px portal modal that renders a data-driven keyboard-shortcut help
// surface. The Phase 8 design treats this as the differentiator chrome:
// "No other tee-sheet vendor publishes this" — and a printable cheat sheet
// for the pro shop. Slice 6 ships the surface; bindings to actions are
// Slice 10's job.
//
// Caller supplies a ShortcutMap (groups + entries). The modal renders all
// keys via the Kbd primitive verbatim. Filter input narrows by label OR
// key match. Focus is trapped on open and restored on dismiss.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./Icon";
import { Kbd } from "./Kbd";

export interface ShortcutEntry {
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  title: string;
  entries: ShortcutEntry[];
}

export type ShortcutMap = ShortcutGroup[];

export interface ShortcutHelpModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  title: string;
  shortcuts: ShortcutMap;
  version?: string;
  onPrintCheatSheet?: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ShortcutHelpModal({
  isOpen,
  onDismiss,
  title,
  shortcuts,
  version = "v1.0",
  onPrintCheatSheet,
}: ShortcutHelpModalProps): JSX.Element | null {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLInputElement | null>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");

  // Filter the shortcut map by case-insensitive substring match against
  // the entry label OR any of the entry's keys. Empty groups drop out.
  const filteredShortcuts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return shortcuts;
    return shortcuts
      .map((group) => ({
        title: group.title,
        entries: group.entries.filter((entry) => {
          if (entry.label.toLowerCase().includes(needle)) return true;
          return entry.keys.some((key) => key.toLowerCase().includes(needle));
        }),
      }))
      .filter((group) => group.entries.length > 0);
  }, [shortcuts, query]);

  const totalCount = useMemo(
    () => shortcuts.reduce((acc, group) => acc + group.entries.length, 0),
    [shortcuts],
  );

  // Reset filter and capture previous focus when opening; restore on close.
  // useLayoutEffect runs after React commits the DOM but before paint, so
  // filterRef.current is already populated — focus is synchronous.
  useLayoutEffect(() => {
    if (!isOpen) return;
    previousActiveRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    filterRef.current?.focus();
    return () => {
      previousActiveRef.current?.focus?.();
    };
  }, [isOpen]);

  // Esc dismiss + Tab focus trap. Both registered once per open lifecycle.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const modal = modalRef.current;
      if (!modal) return;
      const focusables = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first || !modal.contains(document.activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onDismiss]);

  if (!isOpen) return null;

  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "var(--gl-overlay)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    zIndex: 70,
  };

  const modalStyle: CSSProperties = {
    width: 720,
    maxWidth: "100%",
    maxHeight: "80vh",
    background: "var(--gl-surface-raised)",
    border: "1px solid var(--gl-border-subtle)",
    borderRadius: "var(--gl-radius-md)",
    boxShadow: "var(--gl-shadow-modal)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  return createPortal(
    <div
      onMouseDown={(event) => {
        // Backdrop click dismisses; clicks inside the modal don't bubble here
        // because the inner div stops propagation.
        if (event.target === event.currentTarget) {
          onDismiss();
        }
      }}
      style={overlayStyle}
      data-testid="shortcut-help-modal-backdrop"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="shortcut-help-modal"
        onMouseDown={(event) => event.stopPropagation()}
        style={modalStyle}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--gl-border-subtle)",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
            <div className="gl-t-xs gl-muted">Keyboard shortcuts</div>
            <div
              className="gl-serif"
              style={{
                fontSize: 18,
                fontWeight: 500,
                letterSpacing: "-0.005em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label
              className="gl-input"
              style={{ paddingLeft: 10, height: 28, fontSize: 12, width: 220 }}
            >
              <Icon name="search" size={13} color="var(--gl-text-secondary)" />
              <input
                ref={filterRef}
                type="search"
                placeholder="Filter shortcuts…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="shortcut-help-modal-filter"
                aria-label="Filter shortcuts"
                style={{
                  flex: 1,
                  border: 0,
                  outline: 0,
                  background: "transparent",
                  color: "inherit",
                  font: "inherit",
                  fontSize: 12,
                  padding: 0,
                }}
              />
            </label>
            <Kbd>esc</Kbd>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {filteredShortcuts.length === 0 ? (
            <div
              data-testid="shortcut-help-modal-empty"
              style={{
                padding: 32,
                margin: 20,
                borderRadius: "var(--gl-radius-md)",
                border: "1px dashed var(--gl-border-strong)",
                background: "var(--gl-surface-2)",
                textAlign: "center",
                fontSize: 13,
                color: "var(--gl-text-secondary)",
              }}
            >
              No shortcuts match <span className="gl-mono">{query}</span>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              {filteredShortcuts.map((group, i) => (
                <div
                  key={group.title}
                  data-testid={`shortcut-help-modal-group-${group.title.toLowerCase()}`}
                  style={{
                    padding: "18px 20px",
                    borderRight:
                      i % 2 === 0 && i < filteredShortcuts.length - 1
                        ? "1px solid var(--gl-border-subtle)"
                        : "none",
                    borderBottom:
                      i < filteredShortcuts.length - 2
                        ? "1px solid var(--gl-border-subtle)"
                        : "none",
                  }}
                >
                  <div className="gl-t-xs gl-muted" style={{ marginBottom: 10 }}>
                    {group.title}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {group.entries.map((entry, j) => (
                      <div
                        key={j}
                        data-testid={`shortcut-row-${entry.label.toLowerCase().replace(/\s+/g, "-")}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: 12.5,
                          gap: 12,
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>{entry.label}</span>
                        <span style={{ display: "inline-flex", gap: 3, flexShrink: 0 }}>
                          {entry.keys.map((key, k) => (
                            <Kbd key={k}>{key}</Kbd>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--gl-border-subtle)",
            background: "var(--gl-surface-2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11.5,
            color: "var(--gl-text-secondary)",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            No other tee-sheet vendor publishes this.{" "}
            <button
              type="button"
              data-testid="shortcut-help-modal-print"
              onClick={onPrintCheatSheet}
              disabled={!onPrintCheatSheet}
              className="gl-btn gl-btn--tertiary"
              data-size="sm"
              style={{ padding: "0 4px" }}
              aria-label="Print a cheat sheet for the pro shop"
            >
              Print a cheat sheet for the pro shop ↗
            </button>
          </span>
          <span
            className="gl-mono gl-tabular"
            style={{ fontSize: 10.5 }}
            data-testid="shortcut-help-modal-count"
          >
            {version} · {totalCount} shortcuts
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
