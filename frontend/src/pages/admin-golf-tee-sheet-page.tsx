import { useMutation, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";

import {
  cancelBooking,
  checkInBooking,
  completeBooking,
  createBooking,
  markBookingNoShow,
  moveBooking,
  updateBooking,
} from "../api/operations";
import { ApiError } from "../api/client";
import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useCoursesQuery, useTeesQuery } from "../features/golf-settings/hooks";
import { useClubDirectoryQuery } from "../features/people/hooks";
import { BookingCreateDrawer } from "../features/tee-sheet/booking-create-drawer";
import { BookingManagementDrawer } from "../features/tee-sheet/booking-management-drawer";
import type { DraftParticipant } from "../features/tee-sheet/booking-party-editor";
import { DatePickerPopover } from "../features/tee-sheet/date-picker-popover";
import { teeSheetDayQueryOptions, teeSheetKeys, useTeeSheetDayQuery } from "../features/tee-sheet/hooks";
import { TeeSheetSwimLaneGrid } from "../features/tee-sheet/tee-sheet-swimlane-grid";
import type { LayoutMode, TimelineDensity } from "../features/tee-sheet/sheet-shared";
import { useSession } from "../session/session-context";
import type {
  BookingCreateInput,
  BookingCreateParticipantInput,
  BookingCreateResult,
  BookingLifecycleMutationResult,
  BookingParticipantSummary,
  BookingParticipantType,
  BookingPaymentStatus,
  BookingSummary,
  BookingUpdateInput,
  BookingUpdateResult,
  StartLane,
} from "../types/bookings";
import type { BookingRuleAppliesTo, Tee } from "../types/operations";
import type { TeeSheetDayResponse, TeeSheetSlotDisplayStatus, TeeSheetSlotView } from "../types/tee-sheet";


type Action = "cancel" | "check_in" | "complete" | "no_show";
type QuickAction = Exclude<Action, "complete">;
type DrawerMode = "create" | "manage";
type Notice = { message: string; tone: "success" | "info" | "error" };
type SelectedSlotKey = { rowKey: string; slotDatetime: string };
type Dragged = { bookingId: string; rowKey: string; slotDatetime: string };
type TeeSheetBookingView = TeeSheetSlotView["bookings"][number];
type ViewFilter = "all" | "closed" | "golf_day" | "open" | "unpaid";
type LaneSlot = {
  colorCode: string | null;
  laneLabel: string;
  rowKey: string;
  rowLabel: string;
  slot: TeeSheetSlotView;
  startLane: StartLane | null;
  teeId: string | null;
};
type SlotPlayerCell =
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

const COPY: Record<Action, { already: string; blocked: string; success: string }> = {
  cancel: {
    already: "Booking was already cancelled. Tee sheet refreshed from backend state.",
    blocked: "Cancellation blocked.",
    success: "Booking cancelled. Tee sheet refreshed from backend state.",
  },
  check_in: {
    already: "Booking was already checked in. Tee sheet refreshed from backend state.",
    blocked: "Check-in blocked.",
    success: "Booking checked in. Tee sheet refreshed from backend state.",
  },
  complete: {
    already: "Booking was already completed. Tee sheet refreshed from backend state.",
    blocked: "Completion blocked.",
    success: "Booking completed. Tee sheet refreshed from backend state.",
  },
  no_show: {
    already: "Booking was already marked no-show. Tee sheet refreshed from backend state.",
    blocked: "No-show blocked.",
    success: "Booking marked no-show. Tee sheet refreshed from backend state.",
  },
};

const VIEW_FILTERS: Array<{ label: string; value: ViewFilter }> = [
  { label: "All", value: "all" },
  { label: "Unpaid", value: "unpaid" },
  { label: "Open Slots", value: "open" },
  { label: "Golf Day", value: "golf_day" },
  { label: "Closed / Holds", value: "closed" },
];

// 5.5: Compound filter state — replaces the single ViewFilter.
type ParticipantTypeFilter = BookingParticipantType | "all";
type PartySize = 1 | 2 | 3 | 4 | "any";

type TeeSheetFilterState = {
  viewFilter: ViewFilter;
  participantType: ParticipantTypeFilter;
  partySize: PartySize;
  timeFrom: string | null; // "HH:MM"
  timeTo: string | null;   // "HH:MM"
};

const DEFAULT_FILTERS: TeeSheetFilterState = {
  viewFilter: "all",
  participantType: "all",
  partySize: "any",
  timeFrom: null,
  timeTo: null,
};

const PARTICIPANT_TYPE_FILTERS: Array<{ label: string; value: ParticipantTypeFilter }> = [
  { label: "All", value: "all" },
  { label: "Member", value: "member" },
  { label: "Guest", value: "guest" },
  { label: "Staff", value: "staff" },
];

const PARTY_SIZE_FILTERS: Array<{ label: string; value: PartySize }> = [
  { label: "Any", value: "any" },
  { label: "1", value: 1 },
  { label: "2-ball", value: 2 },
  { label: "3-ball", value: 3 },
  { label: "4-ball", value: 4 },
];

const QUICK_ACTIONS: Array<{ action: QuickAction; icon: string; label: string }> = [
  { action: "check_in", icon: "how_to_reg", label: "Check In" },
  { action: "no_show", icon: "person_off", label: "No-Show" },
  { action: "cancel", icon: "event_busy", label: "Cancel" },
];

