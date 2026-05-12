// Path: frontend/src/components/ui/Avatar.tsx — Phase 7 primitive.
// Initials avatar — heritage circle, parchment glyph, serif tile.
import type { CSSProperties } from "react";

export interface AvatarProps {
  initials: string;
  size?: number;
  ariaLabel?: string;
}

export function Avatar({ initials, size = 28, ariaLabel }: AvatarProps): JSX.Element {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 999,
    background: "var(--gl-heritage-700)",
    color: "var(--gl-text-onbrand)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: Math.round(size * 0.42),
    fontWeight: 500,
    fontFamily: "var(--gl-font-serif)",
    flexShrink: 0,
  };
  return (
    <span style={style} aria-label={ariaLabel} role={ariaLabel ? "img" : undefined} aria-hidden={ariaLabel ? undefined : true}>
      {initials}
    </span>
  );
}
