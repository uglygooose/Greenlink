// Path: frontend/src/features/tee-sheet/components/TeeRow.tsx — Phase 10 Slices 2–8a.
// Renders one Phase 8 tee row from a single TeeSheetSlotView. Slice 4 added
// selection: row-level click fires onSelect (except blocked rows), price and
// more_vert are stop-propagation buttons that stay inert until later slices
// wire their popover/menu. Slice 8a adds drop-target wiring on empty player
// cells: dragOver renders the brand-dashed "Drop here · {name}" visual,
// drop fires the page-level mutation with the slot_datetime.
//
// Backend gaps consciously NOT papered over:
// - channel/source per booking → channel dot per player cell omitted
// - "has audit events" per slot   → time-cell audit clock omitted
// - pace per slot                 → pace pip omitted (column still rendered for layout)
// These flow back to the slice-2 report and the recon ambiguities list.
import type { CSSProperties, DragEvent } from "react";

import { Icon } from "../../../components/ui/Icon";
import type { TeeSheetSlotDisplayStatus, TeeSheetSlotView } from "../../../types/tee-sheet";
import { DRAG_PAYLOAD_MIME, type DragPayload, type SlotDropTarget } from "../dnd/types";
import { bookingParticipantNames, slotCapacity, timeKey } from "../sheet-shared";
import { isOptimisticBookingId } from "../use-create-walkin-booking";

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
  isSelected?: boolean;
  onSelect?: (slotKey: string) => void;
  // Phase 8 (phase8-tee-sheet.jsx:576) wires clicking the price to select the
  // row AND open the price popover. The TeeRow fires both callbacks; the page
  // composes selection + popover state from them.
  onPriceClick?: (slotKey: string, anchorEl: HTMLButtonElement) => void;
  // Slice 8a — drag/drop coordination from the page level.
  // dragPayload is the active drag (or null); when set + valid, empty
  // player cells render the brand-dashed drop-target visual. onDrop fires
  // the page-level mutation with the slot_datetime + parsed payload.
  dragPayload?: DragPayload | null;
  activeDropTarget?: SlotDropTarget | null;
  onDragEnterSlot?: (target: SlotDropTarget) => void;
  onDragLeaveSlot?: (target: SlotDropTarget) => void;
  onDropOnSlot?: (target: SlotDropTarget, payload: DragPayload) => void;
}

