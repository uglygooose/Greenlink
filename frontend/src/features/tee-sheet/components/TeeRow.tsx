// Path: frontend/src/features/tee-sheet/components/TeeRow.tsx — Phase 10 Slices 2–8b.
// Renders one Phase 8 tee row from a single TeeSheetSlotView. Slice 4 added
// selection: row-level click fires onSelect (except blocked rows), price and
// more_vert are stop-propagation buttons that stay inert until later slices
// wire their popover/menu. Slice 8a added drop-target wiring on empty player
// cells (waitlist → open cell). Slice 8b extends drag/drop to filled cells:
// moveable bookings (RESERVED / CHECKED_IN) become drag sources, and the
// drop target now accepts cross-row participant moves on both open and
// filled cells. Same-row drags render an at-risk-toned rejection visual
// and the drop is a no-op client-side (spec deferral; backend also
// rejects via move_is_no_op).
//
// Backend gaps consciously NOT papered over:
// - channel/source per booking → channel dot per player cell omitted
// - "has audit events" per slot   → time-cell audit clock omitted
// - pace per slot                 → pace pip omitted (column still rendered for layout)
// These flow back to the slice-2 report and the recon ambiguities list.
import type { CSSProperties, DragEvent } from "react";

import { Icon } from "../../../components/ui/Icon";
import type { BookingStatus } from "../../../types/bookings";
import type { TeeSheetSlotDisplayStatus, TeeSheetSlotView } from "../../../types/tee-sheet";
import type { TeeSheetLockResponse } from "../../../types/tee-sheet-locks";
import {
  DRAG_PAYLOAD_MIME,
  type CellOccupant,
  type DragPayload,
  type ParticipantDragPayload,
  type SlotDropTarget,
} from "../dnd/types";
import { slotCapacity, timeKey } from "../sheet-shared";
import { isOptimisticBookingId } from "../use-create-walkin-booking";

// Subset of BookingStatus values that allow drag-out. Mirrors backend
// MOVEABLE_STATUSES in booking_move_service.py:50.
const MOVEABLE_BOOKING_STATUSES: ReadonlyArray<BookingStatus> = ["reserved", "checked_in"];

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
  // Slice 8b — drag-source coordinates. Populated only on `player`
  // cells; carries the booking_id + participant_id + status the page
  // needs to emit a participant-move payload.
  booking_id?: string;
  participant_id?: string;
  party_size?: number;
  booking_status?: BookingStatus;
}

