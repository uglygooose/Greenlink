// Path: frontend/src/components/ui/CardHead.tsx — Phase 8 primitive.
// Section header for a Card: optional eyebrow + serif title + right-slot for
// actions. Bottom-aligns content over a 1-px subtle rule.
import type { ReactNode } from "react";

export interface CardHeadProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function CardHead({ eyebrow, title, right, className }: CardHeadProps): JSX.Element {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        padding: "12px 16px",
        borderBottom: "1px solid var(--gl-border-subtle)",
      }}
    >
      <div>
        {eyebrow ? <div className="gl-t-xs gl-muted">{eyebrow}</div> : null}
        <div
          className="gl-serif"
          style={{
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: "-0.005em",
            marginTop: eyebrow ? 2 : 0,
          }}
        >
          {title}
        </div>
      </div>
      {right}
    </div>
  );
}
