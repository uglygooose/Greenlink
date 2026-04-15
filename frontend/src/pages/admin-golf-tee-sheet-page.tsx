import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, startTransition, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  cancelBooking,
  checkInBooking,
  completeBooking,
  createBooking,
  markBookingNoShow,
  moveBooking,
  postBookingCharge,
  recordBookingPayment,
  updateBookingPaymentStatus,
  updateBooking,
} from "../api/operations";
import { ApiError } from "../api/client";
import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useCoursesQuery, useTeesQuery } from "../features/golf-settings/hooks";
import { invalidateClubOperationalReadModels } from "../features/operational-read-models/invalidation";
import { useClubDirectoryQuery } from "../features/people/hooks";
import { BookingCreateDrawer } from "../features/tee-sheet/booking-create-drawer";
import { BookingManagementDrawer } from "../features/tee-sheet/booking-management-drawer";
import type { DraftParticipant } from "../features/tee-sheet/booking-party-editor";
import { DatePickerPopover } from "../features/tee-sheet/date-picker-popover";
import { teeSheetDayQueryOptions, teeSheetKeys, useTeeSheetDayQuery } from "../features/tee-sheet/hooks";
import {
  bookingChipClass,
  bookingLeadParticipant,
  bookingParticipantNames,
  bookingPlayerCount,
  bookingStatusIconClass,
  bookingStatusIconName,
  BookingQuickActionPanel,
  canCreate,
  canDrop,
  canManage,
  canQuickAction,
  deriveBookingNextAction,
  InlineBookingContextPanel,
  nextActionBadgeProps,
  participantTypeBorderClass,
  paymentDotClass,
  paymentLabel,
  paymentTooltip,
  slotCapacity,
  slotPlayerCount,
  slotRemainingCapacity,
  type Action,
  type LaneSlot,
  type LayoutMode,
  type QuickAction,
  type TeeSheetBookingView,
} from "../features/tee-sheet/sheet-shared";
import { TeeSheetSwimLaneGrid } from "../features/tee-sheet/tee-sheet-swimlane-grid";
import { useDrawerAccessibility } from "../features/tee-sheet/use-drawer-accessibility";
import { useSession } from "../session/session-context";
import type {
  BookingCreateInput,
  BookingCreateParticipantInput,
  BookingCreateResult,
  BookingChargePostResult,
  BookingLifecycleMutationResult,
  BookingParticipantSummary,
  BookingPaymentRecordResult,
  BookingPaymentStatusUpdateResult,
  BookingParticipantType,
  BookingSummary,
  BookingUpdateInput,
  BookingUpdateResult,
  StartLane,
} from "../types/bookings";
import type { BookingRuleAppliesTo, Tee } from "../types/operations";
import type { ClubPersonEntry } from "../types/people";
import type { TeeSheetDayResponse, TeeSheetSlotDisplayStatus, TeeSheetSlotView } from "../types/tee-sheet";


type DrawerMode = "create" | "manage";
type Notice = { message: string; tone: "success" | "info" | "error" };
type DrawerFeedback = { bookingId: string | null; field: string | null; message: string };
type SelectedSlotKey = { startLane: StartLane | null; slotDatetime: string };
type ExpandedBookingContext = SelectedSlotKey & {
  bookingId: string;
  cellKey: string;
  participantId?: string | null;
  focusedParticipantName?: string | null;
  focusedParticipantType?: BookingParticipantType | null;
};
type Dragged = {
  bookingId: string;
  cellKey: string;
  participantId?: string | null;
  rowKey: string;
  slotDatetime: string;
};
type ViewFilter = "all" | "closed" | "golf_day" | "open" | "unpaid" | "no_shows" | "arrivals_due" | "unresolved" | "warnings";
type FinanceAction = "post_charge" | "record_payment" | "mark_complimentary" | "mark_waived";
type CommandPaletteItem =
  | {
      id: string;
      kind: "command";
      label: string;
      searchText: string;
      subtitle: string;
      viewFilter: ViewFilter;
    }
  | {
      booking: TeeSheetBookingView;
      id: string;
      kind: "booking";
      label: string;
      searchText: string;
      slot: LaneSlot;
      subtitle: string;
    };
export { deriveBookingNextAction };

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
  { label: "Arrivals Due", value: "arrivals_due" },
  { label: "Late / At Risk", value: "no_shows" },
  { label: "Unpaid", value: "unpaid" },
  { label: "Unresolved", value: "unresolved" },
  { label: "Warnings", value: "warnings" },
  { label: "Open Slots", value: "open" },
  { label: "Golf Day", value: "golf_day" },
  { label: "Closed / Holds", value: "closed" },
];

const ARRIVALS_DUE_WINDOW_MINUTES = 90;

// 5.5: Compound filter state — replaces the single ViewFilter.
type PartySize = 1 | 2 | 3 | 4 | "any";

type TeeSheetFilterState = {
  viewFilter: ViewFilter;
  partySize: PartySize;
  timeFrom: string | null; // "HH:MM"
  timeTo: string | null;   // "HH:MM"
};

const DEFAULT_FILTERS: TeeSheetFilterState = {
  viewFilter: "all",
  partySize: "any",
  timeFrom: null,
  timeTo: null,
};

