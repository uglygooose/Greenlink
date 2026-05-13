// Path: frontend/src/features/tee-sheet/components/TeeRow.tsx — Phase 10 Slice 2.
// Renders one Phase 8 tee row from a single TeeSheetSlotView. Read-only:
// no click, drag, popover, or audit-history wiring this slice — those land in
// later phase-10 slices. Map keeps state-band glyphs, 4-up player cells, and
// the blocked/atrisk/noshow note variants in lock-step with the design.
//
// Backend gaps consciously NOT papered over:
// - channel/source per booking → channel dot per player cell omitted
// - "has audit events" per slot   → time-cell audit clock omitted
// - pace per slot                 → pace pip omitted (column still rendered for layout)
// These flow back to the slice-2 report and the recon ambiguities list.
import type { CSSProperties } from "react";

import { Icon } from "../../../components/ui/Icon";
import type { TeeSheetSlotDisplayStatus, TeeSheetSlotView } from "../../../types/tee-sheet";
import { bookingParticipantNames, slotCapacity, timeKey } from "../sheet-shared";

export type RowState = "open" | "booked" | "atrisk" | "blocked";

const SLOT_COLUMN_COUNT = 4;

interface StateBandSpec {
  background: string;
  iconColor: string;
  icon: string | null;
  bordered: boolean;
}

const STATE_BAND: Record<RowState, StateBandSpec> = {
  open: {
    background: "var(--gl-state-open)",
    iconColor: "var(--gl-text-secondary)",
    icon: null,
    bordered: true,
  },
  booked: {
    background: "var(--gl-state-booked)",
    iconColor: "var(--gl-parchment)",
    icon: "event_available",
    bordered: false,
  },
  atrisk: {
    background: "var(--gl-state-atrisk)",
    iconColor: "var(--gl-charcoal)",
    icon: "warning_amber",
    bordered: false,
  },
  blocked: {
    background: "var(--gl-state-blocked)",
    iconColor: "var(--gl-parchment)",
    icon: "block",
    bordered: false,
  },
};

// FROZEN — backend gap. Do not extend, branch, or duplicate.
// Replace when backend read model exposes a row-level state field
// (TeeSheetSlotView.row_state) OR per-slot aggregate booking flags
// (has_checked_in, has_no_show). Until then, Phase 8's checkedin
// and noshow row states are not derivable from display_status alone
// and collapse to "booked" here.

export function rowStateFromDisplayStatus(status: TeeSheetSlotDisplayStatus): RowState {
  switch (status) {
    case "available":
      return "open";
    case "blocked":
      return "blocked";
    case "warning":
      return "atrisk";
    case "reserved":
    case "indeterminate":
    default:
      return "booked";
  }
}

interface PlayerCellSpec {
  kind: "player" | "open";
  name?: string;
  cart?: boolean;
}

export function buildPlayerCells(slot: TeeSheetSlotView): PlayerCellSpec[] {
  const capacity = slotCapacity(slot);
  const cells: PlayerCellSpec[] = [];
  for (const booking of slot.bookings) {
    const names = bookingParticipantNames(booking);
    for (const name of names) {
      if (cells.length >= capacity) break;
      cells.push({ kind: "player", name, cart: Boolean(booking.cart_flag) });
    }
    if (cells.length >= capacity) break;
  }
  while (cells.length < SLOT_COLUMN_COUNT) {
    cells.push({ kind: "open" });
  }
  return cells;
}

// Aggregate booking fees for a one-line price. Presentation only — backend
// remains the source of truth for individual fee_amount values.
export function rowPriceLabel(slot: TeeSheetSlotView): string {
  if (slot.bookings.length === 0) return "—";
  let total = 0;
  let anyAmount = false;
  let currency: string | null = null;
  for (const booking of slot.bookings) {
    if (!booking.fee_amount) continue;
    const value = Number.parseFloat(booking.fee_amount);
    if (!Number.isFinite(value)) continue;
    total += value;
    anyAmount = true;
    currency = currency ?? booking.fee_currency ?? null;
  }
  if (!anyAmount) return "—";
  const formatted = total.toLocaleString("en-ZA", { maximumFractionDigits: 0 });
  const prefix = currency === "ZAR" || currency == null ? "R" : currency;
  return `${prefix} ${formatted}`;
}

function rowNote(slot: TeeSheetSlotView, state: RowState): string | null {
  if (state === "blocked") {
    return slot.blockers[0]?.reason ?? "Blocked";
  }
  if (state === "atrisk") {
    return slot.warnings[0]?.message ?? null;
  }
  return null;
}

export interface TeeRowProps {
  slot: TeeSheetSlotView;
  // True when the previous adjacent slot is also blocked — visually coalesces
  // the time-cell/state-band to the row above per Phase 8 hideHead behaviour.
  coalesceWithPrevious?: boolean;
}