export function TeeRow({
  slot,
  coalesceWithPrevious = false,
  isSelected = false,
  onSelect,
  onPriceClick,
  dragPayload = null,
  activeDropTarget = null,
  onDragEnterSlot,
  onDragLeaveSlot,
  onDropOnSlot,
}: TeeRowProps): JSX.Element | null {
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

  // Optimistic-booking detection: when a drop's mutation is in flight, the
  // tee-sheet day cache carries an "optimistic-..." booking on this slot.
  // The row dims while the mutation resolves.
  const isOptimistic = slot.bookings.some((booking) => isOptimisticBookingId(booking.id));

  // Slice 8a — drop-target eligibility: non-blocked rows accept waitlist
  // drags into their empty player cells. The page passes the active drag
  // payload down; the cells render the brand-dashed visual when targeted.
  const dropEligible = !isBlocked && dragPayload !== null && onDropOnSlot !== undefined;
  const dropTarget: SlotDropTarget = {
    kind: "slot",
    slot_datetime: slot.slot_datetime,
    row_key: timeKey(slot.local_time),
  };
  const isActiveDropTarget =
    activeDropTarget !== null &&
    activeDropTarget !== undefined &&
    activeDropTarget.slot_datetime === slot.slot_datetime;

  // Selection: blocked rows do not select (their hatched overlay covers the
  // body and there is no operationally useful action on a blocked slot).
  // Phase 8 dismiss is esc-only at the page level — clicking a non-blocked
  // row always SETS the selection; it never toggles.
  const handleRowClick = (): void => {
    if (isBlocked || !onSelect) return;
    onSelect(slot.slot_datetime);
  };

  return (
    <div
      role="row"
      aria-selected={isBlocked ? undefined : isSelected}
      data-row-state={state}
      data-slot-time={timeKey(slot.local_time)}
      data-selected={isSelected ? "true" : "false"}
      data-optimistic={isOptimistic ? "true" : undefined}
      onClick={handleRowClick}
      style={{
        display: "flex",
        alignItems: "stretch",
        background: isSelected
          ? "color-mix(in oklab, var(--gl-brand) 7%, var(--gl-surface-raised))"
          : "var(--gl-surface-raised)",
        borderBottom: "1px solid var(--gl-border-subtle)",
        outline: isSelected ? "1px solid var(--gl-brand)" : "none",
        outlineOffset: -1,
        position: "relative",
        minHeight: 32,
        cursor: isBlocked || !onSelect ? "default" : "pointer",
        opacity: isOptimistic ? 0.65 : 1,
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
            <PlayerCell
              key={i}
              cell={cell}
              dropEligible={dropEligible && cell.kind === "open"}
              isActiveDropTarget={isActiveDropTarget && cell.kind === "open"}
              dragLabel={dragLabelFor(dragPayload)}
              onDragEnter={() => onDragEnterSlot?.(dropTarget)}
              onDragLeave={() => onDragLeaveSlot?.(dropTarget)}
              onDrop={(payload) => onDropOnSlot?.(dropTarget, payload)}
            />
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
      {/* Price button: fires onSelect + onPriceClick (Phase 8 parity); data-role
          tags the element so the PricePopover's outside-click listener can
          swap the anchor instead of dismissing when another price is clicked.
          Blocked rows render the cell disabled — no popover, no selection. */}
      <button
        type="button"
        data-testid="row-price-button"
        data-role="row-price-button"
        disabled={isBlocked}
        onClick={(e) => {
          e.stopPropagation();
          if (isBlocked) return;
          onSelect?.(slot.slot_datetime);
          onPriceClick?.(slot.slot_datetime, e.currentTarget);
        }}
        style={{
          width: 76,
          borderLeft: "1px solid var(--gl-border-subtle)",
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          fontSize: 12,
          fontWeight: 500,
          color: isBlocked ? "var(--gl-text-secondary)" : "var(--gl-text-primary)",
          background: "transparent",
          border: "none",
          font: "inherit",
          cursor: isBlocked ? "default" : "pointer",
        }}
      >
        <span className="gl-mono gl-tabular">{price}</span>
      </button>
      {/* more_vert button: stopPropagation no-op stub. Phase 8 doesn't
          specify the menu contents (recon B.4-14 unresolved). Do not invent. */}
      <button
        type="button"
        aria-label={`Row actions for ${timeKey(slot.local_time)}`}
        data-testid="row-actions-button"
        onClick={(e) => {
          e.stopPropagation();
        }}
        style={{
          width: 32,
          borderLeft: "1px solid var(--gl-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <Icon name="more_vert" size={14} color="var(--gl-text-secondary)" />
      </button>

      {/* coalesceWithPrevious passthrough acknowledgement — purely diagnostic, drives nothing visible */}
      <span style={{ display: "none" }} data-coalesce={coalesceWithPrevious ? "true" : "false"} />
    </div>
  );
}

interface PlayerCellProps {
  cell: PlayerCellSpec;
  dropEligible?: boolean;
  isActiveDropTarget?: boolean;
  dragLabel?: string | null;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDrop?: (payload: DragPayload) => void;
}

function PlayerCell({
  cell,
  dropEligible = false,
  isActiveDropTarget = false,
  dragLabel = null,
  onDragEnter,
  onDragLeave,
  onDrop,
}: PlayerCellProps): JSX.Element {
  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!dropEligible) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (!dropEligible) return;
    event.preventDefault();
    onDragEnter?.();
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (!dropEligible) return;
    // Only fire leave when the drag actually exits the cell, not when it
    // moves between child elements of the same cell.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    onDragLeave?.();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!dropEligible || !onDrop) return;
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData(DRAG_PAYLOAD_MIME);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as DragPayload;
      onDrop(payload);
    } catch {
      // Malformed payload — ignore. Drop event has been consumed.
    }
  };

  if (cell.kind === "open") {
    if (isActiveDropTarget && dragLabel !== null) {
      return (
        <div
          data-testid="drop-target-active"
          aria-dropeffect="move"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            ...cellStyleBase,
            border: "1px dashed var(--gl-brand)",
            borderLeft: "1px dashed var(--gl-brand)",
            background: "color-mix(in oklab, var(--gl-brand) 12%, transparent)",
            color: "var(--gl-brand)",
            margin: "2px 2px 2px 0",
            borderRadius: "var(--gl-radius-xs)",
          }}
        >
          <Icon name="north_east" size={12} color="var(--gl-brand)" />
          <span className="gl-mono" style={{ fontSize: 10.5 }}>
            Drop here · {dragLabel}
          </span>
        </div>
      );
    }
    return (
      <div
        data-testid={dropEligible ? "drop-target-eligible" : undefined}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={cellStyleBase}
      >
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

function dragLabelFor(payload: DragPayload | null | undefined): string | null {
  if (!payload) return null;
  if (payload.kind === "waitlist") return payload.entry.name;
  return null;
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
