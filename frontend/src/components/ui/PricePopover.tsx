// Path: frontend/src/components/ui/PricePopover.tsx — Phase 10 Slice 5 (shared primitive).
// 340px-wide portal popover anchored to a price button. Renders an additive
// price-line stack per Phase 8 — each line is one row carrying [kind dot,
// label + mono source, mono value]. Footer carries the channel pill + total.
// Two action stubs in a bottom row: Edit rules ↗ (pricing-rules surface,
// later phase) and Override on this booking (override flow, later phase).
//
// Component is presentational. Aggregation/synthesis lives in
// frontend/src/features/tee-sheet/use-price-breakdown.ts (Slice 5 stub
// against TeeSheetBookingSummary; real backend additive endpoint TBD —
// see DRIFT_LOG 2026-05-13 entries).
//
// Dismiss: own document mousedown + keydown listeners. Mousedown outside
// the popover OR on a [data-role="row-price-button"] (anchor swap) bypasses
// the dismiss; everything else fires onDismiss. Esc fires onDismiss.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { Button } from "./Button";
import { Card } from "./Card";
import { CardHead } from "./CardHead";
import { Icon } from "./Icon";
import { Pill } from "./Pill";

export type PriceLineKind =
  | "base"
  | "premium"
  | "discount"
  | "addon"
  | "channel"
  | "demand"
  | "override"
  | "blackout";

export interface PriceBreakdownLine {
  kind: PriceLineKind;
  label: string;
  source: string;
  value: string;
}

export interface PriceBreakdown {
  lines: PriceBreakdownLine[];
  channel: string;
  total: string;
}

export interface PricePopoverProps {
  anchorEl: HTMLElement | null;
  title: string;
  currency: string;
  breakdown: PriceBreakdown | null;
  loading: boolean;
  error: Error | null;
  onDismiss: () => void;
  onRetry?: () => void;
  onEditRules?: () => void;
  onOverride?: () => void;
}

const KIND_DOT_COLOR: Record<PriceLineKind, string> = {
  base: "var(--gl-heritage-500)",
  premium: "var(--gl-honey)",
  discount: "var(--gl-state-checkedin)",
  addon: "var(--gl-waterway)",
  channel: "var(--gl-flamingo)",
  demand: "var(--gl-honey)",
  override: "var(--gl-caddie)",
  blackout: "var(--gl-slate)",
};

const POPOVER_WIDTH = 340;
const ANCHOR_GAP = 4;

