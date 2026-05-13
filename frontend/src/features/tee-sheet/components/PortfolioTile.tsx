// Path: frontend/src/features/tee-sheet/components/PortfolioTile.tsx — Phase 10 Slice 3.
// One course-summary tile inside the portfolio strip. Pure presentational —
// all metrics arrive as props, aggregation lives in PortfolioStrip.
//
// Active state: brand left-rule + brand-tinted background (color-mix 7%
// per the Slice-1 brand-tint idiom used elsewhere in the codebase).
// Inactive: surface-2 background, subtle border.
import type { CSSProperties } from "react";

export interface PortfolioTileProps {
  courseName: string;
  utilisationPercent: number;
  teeTimesBooked: number;
  teeTimesTotal: number;
  revenueAmount: number | null;
  revenueCurrency: string | null;
  active: boolean;
  onClick: () => void;
}

function formatRevenue(amount: number | null, currency: string | null): string {
  if (amount === null || !Number.isFinite(amount)) return "—";
  const prefix = currency && currency !== "ZAR" ? currency : "R";
  return `${prefix} ${amount.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}

export function PortfolioTile({
  courseName,
  utilisationPercent,
  teeTimesBooked,
  teeTimesTotal,
  revenueAmount,
  revenueCurrency,
  active,
  onClick,
}: PortfolioTileProps): JSX.Element {
  const clampedPercent = Math.max(0, Math.min(100, utilisationPercent));
  const tileStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    textAlign: "left",
    background: active
      ? "color-mix(in oklab, var(--gl-brand) 7%, var(--gl-surface-raised))"
      : "var(--gl-surface-2)",
    border: `1px solid ${active ? "var(--gl-brand)" : "var(--gl-border-subtle)"}`,
    borderLeftWidth: 2,
    borderLeftColor: active ? "var(--gl-brand)" : "var(--gl-border-subtle)",
    borderRadius: "var(--gl-radius-sm)",
    padding: "8px 12px",
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 4,
    alignItems: "center",
    cursor: "pointer",
    fontFamily: "inherit",
    color: "inherit",
    transition: "background var(--gl-dur-functional) var(--gl-ease-standard)",
  };

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={tileStyle}
      data-active={active ? "true" : "false"}
      data-testid={`portfolio-tile-${courseName.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div>
        <div
          className="gl-serif"
          style={{
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "-0.005em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {courseName}
        </div>
        <div className="gl-muted gl-mono" style={{ fontSize: 10.5, marginTop: 2 }}>
          {teeTimesBooked}/{teeTimesTotal} tee times
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="gl-mono gl-tabular" style={{ fontSize: 14, fontWeight: 500 }}>
          {clampedPercent}%
        </div>
        <div className="gl-muted gl-mono gl-tabular" style={{ fontSize: 10 }}>
          {formatRevenue(revenueAmount, revenueCurrency)}
        </div>
      </div>
      <div
        aria-hidden="true"
        style={{
          gridColumn: "1 / -1",
          height: 3,
          background: "var(--gl-surface)",
          borderRadius: "var(--gl-radius-pill)",
          marginTop: 4,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clampedPercent}%`,
            height: "100%",
            background: "var(--gl-brand)",
            borderRadius: "var(--gl-radius-pill)",
            transition: "width var(--gl-dur-confirm) var(--gl-ease-standard)",
          }}
        />
      </div>
    </button>
  );
}
