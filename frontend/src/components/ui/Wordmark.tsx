// Path: frontend/src/components/ui/Wordmark.tsx — Phase 7 primitive (GreenLink wordmark).
// Serif "Green" + sans "link" lowercase + Caddie Red dot.
import type { CSSProperties } from "react";

export interface WordmarkProps {
  size?: number;
  color?: string;
  ariaLabel?: string;
}

export function Wordmark({ size = 22, color = "currentColor", ariaLabel = "GreenLink" }: WordmarkProps): JSX.Element {
  const container: CSSProperties = {
    display: "inline-flex",
    alignItems: "baseline",
    gap: 0,
    color,
    lineHeight: 1,
  };
  const greenStyle: CSSProperties = {
    fontFamily: "var(--gl-font-serif)",
    fontSize: size,
    fontWeight: 500,
    letterSpacing: "-0.02em",
  };
  const linkStyle: CSSProperties = {
    fontFamily: "var(--gl-font-sans)",
    fontSize: size * 0.92,
    fontWeight: 500,
    letterSpacing: "0.04em",
    textTransform: "lowercase",
  };
  const dotStyle: CSSProperties = {
    width: 4,
    height: 4,
    borderRadius: 999,
    background: "var(--gl-caddie)",
    marginLeft: 4,
    transform: "translateY(-2px)",
  };
  return (
    <span style={container} role="img" aria-label={ariaLabel}>
      <span style={greenStyle} aria-hidden="true">Green</span>
      <span style={linkStyle} aria-hidden="true">link</span>
      <span style={dotStyle} aria-hidden="true" />
    </span>
  );
}
