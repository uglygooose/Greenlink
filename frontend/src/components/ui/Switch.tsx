// Path: frontend/src/components/ui/Switch.tsx — Phase 8 primitive.
// 40×22 toggle: brand-coloured track when on, stone when off, white thumb.
// Exposes aria-pressed for assistive tech; consumers pass `label` for the
// accessible name (rendered as aria-label on the button).
import type { CSSProperties } from "react";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onCheckedChange, label, disabled = false, className }: SwitchProps): JSX.Element {
  const trackStyle: CSSProperties = {
    width: 40,
    height: 22,
    borderRadius: "var(--gl-radius-pill)",
    padding: 0,
    border: "none",
    background: checked ? "var(--gl-brand)" : "var(--gl-stone)",
    position: "relative",
    cursor: disabled ? "not-allowed" : "pointer",
    flexShrink: 0,
    opacity: disabled ? 0.5 : 1,
    transition: "background var(--gl-dur-functional) var(--gl-ease-standard)",
  };
  const thumbStyle: CSSProperties = {
    position: "absolute",
    top: 2,
    left: checked ? 20 : 2,
    width: 18,
    height: 18,
    borderRadius: "var(--gl-radius-pill)",
    background: "var(--gl-control-thumb)",
    boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
    transition: "left var(--gl-dur-functional) var(--gl-ease-standard)",
  };
  return (
    <button
      type="button"
      role="switch"
      aria-pressed={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={className}
      style={trackStyle}
    >
      <span aria-hidden="true" style={thumbStyle} />
    </button>
  );
}
