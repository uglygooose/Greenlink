import { memo, type DragEvent } from "react";

import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import type {
  BookingParticipantSummary,
  BookingParticipantType,
  BookingPaymentStatus,
  StartLane,
} from "../../types/bookings";
import type { BookingRuleAppliesTo } from "../../types/operations";
import type { TeeSheetSlotDisplayStatus, TeeSheetSlotView } from "../../types/tee-sheet";

export type Action = "cancel" | "check_in" | "complete" | "no_show";
export type QuickAction = Exclude<Action, "complete">;
export type LayoutMode = "classic" | "timeline";
export type TimelineDensity = "compact" | "comfortable";
export type TeeSheetBookingView = TeeSheetSlotView["bookings"][number];

export type LaneSlot = {
  colorCode: string | null;
  laneLabel: string;
  rowKey: string;
  rowLabel: string;
  slot: TeeSheetSlotView;
  startLane: StartLane | null;
  teeId: string | null;
};

export type TeeSheetBucket = {
  localTime: string;
  slotDatetime: string;
  slots: LaneSlot[];
};

export type SlotPlayerCell =
  | {
      booking: TeeSheetBookingView;
      column: number;
      kind: "occupied";
      participant: BookingParticipantSummary;
      primaryHandle: boolean;
    }
  | {
      column: number;
      kind: "empty";
    };

export const QUICK_ACTIONS: Array<{ action: QuickAction; icon: string; label: string }> = [
  { action: "check_in", icon: "how_to_reg", label: "Check In" },
  { action: "no_show", icon: "person_off", label: "No-Show" },
  { action: "cancel", icon: "event_busy", label: "Cancel" },
];

export function timeKey(value: string): string {
  return value.slice(0, 5);
}

export function clockMinutes(value: string): number {
  const [hoursText = "0", minutesText = "0"] = value.split(":");
  return Number.parseInt(hoursText, 10) * 60 + Number.parseInt(minutesText, 10);
}