export function buildPlayerCells(slot: TeeSheetSlotView): PlayerCellSpec[] {
  const capacity = slotCapacity(slot);
  const cells: PlayerCellSpec[] = [];
  for (const booking of slot.bookings) {
    const participants = booking.participants.length > 0
      ? booking.participants
      : Array.from({ length: booking.party_size }, (_, index) => ({
          id: `${booking.id}-p${index}`,
          display_name: `Player ${index + 1}`,
          participant_type: "guest" as const,
          is_primary: index === 0,
        }));
    for (const participant of participants) {
      if (cells.length >= capacity) break;
      cells.push({
        kind: "player",
        name: participant.display_name,
        cart: Boolean(booking.cart_flag),
        booking_id: booking.id,
        participant_id: participant.id,
        party_size: booking.party_size,
        booking_status: booking.status,
      });
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
  onDropOnSlot?: (
    target: SlotDropTarget,
    payload: DragPayload,
    occupant: CellOccupant | null,
  ) => void;
  // Slice 8b — participant drag source. When a filled player cell with a
  // moveable booking is dragged, the row emits a participant payload via
  // onParticipantDragStart, and clears via onParticipantDragEnd.
  onParticipantDragStart?: (payload: ParticipantDragPayload) => void;
  onParticipantDragEnd?: () => void;
  // Slice 9b — when another operator holds a lock on this slot, the
  // action column renders a non-interactive lock badge in place of the
  // more_vert button. Locks are advisory; the row remains a drop
  // target regardless.
  otherLock?: TeeSheetLockResponse | null;
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
  onParticipantDragStart,
  onParticipantDragEnd,
  otherLock = null,
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

  // Slice 8a/8b — drop-target eligibility & rejection.
  // - Waitlist payload: open cells only.
  // - Participant payload (cross-row): both open and filled cells.
  // - Participant payload (same-row): every cell is "reject" — visual
  //   short-circuit so the operator sees they can't drop here.
  const rowKey = timeKey(slot.local_time);
  const dropTarget: SlotDropTarget = {
    kind: "slot",
    slot_datetime: slot.slot_datetime,
    row_key: rowKey,
  };
  const sameRowDrag =
    dragPayload?.kind === "participant" && dragPayload.source_row_key === rowKey;
  const dropEnabled = !isBlocked && dragPayload !== null && onDropOnSlot !== undefined;
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
          {cells.map((cell, i) => {
            const dropMode = dropModeForCell(cell, dragPayload, dropEnabled, sameRowDrag);
            const isMoveable =
              cell.kind === "player" &&
              cell.booking_status !== undefined &&
              MOVEABLE_BOOKING_STATUSES.includes(cell.booking_status);
            return (
              <PlayerCell
                key={i}
                cell={cell}
                cellIndex={i}
                rowKey={rowKey}
                slotDatetime={slot.slot_datetime}
                dropMode={dropMode}
                isActiveDropTarget={isActiveDropTarget && dropMode !== "none"}
                dragLabel={dragLabelFor(dragPayload)}
                isMoveable={isMoveable}
                onDragEnter={() => onDragEnterSlot?.(dropTarget)}
                onDragLeave={() => onDragLeaveSlot?.(dropTarget)}
                onDrop={(payload, occupant) => {
                  // Same-row reject is handled inside the cell — it never
                  // calls onDrop. Defensive: cross-check at the row level.
                  if (
                    payload.kind === "participant" &&
                    payload.source_row_key === rowKey
                  ) {
                    return;
                  }
                  onDropOnSlot?.(dropTarget, payload, occupant);
                }}
                onParticipantDragStart={onParticipantDragStart}
                onParticipantDragEnd={onParticipantDragEnd}
              />
            );
          })}
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
      {otherLock ? (
        // Slice 9b — Annot #4: when another operator's lock is active,
        // their tile carries a small lock badge in place of the chevron.
        // Non-interactive; the title attribute carries the holder name
        // + remaining seconds for hover-reveal.
        <span
          aria-label={`Slot held by ${otherLock.holder_display_name}`}
          title={`${otherLock.holder_display_name} · ${otherLock.remaining_seconds}s remaining`}
          data-testid="row-other-lock-badge"
          data-holder-user-id={otherLock.holder_user_id}
          style={{
            width: 32,
            borderLeft: "1px solid var(--gl-border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--gl-radius-sm)",
              background: "color-mix(in oklab, var(--gl-state-atrisk) 8%, transparent)",
            }}
          >
            <Icon name="lock" size={12} color="var(--gl-state-atrisk)" />
          </span>
        </span>
      ) : (
        /* more_vert button: stopPropagation no-op stub. Phase 8 doesn't
           specify the menu contents (recon B.4-14 unresolved). Do not invent. */
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
      )}

      {/* coalesceWithPrevious passthrough acknowledgement — purely diagnostic, drives nothing visible */}
      <span style={{ display: "none" }} data-coalesce={coalesceWithPrevious ? "true" : "false"} />
    </div>
  );
}

// Drop mode per cell — the row decides; the cell renders accordingly.
//   "none"   — no active drag, or row is blocked.
//   "valid"  — drag is valid against this cell; renders the brand-dashed
//              drop visual on hover.
//   "reject" — drag is same-row (participant); renders the at-risk-toned
//              rejection visual on hover; drop is a no-op.
type CellDropMode = "none" | "valid" | "reject";

function dropModeForCell(
  cell: PlayerCellSpec,
  dragPayload: DragPayload | null,
  dropEnabled: boolean,
  sameRowDrag: boolean,
): CellDropMode {
  if (!dropEnabled || !dragPayload) return "none";
  if (sameRowDrag) return "reject";
  if (dragPayload.kind === "waitlist") {
    return cell.kind === "open" ? "valid" : "none";
  }
  // participant cross-row: open + filled cells are both targets.
  return "valid";
}

interface PlayerCellProps {
  cell: PlayerCellSpec;
  cellIndex: number;
  rowKey: string;
  slotDatetime: string;
  dropMode?: CellDropMode;
  isActiveDropTarget?: boolean;
  dragLabel?: string | null;
  isMoveable?: boolean;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDrop?: (payload: DragPayload, occupant: CellOccupant | null) => void;
  onParticipantDragStart?: (payload: ParticipantDragPayload) => void;
  onParticipantDragEnd?: () => void;
}

function PlayerCell({
  cell,
  cellIndex,
  rowKey,
  slotDatetime,
  dropMode = "none",
  isActiveDropTarget = false,
  dragLabel = null,
  isMoveable = false,
  onDragEnter,
  onDragLeave,
  onDrop,
  onParticipantDragStart,
  onParticipantDragEnd,
}: PlayerCellProps): JSX.Element {
  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (dropMode === "none") return;
    // For "reject" we still preventDefault so the browser doesn't bypass
    // our onDrop (which is itself a no-op for same-row).
    event.preventDefault();
    event.dataTransfer.dropEffect = dropMode === "valid" ? "move" : "none";
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>): void => {
    if (dropMode === "none") return;
    event.preventDefault();
    onDragEnter?.();
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (dropMode === "none") return;
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    onDragLeave?.();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (dropMode === "none") return;
    event.preventDefault();
    event.stopPropagation();
    if (dropMode === "reject") {
      // Same-row reject — drop is a no-op. The row-level handler also
      // double-guards (see TeeRow body) per ENGINEERING_STANDARDS §1
      // defence-in-depth.
      return;
    }
    if (!onDrop) return;
    const raw = event.dataTransfer.getData(DRAG_PAYLOAD_MIME);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as DragPayload;
      const occupant: CellOccupant | null =
        cell.kind === "player" &&
        cell.booking_id !== undefined &&
        cell.participant_id !== undefined &&
        cell.party_size !== undefined
          ? {
              booking_id: cell.booking_id,
              participant_id: cell.participant_id,
              display_name: cell.name ?? "Player",
              party_size: cell.party_size,
            }
          : null;
      onDrop(payload, occupant);
    } catch {
      // Malformed payload — ignore.
    }
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>): void => {
    if (
      !isMoveable ||
      cell.booking_id === undefined ||
      cell.participant_id === undefined ||
      cell.party_size === undefined
    ) {
      event.preventDefault();
      return;
    }
    const payload: ParticipantDragPayload = {
      kind: "participant",
      booking_id: cell.booking_id,
      participant_id: cell.participant_id,
      display_name: cell.name ?? "Player",
      party_size: cell.party_size,
      source_slot_datetime: slotDatetime,
      source_row_key: rowKey,
      source_cell_index: cellIndex,
    };
    event.dataTransfer.setData(DRAG_PAYLOAD_MIME, JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "move";
    event.currentTarget.setAttribute("data-dragging", "true");
    onParticipantDragStart?.(payload);
  };

  const handleDragEnd = (event: DragEvent<HTMLDivElement>): void => {
    event.currentTarget.removeAttribute("data-dragging");
    onParticipantDragEnd?.();
  };

  // ----- Active drop-target rendering (overrides the cell content) -----
  if (isActiveDropTarget && dragLabel !== null && dropMode === "valid") {
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

  if (isActiveDropTarget && dropMode === "reject") {
    return (
      <div
        data-testid="drop-target-reject"
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          ...cellStyleBase,
          border: "1px dashed var(--gl-state-atrisk)",
          borderLeft: "1px dashed var(--gl-state-atrisk)",
          background: "color-mix(in oklab, var(--gl-state-atrisk) 4%, transparent)",
          color: "var(--gl-text-secondary)",
          margin: "2px 2px 2px 0",
          borderRadius: "var(--gl-radius-xs)",
        }}
      >
        <Icon name="block" size={11} color="var(--gl-state-atrisk)" />
        <span className="gl-mono" style={{ fontSize: 10.5 }}>
          Same-row reorder not yet supported
        </span>
      </div>
    );
  }

  // ----- Default cell rendering (open vs filled) -----
  if (cell.kind === "open") {
    return (
      <div
        data-testid={dropMode === "valid" ? "drop-target-eligible" : undefined}
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
      draggable={isMoveable}
      onDragStart={isMoveable ? handleDragStart : undefined}
      onDragEnd={isMoveable ? handleDragEnd : undefined}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={cell.participant_id ? `player-cell-${cell.participant_id}` : undefined}
      data-dropmode={dropMode}
      data-moveable={isMoveable ? "true" : undefined}
      style={{
        ...cellStyleBase,
        background: "var(--gl-surface-raised)",
        cursor: isMoveable ? "grab" : "default",
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