const PARTY_SIZE_FILTERS: Array<{ label: string; value: PartySize }> = [
  { label: "Any", value: "any" },
  { label: "1", value: 1 },
  { label: "2-ball", value: 2 },
  { label: "3-ball", value: 3 },
  { label: "4-ball", value: 4 },
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

function normalizedDateSearchParam(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  return value;
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

function detail(slot: TeeSheetSlotView): string {
  return slot.blockers[0]?.reason ?? slot.unresolved_checks[0]?.reason ?? slot.warnings[0]?.message ?? "Open for booking";
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

function slotHasNoShowRisk(slot: TeeSheetSlotView, referenceDatetime: string | null | undefined): boolean {
  if (!referenceDatetime) return false;
  const referenceMillis = Date.parse(referenceDatetime);
  if (Number.isNaN(referenceMillis)) return false;
  return slot.bookings.some((booking) => booking.status === "reserved" && Date.parse(booking.slot_datetime) < referenceMillis);
}

function slotMatchesFilter(
  slot: TeeSheetSlotView,
  filter: ViewFilter,
  referenceDatetime: string | null | undefined,
): boolean {
  switch (filter) {
    case "unpaid":
      return slot.bookings.some((booking) => booking.payment_status === "pending");
    case "no_shows":
      return slotHasNoShowRisk(slot, referenceDatetime);
    case "arrivals_due":
      return slotHasArrivalsDue(slot, referenceDatetime);
    case "unresolved":
      return slot.bookings.some((booking) => bookingIsUnresolved(booking));
    case "warnings":
      return slotHasOperationalWarnings(slot);
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
function slotMatchesFilters(
  slot: TeeSheetSlotView,
  f: TeeSheetFilterState,
  referenceDatetime: string | null | undefined,
): boolean {
  return (
    slotMatchesFilter(slot, f.viewFilter, referenceDatetime) &&
    slotMatchesPartySize(slot, f.partySize) &&
    slotMatchesTimeRange(slot, f.timeFrom, f.timeTo)
  );
}

function initialViewFilterFromSearchParam(value: string | null): ViewFilter {
  switch (value) {
    case "unpaid":
      return "unpaid";
    case "no-shows":
      return "no_shows";
    case "arrivals-due":
      return "arrivals_due";
    case "unresolved":
      return "unresolved";
    case "warnings":
      return "warnings";
    case "open":
      return "open";
    case "golf_day":
      return "golf_day";
    case "closed":
      return "closed";
    default:
      return "all";
  }
}

function viewFilterLabel(value: ViewFilter): string {
  switch (value) {
    case "arrivals_due":
      return "Arrivals Due";
    case "no_shows":
      return "Late / At Risk";
    case "unpaid":
      return "Unpaid";
    case "unresolved":
      return "Unresolved";
    case "warnings":
      return "Warnings";
    case "open":
      return "Open Slots";
    case "golf_day":
      return "Golf Day";
    case "closed":
      return "Closed / Holds";
    default:
      return "All";
  }
}

function bookingStatusLabel(status: TeeSheetBookingView["status"]): string {
  return status.replace(/_/g, " ");
}

function bookingCommandTerms(
  booking: TeeSheetBookingView,
  referenceDatetime: string | null | undefined,
): string[] {
  const nextAction = deriveBookingNextAction(booking, referenceDatetime);
  const terms = [bookingStatusLabel(booking.status), paymentLabel(booking.payment_status)];
  if (nextAction === "at_risk") terms.push("Late / At Risk");
  if (nextAction === "ready_to_check_in") terms.push("Arrivals Due");
  if (booking.payment_status === "pending") terms.push("Unpaid");
  if (bookingIsUnresolved(booking)) terms.push("Unresolved");
  return terms;
}

function minutesUntilSlot(slotDatetime: string, referenceDatetime: string | null | undefined): number | null {
  if (!referenceDatetime) return null;
  const slotMillis = Date.parse(slotDatetime);
  const referenceMillis = Date.parse(referenceDatetime);
  if (Number.isNaN(slotMillis) || Number.isNaN(referenceMillis)) return null;
  return Math.floor((slotMillis - referenceMillis) / 60_000);
}

function slotHasArrivalsDue(slot: TeeSheetSlotView, referenceDatetime: string | null | undefined): boolean {
  return slot.bookings.some((booking) => {
    if (deriveBookingNextAction(booking, referenceDatetime) !== "ready_to_check_in") return false;
    const minutes = minutesUntilSlot(booking.slot_datetime, referenceDatetime);
    return minutes !== null && minutes >= 0 && minutes <= ARRIVALS_DUE_WINDOW_MINUTES;
  });
}

function bookingIsUnresolved(booking: Pick<TeeSheetBookingView, "payment_status" | "status">): boolean {
  return booking.payment_status === "pending" && (booking.status === "checked_in" || booking.status === "completed");
}

function matchesExpandedBooking(
  context: ExpandedBookingContext | null,
  slot: Pick<LaneSlot, "startLane" | "slot">,
  bookingId: string,
): boolean {
  return Boolean(
    context &&
    context.bookingId === bookingId &&
    context.startLane === slot.startLane &&
    context.slotDatetime === slot.slot.slot_datetime,
  );
}

function matchesExpandedBookingCell(
  context: ExpandedBookingContext | null,
  slot: Pick<LaneSlot, "startLane" | "slot">,
  bookingId: string,
  cellKey: string,
): boolean {
  return matchesExpandedBooking(context, slot, bookingId) && context?.cellKey === cellKey;
}

function findDirectoryEntryByDisplayName(
  displayName: string | null | undefined,
  directoryByName: Map<string, ClubPersonEntry>,
): ClubPersonEntry | null {
  if (!displayName) return null;
  return directoryByName.get(displayName) ?? null;
}

function slotHasOperationalWarnings(slot: TeeSheetSlotView): boolean {
  return (
    slot.display_status === "blocked" ||
    slot.display_status === "warning" ||
    slot.unresolved_checks.length > 0 ||
    slot.warnings.length > 0
  );
}

function countBookings(
  slotRows: LaneSlot[],
  predicate: (booking: TeeSheetBookingView, slot: TeeSheetSlotView) => boolean,
): number {
  return slotRows.reduce(
    (sum, item) => sum + item.slot.bookings.filter((booking) => predicate(booking, item.slot)).length,
    0,
  );
}

function summaryChipClass(tone: "neutral" | "warning" | "danger"): string {
  if (tone === "danger") return "border-rose-200 bg-rose-50/90 text-rose-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50/90 text-amber-900";
  return "border-emerald-100 bg-white/90 text-on-surface";
}

function filterChipClass(active: boolean): string {
  return active
    ? "border-primary bg-primary text-white"
    : "border-slate-200 bg-white text-on-surface hover:border-primary/30 hover:bg-primary-container/10";
}

function laneGroupKey(startLane: StartLane | null): string {
  return startLane ?? "hole_1";
}

function slotSurfacePriority(slot: TeeSheetSlotView): number {
  if (slot.bookings.length > 0) return 4;
  if (canCreate(slot)) return 3;
  if (slot.display_status === "warning" || slot.display_status === "indeterminate") return 2;
  if (slot.display_status === "available") return 1;
  return 0;
}

function mergeLaneSlotGroup(group: LaneSlot[]): LaneSlot {
  const representative = [...group].sort((a, b) => slotSurfacePriority(b.slot) - slotSurfacePriority(a.slot))[0] ?? group[0];
  const bookings = Array.from(
    new Map(
      group
        .flatMap((item) => item.slot.bookings)
        .map((booking) => [booking.id, booking] as const),
    ).values(),
  );
  const warnings = Array.from(
    new Map(
      group
        .flatMap((item) => item.slot.warnings)
        .map((warning) => [`${warning.code}:${warning.message}`, warning] as const),
    ).values(),
  );

  return {
    ...representative,
    colorCode: null,
    laneLabel: laneLabel(representative.startLane),
    rowLabel: laneLabel(representative.startLane),
    slot: {
      ...updateSlotFromBookings(representative.slot, bookings),
      warnings,
    },
  };
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

function normalizeOptimisticParticipants(
  participants: BookingParticipantSummary[],
): BookingParticipantSummary[] {
  return participants.map((participant, index) => ({
    ...participant,
    is_primary: index === 0,
    sort_order: index,
  }));
}

function optimisticallyMoveBooking(
  day: TeeSheetDayResponse | undefined,
  bookingId: string,
  target: LaneSlot,
  participantId?: string | null,
): TeeSheetDayResponse | undefined {
  if (!day) return day;
  let sourceBooking: TeeSheetBookingView | null = null;
  let movingParticipant: BookingParticipantSummary | null = null;
  for (const row of day.rows) {
    for (const slot of row.slots) {
      const booking = slot.bookings.find((entry) => entry.id === bookingId);
      if (booking) {
        sourceBooking = booking;
        movingParticipant = participantId
          ? booking.participants.find((participant) => participant.id === participantId) ?? null
          : null;
      }
    }
  }
  if (!sourceBooking) return day;

  const splitParticipantMove = Boolean(participantId && movingParticipant && sourceBooking.participants.length > 1);
  const bookingToMove: TeeSheetBookingView = splitParticipantMove
    ? {
        ...sourceBooking,
        id: `${sourceBooking.id}:optimistic:${participantId}`,
        party_size: 1,
        slot_datetime: target.slot.slot_datetime,
        start_lane: target.startLane,
        participants: normalizeOptimisticParticipants([movingParticipant as BookingParticipantSummary]),
      }
    : {
        ...sourceBooking,
        slot_datetime: target.slot.slot_datetime,
        start_lane: target.startLane,
      };

  return {
    ...day,
    rows: day.rows.map((row) => ({
      ...row,
      slots: row.slots.map((slot) => {
        const isSource = slot.bookings.some((booking) => booking.id === bookingId);
        const isTarget = row.start_lane === target.startLane && slot.slot_datetime === target.slot.slot_datetime;
        if (!isSource && !isTarget) return slot;
        let nextBookings = slot.bookings.flatMap((booking) => {
          if (booking.id !== bookingId) return [booking];
          if (!splitParticipantMove || !participantId) return [];

          const remainingParticipants = booking.participants.filter((participant) => participant.id !== participantId);
          if (remainingParticipants.length === 0) return [];

          return [{
            ...booking,
            party_size: remainingParticipants.length,
            participants: normalizeOptimisticParticipants(remainingParticipants),
          }];
        });
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

function bookingFinanceFeedback(
  result: BookingPaymentStatusUpdateResult | BookingChargePostResult | BookingPaymentRecordResult,
): DrawerFeedback {
  const failure = result.failures[0];
  if (!failure) {
    return { bookingId: result.booking_id, field: null, message: "Finance action blocked." };
  }
  switch (failure.code) {
    case "booking_charge_not_posted":
      return {
        bookingId: result.booking_id,
        field: null,
        message: "Post the booking charge before recording payment.",
      };
    case "booking_finance_account_not_found":
      return {
        bookingId: result.booking_id,
        field: null,
        message: "Link an active finance account to this booking before posting the charge.",
      };
    case "booking_finance_account_closed":
      return {
        bookingId: result.booking_id,
        field: null,
        message: "The linked finance account is closed. Reopen or replace it before posting the charge.",
      };
    case "booking_charge_amount_unresolved":
      return {
        bookingId: result.booking_id,
        field: "amount",
        message: "Resolved booking price is unavailable. Enter an override amount or fix pricing setup first.",
      };
    default:
      return {
        bookingId: result.booking_id,
        field: failure.field ?? null,
        message: failure.message,
      };
  }
}

function bookingFinanceSuccessMessage(
  action: FinanceAction,
  result: BookingPaymentStatusUpdateResult | BookingChargePostResult | BookingPaymentRecordResult,
): string {
  switch (action) {
    case "post_charge":
      return "posting_applied" in result && result.posting_applied
        ? "Charge posted. Tee sheet refreshed from backend state."
        : "Charge was already posted. Tee sheet refreshed from backend state.";
    case "record_payment":
      return "settlement_applied" in result && result.settlement_applied
        ? "Payment recorded. Tee sheet refreshed from backend state."
        : "Payment was already recorded. Tee sheet refreshed from backend state.";
    case "mark_complimentary":
      return "update_applied" in result && result.update_applied
        ? "Booking marked complimentary. Tee sheet refreshed from backend state."
        : "Booking was already marked complimentary.";
    case "mark_waived":
      return "update_applied" in result && result.update_applied
        ? "Booking marked waived. Tee sheet refreshed from backend state."
        : "Booking was already marked waived.";
  }
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

function TeeSheetGridSkeleton(): JSX.Element {
  const laneRows = ["1st Tee", "10th Tee", "Practice Tee"];
  const bucketCount = 8;

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm"
      data-testid="tee-sheet-grid-skeleton"
    >
      <div className="border-b border-slate-200/70 bg-slate-50/80 px-4 py-4">
        <div className="grid grid-cols-[136px_repeat(8,minmax(0,1fr))] gap-3">
          <div className="h-10 rounded-2xl bg-slate-200/80 animate-pulse" />
          {Array.from({ length: bucketCount }).map((_, index) => (
            <div key={`header-${index}`} className="space-y-2 rounded-2xl bg-white/70 px-3 py-2 shadow-sm">
              <div className="h-3 w-12 rounded-full bg-slate-200/90 animate-pulse" />
              <div className="h-6 rounded-xl bg-slate-200/80 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 bg-slate-50/50 px-4 py-4">
        {laneRows.map((label) => (
          <div key={label} className="grid grid-cols-[136px_repeat(8,minmax(0,1fr))] gap-3">
            <div className="space-y-2 rounded-[24px] bg-slate-100/90 px-4 py-4">
              <div className="h-3 w-16 rounded-full bg-slate-200/90 animate-pulse" />
              <div className="h-7 rounded-2xl bg-slate-200/80 animate-pulse" />
            </div>
            {Array.from({ length: bucketCount }).map((_, index) => (
              <div key={`${label}-${index}`} className="h-28 rounded-[24px] border border-slate-200/80 bg-white/85 p-3 shadow-sm">
                <div className="space-y-3">
                  <div className="h-3 w-14 rounded-full bg-slate-200/90 animate-pulse" />
                  <div className="h-10 rounded-2xl bg-slate-200/80 animate-pulse" />
                  <div className="h-3 w-20 rounded-full bg-slate-200/80 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminGolfTeeSheetPage(): JSX.Element {
  const { accessToken, bootstrap, initialized, loading } = useSession();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const deepLinkedDate = normalizedDateSearchParam(searchParams.get("date"));
  const deepLinkedCourseId = searchParams.get("courseId");
  const [selectedDate, setSelectedDate] = useState(() => deepLinkedDate ?? todayValue());
  const membershipType: BookingRuleAppliesTo = "staff";
  const [courseId, setCourseId] = useState<string | null>(deepLinkedCourseId);
  const teeId = null;
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState<SelectedSlotKey | null>(null);
  const [drawerFeedbackMessage, setDrawerFeedbackMessage] = useState<string | null>(null);
  const [drawerFeedbackTone, setDrawerFeedbackTone] = useState<"error" | "info" | null>(null);
  const [drawerFeedbackField, setDrawerFeedbackField] = useState<string | null>(null);
  const [drawerFeedbackBookingId, setDrawerFeedbackBookingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [drafts, setDrafts] = useState<DraftParticipant[]>(initialDrafts("member"));
  const [createCartFlag, setCreateCartFlag] = useState(false);
  const [createCaddieFlag, setCreateCaddieFlag] = useState(false);
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const draggedRef = useRef<Dragged | null>(null);
  const activeTableDropLaneCellRef = useRef<HTMLTableCellElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const [searchInputValue, setSearchInputValue] = useState("");
  // 5.5: Compound filter state replaces single ViewFilter.
  const [filters, setFilters] = useState<TeeSheetFilterState>(() => ({
    ...DEFAULT_FILTERS,
    viewFilter: initialViewFilterFromSearchParam(searchParams.get("filter")),
  }));
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [highlightedSlotKey, setHighlightedSlotKey] = useState<string | null>(null);
  const [toolbarCompact, setToolbarCompact] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    try {
      const stored = localStorage.getItem("gl-tee-sheet-layout");
      return stored === "timeline" ? "timeline" : "classic";
    } catch {
      return "classic";
    }
  });

  useEffect(() => {
    if (drawerFeedbackMessage !== null) return;
    setDrawerFeedbackField(null);
    setDrawerFeedbackBookingId(null);
  }, [drawerFeedbackMessage]);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<DraftParticipant[]>([]);
  const [editCartFlag, setEditCartFlag] = useState(false);
  const [editCaddieFlag, setEditCaddieFlag] = useState(false);
  const [inlineActionState, setInlineActionState] = useState<{ action: QuickAction; bookingId: string } | null>(null);
  const [checkingInAllBucket, setCheckingInAllBucket] = useState<string | null>(null);
  const [expandedBookingContext, setExpandedBookingContext] = useState<ExpandedBookingContext | null>(null);
  const [batchNoShowConfirmOpen, setBatchNoShowConfirmOpen] = useState(false);
  const [batchNoShowPending, setBatchNoShowPending] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [commandPaletteActiveIndex, setCommandPaletteActiveIndex] = useState(0);
  const pendingAutoScrollDateRef = useRef<string | null>(selectedDate);
  const prefetchedAdjacentSeedRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const expandedBookingCardRef = useRef<HTMLElement | null>(null);
  const expandedBookingPanelRef = useRef<HTMLDivElement | null>(null);
  const batchNoShowDialogRef = useRef<HTMLDivElement | null>(null);
  const batchNoShowCancelRef = useRef<HTMLButtonElement | null>(null);
  const commandPaletteDialogRef = useRef<HTMLDivElement | null>(null);
  const commandPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const debouncedSearchTerm = useDebouncedValue(searchInputValue, 200);

  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const sessionReady = initialized && !loading && Boolean(accessToken && bootstrap && selectedClubId);
  const guardedAccessToken = sessionReady ? accessToken : null;
  const guardedSelectedClubId = sessionReady ? selectedClubId : null;
  const coursesQuery = useCoursesQuery({ accessToken: guardedAccessToken, selectedClubId: guardedSelectedClubId });
  const teesQuery = useTeesQuery({ accessToken: guardedAccessToken, selectedClubId: guardedSelectedClubId });
  const directoryQuery = useClubDirectoryQuery({ accessToken: guardedAccessToken, selectedClubId: guardedSelectedClubId });
  const selectedCourse = useMemo(
    () => (coursesQuery.data ?? []).find((course) => course.id === courseId) ?? null,
    [courseId, coursesQuery.data],
  );
  const activeCourseTees = useMemo(
    () => (teesQuery.data ?? []).filter((tee: Tee) => tee.course_id === courseId && tee.active),
    [courseId, teesQuery.data],
  );
  // teeId === null means "all tees" — no auto-resolution to first tee so the query key
  // matches the nav-hover prefetch (which also uses null / "all-tees").
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

  const rawSlots = useMemo<LaneSlot[]>(
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

  const slots = useMemo<LaneSlot[]>(() => {
    const laneGroups = new Map<string, LaneSlot[]>();
    for (const slot of rawSlots) {
      const key = `${laneGroupKey(slot.startLane)}:${slot.slot.slot_datetime}`;
      const group = laneGroups.get(key) ?? [];
      group.push(slot);
      laneGroups.set(key, group);
    }
    return Array.from(laneGroups.values())
      .map((group) => mergeLaneSlotGroup(group))
      .sort(
        (a, b) =>
          a.slot.local_time.localeCompare(b.slot.local_time) ||
          laneOrder(a.startLane) - laneOrder(b.startLane) ||
          a.rowLabel.localeCompare(b.rowLabel),
      );
  }, [rawSlots]);

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
          slots: bucket.slots.filter(
            (slot) =>
              slotMatchesSearch(slot, debouncedSearchTerm) &&
              slotMatchesFilters(slot.slot, filters, teeSheetQuery.data?.reference_datetime ?? null),
          ),
        }))
        .filter((bucket) => bucket.slots.length > 0),
    [buckets, debouncedSearchTerm, filters, teeSheetQuery.data?.reference_datetime],
  );

  const batchNoShowBookings = useMemo(() => {
    if (filters.viewFilter !== "no_shows") return [];

    const seen = new Set<string>();
    return filteredBuckets.flatMap((bucket) =>
      bucket.slots.flatMap((slot) =>
        slot.slot.bookings.filter((booking) => {
          if (seen.has(booking.id)) return false;
          const qualifies =
            deriveBookingNextAction(booking, teeSheetQuery.data?.reference_datetime ?? null) === "at_risk" &&
            canQuickAction(booking, "no_show");
          if (qualifies) seen.add(booking.id);
          return qualifies;
        }),
      ),
    );
  }, [filteredBuckets, filters.viewFilter, teeSheetQuery.data?.reference_datetime]);

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

  const selectedSlot = useMemo(() => {
    if (!selectedSlotKey) return null;
    const slot =
      slots.find((item) => item.startLane === selectedSlotKey.startLane && item.slot.slot_datetime === selectedSlotKey.slotDatetime) ?? null;
    if (!slot || !expandedBookingContext) return slot;
    if (!matchesExpandedBooking(expandedBookingContext, slot, expandedBookingContext.bookingId)) return slot;

    const focusedBookingIndex = slot.slot.bookings.findIndex((booking) => booking.id === expandedBookingContext.bookingId);
    if (focusedBookingIndex < 0) return slot;

    const focusedBooking = slot.slot.bookings[focusedBookingIndex];
    const focusedParticipantIndex = expandedBookingContext.participantId
      ? focusedBooking.participants.findIndex((participant) => participant.id === expandedBookingContext.participantId)
      : expandedBookingContext.focusedParticipantName
        ? focusedBooking.participants.findIndex((participant) => participant.display_name === expandedBookingContext.focusedParticipantName)
        : -1;
    const focusedBookingForDrawer = focusedParticipantIndex > 0
      ? {
          ...focusedBooking,
          participants: normalizeOptimisticParticipants([
            focusedBooking.participants[focusedParticipantIndex],
            ...focusedBooking.participants.filter((_, index) => index !== focusedParticipantIndex),
          ]),
        }
      : focusedBooking;

    if (focusedBookingIndex === 0) {
      if (focusedBookingForDrawer === focusedBooking) return slot;
      return {
        ...slot,
        slot: {
          ...slot.slot,
          bookings: [focusedBookingForDrawer, ...slot.slot.bookings.slice(1)],
        },
      };
    }

    const otherBookings = slot.slot.bookings.filter((booking) => booking.id !== expandedBookingContext.bookingId);

    return {
      ...slot,
      slot: {
        ...slot.slot,
        bookings: [focusedBookingForDrawer, ...otherBookings],
      },
    };
  }, [expandedBookingContext, selectedSlotKey, slots]);
  const inlineExpandedBookingContext = drawerMode === "manage" ? null : expandedBookingContext;

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
    await invalidateClubOperationalReadModels(queryClient, guardedSelectedClubId);
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
    if (expandedBookingContext?.bookingId === result.booking_id) {
      setExpandedBookingContext(null);
    }
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

  const paymentStatusMutation = useMutation({
    mutationFn: ({ bookingId, paymentStatus }: { bookingId: string; paymentStatus: "complimentary" | "waived" }) =>
      updateBookingPaymentStatus(
        bookingId,
        { payment_status: paymentStatus },
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    onSuccess: async (result, variables) => {
      if (result.decision === "blocked") {
        const feedback = bookingFinanceFeedback(result);
        setDrawerFeedbackField(feedback.field);
        setDrawerFeedbackBookingId(feedback.bookingId);
        setDrawerFeedbackTone("error");
        setDrawerFeedbackMessage(feedback.message);
        return;
      }
      setDrawerFeedbackField(null);
      setDrawerFeedbackBookingId(null);
      setDrawerFeedbackTone("info");
      setDrawerFeedbackMessage(
        bookingFinanceSuccessMessage(
          variables.paymentStatus === "complimentary" ? "mark_complimentary" : "mark_waived",
          result,
        ),
      );
      await invalidate();
    },
    onError: (error) => {
      setDrawerFeedbackField(null);
      setDrawerFeedbackBookingId(null);
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(asMessage(error));
    },
  });

  const postChargeMutation = useMutation({
    mutationFn: ({ bookingId, amount }: { bookingId: string; amount?: string }) =>
      postBookingCharge(
        bookingId,
        amount ? { amount } : {},
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    onSuccess: async (result) => {
      if (result.decision === "blocked") {
        const feedback = bookingFinanceFeedback(result);
        setDrawerFeedbackField(feedback.field);
        setDrawerFeedbackBookingId(feedback.bookingId);
        setDrawerFeedbackTone("error");
        setDrawerFeedbackMessage(feedback.message);
        return;
      }
      setDrawerFeedbackField(null);
      setDrawerFeedbackBookingId(null);
      setDrawerFeedbackTone("info");
      setDrawerFeedbackMessage(bookingFinanceSuccessMessage("post_charge", result));
      await invalidate();
    },
    onError: (error) => {
      setDrawerFeedbackField(null);
      setDrawerFeedbackBookingId(null);
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(asMessage(error));
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: (bookingId: string) =>
      recordBookingPayment(bookingId, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onSuccess: async (result) => {
      if (result.decision === "blocked") {
        const feedback = bookingFinanceFeedback(result);
        setDrawerFeedbackField(feedback.field);
        setDrawerFeedbackBookingId(feedback.bookingId);
        setDrawerFeedbackTone("error");
        setDrawerFeedbackMessage(feedback.message);
        return;
      }
      setDrawerFeedbackField(null);
      setDrawerFeedbackBookingId(null);
      setDrawerFeedbackTone("info");
      setDrawerFeedbackMessage(bookingFinanceSuccessMessage("record_payment", result));
      await invalidate();
    },
    onError: (error) => {
      setDrawerFeedbackField(null);
      setDrawerFeedbackBookingId(null);
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(asMessage(error));
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ bookingId, participantId, target }: { bookingId: string; participantId?: string | null; target: LaneSlot }) =>
      moveBooking(
        bookingId,
        {
          target_slot_datetime: target.slot.slot_datetime,
          target_start_lane: target.startLane,
          target_tee_id: target.teeId,
          participant_id: participantId ?? null,
        },
        { accessToken: accessToken as string, selectedClubId: selectedClubId as string },
      ),
    onMutate: async ({ bookingId, participantId, target }) => {
      if (!currentDayKey) return { previousDay: undefined };
      const previousDay = queryClient.getQueryData<TeeSheetDayResponse>(currentDayKey);
      queryClient.setQueryData<TeeSheetDayResponse>(currentDayKey, (current) =>
        optimisticallyMoveBooking(current, bookingId, target, participantId),
      );
      setDragged(null);
      await queryClient.cancelQueries({ queryKey: currentDayKey });
      return { previousDay };
    },
    onSuccess: async (result, variables, context) => {
      if (result.decision === "blocked") {
        if (currentDayKey && context?.previousDay) queryClient.setQueryData(currentDayKey, context.previousDay);
        const message = result.failures[0]?.message ?? "Move blocked.";
        setNotice({ tone: "error", message });
        if (selectedSlotKey?.startLane === variables.target.startLane && selectedSlotKey.slotDatetime === variables.target.slot.slot_datetime) {
          setDrawerFeedbackTone("error");
          setDrawerFeedbackMessage(message);
        }
        return;
      }
      setDrawerFeedbackMessage(null);
      setDrawerFeedbackTone(null);
      setSelectedSlotKey(null);
      setDrawerMode(null);
      setExpandedBookingContext(null);
      resetEditState();
      setNotice({
        tone: result.transition_applied ? "success" : "info",
        message: result.transition_applied ? "Slot moved." : "Slot was already at the requested time.",
      });
      void invalidate();
    },
    onError: (error, _variables, context) => {
      if (currentDayKey && context?.previousDay) queryClient.setQueryData(currentDayKey, context.previousDay);
      setDragged(null);
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

  useEffect(() => {
    if (!configuredForSheet) {
      setToolbarCompact(false);
      return;
    }

    const compactThreshold = 88;
    const syncToolbarCompact = (): void => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        setToolbarCompact(window.scrollY > compactThreshold);
      });
    };

    setToolbarCompact(window.scrollY > compactThreshold);
    window.addEventListener("scroll", syncToolbarCompact, { passive: true });
    return () => {
      window.removeEventListener("scroll", syncToolbarCompact);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [configuredForSheet]);

  const totalSlots = slots.length;
  const occupiedSlots = slots.filter((item) => item.slot.bookings.length > 0).length;
  const checkedInBookings = slots.reduce((sum, item) => sum + item.slot.bookings.filter((booking) => booking.status === "checked_in").length, 0);
  const checkedInPlayers = slots.reduce((sum, item) => sum + item.slot.bookings.filter((booking) => booking.status === "checked_in").reduce((inner, booking) => inner + bookingPlayerCount(booking), 0), 0);
  const openSlots = slots.filter((item) => canCreate(item.slot)).length;
  const openPlayerCapacity = slots.reduce((sum, item) => sum + slotRemainingCapacity(item.slot), 0);
  const alertSignals = (teeSheetQuery.data?.warnings.length ?? 0) + statusCounts.warning + statusCounts.blocked;
  const occupancyPct = totalSlots === 0 ? 0 : Math.round((occupiedSlots / totalSlots) * 100);
  const unpaidBookingsCount = countBookings(
    slots,
    (booking) => deriveBookingNextAction(booking, teeSheetQuery.data?.reference_datetime ?? null) === "needs_payment",
  );
  const noShowRiskCount = countBookings(
    slots,
    (booking) =>
      booking.status === "reserved" &&
      teeSheetQuery.data?.reference_datetime != null &&
      Date.parse(booking.slot_datetime) < Date.parse(teeSheetQuery.data.reference_datetime),
  );
  const arrivalsDueCount = countBookings(slots, (booking) => {
    if (deriveBookingNextAction(booking, teeSheetQuery.data?.reference_datetime ?? null) !== "ready_to_check_in") return false;
    const minutes = minutesUntilSlot(booking.slot_datetime, teeSheetQuery.data?.reference_datetime ?? null);
    return minutes !== null && minutes >= 0 && minutes <= ARRIVALS_DUE_WINDOW_MINUTES;
  });
  const unresolvedBookingsCount = countBookings(slots, (booking) => bookingIsUnresolved(booking));
  const warningSlotsCount = slots.filter((item) => slotHasOperationalWarnings(item.slot)).length;
  const pendingAction = inlineActionState?.action ?? (cancelMutation.isPending ? "cancel" : checkInMutation.isPending ? "check_in" : completeMutation.isPending ? "complete" : noShowMutation.isPending ? "no_show" : null);
  const pendingBookingId =
    inlineActionState?.bookingId ??
    (cancelMutation.isPending ? cancelMutation.variables ?? null : checkInMutation.isPending ? checkInMutation.variables ?? null : completeMutation.isPending ? completeMutation.variables ?? null : noShowMutation.isPending ? noShowMutation.variables ?? null : null);
  const pendingFinanceAction: FinanceAction | null = paymentStatusMutation.isPending
    ? paymentStatusMutation.variables?.paymentStatus === "complimentary"
      ? "mark_complimentary"
      : "mark_waived"
    : postChargeMutation.isPending
      ? "post_charge"
      : recordPaymentMutation.isPending
        ? "record_payment"
        : null;
  const pendingFinanceBookingId =
    paymentStatusMutation.isPending
      ? paymentStatusMutation.variables?.bookingId ?? null
      : postChargeMutation.isPending
        ? postChargeMutation.variables?.bookingId ?? null
        : recordPaymentMutation.isPending
          ? recordPaymentMutation.variables ?? null
          : null;
  const movingBookingId = moveMutation.isPending ? moveMutation.variables?.bookingId ?? null : null;
  const savingBookingId = updateMutation.isPending ? updateMutation.variables?.bookingId ?? null : null;
  const directory = directoryQuery.data ?? [];
  const directoryByName = useMemo(
    () => new Map(directory.map((entry) => [entry.person.full_name, entry])),
    [directory],
  );
  const closeExpandedBookingContext = useCallback((): void => {
    setExpandedBookingContext(null);
  }, []);
  const closeCommandPalette = useCallback((): void => {
    setCommandPaletteOpen(false);
    setCommandPaletteQuery("");
    setCommandPaletteActiveIndex(0);
  }, []);
  const openCommandPalette = useCallback((): void => {
    setCommandPaletteOpen(true);
    setCommandPaletteQuery("");
    setCommandPaletteActiveIndex(0);
  }, []);
  const setExpandedBookingCardElement = useCallback((node: HTMLElement | null): void => {
    expandedBookingCardRef.current = node;
  }, []);
  const setExpandedBookingPanelElement = useCallback((node: HTMLDivElement | null): void => {
    expandedBookingPanelRef.current = node;
  }, []);

  const openManage = useCallback((slot: LaneSlot, initialBookingId?: string): void => {
    if (!canManage(slot.slot)) return;
    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setExpandedBookingContext(
      initialBookingId
        ? (
            matchesExpandedBooking(expandedBookingContext, slot, initialBookingId)
              ? expandedBookingContext
              : {
                  bookingId: initialBookingId,
                  cellKey: `${initialBookingId}:lead`,
                  focusedParticipantName: null,
                  focusedParticipantType: null,
                  participantId: null,
                  slotDatetime: slot.slot.slot_datetime,
                  startLane: slot.startLane,
                }
          )
        : null,
    );
    resetCreateDrafts();
    setDrawerMode("manage");
    resetEditState();
    setSelectedSlotKey({ startLane: slot.startLane, slotDatetime: slot.slot.slot_datetime });
  }, [expandedBookingContext, resetCreateDrafts, resetEditState]);

  const openCreate = useCallback((slot: LaneSlot): void => {
    if (!canCreate(slot.slot)) return;
    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setExpandedBookingContext(null);
    resetCreateDrafts();
    setDrawerMode("create");
    resetEditState();
    setSelectedSlotKey({ startLane: slot.startLane, slotDatetime: slot.slot.slot_datetime });
  }, [resetCreateDrafts, resetEditState]);

  const toggleBookingExpansion = useCallback((
    slot: LaneSlot,
    booking: TeeSheetBookingView,
    cellKey = `${booking.id}:lead`,
    participantId?: string | null,
    focusedParticipantName?: string | null,
    focusedParticipantType?: BookingParticipantType | null,
  ): void => {
    setExpandedBookingContext((current) => (
      matchesExpandedBookingCell(current, slot, booking.id, cellKey)
        ? null
        : {
            bookingId: booking.id,
            cellKey,
            participantId: participantId ?? null,
            focusedParticipantName: focusedParticipantName ?? null,
            focusedParticipantType: focusedParticipantType ?? null,
            startLane: slot.startLane,
            slotDatetime: slot.slot.slot_datetime,
          }
    ));
  }, []);

  const dropKey = useCallback((slot: LaneSlot): string => {
    return `${slot.rowKey}:${slot.slot.slot_datetime}`;
  }, []);

  const navigateToBookingContext = useCallback((slot: LaneSlot, booking: TeeSheetBookingView): void => {
    const key = dropKey(slot);
    const targetTime = timeKey(slot.slot.local_time);
    const leadParticipant = bookingLeadParticipant(booking);
    setSearchInputValue("");
    setFilters(DEFAULT_FILTERS);
    setFiltersPanelOpen(false);
    setSelectedSlotKey(null);
    setDrawerMode(null);
    setHighlightedSlotKey(key);
    setExpandedBookingContext({
      bookingId: booking.id,
      cellKey: `${booking.id}:lead`,
      participantId: leadParticipant?.id ?? null,
      focusedParticipantName: leadParticipant?.display_name ?? null,
      focusedParticipantType: leadParticipant?.participant_type ?? null,
      startLane: slot.startLane,
      slotDatetime: slot.slot.slot_datetime,
    });
    window.setTimeout(() => setHighlightedSlotKey(null), 1500);
    document.getElementById(`bucket-${targetTime}`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [dropKey]);

  const isBookingExpanded = useCallback((slot: LaneSlot, booking: TeeSheetBookingView): boolean => (
    matchesExpandedBooking(inlineExpandedBookingContext, slot, booking.id)
  ), [inlineExpandedBookingContext]);

  const nextBookableSlot = useMemo(
    () => filteredBuckets.flatMap((bucket) => bucket.slots).find((slot) => canCreate(slot.slot)) ?? slots.find((slot) => canCreate(slot.slot)) ?? null,
    [filteredBuckets, slots],
  );

  const openNextBookableSlot = useCallback((): void => {
    if (!nextBookableSlot) {
      setNotice({ tone: "info", message: "No open booking slots are available with the current tee-sheet posture." });
      return;
    }
    openCreate(nextBookableSlot);
  }, [nextBookableSlot, openCreate]);

  const closeBatchNoShowConfirm = useCallback((): void => {
    if (batchNoShowPending) return;
    setBatchNoShowConfirmOpen(false);
  }, [batchNoShowPending]);

  useDrawerAccessibility({
    containerRef: batchNoShowDialogRef,
    initialFocusRef: batchNoShowCancelRef,
    onClose: closeBatchNoShowConfirm,
  });

  useDrawerAccessibility({
    containerRef: commandPaletteDialogRef,
    initialFocusRef: commandPaletteInputRef,
    onClose: closeCommandPalette,
  });

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

  function addDraft(type: BookingParticipantType): void {
    setDrafts((current) => (current.length >= 4 ? current : [...current, { key: nextKey(), participant_type: type, person_id: null, guest_name: "", is_primary: false }]));
  }

  function removeDraft(key: string): void {
    setDrafts((current) => current.filter((participant) => participant.key !== key || participant.is_primary));
  }

  function updateEditDraft(key: string, patch: Partial<DraftParticipant>): void {
    setEditDrafts((current) => current.map((participant) => (participant.key === key ? { ...participant, ...patch } : participant)));
  }

  function addEditDraft(type: BookingParticipantType): void {
    setEditDrafts((current) => (current.length >= 4 ? current : [...current, { key: nextKey(), participant_type: type, person_id: null, guest_name: "", is_primary: false }]));
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
    const appliesTo = primary?.participant_type === "staff" ? "staff" : primary?.participant_type === "guest" ? "guest" : primary?.participant_type === "member" ? "member" : undefined;
    return {
      course_id: courseId as string,
      tee_id: slot.teeId,
      start_lane: slot.startLane,
      slot_datetime: slot.slot.slot_datetime,
      slot_interval_minutes: teeSheetQuery.data?.interval_minutes ?? null,
      source: "admin",
      holes: selectedCourse?.holes ?? null,
      applies_to: appliesTo,
      reference_datetime: teeSheetQuery.data?.reference_datetime ?? null,
      cart_flag: createCartFlag,
      caddie_flag: createCaddieFlag,
      participants,
    };
  }

  function updatePayload(): BookingUpdateInput {
    const participants = asParticipantPayload(editDrafts);
    const primary = editDrafts.find((participant) => participant.is_primary);
    const appliesTo = primary?.participant_type === "staff" ? "staff" : primary?.participant_type === "guest" ? "guest" : primary?.participant_type === "member" ? "member" : undefined;
    return {
      holes: selectedCourse?.holes ?? null,
      applies_to: appliesTo,
      reference_datetime: teeSheetQuery.data?.reference_datetime ?? null,
      cart_flag: editCartFlag,
      caddie_flag: editCaddieFlag,
      participants,
    };
  }

  const dropAllowed = useCallback((target: LaneSlot): boolean => {
    const d = draggedRef.current;
    return Boolean(d && canDrop(target.slot) && !(d.rowKey === target.rowKey && d.slotDatetime === target.slot.slot_datetime));
  }, []);

  const clearActiveTableDropTarget = useCallback((): void => {
    activeTableDropLaneCellRef.current?.classList.remove("tee-sheet-drop-target");
    activeTableDropLaneCellRef.current = null;
  }, []);

  const setActiveTableDropTarget = useCallback((row: HTMLTableRowElement): void => {
    const laneCell = row.querySelector<HTMLTableCellElement>('[data-drop-lane="true"]');
    if (!laneCell || activeTableDropLaneCellRef.current === laneCell) return;
    clearActiveTableDropTarget();
    laneCell.classList.add("tee-sheet-drop-target");
    activeTableDropLaneCellRef.current = laneCell;
  }, [clearActiveTableDropTarget]);

  const startDrag = useCallback((
    event: DragEvent<HTMLElement>,
    bookingId: string,
    slot: LaneSlot,
    cellKey = bookingId,
    participantId?: string | null,
  ): void => {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", bookingId);
      try {
        const timeLabel = slot.slot.local_time.slice(0, 5);
        const ghost = document.createElement("div");
        ghost.textContent = `Moving · ${timeLabel}`;
        ghost.style.cssText =
          "position:fixed;top:-9999px;left:-9999px;background:#1a5c3e;color:#fff;font-size:12px;font-weight:600;padding:6px 12px;border-radius:20px;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.25);";
        document.body.appendChild(ghost);
        event.dataTransfer.setDragImage(ghost, 20, 20);
        requestAnimationFrame(() => document.body.removeChild(ghost));
      } catch {
        // setDragImage is best-effort; ignore if unavailable
      }
    }
    const dragState: Dragged = {
      bookingId,
      cellKey,
      participantId: participantId ?? null,
      rowKey: slot.rowKey,
      slotDatetime: slot.slot.slot_datetime,
    };
    draggedRef.current = dragState;
    setDragged(dragState);
    setNotice(null);
  }, []);

  const endDrag = useCallback((): void => {
    draggedRef.current = null;
    setDragged(null);
    clearActiveTableDropTarget();
  }, [clearActiveTableDropTarget]);

  // Stable wrappers so TeeSheetSwimLaneGrid never gets new function references on
  // re-renders that are unrelated to drag state changes.
  const onGridCheckInAllRef = useRef<(slotDatetime: string) => Promise<void>>(async () => undefined);
  const onGridCheckInAll = useCallback((slotDatetime: string): void => {
    void onGridCheckInAllRef.current(slotDatetime);
  }, []);

  const onGridMoveBooking = useCallback((target: LaneSlot): void => {
    const d = draggedRef.current;
    if (!d) return;
    moveMutation.mutate({ bookingId: d.bookingId, target });
  }, [moveMutation]);

  const runInlineQuickAction = useCallback(async (action: QuickAction, bookingId: string): Promise<void> => {
    if (!accessToken || !selectedClubId) return;
    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setInlineActionState({ action, bookingId });

    try {
      if (action === "cancel") await cancelMutation.mutateAsync(bookingId);
      else if (action === "check_in") await checkInMutation.mutateAsync(bookingId);
      else if (action === "complete") await completeMutation.mutateAsync(bookingId);
      else await noShowMutation.mutateAsync(bookingId);
    } catch {
      // Mutation callbacks already handle rollback and staff feedback.
    } finally {
      setInlineActionState(null);
    }
  }, [accessToken, cancelMutation, checkInMutation, completeMutation, noShowMutation, selectedClubId]);

  const handleInlineQuickAction = useCallback((action: QuickAction, bookingId: string): void => {
    void runInlineQuickAction(action, bookingId);
  }, [runInlineQuickAction]);

  const renderExpandedBookingPanel = useCallback((slot: LaneSlot, booking: TeeSheetBookingView, compact = false): JSX.Element => {
    const focusedParticipantName =
      matchesExpandedBooking(inlineExpandedBookingContext, slot, booking.id)
        ? inlineExpandedBookingContext?.focusedParticipantName ?? null
        : null;
    const focusedParticipantType =
      matchesExpandedBooking(inlineExpandedBookingContext, slot, booking.id)
        ? inlineExpandedBookingContext?.focusedParticipantType ?? null
        : null;
    const directoryEntry =
      findDirectoryEntryByDisplayName(
        focusedParticipantName ?? bookingLeadParticipant(booking)?.display_name ?? null,
        directoryByName,
      );
    return (
      <InlineBookingContextPanel
        booking={booking}
        compact={compact}
        directoryEntry={directoryEntry}
        focusedParticipantName={focusedParticipantName}
        focusedParticipantType={focusedParticipantType}
        onOpenFullView={() => {
          openManage(slot, booking.id);
        }}
        onQuickAction={handleInlineQuickAction}
        panelRef={setExpandedBookingPanelElement}
        pendingAction={pendingAction}
        pendingBookingId={pendingBookingId}
        referenceDatetime={teeSheetQuery.data?.reference_datetime ?? null}
      />
    );
  }, [
    inlineExpandedBookingContext,
    directoryByName,
    handleInlineQuickAction,
    openManage,
    pendingAction,
    pendingBookingId,
    setExpandedBookingPanelElement,
    teeSheetQuery.data?.reference_datetime,
  ]);

  const handleCommandPaletteSelect = useCallback((item: CommandPaletteItem): void => {
    if (item.kind === "command") {
      if (item.viewFilter === "all") {
        setFilters(DEFAULT_FILTERS);
      } else {
        setFilters((current) => ({ ...current, viewFilter: item.viewFilter }));
      }
      setSearchInputValue("");
      setFiltersPanelOpen(false);
      closeCommandPalette();
      return;
    }

    navigateToBookingContext(item.slot, item.booking);
    closeCommandPalette();
  }, [closeCommandPalette, navigateToBookingContext]);

  const changeSelectedDate = useCallback((updater: string | ((current: string) => string)): void => {
    startTransition(() => {
      setSelectedDate(updater);
    });
  }, []);

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
  // Keep the stable grid callback pointing at the latest handleCheckInAll closure.
  onGridCheckInAllRef.current = handleCheckInAll;

  async function handleBatchNoShow(): Promise<void> {
    if (!accessToken || !selectedClubId) return;
    if (batchNoShowBookings.length === 0) {
      setBatchNoShowConfirmOpen(false);
      setNotice({ tone: "info", message: "No late / at-risk bookings are currently eligible for batch no-show." });
      return;
    }

    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setBatchNoShowPending(true);

    try {
      const settled = await Promise.allSettled(
        batchNoShowBookings.map((booking) => markBookingNoShow(booking.id, { accessToken, selectedClubId })),
      );
      const failures = settled.flatMap((result) => {
        if (result.status === "rejected") return [asMessage(result.reason)];
        if (result.value.decision === "blocked") return [result.value.failures[0]?.message ?? COPY.no_show.blocked];
        return [];
      });
      const successes = settled.filter((result) => result.status === "fulfilled" && result.value.decision === "allowed" && result.value.transition_applied).length;
      const alreadyProcessed = settled.filter((result) => result.status === "fulfilled" && result.value.decision === "allowed" && !result.value.transition_applied).length;

      setNotice({
        tone: failures.length > 0 ? "error" : successes > 0 ? "success" : "info",
        message: failures.length > 0
          ? `Batch No-Show finished. ${successes} updated, ${failures.length} failed, ${alreadyProcessed} already processed. ${failures[0]}`
          : `Batch No-Show finished. ${successes} updated, 0 failed, ${alreadyProcessed} already processed.`,
      });

      await invalidate();
    } finally {
      setBatchNoShowPending(false);
      setBatchNoShowConfirmOpen(false);
    }
  }

  useEffect(() => {
    setExpandedBookingContext(null);
  }, [filters.partySize, filters.timeFrom, filters.timeTo, filters.viewFilter, selectedDate]);

  useEffect(() => {
    if (!inlineExpandedBookingContext) return;

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node | null;
      if (!target) return;
      if (expandedBookingCardRef.current?.contains(target) || expandedBookingPanelRef.current?.contains(target)) return;
      setExpandedBookingContext(null);
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [inlineExpandedBookingContext]);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    setCommandPaletteActiveIndex(0);
  }, [commandPaletteOpen, commandPaletteQuery]);

  const description = `Course: ${activeCourse?.name ?? "Course setup required"}`;
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
  const showingTransitionDay = teeSheetQuery.isFetching && teeSheetQuery.data?.date !== selectedDate;
  const showInitialGridSkeleton = configuredForSheet && teeSheetQuery.isLoading && !teeSheetQuery.data;
  const hasActiveFilters =
    filters.viewFilter !== "all" ||
    filters.partySize !== "any" ||
    filters.timeFrom !== null ||
    filters.timeTo !== null;
  const filteredEmptyMessage =
    debouncedSearchTerm.trim() && hasActiveFilters
      ? `No results match "${debouncedSearchTerm.trim()}" with the current filters.`
      : debouncedSearchTerm.trim()
        ? `No results match "${debouncedSearchTerm.trim()}" on this view.`
        : "No tee-sheet rows match the current filters.";
  const currentBucketTime =
    teeSheetQuery.data?.date === selectedDate && selectedDate === todayValue()
      ? nearestBucketTime(filteredBuckets, teeSheetQuery.data?.timezone ?? null)
      : null;
  const cockpitPresets: Array<{ count: number; icon: string; label: string; value: ViewFilter }> = [
    { count: arrivalsDueCount, icon: "schedule", label: "Arrivals Due", value: "arrivals_due" },
    { count: noShowRiskCount, icon: "person_off", label: "Late / At Risk", value: "no_shows" },
    { count: unpaidBookingsCount, icon: "payments", label: "Unpaid", value: "unpaid" },
    { count: unresolvedBookingsCount, icon: "task_alt", label: "Unresolved", value: "unresolved" },
    { count: warningSlotsCount, icon: "warning", label: "Warnings", value: "warnings" },
  ];
  const commandPaletteCommands = useMemo<CommandPaletteItem[]>(() => [
    {
      id: "command-filter-arrivals_due",
      kind: "command",
      label: "Show arrivals due",
      searchText: "show arrivals due arriving ready to check in",
      subtitle: "Apply the existing Arrivals Due filter",
      viewFilter: "arrivals_due",
    },
    {
      id: "command-filter-no_shows",
      kind: "command",
      label: "Show late / at risk",
      searchText: "show late at risk no show overdue",
      subtitle: "Apply the existing Late / At Risk filter",
      viewFilter: "no_shows",
    },
    {
      id: "command-filter-unpaid",
      kind: "command",
      label: "Show unpaid",
      searchText: "show unpaid payment pending",
      subtitle: "Apply the existing Unpaid filter",
      viewFilter: "unpaid",
    },
    {
      id: "command-filter-unresolved",
      kind: "command",
      label: "Show unresolved",
      searchText: "show unresolved close day blockers pending checked in completed",
      subtitle: "Apply the existing Unresolved filter",
      viewFilter: "unresolved",
    },
    {
      id: "command-filter-warnings",
      kind: "command",
      label: "Show warnings",
      searchText: "show warnings blocked warning slots",
      subtitle: "Apply the existing Warnings filter",
      viewFilter: "warnings",
    },
    {
      id: "command-filter-all",
      kind: "command",
      label: "Clear filters / show all",
      searchText: "clear filters show all reset tee sheet",
      subtitle: "Reset the current tee-sheet filters",
      viewFilter: "all",
    },
  ], []);
  const commandPaletteBookingItems = useMemo<CommandPaletteItem[]>(() => {
    const seen = new Set<string>();
    return slots.flatMap((slot) =>
      slot.slot.bookings.flatMap((booking) => {
        if (seen.has(booking.id)) return [];
        seen.add(booking.id);
        const participantNames = bookingParticipantNames(booking);
        const leadParticipant = bookingLeadParticipant(booking)?.display_name ?? participantNames[0] ?? booking.id;
        const terms = [
          leadParticipant,
          ...participantNames,
          timeKey(slot.slot.local_time),
          slot.laneLabel,
          slot.rowLabel,
          ...bookingCommandTerms(booking, teeSheetQuery.data?.reference_datetime ?? null),
        ];
        return [{
          booking,
          id: `booking-${booking.id}`,
          kind: "booking" as const,
          label: leadParticipant,
          searchText: terms.join(" ").toLowerCase(),
          slot,
          subtitle: `${timeKey(slot.slot.local_time)} · ${slot.laneLabel} · ${bookingStatusLabel(booking.status)} · ${paymentLabel(booking.payment_status)}`,
        }];
      }),
    );
  }, [slots, teeSheetQuery.data?.reference_datetime]);
  const commandPaletteItems = useMemo<CommandPaletteItem[]>(() => (
    [...commandPaletteCommands, ...commandPaletteBookingItems]
  ), [commandPaletteBookingItems, commandPaletteCommands]);
  const filteredCommandPaletteItems = useMemo<CommandPaletteItem[]>(() => {
    const query = commandPaletteQuery.trim().toLowerCase();
    if (!query) return commandPaletteItems.slice(0, 12);
    return commandPaletteItems.filter((item) => {
      const text = `${item.label} ${item.subtitle} ${item.searchText}`.toLowerCase();
      return text.includes(query);
    }).slice(0, 12);
  }, [commandPaletteItems, commandPaletteQuery]);
  const handleCommandPaletteKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (filteredCommandPaletteItems.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCommandPaletteActiveIndex((current) => (
        current >= filteredCommandPaletteItems.length - 1 ? 0 : current + 1
      ));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCommandPaletteActiveIndex((current) => (
        current <= 0 ? filteredCommandPaletteItems.length - 1 : current - 1
      ));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      handleCommandPaletteSelect(filteredCommandPaletteItems[Math.min(commandPaletteActiveIndex, filteredCommandPaletteItems.length - 1)]);
    }
  }, [commandPaletteActiveIndex, filteredCommandPaletteItems, handleCommandPaletteSelect]);

  useEffect(() => {
    if (layoutMode !== "classic") return;
    if (pendingAutoScrollDateRef.current !== selectedDate) return;
    if (teeSheetQuery.isLoading || teeSheetQuery.error || filteredBuckets.length === 0) return;
    if (teeSheetQuery.data?.date !== selectedDate) return;
    const today = todayValue();
    const targetTime =
      selectedDate === today
        ? nearestBucketTime(filteredBuckets, teeSheetQuery.data?.timezone ?? null)
        : timeKey(filteredBuckets[0]?.localTime ?? "");
    if (!targetTime) return;

    document.getElementById(`bucket-${targetTime}`)?.scrollIntoView({
      behavior: "smooth",
      block: selectedDate === today ? "center" : "start",
    });
    pendingAutoScrollDateRef.current = null;
  }, [filteredBuckets, layoutMode, selectedDate, teeSheetQuery.data?.timezone, teeSheetQuery.error, teeSheetQuery.isLoading]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (batchNoShowConfirmOpen) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        if (drawerMode) return;
        event.preventDefault();
        openCommandPalette();
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === "Escape" && commandPaletteOpen) {
        event.preventDefault();
        closeCommandPalette();
        return;
      }

      if (event.key === "Escape" && inlineExpandedBookingContext) {
        event.preventDefault();
        closeExpandedBookingContext();
        return;
      }

      if (event.key === "Escape" && drawerMode) {
        event.preventDefault();
        close();
        return;
      }

      if (isTypingTarget(event.target)) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        changeSelectedDate((current) => addDays(current, -1));
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        changeSelectedDate((current) => addDays(current, 1));
        return;
      }
      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        changeSelectedDate(todayValue());
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
  }, [
    batchNoShowConfirmOpen,
    changeSelectedDate,
    close,
    closeCommandPalette,
    closeExpandedBookingContext,
    commandPaletteOpen,
    drawerMode,
    inlineExpandedBookingContext,
    openCommandPalette,
  ]);

  return (
    <>
      <AdminWorkspace
        title="Tee Sheet"
        dateLabel={dateLabel(selectedDate)}
        description={description}
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
            {showInitialGridSkeleton ? <TeeSheetGridSkeleton /> : null}
            {teeSheetQuery.error ? <div className="rounded-2xl bg-error-container/30 px-6 py-5 text-sm text-error shadow-sm">{teeSheetErrorMessage}</div> : null}
            {showingTransitionDay ? (
              <div className="rounded-2xl bg-surface-container-lowest px-6 py-4 text-sm text-slate-500 shadow-sm">
                Loading {dateLabel(selectedDate)}. Previous day remains visible until the next read model arrives.
              </div>
            ) : null}
            {showLiveEmptyState ? <div className="rounded-2xl bg-surface-container-lowest px-6 py-5 text-sm text-slate-500 shadow-sm">No tee-sheet rows were generated for the selected day.</div> : null}
            {showFilteredEmptyState ? <div className="rounded-2xl bg-surface-container-lowest px-6 py-5 text-sm text-slate-500 shadow-sm">{filteredEmptyMessage}</div> : null}

            {!teeSheetQuery.isLoading && !teeSheetQuery.error && buckets.length > 0 ? (
              <div className={`space-y-4 transition-opacity ${showingTransitionDay ? "opacity-70" : "opacity-100"}`}>
                <section
                  className={`sticky top-20 z-20 rounded-[28px] border border-slate-200/70 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80 ${toolbarCompact ? "p-3" : "p-4"}`}
                  data-compact={toolbarCompact ? "true" : "false"}
                  data-testid="tee-sheet-toolbar"
                >
                  <div className={`flex flex-col ${toolbarCompact ? "gap-3" : "gap-4"}`}>
                     <>
                        {!toolbarCompact ? (
                        <div
                          className={`grid rounded-[24px] border border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.98))] text-on-surface shadow-[0_20px_45px_-32px_rgba(5,150,105,0.45)] transition-[padding,gap] duration-150 ${toolbarCompact ? "gap-2 px-4 py-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]" : "gap-3 px-5 py-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]"}`}
                          data-compact={toolbarCompact ? "true" : "false"}
                          data-testid="operate-header"
                        >
                          <div className={`flex flex-col ${toolbarCompact ? "gap-2" : "gap-3"}`}>
                            <div className={`flex flex-col ${toolbarCompact ? "gap-2 xl:flex-row xl:items-center xl:justify-between" : "gap-3 xl:flex-row xl:items-start xl:justify-between"}`}>
                              <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">Tee Sheet Control</p>
                                <div className="space-y-1">
                                  <h2 className={`font-headline font-extrabold text-emerald-950 ${toolbarCompact ? "text-xl" : "text-2xl"}`}>Run Today&apos;s Tee Sheet</h2>
                                  <p className={`max-w-2xl text-slate-600 ${toolbarCompact ? "text-xs" : "text-sm"}`}>
                                    {toolbarCompact
                                      ? "Controls stay pinned while the live sheet takes priority."
                                      : "Keep booking actions close to the live sheet and escalate only the exceptions that need intervention."}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  className={`inline-flex items-center gap-2 rounded-2xl bg-emerald-700 font-bold text-white transition-colors hover:bg-emerald-800 ${toolbarCompact ? "px-3.5 py-2 text-xs" : "px-4 py-2.5 text-sm"}`}
                                  onClick={openNextBookableSlot}
                                  type="button"
                                >
                                  <MaterialSymbol className="text-sm" icon="add" />
                                  <span>+ Booking</span>
                                </button>
                                <Link
                                  className={`inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white font-semibold text-emerald-900 transition-colors hover:bg-emerald-50 ${toolbarCompact ? "px-3.5 py-2 text-xs" : "px-4 py-2.5 text-sm"}`}
                                  to="/admin/finance"
                                >
                                  <MaterialSymbol className="text-sm" icon="payments" />
                                  <span>Close Day &rarr;</span>
                                </Link>
                              </div>
                            </div>
                            <div className={`rounded-2xl border border-emerald-100 bg-white/75 text-slate-600 ${toolbarCompact ? "hidden" : "px-4 py-3 text-sm"}`}>
                              The live booking canvas stays primary. Filters, day movement, and exception handling remain above the sheet without overpowering it.
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-3 xl:content-start">
                            <div className={`rounded-2xl border shadow-sm transition-[padding] duration-150 ${summaryChipClass("neutral")} ${toolbarCompact ? "px-3 py-2.5" : "px-4 py-3"}`}>
                              <div className={`flex items-center gap-2 font-bold uppercase tracking-[0.18em] text-slate-500 ${toolbarCompact ? "text-[10px]" : "text-[11px]"}`}>
                                <MaterialSymbol className="text-sm text-emerald-600" icon="grid_view" />
                                <span>Occupancy</span>
                              </div>
                              <div className="mt-2 flex items-end gap-2">
                                <span className={`font-headline font-extrabold text-on-surface ${toolbarCompact ? "text-xl" : "text-2xl"}`}>{configuredForSheet ? `${occupancyPct}%` : "--"}</span>
                                <span className="pb-1 text-xs text-slate-500">{configuredForSheet ? `${occupiedSlots}/${totalSlots} slots` : "No data"}</span>
                              </div>
                            </div>
                            <div className={`rounded-2xl border shadow-sm transition-[padding] duration-150 ${summaryChipClass(unpaidBookingsCount > 0 ? "warning" : "neutral")} ${toolbarCompact ? "px-3 py-2.5" : "px-4 py-3"}`}>
                              <div className={`flex items-center gap-2 font-bold uppercase tracking-[0.18em] text-slate-500 ${toolbarCompact ? "text-[10px]" : "text-[11px]"}`}>
                                <MaterialSymbol className="text-sm text-amber-500" icon="payments" />
                                <span>Unpaid</span>
                              </div>
                              <div className="mt-2 flex items-end gap-2">
                                <span className={`font-headline font-extrabold text-on-surface ${toolbarCompact ? "text-xl" : "text-2xl"}`}>{unpaidBookingsCount}</span>
                                <span className="pb-1 text-xs text-slate-500">Bookings needing payment</span>
                              </div>
                            </div>
                            <div className={`rounded-2xl border shadow-sm transition-[padding] duration-150 ${summaryChipClass(alertSignals > 0 ? "danger" : "neutral")} ${toolbarCompact ? "px-3 py-2.5" : "px-4 py-3"}`}>
                              <div className={`flex items-center gap-2 font-bold uppercase tracking-[0.18em] text-slate-500 ${toolbarCompact ? "text-[10px]" : "text-[11px]"}`}>
                                <MaterialSymbol className="text-sm text-rose-500" icon="warning" />
                                <span>Warnings</span>
                              </div>
                              <div className="mt-2 flex items-end gap-2">
                                <span className={`font-headline font-extrabold text-on-surface ${toolbarCompact ? "text-xl" : "text-2xl"}`}>{alertSignals}</span>
                                <span className="pb-1 text-xs text-slate-500">Blocked, warning, and sheet alerts</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        ) : null}

                        <div className={`flex flex-col ${toolbarCompact ? "gap-2 xl:flex-row xl:items-center xl:justify-between" : "gap-3 xl:flex-row xl:items-end xl:justify-between"}`}>
                          <div className={`flex flex-col ${toolbarCompact ? "gap-2 xl:flex-row xl:items-center" : "gap-3 xl:flex-row xl:items-center"}`}>
                            <div className="flex flex-wrap items-center gap-2">
                              <DatePickerPopover
                                clubId={guardedSelectedClubId}
                                courseId={courseId}
                                membershipType={membershipType}
                                onChange={changeSelectedDate}
                                onOpenChange={setCalendarOpen}
                                open={calendarOpen}
                                queryClient={queryClient}
                                teeId={teeId}
                                value={selectedDate}
                              />
                              <div className="flex gap-1">
                                <button
                                  aria-label="Previous day"
                                  className={`rounded-2xl bg-surface-container-low text-slate-500 transition-colors hover:bg-surface-container ${toolbarCompact ? "p-1.5" : "p-2"}`}
                                  onClick={() => changeSelectedDate((current) => addDays(current, -1))}
                                  type="button"
                                >
                                  <MaterialSymbol icon="chevron_left" />
                                </button>
                                <button
                                  aria-label="Today"
                                  className={`rounded-2xl bg-surface-container-low text-xs font-bold text-slate-500 transition-colors hover:bg-surface-container ${toolbarCompact ? "px-2.5 py-1.5" : "px-3 py-2"}`}
                                  onClick={() => changeSelectedDate(todayValue())}
                                  type="button"
                                >
                                  Today
                                </button>
                                <button
                                  aria-label="Next day"
                                  className={`rounded-2xl bg-surface-container-low text-slate-500 transition-colors hover:bg-surface-container ${toolbarCompact ? "p-1.5" : "p-2"}`}
                                  onClick={() => changeSelectedDate((current) => addDays(current, 1))}
                                  type="button"
                                >
                                  <MaterialSymbol icon="chevron_right" />
                                </button>
                              </div>
                            </div>
                            <label className="space-y-1">
                              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Search</span>
                              <span className="relative flex items-center">
                                <MaterialSymbol className="pointer-events-none absolute left-3 text-sm text-slate-400" icon="search" />
                                <input
                                  className={`w-full rounded-2xl bg-surface-container-low px-10 pr-10 text-sm text-on-surface placeholder:text-slate-400 focus:border-transparent focus:ring-2 focus:ring-primary/20 sm:w-72 ${toolbarCompact ? "py-2" : "py-2.5"}`}
                                  onChange={(event) => setSearchInputValue(event.target.value)}
                                  placeholder="Search players, bookings, or time"
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
                          </div>
                          <div className={`flex flex-wrap items-end ${toolbarCompact ? "gap-2" : "gap-3"}`}>
                            {toolbarCompact ? (
                              <>
                                <button
                                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-800"
                                  onClick={openNextBookableSlot}
                                  type="button"
                                >
                                  <MaterialSymbol className="text-sm" icon="add" />
                                  <span>+ Booking</span>
                                </button>
                                <Link
                                  className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 transition-colors hover:bg-emerald-50"
                                  to="/admin/finance"
                                >
                                  <MaterialSymbol className="text-sm" icon="payments" />
                                  <span>Close Day &rarr;</span>
                                </Link>
                              </>
                            ) : null}
                            <label className="space-y-1">
                              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Jump To</span>
                              <span className={`flex items-center gap-2 rounded-2xl bg-surface-container-low px-3 text-sm text-on-surface ${toolbarCompact ? "py-2" : "py-2.5"}`}>
                                <MaterialSymbol className="text-sm text-on-surface-variant" icon="schedule" />
                                <select
                                  className="border-none bg-transparent pr-5 text-sm font-medium focus:ring-0"
                                  defaultValue=""
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    if (!value) return;
                                    document.getElementById(`bucket-${value}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
                            <button
                              aria-expanded={filtersPanelOpen}
                              className={`inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-surface-container-low font-semibold text-on-surface transition-colors hover:bg-surface-container ${toolbarCompact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm"}`}
                              data-testid="filters-view-toggle"
                              onClick={() => setFiltersPanelOpen((open) => !open)}
                              type="button"
                            >
                              <MaterialSymbol className="text-sm" icon={filtersPanelOpen ? "expand_less" : "tune"} />
                              <span>Filters</span>
                              {hasActiveFilters ? (
                                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                                  Active
                                </span>
                              ) : null}
                            </button>
                          </div>
                        </div>

                        <div className={`flex flex-wrap ${toolbarCompact ? "gap-1.5" : "gap-2"}`}>
                          {cockpitPresets.map((preset) => {
                            const active = filters.viewFilter === preset.value;
                            return (
                              <button
                                className={`inline-flex items-center gap-2 rounded-full border font-semibold transition-colors ${filterChipClass(active)} ${toolbarCompact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"}`}
                                key={preset.value}
                                onClick={() =>
                                  setFilters((current) => ({
                                    ...current,
                                    viewFilter: current.viewFilter === preset.value ? "all" : preset.value,
                                  }))
                                }
                                type="button"
                              >
                                <MaterialSymbol className="text-sm" icon={preset.icon} />
                                <span>{preset.label}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>
                                  {preset.count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>

                    {filtersPanelOpen ? (
                    <div className="space-y-4 rounded-2xl border border-slate-200 bg-surface-container-lowest p-4" data-testid="filters-view-panel">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Filters &amp; View</p>
                          <p className="text-sm text-slate-500">Secondary controls stay collapsed until staff need them.</p>
                        </div>
                        {hasActiveFilters ? (
                          <button
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary-container/30"
                            onClick={() => setFilters(DEFAULT_FILTERS)}
                            type="button"
                          >
                            <MaterialSymbol className="text-sm" icon="filter_alt_off" />
                            <span>Reset Filters</span>
                          </button>
                        ) : null}
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

                      <div className="flex flex-wrap gap-4 border-t border-slate-200 pt-4">
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

                      </div>

                    </div>
                    ) : null}

                    {filters.viewFilter === "no_shows" && batchNoShowBookings.length > 0 ? (
                      <div
                        className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 md:flex-row md:items-center md:justify-between"
                        data-testid="batch-no-show-bar"
                      >
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-800">Late / At Risk</p>
                          <p className="text-sm font-semibold text-amber-950">
                            {batchNoShowBookings.length} booking{batchNoShowBookings.length === 1 ? "" : "s"} ready for batch no-show handling.
                          </p>
                          <p className="text-xs text-amber-800">Uses the existing backend no-show intent for each eligible booking in the current filtered result set.</p>
                        </div>
                        <button
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-700"
                          onClick={() => {
                            setNotice(null);
                            setBatchNoShowConfirmOpen(true);
                          }}
                          type="button"
                        >
                          <MaterialSymbol className="text-sm" icon="person_off" />
                          <span>Batch No-Show</span>
                        </button>
                      </div>
                    ) : null}

                    {/* Legend — always visible inside the sticky toolbar */}
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-slate-200/60 pt-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Participant</span>
                        <span className="flex items-center gap-1"><span className="inline-block h-3 w-[3px] rounded-full bg-blue-600" /><span className="text-[10px] text-slate-600">Member</span></span>
                        <span className="flex items-center gap-1"><span className="inline-block h-3 w-[3px] rounded-full bg-amber-500" /><span className="text-[10px] text-slate-600">Guest</span></span>
                      </div>
                      <span className="hidden h-4 w-px bg-slate-200 self-center sm:block" />
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Slot</span>
                        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary-container" /><span className="text-[10px] text-slate-600">Open</span></span>
                        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-error-container" /><span className="text-[10px] text-slate-600">Blocked</span></span>
                        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-200" /><span className="text-[10px] text-slate-600">Warning</span></span>
                        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-secondary-container" /><span className="text-[10px] text-slate-600">Golf Day</span></span>
                      </div>
                      <span className="hidden h-4 w-px bg-slate-200 self-center sm:block" />
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Booking</span>
                        <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-slate-400" icon="radio_button_unchecked" /><span className="text-[10px] text-slate-600">Reserved</span></span>
                        <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-emerald-600" icon="check_circle" /><span className="text-[10px] text-slate-600">Checked In</span></span>
                        <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-red-500" icon="person_off" /><span className="text-[10px] text-slate-600">No-show</span></span>
                        <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-slate-400" icon="cancel" /><span className="text-[10px] text-slate-600">Cancelled</span></span>
                      </div>
                      <span className="hidden h-4 w-px bg-slate-200 self-center sm:block" />
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">Payment</span>
                        <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-emerald-600" icon="check_circle" /><span className="text-[10px] text-slate-600">Paid</span></span>
                        <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-amber-500" icon="schedule" /><span className="text-[10px] text-slate-600">Unpaid</span></span>
                        <span className="flex items-center gap-1"><MaterialSymbol className="text-sm text-slate-400" icon="remove_circle" /><span className="text-[10px] text-slate-600">Waived</span></span>
                      </div>
                    </div>
                  </div>
                </section>

                {layoutMode === "classic" ? (
                <section className="overflow-hidden rounded-[28px] border border-emerald-100/80 bg-white shadow-[0_24px_55px_-34px_rgba(15,23,42,0.35)]">
                  <div className="overflow-x-auto">
                    <div className="min-w-[1120px] px-4 py-3">
                      <table className="w-full min-w-[1120px] table-fixed border-separate [border-spacing:0_6px]" data-testid="classic-tee-sheet-grid">
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
                            <th className="px-3 pb-2 text-left text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Lane</th>
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
                              const bucketExpandedRowCount = inlineExpandedBookingContext && bucket.slots.some((slot) => (
                                slot.startLane === inlineExpandedBookingContext.startLane &&
                                slot.slot.slot_datetime === inlineExpandedBookingContext.slotDatetime
                              )) ? 1 : 0;
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
                              const expandedBooking = displaySlot.bookings.find((booking) => matchesExpandedBooking(inlineExpandedBookingContext, item, booking.id)) ?? null;
                              // Build individual player cells — one <td> per slot position, never merged
                              const capacity = slotCapacity(displaySlot);
                              const playerCells: Array<
                                | {
                                    kind: "player";
                                    booking: TeeSheetBookingView;
                                    cellKey: string;
                                    isFirst: boolean;
                                    name: string;
                                    participantId: string | null;
                                    participantType: BookingParticipantType | null;
                                  }
                                | { kind: "open" }
                                | { kind: "unavailable" }
                              > = [];
                              for (const booking of displaySlot.bookings) {
                                const names = bookingParticipantNames(booking);
                                const count = Math.max(names.length, bookingPlayerCount(booking));
                                for (let pi = 0; pi < count && playerCells.length < capacity; pi++) {
                                  const participant = booking.participants[pi];
                                  const participantId = participant?.id ?? null;
                                  playerCells.push({
                                    kind: "player",
                                    booking,
                                    cellKey: participantId ? `${booking.id}:participant:${participantId}` : `${booking.id}:participant:${pi}`,
                                    isFirst: pi === 0,
                                    name: names[pi] ?? `Player ${pi + 1}`,
                                    participantId,
                                    participantType: participant?.participant_type ?? null,
                                  });
                                }
                              }
                              while (playerCells.length < capacity) {
                                playerCells.push(canCreate(displaySlot) ? { kind: "open" } : { kind: "unavailable" });
                              }
                              return (
                                <Fragment key={targetKey}>
                                <tr
                                  aria-label={`${item.laneLabel} lane row ${bucket.localTime.slice(0, 5)}`}
                                  className={`group transition-all duration-300 ${highlightedSlotKey === targetKey ? "ring-2 ring-primary ring-offset-1 rounded-[18px]" : ""}`}
                                  data-testid={`lane-row-${item.rowKey}`}
                                  onDragEnter={(event) => {
                                    if (!dropAllowed(item)) return;
                                    setActiveTableDropTarget(event.currentTarget);
                                  }}
                                  onDragLeave={(event) => {
                                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                                    clearActiveTableDropTarget();
                                  }}
                                  onDragOver={(event) => {
                                    if (!dropAllowed(item)) return;
                                    event.preventDefault();
                                    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                                    setActiveTableDropTarget(event.currentTarget);
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    const currentDrag = draggedRef.current;
                                    clearActiveTableDropTarget();
                                    if (!currentDrag || !dropAllowed(item)) return;
                                    moveMutation.mutate({
                                      bookingId: currentDrag.bookingId,
                                      participantId: currentDrag.participantId ?? null,
                                      target: item,
                                    });
                                  }}
                                >
                                  {index === 0 ? (
                                    <td className="w-[96px] px-2 align-top" rowSpan={bucket.slots.length + bucketExpandedRowCount}>
                                      <div className="scroll-mt-44 rounded-[18px] bg-surface-container px-3 py-2 shadow-sm" id={`bucket-${bucket.localTime.slice(0, 5)}`}>
                                        <div className="flex items-center gap-2">
                                          <p className="font-headline text-lg font-extrabold text-on-surface">{bucket.localTime.slice(0, 5)}</p>
                                          {currentBucketTime === bucket.localTime.slice(0, 5) ? (
                                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-red-500">
                                              Now
                                            </span>
                                          ) : null}
                                        </div>
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

                                  <td
                                    className="w-[80px] px-3 align-middle transition-colors"
                                    data-drop-lane="true"
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
                                      <button
                                        aria-label={`View details for ${item.slot.display_status === "blocked" ? "blocked" : "reserved"} slot at ${item.laneLabel} ${bucket.localTime.slice(0, 5)}`}
                                        className={`flex min-h-[3.5rem] w-full cursor-pointer items-center justify-between rounded-[16px] px-3 py-2 text-left transition-opacity hover:opacity-80 ${slotSummaryClass(item.slot)}`}
                                        onClick={() => openManage(item)}
                                        style={item.slot.display_status === "blocked" ? {
                                          backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.06) 5px, rgba(0,0,0,0.06) 10px)",
                                        } : undefined}
                                        type="button"
                                      >
                                        <div className="min-w-0">
                                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                            {item.slot.display_status === "blocked" ? "Blocked" : "Reserved — no bookings"}
                                          </p>
                                          <p className="truncate text-xs font-semibold">
                                            {item.slot.blockers[0]?.reason ?? item.slot.unresolved_checks[0]?.reason ?? item.slot.warnings[0]?.message ?? (item.slot.display_status === "blocked" ? "Slot is closed for this period" : "Slot is held by a club event or rule")}
                                          </p>
                                        </div>
                                        <span className="ml-3 shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] opacity-60">Details →</span>
                                      </button>
                                    </td>
                                  ) : (
                                    playerCells.map((cell, cellIndex) => (
                                      <td
                                        className="w-[calc(25%_-_2px)] px-1 align-top"
                                        key={
                                          cell.kind === "player"
                                            ? `${cell.booking.id}-p${cellIndex}`
                                            : `${targetKey}-${cell.kind}-${cellIndex}`
                                        }
                                      >
                                        {cell.kind === "player" ? (
                                          <div
                                            className={`relative group/chip ${movingBookingId === cell.booking.id ? "opacity-50" : ""}`}
                                            ref={matchesExpandedBookingCell(inlineExpandedBookingContext, item, cell.booking.id, cell.cellKey) ? setExpandedBookingCardElement : undefined}
                                          >
                                            {(() => {
                                              const nextAction = deriveBookingNextAction(
                                                cell.booking,
                                                teeSheetQuery.data?.reference_datetime ?? null,
                                              );
                                              const badge = nextActionBadgeProps(nextAction);
                                              const isExpanded = matchesExpandedBookingCell(
                                                inlineExpandedBookingContext,
                                                item,
                                                cell.booking.id,
                                                cell.cellKey,
                                              );
                                              const canDragParticipant = Boolean(cell.participantId);
                                              return (
                                                <>
                                                  <button
                                                    aria-controls={`inline-booking-panel-${cell.booking.id}`}
                                                    aria-expanded={isExpanded}
                                                    aria-label={
                                                      cell.isFirst
                                                        ? `Open booking ${cell.booking.id}`
                                                        : `Open slot for ${cell.name}`
                                                    }
                                                    className={`${
                                                      cell.isFirst
                                                        ? bookingChipClass(cell.booking, false, nextAction)
                                                        : "flex min-h-[3.5rem] w-full flex-col justify-center rounded-[14px] border border-slate-100 bg-white px-2 py-1.5 text-left shadow-sm transition-colors hover:bg-slate-50"
                                                    } border border-slate-100 shadow-sm transition-opacity hover:opacity-90 ${participantTypeBorderClass(cell.participantType)} ${isExpanded ? "ring-2 ring-primary/30 ring-offset-1 bg-primary-container/15" : ""}`}
                                                    draggable={canDragParticipant}
                                                    onClick={() => toggleBookingExpansion(
                                                      item,
                                                      cell.booking,
                                                      cell.cellKey,
                                                      cell.participantId ?? null,
                                                      cell.name,
                                                      cell.participantType,
                                                    )}
                                                    onDragEnd={endDrag}
                                                    onDragStart={(event) => {
                                                      if (!canDragParticipant) return;
                                                      startDrag(
                                                        event,
                                                        cell.booking.id,
                                                        item,
                                                        cell.cellKey,
                                                        cell.participantId,
                                                      );
                                                    }}
                                                    title={canDragParticipant ? `Drag to move ${cell.name}` : `${cell.name} is not moveable yet`}
                                                    type="button"
                                                  >
                                                    <div className="flex items-center justify-between gap-2">
                                                      <div className="min-w-0">
                                                        <p className="truncate text-[11px] font-semibold leading-tight text-on-surface">{cell.name}</p>
                                                        <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${bookingStatusIconClass(cell.booking.status)}`}>
                                                          <MaterialSymbol className="text-[10px]" icon={bookingStatusIconName(cell.booking.status)} />
                                                          {cell.isFirst ? cell.booking.status.replace(/_/g, " ") : (cell.participantType ?? "player")}
                                                        </span>
                                                      </div>
                                                      {cell.isFirst && badge ? (
                                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.12em] ${badge.className}`}>
                                                          {badge.label}
                                                        </span>
                                                      ) : null}
                                                    </div>
                                                    <div className="mt-1 flex items-center gap-1">
                                                      <span
                                                        aria-label={paymentTooltip(cell.booking.payment_status)}
                                                        className={paymentDotClass(cell.booking.payment_status)}
                                                        title={paymentTooltip(cell.booking.payment_status)}
                                                      >
                                                        <span className="sr-only">{paymentTooltip(cell.booking.payment_status)}</span>
                                                      </span>
                                                      {cell.booking.cart_flag ? (
                                                        <span title="Cart"><MaterialSymbol className="text-[11px] text-slate-400" icon="shopping_cart" /></span>
                                                      ) : null}
                                                    </div>
                                                  </button>
                                                  <BookingQuickActionPanel
                                                    booking={cell.booking}
                                                    onQuickAction={handleInlineQuickAction}
                                                    pendingAction={pendingAction}
                                                    pendingBookingId={pendingBookingId}
                                                  />
                                                </>
                                              );
                                            })()}
                                          </div>
                                        ) : cell.kind === "open" ? (
                                          <button
                                            aria-label={`Create booking for ${item.laneLabel} ${bucket.localTime.slice(0, 5)}`}
                                            className="flex min-h-[3.5rem] w-full items-center justify-center rounded-[14px] border border-dashed border-outline-variant/40 bg-white text-slate-400 transition-colors hover:border-primary/40 hover:bg-primary-container/10 hover:text-primary"
                                            onClick={() => openCreate(item)}
                                            type="button"
                                          >
                                            <MaterialSymbol className="text-base" icon="add" />
                                          </button>
                                        ) : (
                                          <div className="flex min-h-[3.5rem] w-full items-center justify-center rounded-[14px] bg-surface-container-low">
                                            <MaterialSymbol className="text-sm text-slate-300" icon="block" />
                                          </div>
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
                                        <button
                                          aria-label={`View details for ${item.laneLabel} ${bucket.localTime.slice(0, 5)}`}
                                          className="flex-1 rounded-lg bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface transition-colors hover:bg-slate-50"
                                          onClick={() => openManage(item)}
                                          type="button"
                                        >
                                          Details
                                        </button>
                                      ) : null}
                                      {!canManage(displaySlot) && canCreate(displaySlot) ? (
                                        <div className="flex-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                          Open
                                        </div>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                                {expandedBooking ? (
                                  <tr data-testid={`inline-booking-row-${expandedBooking.id}`}>
                                    <td className="px-2 pb-2 pt-1 align-top" colSpan={6}>
                                      {renderExpandedBookingPanel(item, expandedBooking)}
                                    </td>
                                  </tr>
                                ) : null}
                                </Fragment>
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
                    checkingInAllBucket={checkingInAllBucket}
                    columns={filteredBuckets}
                    dropAllowed={dropAllowed}
                    dropKey={dropKey}
                    highlightedSlotKey={highlightedSlotKey}
                    intervalMinutes={teeSheetQuery.data?.interval_minutes ?? 30}
                    movingBookingId={movingBookingId}
                    onCheckInAll={onGridCheckInAll}
                    onEndDrag={endDrag}
                    onMoveBooking={onGridMoveBooking}
                    onOpenCreate={openCreate}
                    onOpenManage={openManage}
                    onQuickAction={handleInlineQuickAction}
                    onStartDrag={startDrag}
                    onToggleBookingExpansion={toggleBookingExpansion}
                    pendingAction={pendingAction}
                    pendingBookingId={pendingBookingId}
                    isBookingExpanded={isBookingExpanded}
                    renderExpandedBookingPanel={renderExpandedBookingPanel}
                    referenceDatetime={teeSheetQuery.data?.reference_datetime ?? null}
                    setExpandedBookingCardElement={setExpandedBookingCardElement}
                    selectedDate={selectedDate}
                    timezone={teeSheetQuery.data?.timezone ?? null}
                  />
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </AdminWorkspace>

      {commandPaletteOpen ? (
        <>
          <button
            aria-label="Close command palette"
            className="fixed inset-0 z-40 bg-slate-900/40"
            onClick={closeCommandPalette}
            type="button"
          />
          <div
            aria-labelledby="tee-sheet-command-palette-heading"
            aria-modal="true"
            className="fixed left-1/2 top-[20vh] z-50 w-full max-w-2xl -translate-x-1/2 rounded-3xl bg-white p-4 shadow-2xl"
            onKeyDown={handleCommandPaletteKeyDown}
            ref={commandPaletteDialogRef}
            role="dialog"
          >
            <div className="mb-3 flex items-center justify-between gap-3 px-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Tee Sheet</p>
                <h2 className="font-headline text-xl font-extrabold text-on-surface" id="tee-sheet-command-palette-heading">
                  Command Palette
                </h2>
              </div>
              <span className="rounded-full bg-surface-container px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                {filteredCommandPaletteItems.length} result{filteredCommandPaletteItems.length === 1 ? "" : "s"}
              </span>
            </div>
            <label className="relative block">
              <MaterialSymbol className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400" icon="search" />
              <input
                aria-label="Command palette search"
                className="w-full rounded-2xl border border-slate-200 bg-surface-container-low px-11 py-3 text-sm text-on-surface placeholder:text-slate-400 focus:border-transparent focus:ring-2 focus:ring-primary/20"
                onChange={(event) => setCommandPaletteQuery(event.target.value)}
                placeholder="Jump to bookings, times, payment posture, or operational views"
                ref={commandPaletteInputRef}
                type="search"
                value={commandPaletteQuery}
              />
            </label>
            <div className="mt-3 max-h-[24rem] overflow-y-auto">
              {filteredCommandPaletteItems.length > 0 ? (
                <div className="space-y-2">
                  {filteredCommandPaletteItems.map((item, index) => {
                    const active = index === commandPaletteActiveIndex;
                    return (
                      <button
                        aria-label={item.label}
                        className={`flex w-full items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                          active
                            ? "border-primary/30 bg-primary-container/20"
                            : "border-slate-200 bg-white hover:bg-surface-container-low"
                        }`}
                        key={item.id}
                        onClick={() => handleCommandPaletteSelect(item)}
                        onMouseEnter={() => setCommandPaletteActiveIndex(index)}
                        type="button"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-on-surface">{item.label}</p>
                          <p className="mt-1 truncate text-xs text-slate-500">{item.subtitle}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                          item.kind === "command"
                            ? "bg-primary/10 text-primary"
                            : "bg-surface-container text-slate-600"
                        }`}>
                          {item.kind === "command" ? viewFilterLabel(item.viewFilter) : "Booking"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl bg-surface-container-low px-4 py-6 text-sm text-slate-500">
                  No tee-sheet commands or bookings match "{commandPaletteQuery.trim()}".
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {batchNoShowConfirmOpen ? (
        <>
          <button
            aria-label="Close batch no-show confirm"
            className="fixed inset-0 z-40 bg-slate-900/40"
            disabled={batchNoShowPending}
            onClick={closeBatchNoShowConfirm}
            type="button"
          />
          <div
            aria-labelledby="batch-no-show-heading"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-8 shadow-2xl"
            ref={batchNoShowDialogRef}
            role="dialog"
          >
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100">
              <MaterialSymbol className="text-amber-700" icon="person_off" />
            </div>
            <h2 className="mt-4 font-headline text-xl font-bold text-on-surface" id="batch-no-show-heading">
              Mark {batchNoShowBookings.length} late booking{batchNoShowBookings.length === 1 ? "" : "s"} as no-show?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This runs the existing backend no-show intent once per eligible booking in the current Late / At Risk filtered result set.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-surface-container-low disabled:opacity-50"
                disabled={batchNoShowPending}
                onClick={closeBatchNoShowConfirm}
                ref={batchNoShowCancelRef}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-2xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:opacity-50"
                disabled={batchNoShowPending}
                onClick={() => {
                  void handleBatchNoShow();
                }}
                type="button"
              >
                {batchNoShowPending ? "Running..." : "Confirm Batch No-Show"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {selectedSlot && drawerMode === "manage"
        ? (
            <BookingManagementDrawer
              editCaddieFlag={editCaddieFlag}
              editCartFlag={editCartFlag}
              colorCode={selectedSlot.colorCode}
              directory={directory}
              feedbackBookingId={drawerFeedbackBookingId}
              feedbackField={drawerFeedbackField}
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
              onFinanceInputChange={() => {
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
              }}
              onMarkComplimentary={(bookingId) => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                paymentStatusMutation.mutate({ bookingId, paymentStatus: "complimentary" });
              }}
              onMarkWaived={(bookingId) => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                paymentStatusMutation.mutate({ bookingId, paymentStatus: "waived" });
              }}
              onNoShow={(bookingId) => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                noShowMutation.mutate(bookingId);
              }}
              onPostCharge={(bookingId, amount) => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                postChargeMutation.mutate({ bookingId, amount });
              }}
              onRecordPayment={(bookingId) => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                recordPaymentMutation.mutate(bookingId);
              }}
              pendingFinanceAction={pendingFinanceAction}
              pendingFinanceBookingId={pendingFinanceBookingId}
              pendingAction={pendingAction}
              pendingBookingId={pendingBookingId}
              savingBookingId={savingBookingId}
              selectedDate={selectedDate}
              showFinanceActions={true}
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
