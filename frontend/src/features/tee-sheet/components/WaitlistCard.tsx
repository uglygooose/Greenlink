// Path: frontend/src/features/tee-sheet/components/WaitlistCard.tsx — Phase 10 Slice 7.
// One waitlist party card inside the WaitlistRail. Renders party name +
// source badge + since-time + party body + conditional auto-fit suggestion
// strip. draggable={true} is the visual affordance; Slice 8a wires the
// drop-target pipeline.
//
// Source-badge tone — Phase 8 prototype renders both "Walk-in" and
// "Member app" with the same neutral slate badge. Spec speculated
// info-vs-neutral differentiation; matched Phase 8 (both neutral).
import { Badge } from "../../../components/ui/Badge";
import { Icon } from "../../../components/ui/Icon";
import type { WaitlistEntry } from "../use-waitlist";

const SOURCE_LABEL: Record<WaitlistEntry["source"], string> = {
  walkin: "Walk-in",
  memberapp: "Member app",
};

export interface WaitlistCardProps {
  entry: WaitlistEntry;
  onPlace?: (entry: WaitlistEntry) => void;
}

export function WaitlistCard({ entry, onPlace }: WaitlistCardProps): JSX.Element {
  return (
    <div
      draggable
      data-testid={`waitlist-card-${entry.id}`}
      data-source={entry.source}
      style={{
        background: "var(--gl-surface-raised)",
        border: "1px solid var(--gl-border-subtle)",
        borderRadius: "var(--gl-radius-sm)",
        padding: "10px 12px",
        cursor: "grab",
        boxShadow: "var(--gl-shadow-card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {entry.name}
          </span>
          <Badge tone="neutral">{SOURCE_LABEL[entry.source]}</Badge>
        </div>
        <span
          className="gl-mono gl-muted"
          style={{ fontSize: 10.5, flexShrink: 0 }}
          data-testid={`waitlist-card-since-${entry.id}`}
        >
          {entry.since}
        </span>
      </div>
      <div className="gl-muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
        Party of <b>{entry.party}</b> · {entry.note}
      </div>

      {entry.suggestion ? (
        <div
          data-testid={`waitlist-card-suggestion-${entry.id}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 8,
            padding: "5px 8px",
            borderRadius: "var(--gl-radius-sm)",
            background: "color-mix(in oklab, var(--gl-state-checkedin) 12%, transparent)",
            color: "var(--gl-state-checkedin)",
            fontSize: 11,
          }}
        >
          <Icon name="auto_awesome" size={12} color="var(--gl-state-checkedin)" />
          <span style={{ flex: 1 }}>
            Fits <b className="gl-mono">{entry.suggestion.slotLabel}</b>
          </span>
          <button
            type="button"
            data-testid={`waitlist-card-place-${entry.id}`}
            className="gl-btn gl-btn--tertiary"
            data-size="sm"
            onClick={() => onPlace?.(entry)}
            disabled={!onPlace}
            style={{ height: 22, padding: 0, color: "var(--gl-state-checkedin)" }}
            aria-label={`Place ${entry.name}`}
          >
            Place
          </button>
        </div>
      ) : (
        /* FROZEN — backend gap. Do not extend, branch, or duplicate.
           No suggestion engine endpoint. When the backend exposes a "best
           gap" suggestion per waitlist entry (likely as
           WaitlistEntry.suggestion = { slot_label, slot_datetime } in the
           same payload the read endpoint returns), the strip renders
           automatically — the conditional above flips to truthy without
           any other change here. The "best gap" semantics are themselves a
           product decision (capacity vs party preference vs holdover
           rules); see DRIFT_LOG 2026-05-13 (Slice 7 Path 1, Path 3
           rejection note). */
        null
      )}
    </div>
  );
}
