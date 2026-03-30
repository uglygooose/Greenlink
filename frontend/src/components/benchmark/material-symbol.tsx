import type { CSSProperties } from "react";

function joinClasses(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

interface MaterialSymbolProps {
  icon: string;
  className?: string;
  filled?: boolean;
  style?: CSSProperties;
}

export function MaterialSymbol({
  icon,
  className,
  filled = false,
  style,
}: MaterialSymbolProps): JSX.Element {
  return (
    <span
      className={joinClasses("material-symbols-outlined", className)}
      data-icon={icon}
      style={filled ? { ...style, fontVariationSettings: "'FILL' 1" } : style}
    >
      {icon}
    </span>
  );
}
