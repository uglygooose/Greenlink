// Path: frontend/src/features/tee-sheet/components/WaitlistRail.tsx — Phase 10 Slice 7.
// 308-px right rail. Header (counts + Add stub), scroll list of WaitlistCards,
// empty-state drop-hint card, footer (POS line + running total + Send to POS
// stub). Always visible on the tee-sheet page — the empty state is the
// production reality today because the backend has no waitlist endpoint.
//
// FROZEN gap for the data shape lives in use-waitlist.ts; this component
// renders whatever the hook supplies. The footer running-total FROZEN note
// below marks where backend-supplied fee values are summed for presentation.
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { CardHead } from "../../../components/ui/CardHead";
import { Icon } from "../../../components/ui/Icon";
import { Pill } from "../../../components/ui/Pill";
import type { WaitlistEntry } from "../use-waitlist";

import { WaitlistCard } from "./WaitlistCard";

export interface WaitlistRailProps {
  waitlist: WaitlistEntry[];
  loading: boolean;
  error: Error | null;
  onRetry?: () => void;
  onPlace?: (entry: WaitlistEntry) => void;
  onAdd?: () => void;
  onSendToPos?: () => void;
}

const RAIL_WIDTH = 308;

export function WaitlistRail({
  waitlist,
  loading,
  error,
  onRetry,
  onPlace,
  onAdd,
  onSendToPos,
}: WaitlistRailProps): JSX.Element {
  const partyCount = waitlist.length;
  const playerCount = waitlist.reduce((sum, entry) => sum + entry.party, 0);

  // FROZEN — backend gap. Do not extend, branch, or duplicate.
  // Running total is a presentation aggregation of fee_amount values the
  // backend already validated per entry, same idiom as Slice 2 row price
  // and Slice 3 portfolio summary. When the waitlist endpoint lands and
  // exposes fee_amount per entry, the total animates automatically. No
  // /api/golf/waitlist endpoint, no Waitlist model, no
  // BookingSource.WALK_IN enum value (see DRIFT_LOG 2026-05-13 Slice 7).
  const total = waitlist.reduce((sum, entry) => sum + (entry.feeAmount ?? 0), 0);
  const currency = waitlist.find((entry) => entry.feeCurrency != null)?.feeCurrency ?? "ZAR";
  const totalLabel = formatTotal(total, currency);

  return (
    <aside
      aria-label="Walk-in waitlist"
      data-testid="waitlist-rail"
      style={{
        width: RAIL_WIDTH,
        flexShrink: 0,
        borderLeft: "1px solid var(--gl-border-subtle)",
        background: "var(--gl-surface-2)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--gl-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div className="gl-t-xs gl-muted">Walk-in waitlist</div>
          <div
            className="gl-serif"
            style={{ fontSize: 15, fontWeight: 500 }}
            data-testid="waitlist-rail-counts"
          >
            {partyCount} parties · {playerCount} players
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onAdd}
          disabled={!onAdd}
          aria-label="Add walk-in party — not wired yet"
          data-testid="waitlist-rail-add"
          leadingIcon={<Icon name="add" size={13} />}
        >
          Add
        </Button>
      </div>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
        data-testid="waitlist-rail-body"
      >
        {loading ? (
          <SkeletonList />
        ) : error ? (
          <ErrorPanel error={error} onRetry={onRetry} />
        ) : waitlist.length === 0 ? (
          <EmptyDropHint />
        ) : (
          waitlist.map((entry) => (
            <WaitlistCard key={entry.id} entry={entry} onPlace={onPlace} />
          ))
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--gl-border-subtle)",
          padding: "10px 14px",
          background: "var(--gl-surface)",
        }}
      >
        <div className="gl-t-xs gl-muted">Pay on placement</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
          <span className="gl-mono" style={{ fontSize: 11 }}>
            POS · pro shop till
          </span>
          <span
            className="gl-serif gl-tabular"
            style={{ fontSize: 16, fontWeight: 500 }}
            data-testid="waitlist-rail-total"
          >
            {totalLabel}
          </span>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onSendToPos}
          disabled={!onSendToPos || waitlist.length === 0}
          aria-label="Send waitlist to POS — not wired yet"
          data-testid="waitlist-rail-send-pos"
          className="gl-btn-fullwidth"
          // Inline width override since Button doesn't expose a "block" variant
          // and the slice spec doesn't justify adding one for one consumer.
        >
          <span style={{ width: "100%", display: "inline-block", textAlign: "center" }}>Send to POS</span>
        </Button>
      </div>
    </aside>
  );
}

function EmptyDropHint(): JSX.Element {
  return (
    <div
      data-testid="waitlist-rail-empty"
      style={{
        marginTop: 4,
        padding: 16,
        borderRadius: "var(--gl-radius-sm)",
        border: "1px dashed var(--gl-border)",
        textAlign: "center",
        color: "var(--gl-text-secondary)",
        fontSize: 11.5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <Icon name="touch_app" size={14} color="var(--gl-text-secondary)" />
      <span>Drag any card onto a tee row to place</span>
    </div>
  );
}

function SkeletonList(): JSX.Element {
  return (
    <div data-testid="waitlist-rail-loading" role="status" aria-label="Loading waitlist">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            marginBottom: 8,
            padding: 12,
            background: "var(--gl-surface-raised)",
            border: "1px solid var(--gl-border-subtle)",
            borderRadius: "var(--gl-radius-sm)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span className="gl-skeleton" style={{ height: 12, width: "60%" }} />
          <span className="gl-skeleton" style={{ height: 10, width: "80%" }} />
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({ error, onRetry }: { error: Error; onRetry?: () => void }): JSX.Element {
  return (
    <Card
      variant="flat"
      data-testid="waitlist-rail-error"
      style={{
        padding: 0,
        background: "color-mix(in oklab, var(--gl-caddie) 7%, var(--gl-surface-raised))",
        borderColor: "color-mix(in oklab, var(--gl-caddie) 35%, var(--gl-border-subtle))",
      }}
    >
      <CardHead eyebrow="Couldn't load waitlist" title="Backend request failed" right={<Pill kind="err">Error</Pill>} />
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }}>{error.message}</p>
        {onRetry ? (
          <div>
            <Button variant="secondary" size="sm" onClick={onRetry} leadingIcon={<Icon name="refresh" size={13} />}>
              Retry
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function formatTotal(amount: number, currency: string): string {
  const prefix = currency === "ZAR" ? "R" : currency;
  return `${prefix} ${amount.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