export function nowTimeKey(timezone?: string | null): string {
  if (timezone) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const hours = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minutes = parts.find((part) => part.type === "minute")?.value ?? "00";
    return `${hours}:${minutes}`;
  }

  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function currentDateInTimezone(timezone?: string | null): string {
  if (timezone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value ?? "0000";
    const month = parts.find((part) => part.type === "month")?.value ?? "01";
    const day = parts.find((part) => part.type === "day")?.value ?? "01";
    return `${year}-${month}-${day}`;
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function laneLabel(value: StartLane | null): string {
  return value === "hole_10" ? "10th Tee" : "1st Tee";
}

export function laneOrder(value: StartLane | null): number {
  return value === "hole_10" ? 1 : 0;
}

export function statusLabel(value: TeeSheetSlotDisplayStatus): string {
  switch (value) {
    case "blocked":
      return "Blocked";
    case "reserved":
      return "Reserved";
    case "warning":
      return "Attention";
    case "indeterminate":
      return "Review";
    default:
      return "Open";
  }
}

export function statusClass(value: TeeSheetSlotDisplayStatus): string {
  switch (value) {
    case "available":
      return "bg-primary-container text-on-primary-container";
    case "blocked":
      return "bg-error-container text-on-error-container";
    case "reserved":
      return "bg-surface-container-high text-on-surface";
    case "warning":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-secondary-container text-on-secondary-container";
  }
}

export function paymentLabel(value: BookingPaymentStatus | null | undefined): string {
  return value ? value.replace("_", " ") : "unassigned";
}

export function bookingStatusIconName(value: TeeSheetBookingView["status"]): string {
  switch (value) {
    case "checked_in":
      return "check_circle";
    case "completed":
      return "task_alt";
    case "no_show":
      return "person_off";
    case "cancelled":
      return "cancel";
    default:
      return "radio_button_unchecked";
  }
}

export function bookingStatusIconClass(value: TeeSheetBookingView["status"]): string {
  switch (value) {
    case "checked_in":
      return "text-emerald-600";
    case "completed":
      return "text-slate-300";
    case "no_show":
      return "text-red-500";
    case "cancelled":
      return "text-slate-400";
    default:
      return "text-slate-400";
  }
}

export function bookingPrimaryType(booking: TeeSheetBookingView): BookingParticipantType | null {
  return (
    booking.participants.find((participant) => participant.is_primary)?.participant_type ??
    booking.participants[0]?.participant_type ??
    null
  );
}

export function participantTypeBorderClass(type: BookingParticipantType | null): string {
  switch (type) {
    case "member":
      return "border-l-[3px] border-l-blue-600";
    case "guest":
      return "border-l-[3px] border-l-amber-500";
    case "staff":
      return "border-l-[3px] border-l-slate-400";
    default:
      return "border-l-[3px] border-l-slate-200";
  }
}

export function paymentIcon(value: BookingPaymentStatus | null | undefined): string {
  switch (value) {
    case "paid":
      return "check_circle";
    case "pending":
      return "schedule";
    case "waived":
      return "remove_circle";
    case "complimentary":
      return "card_giftcard";
    default:
      return "help_outline";
  }
}

export function paymentIconClass(value: BookingPaymentStatus | null | undefined): string {
  switch (value) {
    case "paid":
      return "text-emerald-600";
    case "pending":
      return "text-amber-500";
    case "waived":
      return "text-slate-400";
    case "complimentary":
      return "text-secondary";
    default:
      return "text-slate-400";
  }
}

export function detail(slot: TeeSheetSlotView): string {
  return slot.blockers[0]?.reason ?? slot.unresolved_checks[0]?.reason ?? slot.warnings[0]?.message ?? "Open for booking";
}

export function slotCapacity(slot: TeeSheetSlotView): number {
  const value = slot.occupancy.player_capacity ?? 4;
  return Math.max(1, Math.min(value, 4));
}

export function bookingPlayerCount(booking: TeeSheetBookingView): number {
  return booking.participants.length > 0 ? booking.participants.length : booking.party_size;
}

export function slotPlayerCount(slot: TeeSheetSlotView): number {
  return slot.bookings.reduce((sum, booking) => sum + bookingPlayerCount(booking), 0);
}

export function slotRemainingCapacity(slot: TeeSheetSlotView): number {
  return Math.max(slotCapacity(slot) - slotPlayerCount(slot), 0);
}

export function slotPlayerCells(slot: TeeSheetSlotView): SlotPlayerCell[] {
  const capacity = slotCapacity(slot);
  const cells: SlotPlayerCell[] = [];
  for (const booking of slot.bookings) {
    const participants =
      booking.participants.length > 0
        ? booking.participants
        : Array.from({ length: booking.party_size }, (_, index) => ({
            display_name: `Player ${index + 1}`,
            participant_type: "guest" as const,
            is_primary: index === 0,
          }));
    participants.forEach((participant, index) => {
      if (cells.length < capacity) {
        cells.push({
          booking,
          column: cells.length + 1,
          kind: "occupied",
          participant,
          primaryHandle: index === 0,
        });
      }
    });
  }
  while (cells.length < capacity) {
    cells.push({ column: cells.length + 1, kind: "empty" });
  }
  return cells;
}

export function bookingChipClass(
  booking: TeeSheetBookingView,
  primaryHandle: boolean,
  compact = false,
): string {
  const base = compact
    ? "flex min-h-[2.75rem] w-full flex-col justify-between overflow-hidden rounded-[14px] px-2.5 py-2 text-left transition-all select-none"
    : "flex min-h-[3.5rem] w-full flex-col justify-between overflow-hidden rounded-[16px] px-3 py-2 text-left transition-all select-none";
  if (!primaryHandle) return `${base} cursor-grab bg-surface-container-low hover:bg-surface-container active:cursor-grabbing`;
  if (booking.status === "checked_in") {
    return `${base} cursor-grab bg-secondary-container/70 hover:bg-secondary-container active:cursor-grabbing`;
  }
  if (booking.payment_status === "pending") {
    return `${base} cursor-grab bg-primary-container/70 hover:bg-primary-container active:cursor-grabbing`;
  }
  return `${base} cursor-grab bg-surface-container-low hover:bg-surface-container active:cursor-grabbing`;
}

export function slotSummaryClass(slot: TeeSheetSlotView): string {
  if (slot.display_status === "blocked") return "bg-error-container text-on-error-container";
  if (slot.display_status === "warning") return "bg-amber-100 text-amber-800";
  if (slot.display_status === "reserved") return "bg-surface-container-high text-on-surface";
  return "bg-surface-container-low text-on-surface";
}

export function slotHasGolfDayControl(slot: TeeSheetSlotView): boolean {
  return Boolean(slot.state_flags.event_controlled || slot.state_flags.competition_controlled);
}

export function slotHasClosure(slot: TeeSheetSlotView): boolean {
  return Boolean(slot.display_status === "blocked" || slot.state_flags.manually_blocked || slot.state_flags.externally_unavailable);
}

export function slotIsOpen(slot: TeeSheetSlotView): boolean {
  return (
    slot.display_status === "available" &&
    (slot.occupancy.remaining_player_capacity ?? slotCapacity(slot)) > 0 &&
    !slotHasGolfDayControl(slot) &&
    !slotHasClosure(slot)
  );
}

export function canManage(slot: TeeSheetSlotView): boolean {
  return slot.bookings.length > 0;
}

export function canCreate(slot: TeeSheetSlotView): boolean {
  return slot.display_status !== "blocked" && slot.display_status !== "reserved" && slotRemainingCapacity(slot) > 0;
}

export function canDrop(slot: TeeSheetSlotView): boolean {
  return slot.display_status !== "blocked" && slot.display_status !== "reserved";
}

export function canQuickAction(booking: TeeSheetBookingView, action: QuickAction): boolean {
  if (action === "cancel") return booking.status === "reserved";
  if (action === "check_in") return booking.status === "reserved";
  return booking.status === "reserved";
}

export function quickActionTooltip(booking: TeeSheetBookingView, action: QuickAction, label: string): string {
  if (canQuickAction(booking, action)) return label;
  return `${label} unavailable for ${booking.status.replace(/_/g, " ")}`;
}

interface BookingChipContentProps {
  booking: TeeSheetBookingView;
  column: number;
  compact?: boolean;
  participant: BookingParticipantSummary;
  primaryHandle: boolean;
}

export const BookingChipContent = memo(function BookingChipContent({
  booking,
  column,
  compact = false,
  participant,
  primaryHandle,
}: BookingChipContentProps): JSX.Element {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1 font-bold uppercase tracking-[0.18em] text-slate-400 ${compact ? "text-[8px]" : "text-[9px]"}`}>
          <span>P{column}</span>
          {primaryHandle ? <MaterialSymbol className={compact ? "text-[10px]" : "text-[11px]"} icon="drag_indicator" /> : null}
        </span>
        {primaryHandle ? (
          <div className="flex items-center gap-1">
            <span title={booking.status.replace(/_/g, " ")}>
              <MaterialSymbol
                className={`${compact ? "text-xs" : "text-sm"} ${bookingStatusIconClass(booking.status)}`}
                icon={bookingStatusIconName(booking.status)}
              />
            </span>
            <span title={paymentLabel(booking.payment_status)}>
              <MaterialSymbol
                className={`${compact ? "text-xs" : "text-sm"} ${paymentIconClass(booking.payment_status)}`}
                icon={paymentIcon(booking.payment_status)}
              />
            </span>
          </div>
        ) : null}
      </div>
      <p className={`truncate font-bold leading-none text-on-surface ${compact ? "text-[11px]" : "text-xs"}`}>{participant.display_name}</p>
      {primaryHandle && (booking.cart_flag || booking.caddie_flag) ? (
        <div className="mt-0.5 flex items-center gap-1">
          {booking.cart_flag ? (
            <span title="Cart assigned">
              <MaterialSymbol className={compact ? "text-[10px] text-slate-400" : "text-[11px] text-slate-400"} icon="airport_shuttle" />
            </span>
          ) : null}
          {booking.caddie_flag ? (
            <span title="Caddie assigned">
              <MaterialSymbol className={compact ? "text-[10px] text-slate-400" : "text-[11px] text-slate-400"} icon="person" />
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}, (previousProps, nextProps) => {
  const previousPrimaryType = bookingPrimaryType(previousProps.booking);
  const nextPrimaryType = bookingPrimaryType(nextProps.booking);
  return (
    previousProps.booking.id === nextProps.booking.id &&
    previousProps.booking.status === nextProps.booking.status &&
    previousProps.booking.payment_status === nextProps.booking.payment_status &&
    previousProps.booking.cart_flag === nextProps.booking.cart_flag &&
    previousProps.booking.caddie_flag === nextProps.booking.caddie_flag &&
    previousPrimaryType === nextPrimaryType &&
    previousProps.participant.display_name === nextProps.participant.display_name &&
    previousProps.participant.participant_type === nextProps.participant.participant_type &&
    previousProps.participant.is_primary === nextProps.participant.is_primary &&
    previousProps.primaryHandle === nextProps.primaryHandle &&
    previousProps.column === nextProps.column &&
    previousProps.compact === nextProps.compact
  );
});

interface BookingQuickActionPanelProps {
  booking: TeeSheetBookingView;
  compact?: boolean;
  onQuickAction: (action: QuickAction, bookingId: string) => void;
  pendingAction: Action | null;
  pendingBookingId: string | null;
}

export const BookingQuickActionPanel = memo(function BookingQuickActionPanel({
  booking,
  compact = false,
  onQuickAction,
  pendingAction,
  pendingBookingId,
}: BookingQuickActionPanelProps): JSX.Element {
  return (
    <div className="pointer-events-none absolute right-1 top-1 z-10 flex gap-1 opacity-0 transition-opacity group-hover/chip:pointer-events-auto group-hover/chip:opacity-100 group-focus-within/chip:pointer-events-auto group-focus-within/chip:opacity-100">
      {QUICK_ACTIONS.map((quickAction) => {
        const disabled = !canQuickAction(booking, quickAction.action) || pendingBookingId === booking.id;
        const isPending = pendingBookingId === booking.id && pendingAction === quickAction.action;
        return (
          <button
            aria-label={`${quickAction.label} booking ${booking.id}`}
            className={`rounded-full border border-white/70 bg-white/95 text-slate-600 shadow-sm transition-colors ${
              compact ? "p-1" : "p-1.5"
            } ${disabled ? "cursor-not-allowed opacity-50" : "hover:bg-slate-50 hover:text-slate-900"}`}
            disabled={disabled}
            key={`${booking.id}-${quickAction.action}`}
            onClick={(event) => {
              event.stopPropagation();
              if (disabled) return;
              onQuickAction(quickAction.action, booking.id);
            }}
            title={quickActionTooltip(booking, quickAction.action, quickAction.label)}
            type="button"
          >
            <MaterialSymbol className={compact ? "text-xs" : "text-sm"} icon={isPending ? "progress_activity" : quickAction.icon} />
          </button>
        );
      })}
    </div>
  );
}, (previousProps, nextProps) => (
  previousProps.booking.id === nextProps.booking.id &&
  previousProps.booking.status === nextProps.booking.status &&
  previousProps.pendingBookingId === nextProps.pendingBookingId &&
  previousProps.pendingAction === nextProps.pendingAction &&
  previousProps.onQuickAction === nextProps.onQuickAction &&
  previousProps.compact === nextProps.compact
));

interface OccupiedBookingCellProps {
  booking: TeeSheetBookingView;
  column: number;
  compact?: boolean;
  movingBookingId: string | null;
  onEndDrag: () => void;
  onOpenManage: (slot: LaneSlot) => void;
  onQuickAction: (action: QuickAction, bookingId: string) => void;
  onStartDrag: (event: DragEvent<HTMLElement>, bookingId: string, slot: LaneSlot) => void;
  participant: BookingParticipantSummary;
  pendingAction: Action | null;
  pendingBookingId: string | null;
  primaryHandle: boolean;
  slot: LaneSlot;
}

export const OccupiedBookingCell = memo(function OccupiedBookingCell({
  booking,
  column,
  compact = false,
  movingBookingId,
  onEndDrag,
  onOpenManage,
  onQuickAction,
  onStartDrag,
  participant,
  pendingAction,
  pendingBookingId,
  primaryHandle,
  slot,
}: OccupiedBookingCellProps): JSX.Element {
  return (
    <div className="relative group/chip">
      <button
        aria-label={primaryHandle ? `Open booking ${booking.id}` : `Open participant ${participant.display_name}`}
        className={[
          bookingChipClass(booking, primaryHandle, compact),
          participantTypeBorderClass(bookingPrimaryType(booking)),
          movingBookingId === booking.id ? "opacity-50" : "",
        ].join(" ")}
        draggable
        onClick={() => onOpenManage(slot)}
        onDragEnd={onEndDrag}
        onDragStart={(event) => onStartDrag(event, booking.id, slot)}
        type="button"
      >
        <BookingChipContent booking={booking} column={column} compact={compact} participant={participant} primaryHandle={primaryHandle} />
      </button>
      <BookingQuickActionPanel
        booking={booking}
        compact={compact}
        onQuickAction={onQuickAction}
        pendingAction={pendingAction}
        pendingBookingId={pendingBookingId}
      />
    </div>
  );
}, (previousProps, nextProps) => {
  const previousPrimaryType = bookingPrimaryType(previousProps.booking);
  const nextPrimaryType = bookingPrimaryType(nextProps.booking);
  return (
    previousProps.booking.id === nextProps.booking.id &&
    previousProps.booking.status === nextProps.booking.status &&
    previousProps.booking.payment_status === nextProps.booking.payment_status &&
    previousProps.booking.cart_flag === nextProps.booking.cart_flag &&
    previousProps.booking.caddie_flag === nextProps.booking.caddie_flag &&
    previousPrimaryType === nextPrimaryType &&
    previousProps.participant.display_name === nextProps.participant.display_name &&
    previousProps.participant.participant_type === nextProps.participant.participant_type &&
    previousProps.participant.is_primary === nextProps.participant.is_primary &&
    previousProps.primaryHandle === nextProps.primaryHandle &&
    previousProps.column === nextProps.column &&
    previousProps.movingBookingId === nextProps.movingBookingId &&
    previousProps.pendingBookingId === nextProps.pendingBookingId &&
    previousProps.pendingAction === nextProps.pendingAction &&
    previousProps.slot.rowKey === nextProps.slot.rowKey &&
    previousProps.slot.slot.slot_datetime === nextProps.slot.slot.slot_datetime &&
    previousProps.onEndDrag === nextProps.onEndDrag &&
    previousProps.onOpenManage === nextProps.onOpenManage &&
    previousProps.onQuickAction === nextProps.onQuickAction &&
    previousProps.onStartDrag === nextProps.onStartDrag &&
    previousProps.compact === nextProps.compact
  );
});

interface OpenPlayerSlotContentProps {
  column: number;
  compact?: boolean;
  enabled: boolean;
}

export const OpenPlayerSlotContent = memo(function OpenPlayerSlotContent({
  column,
  compact = false,
  enabled,
}: OpenPlayerSlotContentProps): JSX.Element {
  return (
    <>
      <span className={`font-bold uppercase tracking-[0.18em] text-slate-400 ${compact ? "text-[8px]" : "text-[9px]"}`}>P{column}</span>
      <span className={`truncate font-bold text-on-surface ${compact ? "text-[11px]" : "text-xs"}`}>{enabled ? "Open" : "Unavailable"}</span>
    </>
  );
}, (previousProps, nextProps) => (
  previousProps.column === nextProps.column &&
  previousProps.enabled === nextProps.enabled &&
  previousProps.compact === nextProps.compact
));

export function primaryType(value: BookingRuleAppliesTo): BookingParticipantType {
  return value === "staff" ? "staff" : "member";
}
