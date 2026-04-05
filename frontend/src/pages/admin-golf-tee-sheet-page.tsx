import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
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
import { teeSheetKeys, useTeeSheetDayQuery } from "../features/tee-sheet/hooks";
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
      return "bg-error-container/40 text-on-error-container";
    case "reserved":
      return "bg-surface-container-high text-on-surface";
    case "warning":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-secondary-container text-on-secondary-container";
  }
}

function paymentClass(value: BookingPaymentStatus | null | undefined): string {
  switch (value) {
    case "paid":
      return "bg-primary-container/60 text-on-primary-container";
    case "pending":
      return "bg-secondary-container text-on-secondary-container";
    case "waived":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-surface-container-high text-on-surface";
  }
}

function paymentLabel(value: BookingPaymentStatus | null | undefined): string {
  return value ? value.replace("_", " ") : "unassigned";
}

function bookingStatusLabel(value: TeeSheetBookingView["status"]): string {
  return value.replace("_", " ");
}

function bookingStatusClass(value: TeeSheetBookingView["status"]): string {
  switch (value) {
    case "checked_in":
      return "bg-secondary-container text-on-secondary-container";
    case "completed":
      return "bg-primary-container/60 text-on-primary-container";
    case "no_show":
    case "cancelled":
      return "bg-error-container/30 text-on-error-container";
    default:
      return "bg-surface-container text-on-surface";
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
  const base = "group flex min-h-[3.5rem] w-full flex-col justify-between overflow-hidden rounded-[16px] px-3 py-2 text-left transition-all select-none";
  if (!primaryHandle) {
    return `${base} cursor-pointer bg-surface-container-low hover:bg-surface-container`;
  }
  if (booking.status === "checked_in") {
    return `${base} cursor-grab bg-secondary-container/70 hover:bg-secondary-container active:cursor-grabbing`;
  }
  if (booking.payment_status === "pending") {
    return `${base} cursor-grab bg-primary-container/70 hover:bg-primary-container active:cursor-grabbing`;
  }
  return `${base} cursor-grab bg-surface-container-low hover:bg-surface-container active:cursor-grabbing`;
}

function slotSummaryClass(slot: TeeSheetSlotView): string {
  if (slot.display_status === "blocked") return "bg-error-container/20 text-on-error-container";
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

function canManage(slot: TeeSheetSlotView): boolean {
  return slot.bookings.length > 0;
}

function canCreate(slot: TeeSheetSlotView): boolean {
  return slot.display_status !== "blocked" && slot.display_status !== "reserved" && slotRemainingCapacity(slot) > 0;
}

function canDrop(slot: TeeSheetSlotView): boolean {
  return slot.display_status !== "blocked" && slot.display_status !== "reserved";
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
  const membershipType: BookingRuleAppliesTo = "member";
  const [courseId, setCourseId] = useState<string | null>(null);
  const [teeId, setTeeId] = useState<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState<SelectedSlotKey | null>(null);
  const [drawerFeedbackMessage, setDrawerFeedbackMessage] = useState<string | null>(null);
  const [drawerFeedbackTone, setDrawerFeedbackTone] = useState<"error" | "info" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [drafts, setDrafts] = useState<DraftParticipant[]>(initialDrafts("member"));
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [activeDropKey, setActiveDropKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<DraftParticipant[]>([]);
  const pendingAutoScrollDateRef = useRef<string | null>(selectedDate);

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
  const selectedTeeId = activeCourseTees.some((tee) => tee.id === teeId) ? teeId : activeCourseTees[0]?.id ?? null;
  const selectedTee = activeCourseTees.find((tee) => tee.id === selectedTeeId) ?? null;

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
    if (teeId !== selectedTeeId) {
      setTeeId(selectedTeeId);
    }
  }, [selectedTeeId, teeId]);

  useEffect(() => {
    pendingAutoScrollDateRef.current = selectedDate;
  }, [selectedDate]);

  const teeSheetQuery = useTeeSheetDayQuery({
    accessToken: guardedAccessToken,
    selectedClubId: guardedSelectedClubId,
    courseId,
    date: selectedDate,
    membershipType,
    teeId: selectedTeeId,
  });

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

  const filteredBuckets = useMemo(
    () =>
      buckets
        .map((bucket) => ({
          ...bucket,
          slots: bucket.slots.filter((slot) => slotMatchesSearch(slot, searchTerm) && slotMatchesFilter(slot.slot, viewFilter)),
        }))
        .filter((bucket) => bucket.slots.length > 0),
    [buckets, searchTerm, viewFilter],
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
    }
  }, [selectedSlot, selectedSlotKey]);

  const currentDayKey =
    guardedSelectedClubId && courseId ? teeSheetKeys.day(guardedSelectedClubId, courseId, selectedDate, membershipType, selectedTeeId) : null;

  async function invalidate(): Promise<void> {
    if (!currentDayKey) return;
    await queryClient.invalidateQueries({ queryKey: currentDayKey });
  }

  async function onLifecycleSuccess(action: Action, result: BookingLifecycleMutationResult): Promise<void> {
    if (result.decision === "blocked") {
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(result.failures[0]?.message ?? COPY[action].blocked);
      return;
    }
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setDrawerMode(null);
    setEditingBookingId(null);
    setEditDrafts([]);
    setNotice({ tone: result.transition_applied ? "success" : "info", message: result.transition_applied ? COPY[action].success : COPY[action].already });
    await invalidate();
  }

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelBooking(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onSuccess: async (result) => onLifecycleSuccess("cancel", result),
    onError: (error) => {
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(asMessage(error));
    },
  });

  const checkInMutation = useMutation({
    mutationFn: (id: string) => checkInBooking(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onSuccess: async (result) => onLifecycleSuccess("check_in", result),
    onError: (error) => {
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(asMessage(error));
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => completeBooking(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onSuccess: async (result) => onLifecycleSuccess("complete", result),
    onError: (error) => {
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(asMessage(error));
    },
  });

  const noShowMutation = useMutation({
    mutationFn: (id: string) => markBookingNoShow(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }),
    onSuccess: async (result) => onLifecycleSuccess("no_show", result),
    onError: (error) => {
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(asMessage(error));
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
        setDrafts(initialDrafts(membershipType));
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
        setEditingBookingId(null);
        setEditDrafts([]);
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
      setEditingBookingId(null);
      setEditDrafts([]);
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
  const configuredForSheet = Boolean(activeCourse && selectedTee);

  const totalSlots = slots.length;
  const occupiedSlots = slots.filter((item) => item.slot.bookings.length > 0).length;
  const checkedInBookings = slots.reduce((sum, item) => sum + item.slot.bookings.filter((booking) => booking.status === "checked_in").length, 0);
  const checkedInPlayers = slots.reduce((sum, item) => sum + item.slot.bookings.filter((booking) => booking.status === "checked_in").reduce((inner, booking) => inner + bookingPlayerCount(booking), 0), 0);
  const openSlots = slots.filter((item) => canCreate(item.slot)).length;
  const openPlayerCapacity = slots.reduce((sum, item) => sum + slotRemainingCapacity(item.slot), 0);
  const alertSignals = (teeSheetQuery.data?.warnings.length ?? 0) + statusCounts.warning + statusCounts.blocked;
  const occupancyPct = totalSlots === 0 ? 0 : Math.round((occupiedSlots / totalSlots) * 100);
  const pendingAction = cancelMutation.isPending ? "cancel" : checkInMutation.isPending ? "check_in" : completeMutation.isPending ? "complete" : noShowMutation.isPending ? "no_show" : null;
  const pendingBookingId = cancelMutation.isPending ? cancelMutation.variables ?? null : checkInMutation.isPending ? checkInMutation.variables ?? null : completeMutation.isPending ? completeMutation.variables ?? null : noShowMutation.isPending ? noShowMutation.variables ?? null : null;
  const movingBookingId = moveMutation.isPending ? moveMutation.variables?.bookingId ?? null : null;
  const savingBookingId = updateMutation.isPending ? updateMutation.variables?.bookingId ?? null : null;
  const directory = directoryQuery.data ?? [];

  function openManage(slot: LaneSlot): void {
    if (!canManage(slot.slot)) return;
    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setDrafts(initialDrafts(membershipType));
    setDrawerMode("manage");
    setEditingBookingId(null);
    setEditDrafts([]);
    setSelectedSlotKey({ rowKey: slot.rowKey, slotDatetime: slot.slot.slot_datetime });
  }

  function openCreate(slot: LaneSlot): void {
    if (!canCreate(slot.slot)) return;
    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setDrafts(initialDrafts(membershipType));
    setDrawerMode("create");
    setEditingBookingId(null);
    setEditDrafts([]);
    setSelectedSlotKey({ rowKey: slot.rowKey, slotDatetime: slot.slot.slot_datetime });
  }

  function close(): void {
    setDrawerMode(null);
    setSelectedSlotKey(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setEditingBookingId(null);
    setEditDrafts([]);
  }

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
  }

  function cancelEdit(): void {
    setEditingBookingId(null);
    setEditDrafts([]);
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
      participants,
    };
  }

  function updatePayload(): BookingUpdateInput {
    const participants = asParticipantPayload(editDrafts);
    const primary = editDrafts.find((participant) => participant.is_primary);
    return {
      applies_to: primary?.participant_type === "staff" ? "staff" : primary?.participant_type === "member" ? "member" : undefined,
      reference_datetime: teeSheetQuery.data?.reference_datetime ?? null,
      participants,
    };
  }

  function dropKey(slot: LaneSlot): string {
    return `${slot.rowKey}:${slot.slot.slot_datetime}`;
  }

  function dropAllowed(target: LaneSlot): boolean {
    return Boolean(dragged && canDrop(target.slot) && !(dragged.rowKey === target.rowKey && dragged.slotDatetime === target.slot.slot_datetime));
  }

  function startDrag(event: DragEvent<HTMLElement>, bookingId: string, slot: LaneSlot): void {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", bookingId);
    }
    setDragged({ bookingId, rowKey: slot.rowKey, slotDatetime: slot.slot.slot_datetime });
    setNotice(null);
  }

  function endDrag(): void {
    setDragged(null);
    setActiveDropKey(null);
  }

  const description = `Course: ${activeCourse?.name ?? "Course setup required"} · Tee: ${selectedTee?.name ?? "tee setup required"}`;
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
  const visibleSlotCount = filteredBuckets.reduce((sum, bucket) => sum + bucket.slots.length, 0);

  useEffect(() => {
    if (pendingAutoScrollDateRef.current !== selectedDate) return;
    if (teeSheetQuery.isLoading || teeSheetQuery.error || filteredBuckets.length === 0) return;

    const targetTime = nearestBucketTime(filteredBuckets, teeSheetQuery.data?.timezone ?? null);
    if (!targetTime) return;

    document.getElementById(`bucket-${targetTime}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    pendingAutoScrollDateRef.current = null;
  }, [filteredBuckets, selectedDate, teeSheetQuery.data?.timezone, teeSheetQuery.error, teeSheetQuery.isLoading]);

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
                value={selectedTeeId ?? ""}
              >
                {activeCourseTees.length > 0 ? (
                  activeCourseTees.map((tee) => (
                    <option key={tee.id} value={tee.id}>
                      {tee.name}
                    </option>
                  ))
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
            <div className="flex items-center gap-2">
              <MaterialSymbol className="text-sm text-amber-500" icon="warning" />
              <span className="font-headline text-lg font-extrabold text-on-surface">{configuredForSheet ? alertSignals : "–"}</span>
              <span className="text-xs text-on-surface-variant">{configuredForSheet ? `${statusCounts.blocked} blocked` : "Alerts"}</span>
            </div>
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
            {showFilteredEmptyState ? <div className="rounded-2xl bg-surface-container-lowest px-6 py-5 text-sm text-slate-500 shadow-sm">No tee-sheet rows match the current filters.</div> : null}

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
                          <label className="relative flex items-center gap-2 rounded-2xl bg-surface-container-low px-3 py-2.5 text-sm text-on-surface">
                            <MaterialSymbol className="text-sm text-on-surface-variant" icon="calendar_month" />
                            <span className="font-medium">{dateLabel(selectedDate)}</span>
                            <MaterialSymbol className="text-sm text-on-surface-variant" icon="expand_more" />
                            <input
                              className="absolute inset-0 cursor-pointer opacity-0"
                              onChange={(event) => setSelectedDate(event.target.value)}
                              type="date"
                              value={selectedDate}
                            />
                          </label>
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
                        <div className="rounded-2xl bg-surface-container-low px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Sheet Scope</p>
                          <p className="text-sm font-semibold text-on-surface">
                            Showing {visibleSlotCount} of {slots.length} lane slots
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="space-y-1">
                          <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Search Sheet</span>
                          <span className="relative flex items-center">
                            <MaterialSymbol className="pointer-events-none absolute left-3 text-sm text-slate-400" icon="search" />
                            <input
                              className="w-full rounded-2xl bg-surface-container-low px-10 py-2.5 text-sm text-on-surface placeholder:text-slate-400 focus:border-transparent focus:ring-2 focus:ring-primary/20 sm:w-72"
                              onChange={(event) => setSearchTerm(event.target.value)}
                              placeholder="Search players, lane, or time"
                              type="search"
                              value={searchTerm}
                            />
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
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Operational Filters</p>
                      <div className="flex flex-wrap gap-2">
                        {VIEW_FILTERS.map((filter) => (
                          <button
                            className={`rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                              viewFilter === filter.value
                                ? "bg-primary text-white"
                                : "bg-surface-container-low text-on-surface hover:bg-surface-container"
                            }`}
                            key={filter.value}
                            onClick={() => setViewFilter(filter.value)}
                            type="button"
                          >
                            {filter.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

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
                                  className="group"
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
                                      </div>
                                    </td>
                                  ) : null}

                                  <td className={`w-[80px] px-3 align-middle transition-colors ${activeDropKey === targetKey ? "bg-primary-container/10" : ""}`}>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface">{item.laneLabel}</p>
                                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ${statusClass(item.slot.display_status)}`}>
                                      {statusLabel(item.slot.display_status)}
                                    </span>
                                  </td>

                                  {reservedBlock ? (
                                    <td className="px-2 align-top" colSpan={4}>
                                      <div className={`flex min-h-[3.5rem] items-center justify-between rounded-[16px] px-3 py-2 ${slotSummaryClass(item.slot)}`}>
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
                                          <button
                                            aria-label={cell.primaryHandle ? `Open booking ${cell.booking.id}` : `Open participant ${cell.participant.display_name}`}
                                            className={`${bookingChipClass(cell.booking, cell.primaryHandle)} ${movingBookingId === cell.booking.id ? "opacity-50" : ""}`}
                                            draggable={cell.primaryHandle}
                                            onClick={() => openManage(item)}
                                            onDragEnd={cell.primaryHandle ? endDrag : undefined}
                                            onDragStart={cell.primaryHandle ? (event) => startDrag(event, cell.booking.id, item) : undefined}
                                            type="button"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">P{cell.column}</span>
                                              {cell.primaryHandle ? (
                                                <div className="flex items-center gap-1">
                                                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${bookingStatusClass(cell.booking.status)}`}>
                                                    {bookingStatusLabel(cell.booking.status)}
                                                  </span>
                                                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${paymentClass(cell.booking.payment_status)}`}>
                                                    {paymentLabel(cell.booking.payment_status)}
                                                  </span>
                                                </div>
                                              ) : null}
                                            </div>
                                            <p className="truncate text-xs font-bold text-on-surface leading-none">{cell.participant.display_name}</p>
                                          </button>
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
                                            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">P{cell.column}</span>
                                            <span className="truncate text-xs font-bold text-on-surface">{canCreate(displaySlot) ? "Open" : "Unavailable"}</span>
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
              </>
            ) : null}
          </div>
        ) : null}
      </AdminWorkspace>

      {selectedSlot && drawerMode === "manage"
        ? (
            <BookingManagementDrawer
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
              onEditChangeParticipant={updateEditDraft}
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
              colorCode={selectedSlot.colorCode}
              creating={createMutation.isPending}
              directory={directory}
              feedbackMessage={drawerFeedbackMessage}
              feedbackTone={drawerFeedbackTone}
              laneLabel={selectedSlot.laneLabel}
              onAddParticipant={addDraft}
              onChangeParticipant={updateDraft}
              onClose={close}
              onCreate={() => {
                setNotice(null);
                setDrawerFeedbackMessage(null);
                setDrawerFeedbackTone(null);
                void createMutation.mutateAsync(createPayload(selectedSlot));
              }}
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
