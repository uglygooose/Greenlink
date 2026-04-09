import { memo, type DragEvent } from "react";

import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import type {
  BookingParticipantType,
  BookingPaymentStatus,
  StartLane,
} from "../../types/bookings";
import type { BookingRuleAppliesTo } from "../../types/operations";
import type { TeeSheetSlotDisplayStatus, TeeSheetSlotView } from "../../types/tee-sheet";

export type Action = "cancel" | "check_in" | "complete" | "no_show";
export type QuickAction = Exclude<Action, "complete">;
export type LayoutMode = "classic" | "timeline";
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

export type SlotBookingSegment =
  | {
      booking: TeeSheetBookingView;
      kind: "booking";
      participantNames: string[];
      startColumn: number;
      span: number;
    }
  | {
      kind: "open";
      startColumn: number;
      span: number;
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

export function bookingParticipantNames(booking: TeeSheetBookingView): string[] {
  if (booking.participants.length > 0) {
    return booking.participants.map((participant) => participant.display_name);
  }
  return Array.from({ length: booking.party_size }, (_, index) => `Player ${index + 1}`);
}

export function slotBookingSegments(slot: TeeSheetSlotView): SlotBookingSegment[] {
  const capacity = slotCapacity(slot);
  const segments: SlotBookingSegment[] = [];
  let currentColumn = 1;

  for (const booking of slot.bookings) {
    const span = Math.min(Math.max(bookingPlayerCount(booking), 1), capacity - currentColumn + 1);
    if (span <= 0) break;
    segments.push({
      booking,
      kind: "booking",
      participantNames: bookingParticipantNames(booking),
      startColumn: currentColumn,
      span,
    });
    currentColumn += span;
  }

  if (currentColumn <= capacity) {
    segments.push({
      kind: "open",
      startColumn: currentColumn,
      span: capacity - currentColumn + 1,
    });
  }

  return segments;
}

export function bookingChipClass(
  booking: TeeSheetBookingView,
  compact = false,
): string {
  const base = compact
    ? "flex min-h-[2.75rem] w-full flex-col justify-between overflow-hidden rounded-[14px] px-2.5 py-2 text-left transition-all select-none"
    : "flex min-h-[3.5rem] w-full flex-col justify-between overflow-hidden rounded-[16px] px-3 py-2 text-left transition-all select-none";
  if (booking.status === "checked_in") {
    return `${base} cursor-pointer bg-secondary-container/70 hover:bg-secondary-container`;
  }
  if (booking.payment_status === "pending") {
    return `${base} cursor-pointer bg-primary-container/70 hover:bg-primary-container`;
  }
  return `${base} cursor-pointer bg-surface-container-low hover:bg-surface-container`;
}

function bookingDragHandleClass(compact = false): string {
  return [
    "inline-flex items-center gap-1 rounded-full border border-outline-variant/30 bg-white/80 px-2 py-1 text-slate-500 shadow-sm",
    compact ? "text-[9px]" : "text-[10px]",
  ].join(" ");
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

function bookingCoverageLabel(startColumn: number, span: number): string {
  if (span <= 1) return `P${startColumn}`;
  return `P${startColumn}-P${startColumn + span - 1}`;
}

function bookingSecondaryText(names: string[]): string | null {
  if (names.length <= 1) return null;
  if (names.length === 2) return names[1];
  return `${names[1]} +${names.length - 2} more`;
}

interface BookingCardContentProps {
  booking: TeeSheetBookingView;
  compact?: boolean;
  participantNames: string[];
  startColumn: number;
  span: number;
}

export const BookingCardContent = memo(function BookingCardContent({
  booking,
  compact = false,
  participantNames,
  startColumn,
  span,
}: BookingCardContentProps): JSX.Element {
  const primaryName = participantNames[0] ?? "Booking";
  const secondaryText = bookingSecondaryText(participantNames);
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-bold uppercase tracking-[0.18em] text-slate-400 ${compact ? "text-[8px]" : "text-[9px]"}`}>
          {bookingCoverageLabel(startColumn, span)}
        </span>
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
      </div>
      <div className="space-y-0.5">
        <p className={`truncate font-bold leading-none text-on-surface ${compact ? "text-[11px]" : "text-sm"}`}>{primaryName}</p>
        {secondaryText ? (
          <p className={`truncate text-slate-500 ${compact ? "text-[10px]" : "text-xs"}`}>{secondaryText}</p>
        ) : null}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={`text-slate-500 ${compact ? "text-[10px]" : "text-xs"}`}>
          {span}-player booking
        </span>
        <div className="flex items-center gap-1">
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
          <span className={bookingDragHandleClass(compact)} title="Drag to move booking">
            <MaterialSymbol className={compact ? "text-xs" : "text-sm"} icon="drag_indicator" />
            <span>Move</span>
          </span>
        </div>
      </div>
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
    previousProps.participantNames.join("|") === nextProps.participantNames.join("|") &&
    previousProps.startColumn === nextProps.startColumn &&
    previousProps.span === nextProps.span &&
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

interface OccupiedBookingCardProps {
  booking: TeeSheetBookingView;
  compact?: boolean;
  movingBookingId: string | null;
  onEndDrag: () => void;
  onOpenManage: (slot: LaneSlot) => void;
  onQuickAction: (action: QuickAction, bookingId: string) => void;
  onStartDrag: (event: DragEvent<HTMLElement>, bookingId: string, slot: LaneSlot) => void;
  participantNames: string[];
  pendingAction: Action | null;
  pendingBookingId: string | null;
  startColumn: number;
  span: number;
  slot: LaneSlot;
}

export const OccupiedBookingCard = memo(function OccupiedBookingCard({
  booking,
  compact = false,
  movingBookingId,
  onEndDrag,
  onOpenManage,
  onQuickAction,
  onStartDrag,
  participantNames,
  pendingAction,
  pendingBookingId,
  startColumn,
  span,
  slot,
}: OccupiedBookingCardProps): JSX.Element {
  return (
    <div className="relative group/chip">
      <button
        aria-label={`Open booking ${booking.id}`}
        className={[
          bookingChipClass(booking, compact),
          participantTypeBorderClass(bookingPrimaryType(booking)),
          movingBookingId === booking.id ? "opacity-50" : "",
          "w-full",
        ].join(" ")}
        draggable
        onClick={() => onOpenManage(slot)}
        onDragEnd={onEndDrag}
        onDragStart={(event) => onStartDrag(event, booking.id, slot)}
        title="Drag to move booking"
        type="button"
      >
        <BookingCardContent
          booking={booking}
          compact={compact}
          participantNames={participantNames}
          span={span}
          startColumn={startColumn}
        />
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
    previousProps.participantNames.join("|") === nextProps.participantNames.join("|") &&
    previousProps.startColumn === nextProps.startColumn &&
    previousProps.span === nextProps.span &&
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
  compact?: boolean;
  enabled: boolean;
  span?: number;
}

export const OpenPlayerSlotContent = memo(function OpenPlayerSlotContent({
  compact = false,
  enabled,
  span = 1,
}: OpenPlayerSlotContentProps): JSX.Element {
  return (
    <>
      <span className={`font-bold uppercase tracking-[0.18em] text-slate-400 ${compact ? "text-[8px]" : "text-[9px]"}`}>
        {span === 1 ? "Open" : `${span} Open`}
      </span>
      <span className={`truncate font-bold text-on-surface ${compact ? "text-[11px]" : "text-xs"}`}>
        {enabled ? (span === 1 ? "Available" : `${span} player spots`) : "Unavailable"}
      </span>
    </>
  );
}, (previousProps, nextProps) => (
  previousProps.span === nextProps.span &&
  previousProps.enabled === nextProps.enabled &&
  previousProps.compact === nextProps.compact
));

export function primaryType(value: BookingRuleAppliesTo): BookingParticipantType {
  return value === "staff" ? "staff" : "member";
}
