// Path: frontend/src/components/ui/Pill.tsx — Phase 8 primitive.
// Status pill with seven kinds (ok/warn/err/info/brand/neutral/accent).
// Soft variant (color-mix 14%) by default; solid variant for filled chrome.
// Matches the prototype in docs/phase8_prototype/phase8-shell.jsx.
import type { CSSProperties, ReactNode } from "react";

export type PillKind = "ok" | "warn" | "err" | "info" | "brand" | "neutral" | "accent";

export interface PillProps {
  kind?: PillKind;
  soft?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const KIND_COLOR: Record<PillKind, string> = {
  ok: "var(--gl-state-checkedin)",
  warn: "var(--gl-state-atrisk)",
  err: "var(--gl-caddie)",
  info: "var(--gl-heritage-500)",
  brand: "var(--gl-heritage-700)",
  neutral: "var(--gl-slate)",
  accent: "var(--gl-honey)",
};

export function Pill({ kind = "neutral", soft = true, icon, children, className }: PillProps): JSX.Element {
  const color = KIND_COLOR[kind];
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "2px 8px",
    borderRadius: "var(--gl-radius-pill)",
    background: soft ? `color-mix(in oklab, ${color} 14%, transparent)` : color,
    color: soft ? color : "var(--gl-text-onbrand)",
    fontSize: 10.5,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    fontWeight: 500,
    whiteSpace: "nowrap",
  };
  return (
    <span data-kind={kind} className={className} style={style}>
      {icon}
      {children}
    </span>
  );
}
