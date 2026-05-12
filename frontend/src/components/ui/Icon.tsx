// Path: frontend/src/components/ui/Icon.tsx — Phase 7 primitive (Material Symbols Outlined wrapper).
import type { CSSProperties } from "react";

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700;
  fill?: 0 | 1;
  className?: string;
  ariaLabel?: string;
}

export function Icon({
  name,
  size = 18,
  color = "currentColor",
  weight = 400,
  fill = 0,
  className,
  ariaLabel,
}: IconProps): JSX.Element {
  const style: CSSProperties = {
    fontSize: size,
    color,
    lineHeight: 1,
    fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
    verticalAlign: "middle",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: size,
    height: size,
  };
  const a11y = ariaLabel
    ? { role: "img" as const, "aria-label": ariaLabel }
    : { "aria-hidden": true as const };
  return (
    <span className={`material-symbols-outlined${className ? ` ${className}` : ""}`} style={style} {...a11y}>
      {name}
    </span>
  );
}
