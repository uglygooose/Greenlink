// Path: frontend/src/components/ui/Card.tsx — Phase 7 primitive.
// Variants: default / flat / sunken. References --gl-card-pad token.
import type { HTMLAttributes, ReactNode } from "react";

export type CardVariant = "default" | "flat" | "sunken";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  as?: "div" | "section" | "article" | "aside";
  children: ReactNode;
}

export function Card({
  variant = "default",
  as = "div",
  className,
  children,
  ...rest
}: CardProps): JSX.Element {
  const variantClass = variant === "flat" ? " gl-card--flat" : variant === "sunken" ? " gl-card--sunken" : "";
  const composed = `gl-card${variantClass}${className ? ` ${className}` : ""}`;
  if (as === "section") return <section className={composed} {...rest}>{children}</section>;
  if (as === "article") return <article className={composed} {...rest}>{children}</article>;
  if (as === "aside") return <aside className={composed} {...rest}>{children}</aside>;
  return <div className={composed} {...rest}>{children}</div>;
}
