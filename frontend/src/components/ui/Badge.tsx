// Path: frontend/src/components/ui/Badge.tsx — Phase 7 primitive.
// Status pill with optional dot. Tone maps to deuteranopia-aware tokens.
import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "good" | "warn" | "danger" | "info" | "honey" | "flamingo" | "waterway";

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const TONE_COLOR: Record<BadgeTone, string> = {
  neutral: "var(--gl-text-secondary)",
  brand: "var(--gl-heritage-700)",
  good: "var(--gl-state-checkedin)",
  warn: "var(--gl-state-atrisk)",
  danger: "var(--gl-caddie)",
  info: "var(--gl-heritage-500)",
  honey: "var(--gl-honey)",
  flamingo: "var(--gl-flamingo)",
  waterway: "var(--gl-waterway)",
};

export function Badge({ tone = "neutral", dot = false, icon, children, className }: BadgeProps): JSX.Element {
  const color = TONE_COLOR[tone];
  return (
    <span className={`gl-badge${className ? ` ${className}` : ""}`} style={{ color }}>
      {dot ? <span className="gl-dot" aria-hidden="true" /> : null}
      {icon}
      {children}
    </span>
  );
}