export function TeeRow({ slot, coalesceWithPrevious = false }: TeeRowProps): JSX.Element | null {
  const state = rowStateFromDisplayStatus(slot.display_status);

  // hideHead: don't render the second/Nth adjacent blocked row at all — the
  // first one absorbs the time range via its blocker.reason note.
  if (coalesceWithPrevious && state === "blocked") {
    return null;
  }

  const band = STATE_BAND[state];
  const isBlocked = state === "blocked";
  const cells = isBlocked ? [] : buildPlayerCells(slot);
  const price = rowPriceLabel(slot);
  const note = rowNote(slot, state);

  return (
    <div
      data-row-state={state}
      data-slot-time={timeKey(slot.local_time)}
      style={{
        display: "flex",
        alignItems: "stretch",
        background: "var(--gl-surface-raised)",
        borderBottom: "1px solid var(--gl-border-subtle)",
        position: "relative",
        minHeight: 32,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18,
          alignSelf: "stretch",
          background: band.background,
          color: band.iconColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRight: band.bordered ? "1px solid var(--gl-border)" : "none",
        }}
      >
        {band.icon ? <Icon name={band.icon} size={10} color={band.iconColor} /> : null}
      </span>
      <div
        style={{
          width: 52,
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          borderRight: "1px solid var(--gl-border-subtle)",
        }}
      >
        <span className="gl-mono" style={{ fontSize: 12, fontWeight: 500 }}>
          {timeKey(slot.local_time)}
        </span>
        {/* FROZEN — backend gap. Do not extend, branch, or duplicate.
            Replace when backend read model exposes "has audit events today"
            per TeeSheetSlotView (e.g. has_audit_events: bool). Phase 8's
            time-cell history clock cannot be rendered without this signal. */}
      </div>

      {isBlocked ? (
        <div
          style={{
            flex: 1,
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background:
              "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in oklab, var(--gl-state-blocked) 14%, transparent) 6px 7px)",
            color: "var(--gl-text-secondary)",
          }}
        >
          <Icon name="construction" size={13} color="var(--gl-text-secondary)" />
          <span style={{ fontSize: 12 }}>{note ?? "Blocked"}</span>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "stretch", position: "relative" }}>
          {cells.map((cell, i) => (
            <PlayerCell key={i} cell={cell} />
          ))}
          {note && state === "atrisk" ? (
            <span
              style={{
                position: "absolute",
                left: 8,
                bottom: -16,
                fontSize: 10.5,
                color: "var(--gl-state-atrisk)",
                fontStyle: "italic",
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              {note}
            </span>
          ) : null}
        </div>
      )}

      <div
        aria-hidden="true"
        style={{
          width: 32,
          borderLeft: "1px solid var(--gl-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />
      <div
        style={{
          width: 76,
          borderLeft: "1px solid var(--gl-border-subtle)",
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--gl-text-primary)",
        }}
      >
        <span className="gl-mono gl-tabular">{price}</span>
      </div>
      <div
        aria-hidden="true"
        style={{
          width: 32,
          borderLeft: "1px solid var(--gl-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="more_vert" size={14} color="var(--gl-text-secondary)" />
      </div>

      {/* coalesceWithPrevious passthrough acknowledgement — purely diagnostic, drives nothing visible */}
      <span style={{ display: "none" }} data-coalesce={coalesceWithPrevious ? "true" : "false"} />
    </div>
  );
}

function PlayerCell({ cell }: { cell: PlayerCellSpec }): JSX.Element {
  if (cell.kind === "open") {
    return (
      <div style={cellStyleBase}>
        <Icon name="add" size={11} color="var(--gl-text-secondary)" />
        <span className="gl-t-xs gl-muted" style={{ textTransform: "none", letterSpacing: 0 }}>
          Add player
        </span>
      </div>
    );
  }
  return (
    <div
      style={{
        ...cellStyleBase,
        background: "var(--gl-surface-raised)",
      }}
    >
      {/* FROZEN — backend gap. Do not extend, branch, or duplicate.
          Replace when backend read model exposes booking channel/source per
          TeeSheetBookingSummary (e.g. source: BookingSource). Phase 8's
          per-cell channel dot (member-direct / member-app / aggregator /
          walk-in) cannot be rendered without this field. */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flex: 1,
          minWidth: 0,
        }}
      >
        {cell.name}
      </span>
      {cell.cart ? <Icon name="electric_rickshaw" size={12} color="var(--gl-text-secondary)" /> : null}
    </div>
  );
}

const cellStyleBase: CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "var(--gl-surface)",
  borderLeft: "1px solid var(--gl-border-subtle)",
  padding: "4px 8px",
  fontSize: 11,
  color: "var(--gl-text-secondary)",
  display: "flex",
  alignItems: "center",
  gap: 5,
};
