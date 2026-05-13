// Path: frontend/src/features/tee-sheet/components/PartialSwapPill.tsx — Phase 10 Slice 8b.
// Inline action banner that renders when the swap orchestrator is in a
// partial-failure-second state — move A committed, move B failed, and
// the operator needs to choose Retry or Restore. Uses the info Pill
// kind's heritage tint (heritage-500) at the same 14% / 35% tinting
// proportions as Slice 8a's WalkinBookingErrorBanner.
//
// Note this is NOT a literal use of the Pill primitive (Pill is a
// badge-sized status chip; this is an action banner). The "Pill" name in
// the slice spec refers to the visual tone, not the primitive type.
import type { CSSProperties } from "react";

import { Icon } from "../../../components/ui/Icon";

export interface PartialSwapPillProps {
  participantAName: string;
  participantBName: string;
  isRetrying: boolean;
  isRestoring: boolean;
  onRetry: () => void;
  onRestore: () => void;
}

const CONTAINER_STYLE: CSSProperties = {
  margin: "8px 12px 0",
  padding: "8px 12px",
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderRadius: "var(--gl-radius-sm)",
  background: "color-mix(in oklab, var(--gl-heritage-500) 7%, var(--gl-surface-raised))",
  border: "1px solid color-mix(in oklab, var(--gl-heritage-500) 35%, var(--gl-border-subtle))",
  fontSize: 12,
};

const ACTION_BUTTON_STYLE: CSSProperties = {
  height: 22,
  padding: "0 8px",
};

export function PartialSwapPill({
  participantAName,
  participantBName,
  isRetrying,
  isRestoring,
  onRetry,
  onRestore,
}: PartialSwapPillProps): JSX.Element {
  const busy = isRetrying || isRestoring;
  return (
    <div role="alert" data-testid="partial-swap-pill" style={CONTAINER_STYLE}>
      <Icon name="swap_horiz" size={14} color="var(--gl-heritage-500)" />
      <span style={{ flex: 1 }}>
        Partial swap: <b>{participantAName}</b> moved, <b>{participantBName}</b> still pending.
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        aria-label="Retry second move"
        data-testid="partial-swap-retry"
        className="gl-btn gl-btn--tertiary"
        data-size="sm"
        style={ACTION_BUTTON_STYLE}
      >
        {isRetrying ? "Retrying…" : "Retry move"}
      </button>
      <button
        type="button"
        onClick={onRestore}
        disabled={busy}
        aria-label="Restore first move"
        data-testid="partial-swap-restore"
        className="gl-btn gl-btn--tertiary"
        data-size="sm"
        style={ACTION_BUTTON_STYLE}
      >
        {isRestoring ? "Restoring…" : "Restore"}
      </button>
    </div>
  );
}
