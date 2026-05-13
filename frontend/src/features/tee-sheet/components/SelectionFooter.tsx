// Path: frontend/src/features/tee-sheet/components/SelectionFooter.tsx — Phase 10 Slices 4–6.
// Persistent footer below the row list. Always visible — its height is
// constant whether or not a row is selected (no layout shift between empty
// and hydrated states).
//
// Slice 4 stubs (wired in later slices):
// - Shortcut chips render but bind nothing      → Slice 10 wires keys
// - Lock-holder line is always the stub text    → Slice 9a wires real locks
// Slice 6 wired:
// - "?" button now opens the ShortcutHelpModal via the onOpenShortcuts prop
import type { CSSProperties } from "react";

import { Icon } from "../../../components/ui/Icon";
import { Kbd } from "../../../components/ui/Kbd";
import { timeKey } from "../sheet-shared";
import type { TeeSheetSlotView } from "../../../types/tee-sheet";

const SHORTCUT_CHIPS: Array<{ key: string; label: string }> = [
  { key: "n", label: "new" },
  { key: "s", label: "squeeze" },
  { key: "c", label: "check-in" },
  { key: "p", label: "pace" },
];

export interface SelectionFooterProps {
  selectedSlot: TeeSheetSlotView | null;
  onOpenShortcuts?: () => void;
}

export function SelectionFooter({
  selectedSlot,
  onOpenShortcuts,
}: SelectionFooterProps): JSX.Element {
  const hasSelection = selectedSlot !== null;
  const selectedTime = selectedSlot ? timeKey(selectedSlot.local_time) : null;

  const dimmedStyle: CSSProperties = { opacity: hasSelection ? 1 : 0.45 };

  return (
    <div
      role="contentinfo"
      aria-label="Tee sheet selection"
      data-testid="selection-footer"
      data-has-selection={hasSelection ? "true" : "false"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "6px 14px",
        borderTop: "1px solid var(--gl-border)",
        background: "var(--gl-surface-2)",
        fontSize: 11,
        color: "var(--gl-text-secondary)",
        flexShrink: 0,
        flexWrap: "wrap",
      }}
    >
      <span data-testid="selection-label">
        Selection ·{" "}
        <span className="gl-mono" style={{ color: hasSelection ? "var(--gl-text-primary)" : "var(--gl-text-secondary)" }}>
          {selectedTime ?? "—"}
        </span>
      </span>

      <span aria-hidden="true" style={{ width: 1, height: 12, background: "var(--gl-border)" }} />

      <span
        data-testid="selection-shortcut-chips"
        style={{ ...dimmedStyle, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      >
        {SHORTCUT_CHIPS.map((chip, i) => (
          <span key={chip.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: i === 0 ? 0 : 4 }}>
            <Kbd>{chip.key}</Kbd>
            <span>{chip.label}</span>
          </span>
        ))}
      </span>

      <span
        data-testid="selection-lock-line"
        style={{
          marginLeft: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--gl-text-secondary)",
        }}
      >
        <Icon name="lock" size={14} color="var(--gl-text-secondary)" />
        <span>Slot — · — remaining</span>
      </span>

      <button
        type="button"
        aria-label="Open keyboard shortcuts"
        title="Open keyboard shortcuts"
        onClick={onOpenShortcuts}
        disabled={!onOpenShortcuts}
        data-testid="selection-shortcuts-button"
        style={{
          width: 28,
          height: 22,
          padding: 0,
          background: "var(--gl-surface-2)",
          border: "1px solid var(--gl-border-subtle)",
          borderBottomWidth: 2,
          borderRadius: "var(--gl-radius-sm)",
          fontFamily: "var(--gl-font-mono)",
          fontSize: 11,
          color: "var(--gl-text-secondary)",
          cursor: onOpenShortcuts ? "pointer" : "not-allowed",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ?
      </button>
    </div>
  );
}
