// Path: frontend/src/components/ui/TeeStateChip.tsx — Phase 8 primitive.
// Six deuteranopia-safe tee-time state chips. Encodes state on (1) hue,
// (2) luminance band via the --gl-state-* tokens, and (3) an explicit Material
// glyph and label. Compact size used inside the legend strip and density-
// compact rows; default size used everywhere else.
import type { CSSProperties } from "react";

import { Icon } from "./Icon";

export type TeeState = "open" | "booked" | "checkedin" | "atrisk" | "noshow" | "blocked";

export interface TeeStateChipProps {
  state: TeeState;
  compact?: boolean;
  className?: string;
}

interface StateSpec {
  background: string;
  foreground: string;
  icon: string;
  label: string;
  bordered: boolean;
}

const STATE_SPEC: Record<TeeState, StateSpec> = {
  open: {
    background: "var(--gl-state-open)",
    foreground: "var(--gl-text-secondary)",
    icon: "schedule",
    label: "Open",
    bordered: true,
  },
  booked: {
    background: "var(--gl-state-booked)",
    foreground: "var(--gl-parchment)",
    icon: "event_available",
    label: "Booked",
    bordered: false,
  },
  checkedin: {
    background: "var(--gl-state-checkedin)",
    foreground: "var(--gl-parchment)",
    icon: "how_to_reg",
    label: "Checked in",
    bordered: false,
  },
  atrisk: {
    background: "var(--gl-state-atrisk)",
    foreground: "var(--gl-charcoal)",
    icon: "warning_amber",
    label: "At-risk",
    bordered: false,
  },
  noshow: {
    background: "var(--gl-state-noshow)",
    foreground: "var(--gl-parchment)",
    icon: "cancel",
    label: "No-show",
    bordered: false,
  },
  blocked: {
    background: "var(--gl-state-blocked)",
    foreground: "var(--gl-parchment)",
    icon: "block",
    label: "Blocked",
    bordered: false,
  },
};

export function TeeStateChip({ state, compact = false, className }: TeeStateChipProps): JSX.Element {
  const spec = STATE_SPEC[state];
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: compact ? "1px 6px" : "2px 8px",
    borderRadius: "var(--gl-radius-sm)",
    background: spec.background,
    color: spec.foreground,
    fontSize: compact ? 10 : 11,
    fontWeight: 500,
    letterSpacing: "0.015em",
    border: spec.bordered ? "1px solid var(--gl-border)" : "none",
    whiteSpace: "nowrap",
  };
  return (
    <span data-state={state} className={className} style={style}>
      <Icon name={spec.icon} size={compact ? 10 : 11} color={spec.foreground} />
      <span>{spec.label}</span>
    </span>
  );
}