export function PricePopover({
  anchorEl,
  title,
  currency,
  breakdown,
  loading,
  error,
  onDismiss,
  onRetry,
  onEditRules,
  onOverride,
}: PricePopoverProps): JSX.Element | null {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<{ top: number; left: number; flipped: boolean }>({
    top: 0,
    left: 0,
    flipped: false,
  });

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const compute = (): void => {
      const anchorRect = anchorEl.getBoundingClientRect();
      // offsetHeight is 0 in jsdom (no layout engine); fall through to a
      // sensible default so the flip math behaves identically in tests.
      const popoverHeight = popoverRef.current?.offsetHeight || 200;
      const viewportHeight = window.innerHeight;
      const wouldOverflowBottom = anchorRect.bottom + ANCHOR_GAP + popoverHeight > viewportHeight;
      const flipped = wouldOverflowBottom;
      const top = flipped
        ? Math.max(8, anchorRect.top - popoverHeight - ANCHOR_GAP)
        : anchorRect.bottom + ANCHOR_GAP;
      const left = Math.max(8, Math.min(anchorRect.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));
      setPlacement({ top, left, flipped });
    };
    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [anchorEl, breakdown, loading, error]);

  // Outside-click + esc dismiss live with the popover so any future consumer
  // (pricing-rules editor, close-day wizard) gets the same dismiss model.
  useEffect(() => {
    const onMouseDown = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      // Clicking another row's price button must SWAP the anchor, not dismiss.
      if (target.closest('[data-role="row-price-button"]')) return;
      onDismiss();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      // Defer to a higher-tier overlay: any aria-modal dialog (e.g. the
      // shortcut help modal) gets dismissed first; the popover keeps state
      // until the modal closes. Matches the spec's esc priority order
      // (modal > popover > selection) without requiring a shared
      // dismiss-stack registry between sibling overlays.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onDismiss();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  if (!anchorEl) return null;

  const containerStyle: CSSProperties = {
    position: "fixed",
    top: placement.top,
    left: placement.left,
    width: POPOVER_WIDTH,
    zIndex: 60,
  };

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Price breakdown"
      data-testid="price-popover"
      data-flipped={placement.flipped ? "true" : "false"}
      style={containerStyle}
    >
      <div
        style={{
          background: "var(--gl-surface-raised)",
          border: "1px solid var(--gl-border-subtle)",
          borderRadius: "var(--gl-radius-md)",
          boxShadow: "var(--gl-shadow-pop)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 14px 10px 14px",
            borderBottom: "1px solid var(--gl-border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div className="gl-t-xs gl-muted">Price breakdown</div>
            <div className="gl-mono gl-tabular gl-muted" style={{ fontSize: 11 }}>
              {currency}
            </div>
          </div>
          <div
            className="gl-serif"
            style={{ fontSize: 16, fontWeight: 500, letterSpacing: "-0.005em" }}
          >
            {title}
          </div>
        </div>

        {loading ? (
          <Skeleton />
        ) : error ? (
          <ErrorBody error={error} onRetry={onRetry} />
        ) : breakdown ? (
          <Body breakdown={breakdown} />
        ) : (
          <div style={{ padding: 16 }}>
            <p className="gl-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }}>
              No price information available for this slot.
            </p>
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderTop: "1px solid var(--gl-border-subtle)",
            background: "var(--gl-surface-2)",
          }}
        >
          <button
            type="button"
            data-testid="price-popover-edit-rules"
            disabled={!onEditRules}
            onClick={onEditRules}
            className="gl-btn gl-btn--tertiary"
            data-size="sm"
            aria-label="Edit pricing rules — ships in a later slice"
          >
            Edit rules ↗
          </button>
          <button
            type="button"
            data-testid="price-popover-override"
            disabled={!onOverride}
            onClick={onOverride}
            className="gl-btn gl-btn--tertiary"
            data-size="sm"
            aria-label="Override price on this booking — ships in a later slice"
          >
            Override on this booking
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Body({ breakdown }: { breakdown: PriceBreakdown }): JSX.Element {
  return (
    <>
      <ul
        data-testid="price-popover-lines"
        style={{
          margin: 0,
          padding: "8px 14px",
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {breakdown.lines.map((line, i) => (
          <li
            key={i}
            data-kind={line.kind}
            style={{
              display: "grid",
              gridTemplateColumns: "8px 1fr auto",
              gap: 10,
              padding: "6px 0",
              borderBottom: i < breakdown.lines.length - 1 ? "1px solid var(--gl-border-subtle)" : "none",
              alignItems: "baseline",
            }}
          >
            <span
              aria-hidden="true"
              data-testid={`price-popover-dot-${line.kind}`}
              style={{
                width: 6,
                height: 6,
                borderRadius: "var(--gl-radius-pill)",
                background: KIND_DOT_COLOR[line.kind],
                alignSelf: "center",
              }}
            />
            <div>
              <div style={{ fontSize: 12.5, lineHeight: 1.35 }}>{line.label}</div>
              <div
                className="gl-mono"
                style={{ fontSize: 10.5, color: "var(--gl-text-secondary)", marginTop: 2 }}
              >
                {line.source}
              </div>
            </div>
            <div
              className="gl-mono gl-tabular"
              style={{ fontSize: 12.5, fontWeight: 500 }}
            >
              {line.value}
            </div>
          </li>
        ))}
      </ul>

      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--gl-border-subtle)",
          background: "var(--gl-surface-2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="sell" size={13} color="var(--gl-text-secondary)" />
          <Pill kind="neutral">Channel · {breakdown.channel}</Pill>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="gl-t-xs gl-muted">Total</span>
          <span
            className="gl-serif gl-tabular"
            style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.005em" }}
            data-testid="price-popover-total"
          >
            {breakdown.total}
          </span>
        </div>
      </div>
    </>
  );
}

function Skeleton(): JSX.Element {
  return (
    <div
      data-testid="price-popover-loading"
      role="status"
      aria-label="Loading price breakdown"
      style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="gl-skeleton"
          style={{ height: 12, width: i === 0 ? "70%" : i === 1 ? "85%" : "60%" }}
        />
      ))}
    </div>
  );
}

function ErrorBody({ error, onRetry }: { error: Error; onRetry?: () => void }): JSX.Element {
  return (
    <Card
      variant="flat"
      data-testid="price-popover-error"
      style={{
        margin: 12,
        padding: 0,
        background: "color-mix(in oklab, var(--gl-caddie) 7%, var(--gl-surface-raised))",
        borderColor: "color-mix(in oklab, var(--gl-caddie) 35%, var(--gl-border-subtle))",
      }}
    >
      <CardHead eyebrow="Couldn't load breakdown" title="Backend request failed" right={<Pill kind="err">Error</Pill>} />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }}>{error.message}</p>
        {onRetry ? (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={onRetry}
              leadingIcon={<Icon name="refresh" size={13} />}
            >
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
