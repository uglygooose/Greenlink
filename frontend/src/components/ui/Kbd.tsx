// Path: frontend/src/components/ui/Kbd.tsx — Phase 8 primitive.
// 20×20 keycap rendered through the .gl-kbd class declared in tokens.css.
// Optional `dim` softens the chip for inline hints (e.g. selection footer).
import type { CSSProperties, ReactNode } from "react";

export interface KbdProps {
  children: ReactNode;
  dim?: boolean;
  className?: string;
}

export function Kbd({ children, dim = false, className }: KbdProps): JSX.Element {
  const style: CSSProperties | undefined = dim ? { opacity: 0.55 } : undefined;
  const composed = `gl-kbd${className ? ` ${className}` : ""}`;
  return (
    <kbd className={composed} style={style}>
      {children}
    </kbd>
  );
}