const LIFECYCLE_TRANSITIONS: Record<Action, { from: TeeSheetBookingView["status"]; to: TeeSheetBookingView["status"] }> = {
  cancel: { from: "reserved", to: "cancelled" },
  check_in: { from: "reserved", to: "checked_in" },
  complete: { from: "checked_in", to: "completed" },
  no_show: { from: "reserved", to: "no_show" },
};

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function todayValue(): string {
  return localDateString(new Date());
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

function timeKey(value: string): string {
  return value.slice(0, 5);
}

function clockMinutes(value: string): number {
  const [hoursText = "0", minutesText = "0"] = value.split(":");
  return Number.parseInt(hoursText, 10) * 60 + Number.parseInt(minutesText, 10);
}

function nowTimeKey(timezone?: string | null): string {
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

export function nearestBucketTime(
  buckets: Array<{ localTime: string }>,
  timezone?: string | null,
): string | null {
  if (buckets.length === 0) return null;

  const targetMinutes = clockMinutes(nowTimeKey(timezone));
  let nearest = timeKey(buckets[0].localTime);
  let nearestDistance = Math.abs(clockMinutes(nearest) - targetMinutes);

  for (const bucket of buckets.slice(1)) {
    const candidate = timeKey(bucket.localTime);
    const candidateDistance = Math.abs(clockMinutes(candidate) - targetMinutes);
    if (candidateDistance < nearestDistance) {
      nearest = candidate;
      nearestDistance = candidateDistance;
    }
  }

  return nearest;
}

function laneLabel(value: StartLane | null): string {
  return value === "hole_10" ? "10th Tee" : "1st Tee";
}

function laneOrder(value: StartLane | null): number {
  return value === "hole_10" ? 1 : 0;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function asMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "Request failed";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target.isContentEditable;
}

function canQuickAction(booking: TeeSheetBookingView, action: QuickAction): boolean {
  if (action === "cancel") return booking.status === "reserved";
  if (action === "check_in") return booking.status === "reserved";
  return booking.status === "reserved";
}

function quickActionTooltip(booking: TeeSheetBookingView, action: QuickAction, label: string): string {
  if (canQuickAction(booking, action)) return label;
  return `${label} unavailable for ${booking.status.replace(/_/g, " ")}`;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
}

function statusLabel(value: TeeSheetSlotDisplayStatus): string {
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

function statusClass(value: TeeSheetSlotDisplayStatus): string {
  switch (value) {
    case "available":
      return "bg-primary-container text-on-primary-container";
    case "blocked":
      // Full opacity — must be unmistakable at a glance (2.5).
      return "bg-error-container text-on-error-container";
    case "reserved":
      return "bg-surface-container-high text-on-surface";
    case "warning":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-secondary-container text-on-secondary-container";
  }
}

function paymentLabel(value: BookingPaymentStatus | null | undefined): string {
  return value ? value.replace("_", " ") : "unassigned";
}

// Booking lifecycle status — icon-only channel (2.2).
// Text label kept only for tooltip / accessibility title.
function bookingStatusIconName(value: TeeSheetBookingView["status"]): string {
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

function bookingStatusIconClass(value: TeeSheetBookingView["status"]): string {
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

// Booking type — left-border colour channel (2.1).
// Uses the primary participant's type so the colour is consistent across all
// cells of the same booking.
// Returns the participant type of the booking's primary player.
// Resolution order:
//   1. First participant explicitly flagged is_primary === true
//   2. First participant in the array (position 0) — covers cases where the
//      is_primary flag was not set or is malformed
//   3. null — no usable participant data at all (renders a neutral border so
//      staff are not misled into thinking a booking is a specific type)
function bookingPrimaryType(booking: TeeSheetBookingView): BookingParticipantType | null {
  return (
    booking.participants.find((p) => p.is_primary)?.participant_type ??
    booking.participants[0]?.participant_type ??
    null
  );
}

function participantTypeBorderClass(type: BookingParticipantType | null): string {
  switch (type) {
    case "member":
      return "border-l-[3px] border-l-blue-600";
    case "guest":
      return "border-l-[3px] border-l-amber-500";
    case "staff":
      return "border-l-[3px] border-l-slate-400";
    default:
      // null or unknown — very light neutral; signals "type indeterminate"
      // without asserting a specific category.
      return "border-l-[3px] border-l-slate-200";
  }
}

// Payment status icon — distinct visual channel from booking status so the two
// cannot be confused when both appear on the same chip.
function paymentIcon(value: BookingPaymentStatus | null | undefined): string {
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

function paymentIconClass(value: BookingPaymentStatus | null | undefined): string {
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

function detail(slot: TeeSheetSlotView): string {
  return slot.blockers[0]?.reason ?? slot.unresolved_checks[0]?.reason ?? slot.warnings[0]?.message ?? "Open for booking";
}

function slotCapacity(slot: TeeSheetSlotView): number {
  const value = slot.occupancy.player_capacity ?? 4;
  return Math.max(1, Math.min(value, 4));
}

function bookingPlayerCount(booking: TeeSheetBookingView): number {
  return booking.participants.length > 0 ? booking.participants.length : booking.party_size;
}

function slotPlayerCount(slot: TeeSheetSlotView): number {
  return slot.bookings.reduce((sum, booking) => sum + bookingPlayerCount(booking), 0);
}

function slotRemainingCapacity(slot: TeeSheetSlotView): number {
  return Math.max(slotCapacity(slot) - slotPlayerCount(slot), 0);
}

function slotPlayerCells(slot: TeeSheetSlotView): SlotPlayerCell[] {
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

function participantTypeLabel(value: BookingParticipantType): string {
  switch (value) {
    case "staff":
      return "Staff";
    case "guest":
      return "Guest";
    default:
      return "Member";
  }
}

function bookingChipClass(booking: TeeSheetBookingView, primaryHandle: boolean): string {
  const base = "flex min-h-[3.5rem] w-full flex-col justify-between overflow-hidden rounded-[16px] px-3 py-2 text-left transition-all select-none";
  if (!primaryHandle) return `${base} cursor-grab bg-surface-container-low hover:bg-surface-container active:cursor-grabbing`;
  if (booking.status === "checked_in") {
    return `${base} cursor-grab bg-secondary-container/70 hover:bg-secondary-container active:cursor-grabbing`;
  }
  if (booking.payment_status === "pending") {
    return `${base} cursor-grab bg-primary-container/70 hover:bg-primary-container active:cursor-grabbing`;
  }
  return `${base} cursor-grab bg-surface-container-low hover:bg-surface-container active:cursor-grabbing`;
}

function slotSummaryClass(slot: TeeSheetSlotView): string {
  // Full opacity for blocked — same as statusClass change (2.5).
  if (slot.display_status === "blocked") return "bg-error-container text-on-error-container";
  if (slot.display_status === "warning") return "bg-amber-100 text-amber-800";
  if (slot.display_status === "reserved") return "bg-surface-container-high text-on-surface";
  return "bg-surface-container-low text-on-surface";
}

function slotHasGolfDayControl(slot: TeeSheetSlotView): boolean {
  return Boolean(slot.state_flags.event_controlled || slot.state_flags.competition_controlled);
}

function slotHasClosure(slot: TeeSheetSlotView): boolean {
  return Boolean(slot.display_status === "blocked" || slot.state_flags.manually_blocked || slot.state_flags.externally_unavailable);
}

function slotIsOpen(slot: TeeSheetSlotView): boolean {
  return (
    slot.display_status === "available" &&
    (slot.occupancy.remaining_player_capacity ?? slotCapacity(slot)) > 0 &&
    !slotHasGolfDayControl(slot) &&
    !slotHasClosure(slot)
  );
}

function slotMatchesSearch(slot: LaneSlot, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const participantText = slot.slot.bookings
    .flatMap((booking) => booking.participants.map((participant) => participant.display_name))
    .join(" ")
    .toLowerCase();
  const metadata = `${slot.rowLabel} ${slot.laneLabel} ${slot.slot.local_time.slice(0, 5)}`.toLowerCase();
  return participantText.includes(query) || metadata.includes(query);
}

function slotMatchesFilter(slot: TeeSheetSlotView, filter: ViewFilter): boolean {
  switch (filter) {
    case "unpaid":
      return slot.bookings.some((booking) => booking.payment_status === "pending");
    case "open":
      return slotIsOpen(slot);
    case "golf_day":
      return slotHasGolfDayControl(slot);
    case "closed":
      return slotHasClosure(slot) || slotHasGolfDayControl(slot);
    default:
      return true;
  }
}

// 5.1: Filter by primary participant type of any booking in the slot.
function slotMatchesParticipantType(slot: TeeSheetSlotView, participantType: ParticipantTypeFilter): boolean {
  if (participantType === "all") return true;
  return slot.bookings.some((b) => bookingPrimaryType(b) === participantType);
}

// 5.3: Filter by number of players in any booking in the slot.
function slotMatchesPartySize(slot: TeeSheetSlotView, partySize: PartySize): boolean {
  if (partySize === "any") return true;
  return slot.bookings.some((b) => bookingPlayerCount(b) === partySize);
}

// 5.2: Filter by time range using the slot's local time (HH:MM).
function slotMatchesTimeRange(slot: TeeSheetSlotView, timeFrom: string | null, timeTo: string | null): boolean {
  if (!timeFrom && !timeTo) return true;
  const slotMinutes = clockMinutes(slot.local_time.slice(0, 5));
  if (timeFrom && clockMinutes(timeFrom) > slotMinutes) return false;
  if (timeTo && clockMinutes(timeTo) < slotMinutes) return false;
  return true;
}

// 5.5: Compound filter — all individual dimensions must pass.
function slotMatchesFilters(slot: TeeSheetSlotView, f: TeeSheetFilterState): boolean {
  return (
    slotMatchesFilter(slot, f.viewFilter) &&
    slotMatchesParticipantType(slot, f.participantType) &&
    slotMatchesPartySize(slot, f.partySize) &&
    slotMatchesTimeRange(slot, f.timeFrom, f.timeTo)
  );
}

function updateSlotFromBookings(slot: TeeSheetSlotView, bookings: TeeSheetBookingView[]): TeeSheetSlotView {
  const playerCapacity = slot.occupancy.player_capacity ?? 4;
  const memberCount = bookings.reduce(
    (sum, booking) => sum + booking.participants.filter((participant) => participant.participant_type === "member").length,
    0,
  );
  const guestCount = bookings.reduce(
    (sum, booking) => sum + booking.participants.filter((participant) => participant.participant_type === "guest").length,
    0,
  );
  const staffCount = bookings.reduce(
    (sum, booking) => sum + booking.participants.filter((participant) => participant.participant_type === "staff").length,
    0,
  );
  const reservedPlayers = bookings
    .filter((booking) => booking.status === "reserved")
    .reduce((sum, booking) => sum + bookingPlayerCount(booking), 0);
  const checkedInPlayers = bookings
    .filter((booking) => booking.status === "checked_in")
    .reduce((sum, booking) => sum + bookingPlayerCount(booking), 0);
  const reservedBookings = bookings.filter((booking) => booking.status === "reserved").length;
  const confirmedBookings = bookings.filter((booking) => booking.status === "checked_in").length;
  return {
    ...slot,
    bookings,
    occupancy: {
      ...slot.occupancy,
      occupied_player_count: checkedInPlayers,
      reserved_player_count: reservedPlayers,
      confirmed_booking_count: confirmedBookings,
      reserved_booking_count: reservedBookings,
      remaining_player_capacity:
        playerCapacity == null ? slot.occupancy.remaining_player_capacity : Math.max(playerCapacity - checkedInPlayers - reservedPlayers, 0),
    },
    party_summary: {
      ...slot.party_summary,
      member_count: memberCount,
      guest_count: guestCount,
      staff_count: staffCount,
      total_players: memberCount + guestCount + staffCount,
      has_activity: memberCount + guestCount + staffCount > 0,
    },
  };
}

function optimisticallyMoveBooking(
  day: TeeSheetDayResponse | undefined,
  bookingId: string,
  target: LaneSlot,
): TeeSheetDayResponse | undefined {
  if (!day) return day;
  let bookingToMove: TeeSheetBookingView | null = null;
  for (const row of day.rows) {
    for (const slot of row.slots) {
      const booking = slot.bookings.find((entry) => entry.id === bookingId);
      if (booking) {
        bookingToMove = {
          ...booking,
          slot_datetime: target.slot.slot_datetime,
          start_lane: target.startLane,
        };
      }
    }
  }
  if (!bookingToMove) return day;

  return {
    ...day,
    rows: day.rows.map((row) => ({
      ...row,
      slots: row.slots.map((slot) => {
        const isSource = slot.bookings.some((booking) => booking.id === bookingId);
        const isTarget = row.row_key === target.rowKey && slot.slot_datetime === target.slot.slot_datetime;
        if (!isSource && !isTarget) return slot;
        let nextBookings = slot.bookings.filter((booking) => booking.id !== bookingId);
        if (isTarget) nextBookings = [...nextBookings, bookingToMove as TeeSheetBookingView];
        return updateSlotFromBookings(slot, nextBookings);
      }),
    })),
  };
}

export function optimisticallyTransitionBooking(
  day: TeeSheetDayResponse | undefined,
  bookingId: string,
  action: Action,
): TeeSheetDayResponse | undefined {
  if (!day) return day;

  const transition = LIFECYCLE_TRANSITIONS[action];
  let changed = false;
  const nextRows = day.rows.map((row) => ({
    ...row,
    slots: row.slots.map((slot) => {
      if (!slot.bookings.some((booking) => booking.id === bookingId)) return slot;
      const nextBookings = slot.bookings.map((booking) => {
        if (booking.id !== bookingId || booking.status !== transition.from) return booking;
        changed = true;
        return { ...booking, status: transition.to };
      });
      return changed ? updateSlotFromBookings(slot, nextBookings) : slot;
    }),
  }));

  return changed ? { ...day, rows: nextRows } : day;
}

function canManage(slot: TeeSheetSlotView): boolean {
  return slot.bookings.length > 0;
}

function canCreate(slot: TeeSheetSlotView): boolean {
  return slot.display_status !== "blocked" && slot.display_status !== "reserved" && slotRemainingCapacity(slot) > 0;
}

function canDrop(slot: TeeSheetSlotView): boolean {
  return slot.display_status !== "blocked" && slot.display_status !== "reserved";
}

interface OccupiedBookingCellProps {
  booking: TeeSheetBookingView;
  column: number;
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

const OccupiedBookingCell = memo(function OccupiedBookingCell({
  booking,
  column,
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
          bookingChipClass(booking, primaryHandle),
          participantTypeBorderClass(bookingPrimaryType(booking)),
          movingBookingId === booking.id ? "opacity-50" : "",
        ].join(" ")}
        draggable
        onClick={() => onOpenManage(slot)}
        onDragEnd={onEndDrag}
        onDragStart={(event) => onStartDrag(event, booking.id, slot)}
        type="button"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
            <span>P{column}</span>
            {primaryHandle ? <MaterialSymbol className="text-[11px]" icon="drag_indicator" /> : null}
          </span>
          {primaryHandle ? (
            <div className="flex items-center gap-1">
              <span title={booking.status.replace(/_/g, " ")}>
                <MaterialSymbol
                  className={`text-sm ${bookingStatusIconClass(booking.status)}`}
                  icon={bookingStatusIconName(booking.status)}
                />
              </span>
              <span title={paymentLabel(booking.payment_status)}>
                <MaterialSymbol
                  className={`text-sm ${paymentIconClass(booking.payment_status)}`}
                  icon={paymentIcon(booking.payment_status)}
                />
              </span>
            </div>
          ) : null}
        </div>
        <p className="truncate text-xs font-bold leading-none text-on-surface">{participant.display_name}</p>
        {primaryHandle && (booking.cart_flag || booking.caddie_flag) ? (
          <div className="mt-0.5 flex items-center gap-1">
            {booking.cart_flag ? (
              <span title="Cart assigned">
                <MaterialSymbol className="text-[11px] text-slate-400" icon="airport_shuttle" />
              </span>
            ) : null}
            {booking.caddie_flag ? (
              <span title="Caddie assigned">
                <MaterialSymbol className="text-[11px] text-slate-400" icon="person" />
              </span>
            ) : null}
          </div>
        ) : null}
      </button>
      <div className="pointer-events-none absolute right-1 top-1 z-10 flex gap-1 opacity-0 transition-opacity group-hover/chip:pointer-events-auto group-hover/chip:opacity-100 group-focus-within/chip:pointer-events-auto group-focus-within/chip:opacity-100">
        {QUICK_ACTIONS.map((quickAction) => {
          const disabled = !canQuickAction(booking, quickAction.action) || pendingBookingId === booking.id;
          const isPending = pendingBookingId === booking.id && pendingAction === quickAction.action;
          return (
            <button
              aria-label={`${quickAction.label} booking ${booking.id}`}
              className={`rounded-full border border-white/70 bg-white/95 p-1.5 text-slate-600 shadow-sm transition-colors ${
                disabled ? "cursor-not-allowed opacity-50" : "hover:bg-slate-50 hover:text-slate-900"
              }`}
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
              <MaterialSymbol className="text-sm" icon={isPending ? "progress_activity" : quickAction.icon} />
            </button>
          );
        })}
      </div>
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
    previousProps.onStartDrag === nextProps.onStartDrag
  );
});

interface BookingChipContentProps {
  booking: TeeSheetBookingView;
  column: number;
  participant: BookingParticipantSummary;
  primaryHandle: boolean;
}

const BookingChipContent = memo(function BookingChipContent({
  booking,
  column,
  participant,
  primaryHandle,
}: BookingChipContentProps): JSX.Element {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
          <span>P{column}</span>
          {primaryHandle ? <MaterialSymbol className="text-[11px]" icon="drag_indicator" /> : null}
        </span>
        {primaryHandle ? (
          <div className="flex items-center gap-1">
            <span title={booking.status.replace(/_/g, " ")}>
              <MaterialSymbol
                className={`text-sm ${bookingStatusIconClass(booking.status)}`}
                icon={bookingStatusIconName(booking.status)}
              />
            </span>
            <span title={paymentLabel(booking.payment_status)}>
              <MaterialSymbol
                className={`text-sm ${paymentIconClass(booking.payment_status)}`}
                icon={paymentIcon(booking.payment_status)}
              />
            </span>
          </div>
        ) : null}
      </div>
      <p className="truncate text-xs font-bold leading-none text-on-surface">{participant.display_name}</p>
      {primaryHandle && (booking.cart_flag || booking.caddie_flag) ? (
        <div className="mt-0.5 flex items-center gap-1">
          {booking.cart_flag ? (
            <span title="Cart assigned">
              <MaterialSymbol className="text-[11px] text-slate-400" icon="airport_shuttle" />
            </span>
          ) : null}
          {booking.caddie_flag ? (
            <span title="Caddie assigned">
              <MaterialSymbol className="text-[11px] text-slate-400" icon="person" />
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
    previousProps.column === nextProps.column
  );
});

interface BookingQuickActionPanelProps {
  booking: TeeSheetBookingView;
  onQuickAction: (action: QuickAction, bookingId: string) => void;
  pendingAction: Action | null;
  pendingBookingId: string | null;
}

const BookingQuickActionPanel = memo(function BookingQuickActionPanel({
  booking,
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
            className={`rounded-full border border-white/70 bg-white/95 p-1.5 text-slate-600 shadow-sm transition-colors ${
              disabled ? "cursor-not-allowed opacity-50" : "hover:bg-slate-50 hover:text-slate-900"
            }`}
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
            <MaterialSymbol className="text-sm" icon={isPending ? "progress_activity" : quickAction.icon} />
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
  previousProps.onQuickAction === nextProps.onQuickAction
));

interface OpenPlayerSlotContentProps {
  column: number;
  enabled: boolean;
}

const OpenPlayerSlotContent = memo(function OpenPlayerSlotContent({
  column,
  enabled,
}: OpenPlayerSlotContentProps): JSX.Element {
  return (
    <>
      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">P{column}</span>
      <span className="truncate text-xs font-bold text-on-surface">{enabled ? "Open" : "Unavailable"}</span>
    </>
  );
}, (previousProps, nextProps) => (
  previousProps.column === nextProps.column &&
  previousProps.enabled === nextProps.enabled
));

function primaryType(value: BookingRuleAppliesTo): BookingParticipantType {
  return value === "staff" ? "staff" : "member";
}

function initialDrafts(value: BookingRuleAppliesTo): DraftParticipant[] {
  return [{ key: "primary", participant_type: primaryType(value), person_id: null, guest_name: "", is_primary: true }];
}

function nextKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function bookingFeedback(result: BookingCreateResult | BookingUpdateResult): { message: string; tone: "error" | "info" } {
  if (result.failures[0]) return { tone: "error", message: result.failures[0].message };
  if (result.availability?.blockers[0]) return { tone: "error", message: result.availability.blockers[0].reason };
  if (result.availability?.unresolved_checks[0]) return { tone: "info", message: result.availability.unresolved_checks[0].reason };
  return {
    tone: "error",
    message: result.decision === "indeterminate" ? "Booking could not be resolved for this slot." : "Booking update blocked.",
  };
}

function participantDraftsFromBooking(booking: BookingSummary): DraftParticipant[] {
  const drafts = booking.participants.map((participant, index) => ({
    key: participant.id ?? `participant-${index}`,
    participant_type: participant.participant_type,
    person_id: participant.person_id ?? null,
    guest_name: participant.guest_name ?? "",
    is_primary: participant.is_primary,
  }));
  return drafts.length > 0 ? drafts : [{ key: "primary", participant_type: "member", person_id: null, guest_name: "", is_primary: true }];
}

function asParticipantPayload(participants: DraftParticipant[]): BookingCreateParticipantInput[] {
  return participants.map((participant) => ({
    participant_type: participant.participant_type,
    person_id: participant.participant_type === "guest" ? null : participant.person_id,
    guest_name: participant.participant_type === "guest" ? participant.guest_name.trim() : null,
    is_primary: participant.is_primary,
  }));
}

function SetupState({
  title,
  description,
}: {
  title: string;
  description: string;
}): JSX.Element {
  return (
    <section className="rounded-[28px] bg-surface-container-lowest p-8 shadow-sm">
      <div className="max-w-2xl space-y-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container text-primary">
          <MaterialSymbol filled icon="golf_course" />
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Setup Required</p>
          <h2 className="font-headline text-2xl font-extrabold text-on-surface">{title}</h2>
          <p className="text-sm leading-6 text-on-surface-variant">{description}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-dim"
            to="/admin/golf/settings"
          >
            <MaterialSymbol className="text-sm" icon="settings" />
            <span>Open Golf Settings</span>
          </Link>
          <p className="self-center text-xs text-slate-500">
            Create a course and at least one tee before expecting live tee-sheet rows.
          </p>
        </div>
      </div>
    </section>
  );
}

export function AdminGolfTeeSheetPage(): JSX.Element {
  const { accessToken, bootstrap, initialized, loading } = useSession();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [membershipType, setMembershipType] = useState<BookingRuleAppliesTo>("staff");
  const [courseId, setCourseId] = useState<string | null>(null);
  const [teeId, setTeeId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState<SelectedSlotKey | null>(null);
  const [drawerFeedbackMessage, setDrawerFeedbackMessage] = useState<string | null>(null);
  const [drawerFeedbackTone, setDrawerFeedbackTone] = useState<"error" | "info" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [drafts, setDrafts] = useState<DraftParticipant[]>(initialDrafts("member"));
  const [createCartFlag, setCreateCartFlag] = useState(false);
  const [createCaddieFlag, setCreateCaddieFlag] = useState(false);
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [activeDropKey, setActiveDropKey] = useState<string | null>(null);
  const [searchInputValue, setSearchInputValue] = useState("");
  // 5.5: Compound filter state replaces single ViewFilter.
  const [filters, setFilters] = useState<TeeSheetFilterState>(DEFAULT_FILTERS);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [highlightedSlotKey, setHighlightedSlotKey] = useState<string | null>(null);
  // Legend visibility persisted in localStorage so staff don't re-expand on every visit.
  const [legendVisible, setLegendVisible] = useState<boolean>(() => {
    try {
      return localStorage.getItem("gl-tee-sheet-legend") !== "hidden";
    } catch {
      return true;
    }
  });
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    try {
      const stored = localStorage.getItem("gl-tee-sheet-layout");
      return stored === "timeline" ? "timeline" : "classic";
    } catch {
      return "classic";
    }
  });
  const [timelineDensity, setTimelineDensity] = useState<TimelineDensity>(() => {
    try {
      return localStorage.getItem("gl-tee-sheet-density") === "compact" ? "compact" : "comfortable";
    } catch {
      return "comfortable";
    }
  });
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<DraftParticipant[]>([]);
  const [editCartFlag, setEditCartFlag] = useState(false);
  const [editCaddieFlag, setEditCaddieFlag] = useState(false);
  const [inlineActionState, setInlineActionState] = useState<{ action: QuickAction; bookingId: string } | null>(null);
  const [checkingInAllBucket, setCheckingInAllBucket] = useState<string | null>(null);
  const pendingAutoScrollDateRef = useRef<string | null>(selectedDate);
  const prefetchedAdjacentSeedRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const debouncedSearchTerm = useDebouncedValue(searchInputValue, 200);

  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const sessionReady = initialized && !loading && Boolean(accessToken && bootstrap && selectedClubId);
  const guardedAccessToken = sessionReady ? accessToken : null;
  const guardedSelectedClubId = sessionReady ? selectedClubId : null;
  const coursesQuery = useCoursesQuery({ accessToken: guardedAccessToken, selectedClubId: guardedSelectedClubId });
  const teesQuery = useTeesQuery({ accessToken: guardedAccessToken, selectedClubId: guardedSelectedClubId });
  const directoryQuery = useClubDirectoryQuery({ accessToken: guardedAccessToken, selectedClubId: guardedSelectedClubId });
  const activeCourseTees = useMemo(
    () => (teesQuery.data ?? []).filter((tee: Tee) => tee.course_id === courseId && tee.active),
    [courseId, teesQuery.data],
  );
  // teeId === null means "all tees" — no auto-resolution to first tee so the query key
  // matches the nav-hover prefetch (which also uses null / "all-tees").
  const selectedTee = activeCourseTees.find((tee) => tee.id === teeId) ?? null;

  useEffect(() => {
    const courses = coursesQuery.data ?? [];
    if (courses.length === 0) {
      if (courseId !== null) setCourseId(null);
      return;
    }
    if (!courseId || !courses.some((course) => course.id === courseId)) {
      setCourseId(courses[0].id);
    }
  }, [courseId, coursesQuery.data]);

  useEffect(() => {
    pendingAutoScrollDateRef.current = selectedDate;
  }, [selectedDate]);

  const teeSheetQuery = useTeeSheetDayQuery({
    accessToken: guardedAccessToken,
    selectedClubId: guardedSelectedClubId,
    courseId,
    date: selectedDate,
    membershipType,
    teeId,
  });

  useEffect(() => {
    if (!teeSheetQuery.data || !guardedAccessToken || !guardedSelectedClubId || !courseId) return;
    const prefetchSeed = JSON.stringify(
      teeSheetKeys.day(guardedSelectedClubId, courseId, selectedDate, membershipType, teeId),
    );
    if (prefetchedAdjacentSeedRef.current === prefetchSeed) return;
    prefetchedAdjacentSeedRef.current = prefetchSeed;
    void Promise.all([
      queryClient.prefetchQuery(
        teeSheetDayQueryOptions({
          accessToken: guardedAccessToken,
          selectedClubId: guardedSelectedClubId,
          courseId,
          date: addDays(selectedDate, -1),
          membershipType,
          teeId,
        }),
      ),
      queryClient.prefetchQuery(
        teeSheetDayQueryOptions({
          accessToken: guardedAccessToken,
          selectedClubId: guardedSelectedClubId,
          courseId,
          date: addDays(selectedDate, 1),
          membershipType,
          teeId,
        }),
      ),
    ]);
  }, [courseId, guardedAccessToken, guardedSelectedClubId, membershipType, queryClient, selectedDate, teeId, teeSheetQuery.data]);

  const slots = useMemo<LaneSlot[]>(
    () =>
      (teeSheetQuery.data?.rows ?? [])
        .flatMap((row) =>
          row.slots.map((slot) => ({
            colorCode: row.color_code,
            laneLabel: laneLabel(row.start_lane),
            rowKey: row.row_key,
            rowLabel: row.label,
            slot,
            startLane: row.start_lane,
            teeId: row.tee_id,
          })),
        )
        .sort(
          (a, b) =>
            a.slot.local_time.localeCompare(b.slot.local_time) ||
            laneOrder(a.startLane) - laneOrder(b.startLane) ||
            a.rowLabel.localeCompare(b.rowLabel),
        ),
    [teeSheetQuery.data],
  );

  const buckets = useMemo(() => {
    const map = new Map<string, { localTime: string; slotDatetime: string; slots: LaneSlot[] }>();
    for (const slot of slots) {
      const current = map.get(slot.slot.slot_datetime);
      if (current) current.slots.push(slot);
      else map.set(slot.slot.slot_datetime, { localTime: slot.slot.local_time, slotDatetime: slot.slot.slot_datetime, slots: [slot] });
    }
    return Array.from(map.values()).map((bucket) => ({
      ...bucket,
      slots: bucket.slots.sort((a, b) => laneOrder(a.startLane) - laneOrder(b.startLane) || a.rowLabel.localeCompare(b.rowLabel)),
    }));
  }, [slots]);

  const reservedBookingsByBucket = useMemo(() => {
    const map = new Map<string, TeeSheetBookingView[]>();
    for (const bucket of buckets) {
      map.set(
        bucket.slotDatetime,
        bucket.slots.flatMap((slot) => slot.slot.bookings.filter((booking) => booking.status === "reserved")),
      );
    }
    return map;
  }, [buckets]);

  const filteredBuckets = useMemo(
    () =>
      buckets
        .map((bucket) => ({
          ...bucket,
          slots: bucket.slots.filter((slot) => slotMatchesSearch(slot, debouncedSearchTerm) && slotMatchesFilters(slot.slot, filters)),
        }))
        .filter((bucket) => bucket.slots.length > 0),
    [buckets, debouncedSearchTerm, filters],
  );

  const statusCounts = useMemo(
    () =>
      slots.reduce(
        (counts, item) => {
          counts[item.slot.display_status] += 1;
          return counts;
        },
        {
          available: 0,
          blocked: 0,
          reserved: 0,
          indeterminate: 0,
          warning: 0,
        } satisfies Record<TeeSheetSlotDisplayStatus, number>,
      ),
    [slots],
  );

  const selectedSlot = useMemo(
    () =>
      selectedSlotKey
        ? slots.find((item) => item.rowKey === selectedSlotKey.rowKey && item.slot.slot_datetime === selectedSlotKey.slotDatetime) ?? null
        : null,
    [selectedSlotKey, slots],
  );

  useEffect(() => {
    if (selectedSlotKey && !selectedSlot) {
      setSelectedSlotKey(null);
      setDrawerMode(null);
      setDrawerFeedbackMessage(null);
      setDrawerFeedbackTone(null);
      setEditingBookingId(null);
      setEditDrafts([]);
      setEditCartFlag(false);
      setEditCaddieFlag(false);
      setCreateCartFlag(false);
      setCreateCaddieFlag(false);
    }
  }, [selectedSlot, selectedSlotKey]);

  const resetCreateDrafts = useCallback((): void => {
    setDrafts(initialDrafts("member"));
    setCreateCartFlag(false);
    setCreateCaddieFlag(false);
  }, []);

  const resetEditState = useCallback((): void => {
    setEditingBookingId(null);
    setEditDrafts([]);
    setEditCartFlag(false);
    setEditCaddieFlag(false);
  }, []);

  const currentDayKey =
    guardedSelectedClubId && courseId ? teeSheetKeys.day(guardedSelectedClubId, courseId, selectedDate, membershipType, teeId) : null;

  async function invalidate(): Promise<void> {
    if (!currentDayKey) return;
    await queryClient.invalidateQueries({ queryKey: currentDayKey });
  }

  function rollbackLifecycleContext(context?: { previousDay: TeeSheetDayResponse | undefined }): void {
    if (!currentDayKey || !context?.previousDay) return;
    queryClient.setQueryData(currentDayKey, context.previousDay);
  }

  async function onLifecycleMutate(action: Action, bookingId: string): Promise<{ previousDay: TeeSheetDayResponse | undefined }> {
    if (!currentDayKey) return { previousDay: undefined };
    await queryClient.cancelQueries({ queryKey: currentDayKey });
    const previousDay = queryClient.getQueryData<TeeSheetDayResponse>(currentDayKey);
    queryClient.setQueryData<TeeSheetDayResponse>(currentDayKey, (current) =>
      optimisticallyTransitionBooking(current, bookingId, action),
    );
    return { previousDay };
  }

  function handleLifecycleBlocked(
    action: Action,
    bookingId: string,
    result: BookingLifecycleMutationResult,
    context?: { previousDay: TeeSheetDayResponse | undefined },
  ): void {
    rollbackLifecycleContext(context);
    const message = result.failures[0]?.message ?? COPY[action].blocked;
    if (inlineActionState?.bookingId === bookingId) {
      setNotice({ tone: "error", message });
      return;
    }
    setDrawerFeedbackTone("error");
    setDrawerFeedbackMessage(message);
  }

  function handleLifecycleError(
    bookingId: string,
    error: unknown,
    context?: { previousDay: TeeSheetDayResponse | undefined },
  ): void {
    rollbackLifecycleContext(context);
    const message = asMessage(error);
    if (inlineActionState?.bookingId === bookingId) {
      setNotice({ tone: "error", message });
      return;
    }
    setDrawerFeedbackTone("error");
    setDrawerFeedbackMessage(message);
  }

  function onLifecycleSuccess(action: Action, result: BookingLifecycleMutationResult): void {
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setDrawerMode(null);
    resetEditState();
    setNotice({ tone: result.transition_applied ? "success" : "info", message: result.transition_applied ? COPY[action].success : COPY[action].already });
  }

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelBooking(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onMutate: (bookingId) => onLifecycleMutate("cancel", bookingId),
    onSuccess: (result, bookingId, context) => {
      if (result.decision === "blocked") {
        handleLifecycleBlocked("cancel", bookingId, result, context);
        return;
      }
      onLifecycleSuccess("cancel", result);
    },
    onError: (error, bookingId, context) => {
      handleLifecycleError(bookingId, error, context);
    },
    onSettled: () => {
      void invalidate();
    },
  });

  const checkInMutation = useMutation({
    mutationFn: (id: string) => checkInBooking(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onMutate: (bookingId) => onLifecycleMutate("check_in", bookingId),
    onSuccess: (result, bookingId, context) => {
      if (result.decision === "blocked") {
        handleLifecycleBlocked("check_in", bookingId, result, context);
        return;
      }
      onLifecycleSuccess("check_in", result);
    },
    onError: (error, bookingId, context) => {
      handleLifecycleError(bookingId, error, context);
    },
    onSettled: () => {
      void invalidate();
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => completeBooking(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onMutate: (bookingId) => onLifecycleMutate("complete", bookingId),
    onSuccess: (result, bookingId, context) => {
      if (result.decision === "blocked") {
        handleLifecycleBlocked("complete", bookingId, result, context);
        return;
      }
      onLifecycleSuccess("complete", result);
    },
    onError: (error, bookingId, context) => {
      handleLifecycleError(bookingId, error, context);
    },
    onSettled: () => {
      void invalidate();
    },
  });

  const noShowMutation = useMutation({
    mutationFn: (id: string) => markBookingNoShow(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onMutate: (bookingId) => onLifecycleMutate("no_show", bookingId),
    onSuccess: (result, bookingId, context) => {
      if (result.decision === "blocked") {
        handleLifecycleBlocked("no_show", bookingId, result, context);
        return;
      }
      onLifecycleSuccess("no_show", result);
    },
    onError: (error, bookingId, context) => {
      handleLifecycleError(bookingId, error, context);
    },
    onSettled: () => {
      void invalidate();
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: BookingCreateInput) => createBooking(payload, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onSuccess: async (result) => {
      if (result.decision === "allowed") {
        setDrawerFeedbackMessage(null);
        setDrawerFeedbackTone(null);
        setDrawerMode(null);
        setSelectedSlotKey(null);
        setNotice({ tone: "success", message: "Booking created. Tee sheet refreshed from backend state." });
        resetCreateDrafts();
        await invalidate();
        return;
      }
      const feedback = bookingFeedback(result);
      setDrawerFeedbackTone(feedback.tone);
      setDrawerFeedbackMessage(feedback.message);
    },
    onError: (error) => {
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(asMessage(error));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ bookingId, payload }: { bookingId: string; payload: BookingUpdateInput }) =>
      updateBooking(bookingId, payload, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onSuccess: async (result) => {
      if (result.decision === "allowed") {
        setDrawerFeedbackMessage(null);
        setDrawerFeedbackTone(null);
        setDrawerMode("manage");
        resetEditState();
        setNotice({ tone: "success", message: "Booking updated. Tee sheet refreshed from backend state." });
        await invalidate();
        return;
      }
      const feedback = bookingFeedback(result);
      setDrawerFeedbackTone(feedback.tone);
      setDrawerFeedbackMessage(feedback.message);
    },
    onError: (error) => {
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(asMessage(error));
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ bookingId, target }: { bookingId: string; target: LaneSlot }) =>
      moveBooking(
        bookingId,
        { target_slot_datetime: target.slot.slot_datetime, target_start_lane: target.startLane, target_tee_id: target.teeId },
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    onMutate: async ({ bookingId, target }) => {
      if (!currentDayKey) return { previousDay: undefined };
      await queryClient.cancelQueries({ queryKey: currentDayKey });
      const previousDay = queryClient.getQueryData<TeeSheetDayResponse>(currentDayKey);
      queryClient.setQueryData<TeeSheetDayResponse>(currentDayKey, (current) => optimisticallyMoveBooking(current, bookingId, target));
      setDragged(null);
      setActiveDropKey(null);
      return { previousDay };
    },
    onSuccess: async (result, variables, context) => {
      if (result.decision === "blocked") {
        if (currentDayKey && context?.previousDay) queryClient.setQueryData(currentDayKey, context.previousDay);
        const message = result.failures[0]?.message ?? "Move blocked.";
        setNotice({ tone: "error", message });
        if (selectedSlotKey?.rowKey === variables.target.rowKey && selectedSlotKey.slotDatetime === variables.target.slot.slot_datetime) {
          setDrawerFeedbackTone("error");
          setDrawerFeedbackMessage(message);
        }
        return;
      }
      setDrawerFeedbackMessage(null);
      setDrawerFeedbackTone(null);
      setSelectedSlotKey(null);
      setDrawerMode(null);
      resetEditState();
      setNotice({
        tone: result.transition_applied ? "success" : "info",
        message: result.transition_applied ? "Booking moved." : "Booking was already at the requested slot.",
      });
      void invalidate();
    },
    onError: (error, _variables, context) => {
      if (currentDayKey && context?.previousDay) queryClient.setQueryData(currentDayKey, context.previousDay);
      setDragged(null);
      setActiveDropKey(null);
      setNotice({ tone: "error", message: asMessage(error) });
    },
  });

  const activeCourse = coursesQuery.data?.find((course) => course.id === courseId) ?? null;
  const hasCourses = (coursesQuery.data?.length ?? 0) > 0;
  const setupMissingCourses = !coursesQuery.isLoading && !coursesQuery.error && !hasCourses;
  const setupMissingTees =
    !setupMissingCourses &&
    Boolean(courseId) &&
    !teesQuery.isLoading &&
    !teesQuery.error &&
    activeCourseTees.length === 0;
  // A specific tee is optional — null means "all tees". The sheet can render as long
  // as a course is selected and at least one active tee exists for it.
  const configuredForSheet = Boolean(activeCourse);

  const totalSlots = slots.length;
  const occupiedSlots = slots.filter((item) => item.slot.bookings.length > 0).length;
  const checkedInBookings = slots.reduce((sum, item) => sum + item.slot.bookings.filter((booking) => booking.status === "checked_in").length, 0);
  const checkedInPlayers = slots.reduce((sum, item) => sum + item.slot.bookings.filter((booking) => booking.status === "checked_in").reduce((inner, booking) => inner + bookingPlayerCount(booking), 0), 0);
  const openSlots = slots.filter((item) => canCreate(item.slot)).length;
  const openPlayerCapacity = slots.reduce((sum, item) => sum + slotRemainingCapacity(item.slot), 0);
  const alertSignals = (teeSheetQuery.data?.warnings.length ?? 0) + statusCounts.warning + statusCounts.blocked;
  const occupancyPct = totalSlots === 0 ? 0 : Math.round((occupiedSlots / totalSlots) * 100);
  const pendingAction = inlineActionState?.action ?? (cancelMutation.isPending ? "cancel" : checkInMutation.isPending ? "check_in" : completeMutation.isPending ? "complete" : noShowMutation.isPending ? "no_show" : null);
  const pendingBookingId =
    inlineActionState?.bookingId ??
    (cancelMutation.isPending ? cancelMutation.variables ?? null : checkInMutation.isPending ? checkInMutation.variables ?? null : completeMutation.isPending ? completeMutation.variables ?? null : noShowMutation.isPending ? noShowMutation.variables ?? null : null);
  const movingBookingId = moveMutation.isPending ? moveMutation.variables?.bookingId ?? null : null;
  const savingBookingId = updateMutation.isPending ? updateMutation.variables?.bookingId ?? null : null;
  const directory = directoryQuery.data ?? [];

  const openManage = useCallback((slot: LaneSlot): void => {
    if (!canManage(slot.slot)) return;
    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    resetCreateDrafts();
    setDrawerMode("manage");
    resetEditState();
    setSelectedSlotKey({ rowKey: slot.rowKey, slotDatetime: slot.slot.slot_datetime });
  }, [resetCreateDrafts, resetEditState]);

  const openCreate = useCallback((slot: LaneSlot): void => {
    if (!canCreate(slot.slot)) return;
    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    resetCreateDrafts();
    setDrawerMode("create");
    resetEditState();
    setSelectedSlotKey({ rowKey: slot.rowKey, slotDatetime: slot.slot.slot_datetime });
  }, [resetCreateDrafts, resetEditState]);

  const close = useCallback((): void => {
    setDrawerMode(null);
    setSelectedSlotKey(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    resetCreateDrafts();
    resetEditState();
  }, [resetCreateDrafts, resetEditState]);

  function updateDraft(key: string, patch: Partial<DraftParticipant>): void {
    setDrafts((current) => current.map((participant) => (participant.key === key ? { ...participant, ...patch } : participant)));
  }

  function addDraft(): void {
    setDrafts((current) => (current.length >= 4 ? current : [...current, { key: nextKey(), participant_type: "guest", person_id: null, guest_name: "", is_primary: false }]));
  }

  function removeDraft(key: string): void {
    setDrafts((current) => current.filter((participant) => participant.key !== key || participant.is_primary));
  }

  function updateEditDraft(key: string, patch: Partial<DraftParticipant>): void {
    setEditDrafts((current) => current.map((participant) => (participant.key === key ? { ...participant, ...patch } : participant)));
  }

  function addEditDraft(): void {
    setEditDrafts((current) => (current.length >= 4 ? current : [...current, { key: nextKey(), participant_type: "guest", person_id: null, guest_name: "", is_primary: false }]));
  }

  function removeEditDraft(key: string): void {
    setEditDrafts((current) => current.filter((participant) => participant.key !== key || participant.is_primary));
  }

  function startEdit(booking: BookingSummary): void {
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setEditingBookingId(booking.id);
    setEditDrafts(participantDraftsFromBooking(booking));
    setEditCartFlag(Boolean(booking.cart_flag));
    setEditCaddieFlag(Boolean(booking.caddie_flag));
  }

  function cancelEdit(): void {
    resetEditState();
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
  }

  function createPayload(slot: LaneSlot): BookingCreateInput {
    const participants = asParticipantPayload(drafts);
    const primary = drafts.find((participant) => participant.is_primary);
    return {
      course_id: courseId as string,
      tee_id: slot.teeId,
      start_lane: slot.startLane,
      slot_datetime: slot.slot.slot_datetime,
      slot_interval_minutes: teeSheetQuery.data?.interval_minutes ?? null,
      source: "admin",
      applies_to: primary?.participant_type === "staff" ? "staff" : primary?.participant_type === "member" ? "member" : undefined,
      reference_datetime: teeSheetQuery.data?.reference_datetime ?? null,
      cart_flag: createCartFlag,
      caddie_flag: createCaddieFlag,
      participants,
    };
  }

  function updatePayload(): BookingUpdateInput {
    const participants = asParticipantPayload(editDrafts);
    const primary = editDrafts.find((participant) => participant.is_primary);
    return {
      applies_to: primary?.participant_type === "staff" ? "staff" : primary?.participant_type === "member" ? "member" : undefined,
      reference_datetime: teeSheetQuery.data?.reference_datetime ?? null,
      cart_flag: editCartFlag,
      caddie_flag: editCaddieFlag,
      participants,
    };
  }

  function dropKey(slot: LaneSlot): string {
    return `${slot.rowKey}:${slot.slot.slot_datetime}`;
  }

  function dropAllowed(target: LaneSlot): boolean {
    return Boolean(dragged && canDrop(target.slot) && !(dragged.rowKey === target.rowKey && dragged.slotDatetime === target.slot.slot_datetime));
  }

  const startDrag = useCallback((event: DragEvent<HTMLElement>, bookingId: string, slot: LaneSlot): void => {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", bookingId);
    }
    setDragged({ bookingId, rowKey: slot.rowKey, slotDatetime: slot.slot.slot_datetime });
    setNotice(null);
  }, []);

  const endDrag = useCallback((): void => {
    setDragged(null);
    setActiveDropKey(null);
  }, []);

  const runInlineQuickAction = useCallback(async (action: QuickAction, bookingId: string): Promise<void> => {
    if (!accessToken || !selectedClubId) return;
    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setInlineActionState({ action, bookingId });

    try {
      if (action === "cancel") await cancelMutation.mutateAsync(bookingId);
      else if (action === "check_in") await checkInMutation.mutateAsync(bookingId);
      else await noShowMutation.mutateAsync(bookingId);
    } catch {
      // Mutation callbacks already handle rollback and staff feedback.
    } finally {
      setInlineActionState(null);
    }
  }, [accessToken, cancelMutation, checkInMutation, noShowMutation, selectedClubId]);

  async function handleCheckInAll(bucketSlotDatetime: string): Promise<void> {
    if (!accessToken || !selectedClubId) return;
    const reservedBookings = reservedBookingsByBucket.get(bucketSlotDatetime) ?? [];
    if (reservedBookings.length === 0) return;

    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setCheckingInAllBucket(bucketSlotDatetime);

    try {
      const settled = await Promise.allSettled(
        reservedBookings.map((booking) => checkInBooking(booking.id, { accessToken, selectedClubId })),
      );
      const failures = settled.flatMap((result) => {
        if (result.status === "rejected") return [asMessage(result.reason)];
        if (result.value.decision === "blocked") return [result.value.failures[0]?.message ?? COPY.check_in.blocked];
        return [];
      });
      const successes = settled.filter((result) => result.status === "fulfilled" && result.value.decision === "allowed" && result.value.transition_applied).length;
      const alreadyProcessed = settled.filter((result) => result.status === "fulfilled" && result.value.decision === "allowed" && !result.value.transition_applied).length;

      if (failures.length > 0) {
        const completed = successes + alreadyProcessed;
        setNotice({
          tone: "error",
          message: `Check In All completed ${completed}/${reservedBookings.length}. ${failures[0]}`,
        });
      } else {
        setNotice({
          tone: successes > 0 ? "success" : "info",
          message: successes > 0
            ? `Checked in ${successes} booking${successes === 1 ? "" : "s"} for this time bucket.`
            : "All reserved bookings in this time bucket were already checked in.",
        });
      }

      await invalidate();
    } finally {
      setCheckingInAllBucket(null);
    }
  }

  const description = `Course: ${activeCourse?.name ?? "Course setup required"} · Tee: ${selectedTee?.name ?? "All tees"}`;
  const teeSheetErrorMessage =
    teeSheetQuery.error instanceof ApiError && teeSheetQuery.error.status === 401
      ? "Session expired. Redirecting to login."
      : teeSheetQuery.error?.message ?? null;
  const jumpTimes = useMemo(
    () => Array.from(new Set(buckets.map((bucket) => timeKey(bucket.localTime)))),
    [buckets],
  );
  const showLiveEmptyState = configuredForSheet && !teeSheetQuery.isLoading && !teeSheetQuery.error && buckets.length === 0;
  const showFilteredEmptyState =
    configuredForSheet && !teeSheetQuery.isLoading && !teeSheetQuery.error && buckets.length > 0 && filteredBuckets.length === 0;
  const showClearSearch = searchInputValue.trim().length > 0;
  const hasActiveFilters =
    filters.viewFilter !== "all" ||
    filters.participantType !== "all" ||
    filters.partySize !== "any" ||
    filters.timeFrom !== null ||
    filters.timeTo !== null;
  const filteredEmptyMessage =
    debouncedSearchTerm.trim() && hasActiveFilters
      ? `No results match "${debouncedSearchTerm.trim()}" with the current filters.`
      : debouncedSearchTerm.trim()
        ? `No results match "${debouncedSearchTerm.trim()}" on this view.`
        : "No tee-sheet rows match the current filters.";
  const visibleSlotCount = filteredBuckets.reduce((sum, bucket) => sum + bucket.slots.length, 0);

  useEffect(() => {
    if (layoutMode !== "classic") return;
    if (pendingAutoScrollDateRef.current !== selectedDate) return;
    if (teeSheetQuery.isLoading || teeSheetQuery.error || filteredBuckets.length === 0) return;

    const targetTime = nearestBucketTime(filteredBuckets, teeSheetQuery.data?.timezone ?? null);
    if (!targetTime) return;

    document.getElementById(`bucket-${targetTime}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    pendingAutoScrollDateRef.current = null;
  }, [filteredBuckets, layoutMode, selectedDate, teeSheetQuery.data?.timezone, teeSheetQuery.error, teeSheetQuery.isLoading]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === "Escape" && drawerMode) {
        event.preventDefault();
        close();
        return;
      }

      if (isTypingTarget(event.target)) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setSelectedDate((current) => addDays(current, -1));
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setSelectedDate((current) => addDays(current, 1));
        return;
      }
      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        setSelectedDate(todayValue());
        return;
      }
      if (event.key === "d" || event.key === "D") {
        event.preventDefault();
        setCalendarOpen((v) => !v);
        return;
      }
      if (event.key === "f" || event.key === "F" || event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerMode]);

  return (
    <>
      <AdminWorkspace
        title="Daily Tee Sheet"
        dateLabel={dateLabel(selectedDate)}
        description={description}
        actions={
          <>
            <label className="flex items-center gap-2 rounded-2xl bg-surface-container-high px-4 py-2.5 text-sm font-semibold text-on-surface">
              <MaterialSymbol className="text-sm" icon="flag" />
              <select
                className="border-none bg-transparent pr-5 text-sm font-semibold focus:ring-0"
                disabled={!hasCourses}
                onChange={(event) => {
                  setCourseId(event.target.value || null);
                  setTeeId(null);
                  setDrawerMode(null);
                  setSelectedSlotKey(null);
                  setEditingBookingId(null);
                  setEditDrafts([]);
                  setDrawerFeedbackMessage(null);
                  setDrawerFeedbackTone(null);
                }}
                value={courseId ?? ""}
              >
                {hasCourses ? (
                  (coursesQuery.data ?? []).map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))
                ) : (
                  <option value="">No courses configured</option>
                )}
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-2xl bg-surface-container-low px-4 py-2.5 text-sm font-semibold text-on-surface">
              <MaterialSymbol className="text-sm text-on-surface-variant" icon="golf_course" />
              <select
                className="border-none bg-transparent pr-5 text-sm font-semibold focus:ring-0"
                disabled={activeCourseTees.length === 0}
                onChange={(event) => {
                  setTeeId(event.target.value || null);
                  setDrawerMode(null);
                  setSelectedSlotKey(null);
                  setEditingBookingId(null);
                  setEditDrafts([]);
                  setDrawerFeedbackMessage(null);
                  setDrawerFeedbackTone(null);
                }}
                value={teeId ?? ""}
              >
                {activeCourseTees.length > 0 ? (
                  <>
                    <option value="">All Tees</option>
                    {activeCourseTees.map((tee) => (
                      <option key={tee.id} value={tee.id}>
                        {tee.name}
                      </option>
                    ))}
                  </>
                ) : (
                  <option value="">No tees configured</option>
                )}
              </select>
            </label>
          </>
        }
        kpis={
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-surface-container-lowest px-5 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <MaterialSymbol className="text-sm text-primary" icon="golf_course" />
              <span className="font-headline text-lg font-extrabold text-on-surface">{configuredForSheet ? `${occupancyPct}%` : "–"}</span>
              <span className="text-xs text-on-surface-variant">{configuredForSheet ? `${occupiedSlots}/${totalSlots} slots` : "Occupancy"}</span>
            </div>
            <div className="h-4 w-px bg-outline-variant/30" />
            <div className="flex items-center gap-2">
              <MaterialSymbol className="text-sm text-secondary" icon="how_to_reg" />
              <span className="font-headline text-lg font-extrabold text-on-surface">{configuredForSheet ? checkedInBookings : "–"}</span>
              <span className="text-xs text-on-surface-variant">{configuredForSheet ? `${checkedInPlayers} players` : "Checked In"}</span>
            </div>
            <div className="h-4 w-px bg-outline-variant/30" />
            <div className="flex items-center gap-2">
              <MaterialSymbol className="text-sm text-emerald-600" icon="grid_view" />
              <span className="font-headline text-lg font-extrabold text-on-surface">{configuredForSheet ? openSlots : "–"}</span>
              <span className="text-xs text-on-surface-variant">{configuredForSheet ? `${openPlayerCapacity} open` : "Open Capacity"}</span>
            </div>
            <div className="h-4 w-px bg-outline-variant/30" />
            {/* 2.8: UI convenience only — clicking here applies the "Closed/Holds"
                 filter lens so staff can quickly find problem slots. It does NOT
                 assert that "alerts" and "closed" are the same domain concept;
                 alertSignals may include holds and overrides that aren't closed. */}
            <button
              className="flex items-center gap-2 rounded-xl px-2 py-1 transition-colors hover:bg-amber-50 disabled:cursor-default"
              disabled={!configuredForSheet || alertSignals === 0}
              onClick={() => setFilters((f) => ({ ...f, viewFilter: "closed" }))}
              title="Filter to Closed / Holds view"
              type="button"
            >
              <MaterialSymbol className="text-sm text-amber-500" icon="warning" />
              <span className="font-headline text-lg font-extrabold text-on-surface">{configuredForSheet ? alertSignals : "–"}</span>
              <span className="text-xs text-on-surface-variant">{configuredForSheet ? `${statusCounts.blocked} blocked` : "Alerts"}</span>
            </button>
          </div>
        }
      >
        {notice ? <div className={notice.tone === "success" ? "rounded-2xl bg-primary-container/50 px-4 py-3 text-sm font-medium text-on-primary-container" : notice.tone === "error" ? "rounded-2xl bg-error-container/40 px-4 py-3 text-sm font-medium text-on-error-container" : "rounded-2xl bg-secondary-container px-4 py-3 text-sm font-medium text-on-secondary-container"}>{notice.message}</div> : null}

        {coursesQuery.error ? <div className="rounded-2xl bg-error-container/30 px-6 py-5 text-sm text-error shadow-sm">{coursesQuery.error.message}</div> : null}
        {teesQuery.error ? <div className="rounded-2xl bg-error-container/30 px-6 py-5 text-sm text-error shadow-sm">{teesQuery.error.message}</div> : null}

        {setupMissingCourses ? (
          <SetupState
            title="No courses are configured for this club."
            description="The tee sheet cannot render until the selected club has a course record and at least one playable tee definition."
          />
        ) : null}

        {setupMissingTees ? (
          <SetupState
            title="This course has no active tees."
            description="The tee sheet is a time-first operational read model. Without at least one active tee definition, the admin surface should guide setup instead of pretending there are zero live slots."
          />
        ) : null}

        {configuredForSheet ? (
          <div className="space-y-4">
            {teeSheetQuery.isLoading ? <div className="rounded-2xl bg-surface-container-lowest px-6 py-5 text-sm text-slate-500 shadow-sm">Loading tee sheet...</div> : null}
            {teeSheetQuery.error ? <div className="rounded-2xl bg-error-container/30 px-6 py-5 text-sm text-error shadow-sm">{teeSheetErrorMessage}</div> : null}
            {showLiveEmptyState ? <div className="rounded-2xl bg-surface-container-lowest px-6 py-5 text-sm text-slate-500 shadow-sm">No tee-sheet rows were generated for the selected day.</div> : null}
            {showFilteredEmptyState ? <div className="rounded-2xl bg-surface-container-lowest px-6 py-5 text-sm text-slate-500 shadow-sm">{filteredEmptyMessage}</div> : null}

            {!teeSheetQuery.isLoading && !teeSheetQuery.error && buckets.length > 0 ? (
              <>
                <section
                  className="sticky top-20 z-20 rounded-[28px] border border-slate-200/70 bg-white/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80"
                  data-testid="tee-sheet-toolbar"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* 5.6: Custom week-strip calendar popover replaces native <input type="date"> */}
                          <DatePickerPopover
                            clubId={guardedSelectedClubId}
                            courseId={courseId}
                            membershipType={membershipType}
                            onChange={setSelectedDate}
                            onOpenChange={setCalendarOpen}
                            open={calendarOpen}
                            queryClient={queryClient}
                            teeId={teeId}
                            value={selectedDate}
                          />
                          <div className="flex gap-1">
                            <button
                              aria-label="Previous day"
                              className="rounded-2xl bg-surface-container-low p-2 text-slate-500 transition-colors hover:bg-surface-container"
                              onClick={() => setSelectedDate((current) => addDays(current, -1))}
                              type="button"
                            >
                              <MaterialSymbol icon="chevron_left" />
                            </button>
                            <button
                              aria-label="Today"
                              className="rounded-2xl bg-surface-container-low px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-surface-container"
                              onClick={() => setSelectedDate(todayValue())}
                              type="button"
                            >
                              Today
                            </button>
                            <button
                              aria-label="Next day"
                              className="rounded-2xl bg-surface-container-low p-2 text-slate-500 transition-colors hover:bg-surface-container"
                              onClick={() => setSelectedDate((current) => addDays(current, 1))}
                              type="button"
                            >
                              <MaterialSymbol icon="chevron_right" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="rounded-2xl bg-surface-container-low px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Sheet Scope</p>
                            <p className="text-sm font-semibold text-on-surface">
                              Showing {visibleSlotCount} of {slots.length} lane slots
                            </p>
                          </div>
                          {/* 5.4: Find Next Open Slot — scrolls to the first available slot in the current view */}
                          {configuredForSheet && openSlots > 0 ? (
                            <button
                              className="flex items-center gap-1.5 rounded-2xl bg-primary-container/60 px-3 py-2.5 text-xs font-bold text-on-primary-container transition-colors hover:bg-primary-container"
                              onClick={() => {
                                const firstOpen = filteredBuckets.flatMap((b) => b.slots).find((s) => canCreate(s.slot));
                                if (!firstOpen) {
                                  setNotice({ tone: "info", message: "No open slots found with the current filters." });
                                  return;
                                }
                                const targetTime = timeKey(firstOpen.slot.local_time);
                                document.getElementById(`bucket-${targetTime}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                                const key = `${firstOpen.rowKey}:${firstOpen.slot.slot_datetime}`;
                                setHighlightedSlotKey(key);
                                setTimeout(() => setHighlightedSlotKey(null), 1500);
                              }}
                              title="Jump to the first available open slot"
                              type="button"
                            >
                              <MaterialSymbol className="text-sm" icon="my_location" />
                              <span>Next Open</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="space-y-1">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">View As</span>
                          <span className="flex items-center gap-2 rounded-2xl bg-surface-container-low px-3 py-2.5 text-sm text-on-surface">
                            <MaterialSymbol className="text-sm text-on-surface-variant" icon="manage_accounts" />
                            <select
                              className="border-none bg-transparent pr-5 text-sm font-medium focus:ring-0"
                              onChange={(event) => setMembershipType(event.target.value as BookingRuleAppliesTo)}
                              title="Evaluate slot availability under these booking rules"
                              value={membershipType}
                            >
                              <option value="staff">Staff</option>
                              <option value="member">Member</option>
                              <option value="guest">Guest</option>
                            </select>
                          </span>
                        </label>
                        <label className="space-y-1">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Search Sheet</span>
                          <span className="relative flex items-center">
                            <MaterialSymbol className="pointer-events-none absolute left-3 text-sm text-slate-400" icon="search" />
                            <input
                              className="w-full rounded-2xl bg-surface-container-low px-10 py-2.5 pr-10 text-sm text-on-surface placeholder:text-slate-400 focus:border-transparent focus:ring-2 focus:ring-primary/20 sm:w-72"
                              onChange={(event) => setSearchInputValue(event.target.value)}
                              placeholder="Search players, lane, or time"
                              ref={searchInputRef}
                              type="search"
                              value={searchInputValue}
                            />
                            {showClearSearch ? (
                              <button
                                aria-label="Clear tee-sheet search"
                                className="absolute right-2 rounded-full p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
                                onClick={() => {
                                  setSearchInputValue("");
                                  searchInputRef.current?.focus();
                                }}
                                type="button"
                              >
                                <MaterialSymbol className="text-sm" icon="close" />
                              </button>
                            ) : null}
                          </span>
                        </label>
                        <label className="space-y-1">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Jump To Time</span>
                          <span className="flex items-center gap-2 rounded-2xl bg-surface-container-low px-3 py-2.5 text-sm text-on-surface">
                            <MaterialSymbol className="text-sm text-on-surface-variant" icon="schedule" />
                            <select
                              className="border-none bg-transparent pr-5 text-sm font-medium focus:ring-0"
                              defaultValue=""
                              onChange={(event) => {
                                const value = event.target.value;
                                if (!value) return;
                                document.getElementById(`bucket-${value}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                              }}
                            >
                              <option value="">Select time</option>
                              {jumpTimes.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          </span>
                        </label>
                        <div className="space-y-1">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Layout</span>
                          <div className="flex items-center rounded-2xl bg-surface-container-low p-1">
                            {(["classic", "timeline"] as const).map((value) => (
                              <button
                                aria-pressed={layoutMode === value}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                                  layoutMode === value
                                    ? "bg-white text-on-surface shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                }`}
                                key={value}
                                onClick={() => {
                                  setLayoutMode(value);
                                  try {
                                    localStorage.setItem("gl-tee-sheet-layout", value);
                                  } catch {
                                    // Ignore localStorage failures.
                                  }
                                }}
                                type="button"
                              >
                                {value === "classic" ? "Classic" : "Timeline"}
                              </button>
                            ))}
                          </div>
                        </div>
                        {layoutMode === "timeline" ? (
                          <div className="space-y-1">
                            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Density</span>
                            <div className="flex items-center rounded-2xl bg-surface-container-low p-1">
                              {(["compact", "comfortable"] as const).map((value) => (
                                <button
                                  aria-pressed={timelineDensity === value}
                                  className={`rounded-xl px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                                    timelineDensity === value
                                      ? "bg-white text-on-surface shadow-sm"
                                      : "text-slate-500 hover:text-slate-700"
                                  }`}
                                  key={value}
                                  onClick={() => {
                                    setTimelineDensity(value);
                                    try {
                                      localStorage.setItem("gl-tee-sheet-density", value);
                                    } catch {
                                      // Ignore localStorage failures.
                                    }
                                  }}
                                  type="button"
                                >
                                  {value === "compact" ? "Compact" : "Comfortable"}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Operational Filters — compound (5.5) */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Filters</p>
                        <div className="flex items-center gap-2">
                          {/* Reset all filters when any non-default filter is active */}
                          {hasActiveFilters ? (
                            <button
                              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary-container/30"
                              onClick={() => setFilters(DEFAULT_FILTERS)}
                              type="button"
                            >
                              <MaterialSymbol className="text-sm" icon="filter_alt_off" />
                              <span>Reset</span>
                            </button>
                          ) : null}
                          {/* 2.6: legend toggle */}
                          <button
                            aria-label={legendVisible ? "Hide legend" : "Show legend"}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 transition-colors hover:bg-surface-container-low hover:text-slate-600"
                            onClick={() => {
                              setLegendVisible((v) => {
                                const next = !v;
                                try { localStorage.setItem("gl-tee-sheet-legend", next ? "visible" : "hidden"); } catch { /* ignore */ }
                                return next;
                              });
                            }}
                            type="button"
                          >
                            <MaterialSymbol className="text-sm" icon={legendVisible ? "expand_less" : "legend_toggle"} />
                            <span>Legend</span>
                          </button>
                        </div>
                      </div>

                      {/* Status filter (ViewFilter) — row 1 */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Status</span>
                        <div className="flex flex-wrap gap-1.5">
                          {VIEW_FILTERS.map((filter) => (
                            <button
                              className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                                filters.viewFilter === filter.value
                                  ? "bg-primary text-white"
                                  : "bg-surface-container-low text-on-surface hover:bg-surface-container"
                              }`}
                              key={filter.value}
                              onClick={() => setFilters((f) => ({ ...f, viewFilter: filter.value }))}
                              type="button"
                            >
                              {filter.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 5.1: Booking type filter — row 2 */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Type</span>
                        <div className="flex flex-wrap gap-1.5">
                          {PARTICIPANT_TYPE_FILTERS.map((filter) => (
                            <button
                              className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                                filters.participantType === filter.value
                                  ? "bg-secondary text-white"
                                  : "bg-surface-container-low text-on-surface hover:bg-surface-container"
                              }`}
                              key={filter.value}
                              onClick={() => setFilters((f) => ({ ...f, participantType: filter.value }))}
                              type="button"
                            >
                              {filter.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 5.3: Party size filter + 5.2: Time range — row 3 */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Party</span>
                          <div className="flex flex-wrap gap-1.5">
                            {PARTY_SIZE_FILTERS.map((filter) => (
                              <button
                                className={`rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                                  filters.partySize === filter.value
                                    ? "bg-secondary text-white"
                                    : "bg-surface-container-low text-on-surface hover:bg-surface-container"
                                }`}
                                key={String(filter.value)}
                                onClick={() => setFilters((f) => ({ ...f, partySize: filter.value }))}
                                type="button"
                              >
                                {filter.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* 5.2: Time range — From / To */}
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">From</span>
                          <input
                            className="rounded-xl bg-surface-container-low px-2 py-1.5 text-xs font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                            onChange={(e) => setFilters((f) => ({ ...f, timeFrom: e.target.value || null }))}
                            step="900"
                            type="time"
                            value={filters.timeFrom ?? ""}
                          />
                          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">To</span>
                          <input
                            className="rounded-xl bg-surface-container-low px-2 py-1.5 text-xs font-medium text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                            onChange={(e) => setFilters((f) => ({ ...f, timeTo: e.target.value || null }))}
                            step="900"
                            type="time"
                            value={filters.timeTo ?? ""}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 2.6: Collapsible legend — default visible on first load */}
                    {legendVisible ? (
                      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-2xl border border-slate-100 bg-surface-container-lowest px-4 py-3">
                        {/* Booking type */}
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Type</span>
                          <span className="flex items-center gap-1"><span className="inline-block h-3 w-[3px] rounded-full bg-blue-600" /><span className="text-[10px] text-slate-600">Member</span></span>
                          <span className="flex items-center gap-1"><span className="inline-block h-3 w-[3px] rounded-full bg-amber-500" /><span className="text-[10px] text-slate-600">Guest</span></span>
                          <span className="flex items-center gap-1"><span className="inline-block h-3 w-[3px] rounded-full bg-slate-400" /><span className="text-[10px] text-slate-600">Staff</span></span>
                        </div>
                        <span className="hidden h-4 w-px bg-slate-200 self-center sm:block" />
                        {/* Slot status */}
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Slot</span>
                          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary-container" /><span className="text-[10px] text-slate-600">Open</span></span>
                          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-error-container" /><span className="text-[10px] text-slate-600">Blocked</span></span>
                          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-200" /><span className="text-[10px] text-slate-600">Warning</span></span>
                          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-secondary-container" /><span className="text-[10px] text-slate-600">Golf Day</span></span>
                        </div>
                        <span className="hidden h-4 w-px bg-slate-200 self-center sm:block" />
                        {/* Booking status icons */}
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Status</span>
                          <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-slate-400" icon="radio_button_unchecked" /><span className="text-[10px] text-slate-600">Reserved</span></span>
                          <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-emerald-600" icon="check_circle" /><span className="text-[10px] text-slate-600">In</span></span>
                          <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-red-500" icon="person_off" /><span className="text-[10px] text-slate-600">No-show</span></span>
                          <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-slate-400" icon="cancel" /><span className="text-[10px] text-slate-600">Cancelled</span></span>
                        </div>
                        <span className="hidden h-4 w-px bg-slate-200 self-center sm:block" />
                        {/* Payment icons */}
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Payment</span>
                          <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-emerald-600" icon="check_circle" /><span className="text-[10px] text-slate-600">Paid</span></span>
                          <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-amber-500" icon="schedule" /><span className="text-[10px] text-slate-600">Unpaid</span></span>
                          <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-slate-400" icon="remove_circle" /><span className="text-[10px] text-slate-600">Waived</span></span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>

                {layoutMode === "classic" ? (
                <section className="overflow-hidden rounded-[28px] bg-surface-container-lowest shadow-sm">
                  <div className="overflow-x-auto">
                    <div className="min-w-[1120px] px-4 py-3">
                      <table className="w-full min-w-[1120px] table-fixed border-separate [border-spacing:0_6px]">
                        <colgroup>
                          <col className="w-[104px]" />
                          <col className="w-[108px]" />
                          <col className="w-[18.5%]" />
                          <col className="w-[18.5%]" />
                          <col className="w-[18.5%]" />
                          <col className="w-[18.5%]" />
                          <col className="w-[148px]" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th className="px-2 pb-2 text-left text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Time</th>
                            <th className="px-3 pb-2 text-left text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Tee</th>
                            <th className="px-2 pb-2 text-left text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Player 1</th>
                            <th className="px-2 pb-2 text-left text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Player 2</th>
                            <th className="px-2 pb-2 text-left text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Player 3</th>
                            <th className="px-2 pb-2 text-left text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Player 4</th>
                            <th className="px-2 pb-2 text-left text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredBuckets.map((bucket) =>
                            bucket.slots.map((item, index) => {
                              const targetKey = dropKey(item);
                              const allowedDrop = dropAllowed(item);
                              const isMultiLane = bucket.slots.length > 1;
                              const reservedBookings = reservedBookingsByBucket.get(bucket.slotDatetime) ?? [];
                              const displaySlot = isMultiLane
                                ? {
                                    ...item.slot,
                                    bookings: item.slot.bookings.filter((b) =>
                                      item.startLane === "hole_10" ? b.start_lane === "hole_10" : b.start_lane !== "hole_10",
                                    ),
                                  }
                                : item.slot;
                              const reservedBlock = (item.slot.display_status === "blocked" || item.slot.display_status === "reserved") && displaySlot.bookings.length === 0;
                              const cells = slotPlayerCells(displaySlot);
                              return (
                                <tr
                                  aria-label={`${item.laneLabel} lane row ${bucket.localTime.slice(0, 5)}`}
                                  className={`group transition-all duration-300 ${highlightedSlotKey === targetKey ? "ring-2 ring-primary ring-offset-1 rounded-[18px]" : ""}`}
                                  data-testid={`lane-row-${item.rowKey}`}
                                  key={targetKey}
                                  onDragEnter={() => {
                                    if (allowedDrop) setActiveDropKey(targetKey);
                                  }}
                                  onDragLeave={() => {
                                    if (activeDropKey === targetKey) setActiveDropKey(null);
                                  }}
                                  onDragOver={(event) => {
                                    if (allowedDrop) {
                                      event.preventDefault();
                                      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                                      setActiveDropKey(targetKey);
                                    }
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    if (allowedDrop && dragged) moveMutation.mutate({ bookingId: dragged.bookingId, target: item });
                                  }}
                                >
                                  {index === 0 ? (
                                    <td className="w-[96px] px-2 align-top" rowSpan={bucket.slots.length}>
                                      <div className="scroll-mt-44 rounded-[18px] bg-surface-container px-3 py-2 shadow-sm" id={`bucket-${bucket.localTime.slice(0, 5)}`}>
                                        <p className="font-headline text-lg font-extrabold text-on-surface">{bucket.localTime.slice(0, 5)}</p>
                                        {(() => {
                                          const total = bucket.slots.reduce((sum, slot) => sum + slotPlayerCount(slot.slot), 0);
                                          return total > 0 ? (
                                            <p className="mt-0.5 text-[10px] text-slate-400">{total} booked</p>
                                          ) : null;
                                        })()}
                                        {bucket.slots.some((s) => canCreate(s.slot)) ? (
                                          <button
                                            aria-label={`Create new booking at ${bucket.localTime.slice(0, 5)}`}
                                            className="mt-1.5 w-full rounded-lg bg-primary px-2 py-1 text-[9px] font-bold uppercase tracking-[0.10em] text-white transition-colors hover:bg-primary-dim"
                                            onClick={() => {
                                              const available = bucket.slots.find((s) => canCreate(s.slot));
                                              if (available) openCreate(available);
                                            }}
                                            type="button"
                                          >
                                            + New
                                          </button>
                                        ) : null}
                                        {reservedBookings.length > 0 ? (
                                          <button
                                            aria-label={`Check in all reserved bookings at ${bucket.localTime.slice(0, 5)}`}
                                            className="mt-1.5 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.10em] text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                                            disabled={checkingInAllBucket === bucket.slotDatetime}
                                            onClick={() => {
                                              void handleCheckInAll(bucket.slotDatetime);
                                            }}
                                            title={`Check in all reserved bookings in the ${bucket.localTime.slice(0, 5)} bucket`}
                                            type="button"
                                          >
                                            {checkingInAllBucket === bucket.slotDatetime ? "Checking..." : `Check In All (${reservedBookings.length})`}
                                          </button>
                                        ) : null}
                                      </div>
                                    </td>
                                  ) : null}

                                  {/* 2.3: tee.color_code as left border via inline style (dynamic value) */}
                                  <td
                                    className={`w-[80px] px-3 align-middle transition-colors ${activeDropKey === targetKey ? "bg-primary-container/10" : ""}`}
                                    style={item.colorCode ? { borderLeft: `4px solid ${item.colorCode}` } : undefined}
                                  >
                                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface">{item.laneLabel}</p>
                                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ${statusClass(item.slot.display_status)}`}>
                                      {statusLabel(item.slot.display_status)}
                                    </span>
                                    {/* 2.7: warning badge — only on non-blocked bookable slots */}
                                    {item.slot.warnings.length > 0 && item.slot.display_status !== "blocked" ? (
                                      <span
                                        className="mt-1 flex items-center gap-0.5"
                                        title={item.slot.warnings[0].message}
                                      >
                                        <MaterialSymbol className="text-xs text-amber-500" icon="warning" />
                                        <span className="text-[8px] font-semibold text-amber-600">
                                          {item.slot.warnings.length > 1 ? `${item.slot.warnings.length}` : ""}
                                        </span>
                                      </span>
                                    ) : null}
                                  </td>

                                  {reservedBlock ? (
                                    <td className="px-2 align-top" colSpan={4}>
                                      {/* 2.5: diagonal stripe overlaid on blocked cells for colorblind accessibility */}
                                      <div
                                        className={`flex min-h-[3.5rem] items-center justify-between rounded-[16px] px-3 py-2 ${slotSummaryClass(item.slot)}`}
                                        style={item.slot.display_status === "blocked" ? {
                                          backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.06) 5px, rgba(0,0,0,0.06) 10px)",
                                        } : undefined}
                                      >
                                        <div className="min-w-0">
                                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                            {item.slot.display_status === "blocked" ? "Blocked Slot" : "Reserved Slot"}
                                          </p>
                                          <p className="truncate text-xs font-semibold">{detail(item.slot)}</p>
                                        </div>
                                        {activeDropKey === targetKey ? <span className="text-xs font-semibold text-primary">Drop here</span> : null}
                                      </div>
                                    </td>
                                  ) : (
                                    cells.map((cell) => (
                                      <td className="px-2 align-top" key={cell.kind === "occupied" ? `${cell.booking.id}-${cell.column}-${cell.participant.display_name}` : `${targetKey}-empty-${cell.column}`}>
                                        {cell.kind === "occupied" ? (
                                          <div className="relative group/chip" data-memo-cell={cell.booking.id}>
                                            <button
                                              aria-label={cell.primaryHandle ? `Open booking ${cell.booking.id}` : `Open participant ${cell.participant.display_name}`}
                                              className={[
                                                bookingChipClass(cell.booking, cell.primaryHandle),
                                                // 2.1: left border encodes booking type so member/guest/staff are
                                                // instantly distinguishable without opening the management drawer.
                                                participantTypeBorderClass(bookingPrimaryType(cell.booking)),
                                                movingBookingId === cell.booking.id ? "opacity-50" : "",
                                              ].join(" ")}
                                              draggable
                                              onClick={() => openManage(item)}
                                              onDragEnd={endDrag}
                                              onDragStart={(event) => startDrag(event, cell.booking.id, item)}
                                              type="button"
                                            >
                                              <div className="flex items-center justify-between gap-2" data-chip-content={cell.booking.id}>
                                                <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                                  <span>P{cell.column}</span>
                                                  {cell.primaryHandle ? <MaterialSymbol className="text-[11px]" icon="drag_indicator" /> : null}
                                                </span>
                                                {cell.primaryHandle ? (
                                                  <div className="flex items-center gap-1">
                                                    {/* 2.2: booking lifecycle status as icon — replaces text badge */}
                                                    <span title={cell.booking.status.replace(/_/g, " ")}>
                                                      <MaterialSymbol
                                                        className={`text-sm ${bookingStatusIconClass(cell.booking.status)}`}
                                                        icon={bookingStatusIconName(cell.booking.status)}
                                                      />
                                                    </span>
                                                    {/* Payment icon (Phase 1) — separate visual channel */}
                                                    <span title={paymentLabel(cell.booking.payment_status)}>
                                                      <MaterialSymbol
                                                        className={`text-sm ${paymentIconClass(cell.booking.payment_status)}`}
                                                        icon={paymentIcon(cell.booking.payment_status)}
                                                      />
                                                    </span>
                                                  </div>
                                                ) : null}
                                              </div>
                                              <p className="truncate text-xs font-bold text-on-surface leading-none">{cell.participant.display_name}</p>
                                              {/* 2.4: cart/caddie extras icons — primary chip only, booking-level flags */}
                                              {cell.primaryHandle && (cell.booking.cart_flag || cell.booking.caddie_flag) ? (
                                                <div className="mt-0.5 flex items-center gap-1">
                                                  {cell.booking.cart_flag ? (
                                                    <span title="Cart assigned">
                                                      <MaterialSymbol className="text-[11px] text-slate-400" icon="airport_shuttle" />
                                                    </span>
                                                  ) : null}
                                                  {cell.booking.caddie_flag ? (
                                                    <span title="Caddie assigned">
                                                      <MaterialSymbol className="text-[11px] text-slate-400" icon="person" />
                                                    </span>
                                                  ) : null}
                                                </div>
                                              ) : null}
                                            </button>
                                            <div className="pointer-events-none absolute right-1 top-1 z-10 flex gap-1 opacity-0 transition-opacity group-hover/chip:pointer-events-auto group-hover/chip:opacity-100 group-focus-within/chip:pointer-events-auto group-focus-within/chip:opacity-100">
                                              {QUICK_ACTIONS.map((quickAction) => {
                                                const disabled = !canQuickAction(cell.booking, quickAction.action) || pendingBookingId === cell.booking.id;
                                                const isPending = pendingBookingId === cell.booking.id && pendingAction === quickAction.action;
                                                return (
                                                  <button
                                                    aria-label={`${quickAction.label} booking ${cell.booking.id}`}
                                                    className={`rounded-full border border-white/70 bg-white/95 p-1.5 text-slate-600 shadow-sm transition-colors ${
                                                      disabled ? "cursor-not-allowed opacity-50" : "hover:bg-slate-50 hover:text-slate-900"
                                                    }`}
                                                    disabled={disabled}
                                                    key={`${cell.booking.id}-${quickAction.action}`}
                                                    onClick={(event) => {
                                                      event.stopPropagation();
                                                      if (disabled) return;
                                                      void runInlineQuickAction(quickAction.action, cell.booking.id);
                                                    }}
                                                    title={quickActionTooltip(cell.booking, quickAction.action, quickAction.label)}
                                                    type="button"
                                                  >
                                                    <MaterialSymbol className="text-sm" icon={isPending ? "progress_activity" : quickAction.icon} />
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        ) : (
                                          <button
                                            aria-label={`Create booking for ${item.laneLabel} ${bucket.localTime.slice(0, 5)} player slot ${cell.column}`}
                                            className={`flex min-h-[3.5rem] w-full items-center gap-2 rounded-[16px] border border-dashed px-3 py-2 text-left transition-colors ${
                                              canCreate(displaySlot)
                                                ? "border-outline-variant/40 bg-white hover:border-primary/40 hover:bg-primary-container/10"
                                                : "border-outline-variant/20 bg-surface-container-low text-slate-400"
                                            }`}
                                            disabled={!canCreate(displaySlot)}
                                            onClick={() => openCreate(item)}
                                            type="button"
                                          >
                                            <OpenPlayerSlotContent column={cell.column} enabled={canCreate(displaySlot)} />
                                          </button>
                                        )}
                                      </td>
                                    ))
                                  )}

                                  <td className="w-[140px] px-2 align-top">
                                    <div className="flex min-h-[3.5rem] items-center gap-1.5 rounded-[16px] bg-surface-container-low px-2 shadow-sm">
                                      {canManage(displaySlot) ? (
                                        <button
                                          aria-label={`Manage bookings for ${item.laneLabel} ${bucket.localTime.slice(0, 5)}`}
                                          className="flex-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface transition-colors hover:bg-slate-50"
                                          onClick={() => openManage(item)}
                                          type="button"
                                        >
                                          Details
                                        </button>
                                      ) : null}
                                      {canManage(displaySlot) && canCreate(displaySlot) ? (
                                        <button
                                          aria-label={`Add booking for ${item.laneLabel} ${bucket.localTime.slice(0, 5)}`}
                                          className="flex-1 rounded-lg bg-primary-container/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-on-primary-container transition-colors hover:bg-primary-container"
                                          onClick={() => openCreate(item)}
                                          type="button"
                                        >
                                          Add
                                        </button>
                                      ) : null}
                                      {!canManage(displaySlot) && !canCreate(displaySlot) ? (
                                        <div className="flex-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                          Read Only
                                        </div>
                                      ) : null}
                                      {!canManage(displaySlot) && canCreate(displaySlot) ? (
                                        <div className="flex-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                          Open
                                        </div>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              );
                            }),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
                ) : (
                  <TeeSheetSwimLaneGrid
                    activeDropKey={activeDropKey}
                    checkingInAllBucket={checkingInAllBucket}
                    columns={filteredBuckets}
                    density={timelineDensity}
                    dragged={dragged}
                    dropAllowed={dropAllowed}
                    dropKey={dropKey}
                    highlightedSlotKey={highlightedSlotKey}
                    intervalMinutes={teeSheetQuery.data?.interval_minutes ?? 30}
                    movingBookingId={movingBookingId}
                    onCheckInAll={(slotDatetime) => {
                      void handleCheckInAll(slotDatetime);
                    }}
                    onEndDrag={endDrag}
                    onMoveBooking={(target) => {
                      if (!dragged) return;
                      moveMutation.mutate({ bookingId: dragged.bookingId, target });
                    }}
                    onOpenCreate={openCreate}
                    onOpenManage={openManage}
                    onQuickAction={(action, bookingId) => {
                      void runInlineQuickAction(action, bookingId);
                    }}
                    onSetActiveDropKey={setActiveDropKey}
                    onStartDrag={startDrag}
                    pendingAction={pendingAction}
                    pendingBookingId={pendingBookingId}
                    selectedDate={selectedDate}
                    timezone={teeSheetQuery.data?.timezone ?? null}
                  />
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </AdminWorkspace>

      {selectedSlot && drawerMode === "manage"
        ? (
            <BookingManagementDrawer
              editCaddieFlag={editCaddieFlag}
              editCartFlag={editCartFlag}
              colorCode={selectedSlot.colorCode}
              directory={directory}
              editingBookingId={editingBookingId}
              editParticipants={editDrafts}
              feedbackMessage={drawerFeedbackMessage}
              feedbackTone={drawerFeedbackTone}
              laneLabel={selectedSlot.laneLabel}
              onCancel={(bookingId) => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                cancelMutation.mutate(bookingId);
              }}
              onCheckIn={(bookingId) => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                checkInMutation.mutate(bookingId);
              }}
              onClose={close}
              onComplete={(bookingId) => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                completeMutation.mutate(bookingId);
              }}
              onEditAddParticipant={addEditDraft}
              onEditCancel={cancelEdit}
              onEditCaddieFlagChange={setEditCaddieFlag}
              onEditChangeParticipant={updateEditDraft}
              onEditCartFlagChange={setEditCartFlag}
              onEditRemoveParticipant={removeEditDraft}
              onEditSave={(bookingId) => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                void updateMutation.mutateAsync({ bookingId, payload: updatePayload() });
              }}
              onEditStart={startEdit}
              onNoShow={(bookingId) => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                noShowMutation.mutate(bookingId);
              }}
              pendingAction={pendingAction}
              pendingBookingId={pendingBookingId}
              savingBookingId={savingBookingId}
              selectedDate={selectedDate}
              slot={selectedSlot.slot}
              teeLabel={selectedSlot.rowLabel}
            />
          )
        : selectedSlot && drawerMode === "create"
          ? (
            <BookingCreateDrawer
              caddieFlag={createCaddieFlag}
              colorCode={selectedSlot.colorCode}
              creating={createMutation.isPending}
              cartFlag={createCartFlag}
              directory={directory}
              feedbackMessage={drawerFeedbackMessage}
              feedbackTone={drawerFeedbackTone}
              laneLabel={selectedSlot.laneLabel}
              onAddParticipant={addDraft}
              onCaddieFlagChange={setCreateCaddieFlag}
              onChangeParticipant={updateDraft}
              onClose={close}
              onCreate={() => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                void createMutation.mutateAsync(createPayload(selectedSlot));
              }}
              onCartFlagChange={setCreateCartFlag}
              onRemoveParticipant={removeDraft}
              participants={drafts}
              selectedDate={selectedDate}
              slot={selectedSlot.slot}
              teeLabel={selectedSlot.rowLabel}
            />
          )
        : null}
    </>
  );
}
