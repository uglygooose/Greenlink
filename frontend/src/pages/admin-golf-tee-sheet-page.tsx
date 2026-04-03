import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type DragEvent } from "react";
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
import type { TeeSheetSlotDisplayStatus, TeeSheetSlotView } from "../types/tee-sheet";

const MEMBERSHIP_OPTIONS: BookingRuleAppliesTo[] = ["member", "guest", "staff"];

type Action = "cancel" | "check_in" | "complete" | "no_show";
type Notice = { message: string; tone: "success" | "info" | "error" };
type SelectedSlotKey = { rowKey: string; slotDatetime: string };
type Dragged = { bookingId: string; rowKey: string; slotDatetime: string };
type LaneSlot = {
  colorCode: string | null;
  laneLabel: string;
  rowKey: string;
  rowLabel: string;
  slot: TeeSheetSlotView;
  startLane: StartLane | null;
  teeId: string | null;
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

function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
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

function detail(slot: TeeSheetSlotView): string {
  return slot.blockers[0]?.reason ?? slot.unresolved_checks[0]?.reason ?? slot.warnings[0]?.message ?? "Open for booking";
}

function canManage(slot: TeeSheetSlotView): boolean {
  return slot.bookings.length > 0;
}

function canCreate(slot: TeeSheetSlotView): boolean {
  return slot.bookings.length === 0 && slot.display_status !== "blocked" && slot.display_status !== "reserved";
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
  const { accessToken, bootstrap } = useSession();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [membershipType, setMembershipType] = useState<BookingRuleAppliesTo>("member");
  const [courseId, setCourseId] = useState<string | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState<SelectedSlotKey | null>(null);
  const [drawerFeedbackMessage, setDrawerFeedbackMessage] = useState<string | null>(null);
  const [drawerFeedbackTone, setDrawerFeedbackTone] = useState<"error" | "info" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [drafts, setDrafts] = useState<DraftParticipant[]>(initialDrafts("member"));
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [activeDropKey, setActiveDropKey] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<DraftParticipant[]>([]);

  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const teesQuery = useTeesQuery({ accessToken, selectedClubId });
  const directoryQuery = useClubDirectoryQuery({ accessToken, selectedClubId });

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
    setDrafts(initialDrafts(membershipType));
  }, [membershipType]);

  const teeSheetQuery = useTeeSheetDayQuery({
    accessToken,
    selectedClubId,
    courseId,
    date: selectedDate,
    membershipType,
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
      setDrawerFeedbackMessage(null);
      setDrawerFeedbackTone(null);
      setEditingBookingId(null);
      setEditDrafts([]);
    }
  }, [selectedSlot, selectedSlotKey]);

  async function invalidate(): Promise<void> {
    if (!selectedClubId || !courseId) return;
    await queryClient.invalidateQueries({ queryKey: teeSheetKeys.day(selectedClubId, courseId, selectedDate, membershipType) });
  }

  async function onLifecycleSuccess(action: Action, result: BookingLifecycleMutationResult): Promise<void> {
    if (result.decision === "blocked") {
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(result.failures[0]?.message ?? COPY[action].blocked);
      return;
    }
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
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
    onSuccess: async (result, variables) => {
      setDragged(null);
      setActiveDropKey(null);
      if (result.decision === "blocked") {
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
      setEditingBookingId(null);
      setEditDrafts([]);
      setNotice({
        tone: result.transition_applied ? "success" : "info",
        message: result.transition_applied ? "Booking moved. Tee sheet refreshed from backend state." : "Booking was already at the requested slot.",
      });
      await invalidate();
    },
    onError: (error) => {
      setDragged(null);
      setActiveDropKey(null);
      setNotice({ tone: "error", message: asMessage(error) });
    },
  });

  const activeCourse = coursesQuery.data?.find((course) => course.id === courseId) ?? null;
  const activeCourseTees = useMemo(
    () => (teesQuery.data ?? []).filter((tee: Tee) => tee.course_id === courseId && tee.active),
    [courseId, teesQuery.data],
  );
  const hasCourses = (coursesQuery.data?.length ?? 0) > 0;
  const setupMissingCourses = !coursesQuery.isLoading && !coursesQuery.error && !hasCourses;
  const setupMissingTees =
    !setupMissingCourses &&
    Boolean(courseId) &&
    !teesQuery.isLoading &&
    !teesQuery.error &&
    activeCourseTees.length === 0;
  const configuredForSheet = Boolean(activeCourse && activeCourseTees.length > 0);

  const warningMessage = teeSheetQuery.data?.warnings[0]?.message ?? "No weather or policy alerts for this day.";
  const totalSlots = slots.length;
  const occupiedSlots = slots.filter((item) => item.slot.bookings.length > 0).length;
  const checkedInBookings = slots.reduce((sum, item) => sum + item.slot.bookings.filter((booking) => booking.status === "checked_in").length, 0);
  const checkedInPlayers = slots.reduce((sum, item) => sum + item.slot.bookings.filter((booking) => booking.status === "checked_in").reduce((inner, booking) => inner + booking.party_size, 0), 0);
  const openSlots = statusCounts.available + statusCounts.indeterminate + statusCounts.warning;
  const openPlayerCapacity = slots.reduce((sum, item) => sum + Math.max(item.slot.occupancy.remaining_player_capacity ?? 0, 0), 0);
  const alertSignals = (teeSheetQuery.data?.warnings.length ?? 0) + statusCounts.warning + statusCounts.blocked;
  const occupancyPct = totalSlots === 0 ? 0 : Math.round((occupiedSlots / totalSlots) * 100);
  const pendingAction = cancelMutation.isPending ? "cancel" : checkInMutation.isPending ? "check_in" : completeMutation.isPending ? "complete" : noShowMutation.isPending ? "no_show" : null;
  const pendingBookingId = cancelMutation.isPending ? cancelMutation.variables ?? null : checkInMutation.isPending ? checkInMutation.variables ?? null : completeMutation.isPending ? completeMutation.variables ?? null : noShowMutation.isPending ? noShowMutation.variables ?? null : null;
  const movingBookingId = moveMutation.isPending ? moveMutation.variables?.bookingId ?? null : null;
  const savingBookingId = updateMutation.isPending ? updateMutation.variables?.bookingId ?? null : null;
  const directory = directoryQuery.data ?? [];

  function open(slot: LaneSlot): void {
    if (!canManage(slot.slot) && !canCreate(slot.slot)) return;
    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setDrafts(initialDrafts(membershipType));
    setEditingBookingId(null);
    setEditDrafts([]);
    setSelectedSlotKey({ rowKey: slot.rowKey, slotDatetime: slot.slot.slot_datetime });
  }

  function close(): void {
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

  const description = `Course: ${activeCourse?.name ?? "Course setup required"} - ${membershipType} preview`;
  const showLiveEmptyState = configuredForSheet && !teeSheetQuery.isLoading && !teeSheetQuery.error && buckets.length === 0;
  return (
    <>
      <AdminWorkspace
        title="Daily Tee Sheet"
        dateLabel={dateLabel(selectedDate)}
        description={description}
        actions={
          <>
            <label className="relative flex items-center gap-2 rounded-2xl bg-surface-container-low px-3 py-2.5 text-sm text-on-surface">
              <MaterialSymbol className="text-sm text-on-surface-variant" icon="calendar_month" />
              <span className="font-medium">{dateLabel(selectedDate)}</span>
              <MaterialSymbol className="text-sm text-on-surface-variant" icon="expand_more" />
              <input className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => setSelectedDate(event.target.value)} type="date" value={selectedDate} />
            </label>
            <div className="flex gap-1">
              <button className="rounded-2xl bg-surface-container-low p-2 text-slate-500 transition-colors hover:bg-surface-container" onClick={() => setSelectedDate((current) => addDays(current, -1))} type="button">
                <MaterialSymbol icon="chevron_left" />
              </button>
              <button className="rounded-2xl bg-surface-container-low p-2 text-slate-500 transition-colors hover:bg-surface-container" onClick={() => setSelectedDate((current) => addDays(current, 1))} type="button">
                <MaterialSymbol icon="chevron_right" />
              </button>
            </div>
            <label className="flex items-center gap-2 rounded-2xl bg-surface-container-high px-4 py-2.5 text-sm font-semibold text-on-surface">
              <MaterialSymbol className="text-sm" icon="flag" />
              <select
                className="border-none bg-transparent pr-5 text-sm font-semibold focus:ring-0"
                disabled={!hasCourses}
                onChange={(event) => {
                  setCourseId(event.target.value || null);
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
            <label className="flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white">
              <MaterialSymbol className="text-sm" icon="person_add" />
              <select className="border-none bg-transparent pr-5 text-sm font-bold text-white focus:ring-0" onChange={(event) => setMembershipType(event.target.value as BookingRuleAppliesTo)} value={membershipType}>
                {MEMBERSHIP_OPTIONS.map((option) => (
                  <option className="text-on-surface" key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        kpis={
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div className="rounded-[24px] bg-surface-container-lowest p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Occupancy</span>
                <MaterialSymbol className="text-primary" icon="golf_course" />
              </div>
              <div className="flex items-end gap-2">
                <span className="font-headline text-3xl font-extrabold text-on-surface">{configuredForSheet ? `${occupancyPct}%` : "-"}</span>
                <span className="pb-1 text-xs text-primary">{configuredForSheet ? `${occupiedSlots}/${totalSlots} lane slots` : "Awaiting setup"}</span>
              </div>
            </div>
            <div className="rounded-[24px] bg-surface-container-lowest p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Checked In</span>
                <MaterialSymbol className="text-secondary" icon="how_to_reg" />
              </div>
              <div className="flex items-end gap-2">
                <span className="font-headline text-3xl font-extrabold text-on-surface">{configuredForSheet ? checkedInBookings : "-"}</span>
                <span className="pb-1 text-xs text-secondary">{configuredForSheet ? `${checkedInPlayers} players` : "Awaiting setup"}</span>
              </div>
            </div>
            <div className="rounded-[24px] bg-surface-container-lowest p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Open Capacity</span>
                <MaterialSymbol className="text-emerald-600" icon="grid_view" />
              </div>
              <div className="flex items-end gap-2">
                <span className="font-headline text-3xl font-extrabold text-on-surface">{configuredForSheet ? openSlots : "-"}</span>
                <span className="pb-1 text-xs text-emerald-600">{configuredForSheet ? `${openPlayerCapacity} spaces` : "Awaiting setup"}</span>
              </div>
            </div>
            <div className="rounded-[24px] bg-surface-container-lowest p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Alerts</span>
                <MaterialSymbol className="text-amber-500" icon="warning" />
              </div>
              <div className="flex items-end gap-2">
                <span className="font-headline text-3xl font-extrabold text-on-surface">{configuredForSheet ? alertSignals : "-"}</span>
                <span className="pb-1 text-xs text-amber-600">{configuredForSheet ? `${statusCounts.blocked} blocked` : "Awaiting setup"}</span>
              </div>
              <p className="mt-3 text-xs text-on-surface-variant">{configuredForSheet ? warningMessage : "Configure course and tee records to activate the operational sheet."}</p>
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
            {teeSheetQuery.error ? <div className="rounded-2xl bg-error-container/30 px-6 py-5 text-sm text-error shadow-sm">{teeSheetQuery.error.message}</div> : null}
            {showLiveEmptyState ? <div className="rounded-2xl bg-surface-container-lowest px-6 py-5 text-sm text-slate-500 shadow-sm">No tee-sheet rows were generated for the selected day.</div> : null}

            {buckets.map((bucket) => (
              <section className="overflow-hidden rounded-[28px] bg-surface-container-lowest shadow-sm" key={bucket.slotDatetime}>
                <div className="grid gap-4 bg-surface-container px-6 py-5 md:grid-cols-[140px_minmax(0,1fr)_auto] md:items-center">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Time</p>
                    <h3 className="mt-1 font-headline text-2xl font-extrabold text-on-surface">{bucket.localTime.slice(0, 5)}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-white px-3 py-1 font-semibold">{bucket.slots.length} lanes</span>
                    <span className="rounded-full bg-white px-3 py-1 font-semibold">
                      {bucket.slots.reduce((sum, slot) => sum + slot.slot.bookings.length, 0)} bookings
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 font-semibold">
                      {bucket.slots.reduce((sum, slot) => sum + (slot.slot.party_summary.total_players ?? 0), 0)} players
                    </span>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    {bucket.slots.some((slot) => slot.slot.display_status === "blocked") ? "Blocked lanes need ops action." : "Operational view"}
                  </div>
                </div>

                <div className="space-y-2 px-4 py-4">
                  {bucket.slots.map((item) => {
                    const reservedBlock = (item.slot.display_status === "blocked" || item.slot.display_status === "reserved") && (item.slot.party_summary.total_players ?? 0) === 0;
                    const allowedDrop = dropAllowed(item);
                    const targetKey = dropKey(item);
                    return (
                      <div
                        aria-label={`${item.laneLabel} lane row ${bucket.localTime.slice(0, 5)}`}
                        className={`grid gap-4 rounded-[24px] px-5 py-5 md:grid-cols-[160px_minmax(0,1fr)_auto] ${activeDropKey === targetKey ? "bg-primary-container/30" : item.slot.display_status === "blocked" ? "bg-error-container/20" : "bg-surface-container-low"}`}
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
                          if (allowedDrop && dragged) void moveMutation.mutateAsync({ bookingId: dragged.bookingId, target: item });
                        }}
                      >
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">{item.laneLabel}</p>
                          <div>
                            <p className="text-base font-bold text-on-surface">{item.rowLabel}</p>
                            <p className="text-xs text-slate-500">
                              {item.colorCode ? `${item.colorCode} | ` : ""}
                              {item.slot.occupancy.remaining_player_capacity ?? 0} spaces left
                            </p>
                          </div>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(item.slot.display_status)}`}>
                            {statusLabel(item.slot.display_status)}
                          </span>
                        </div>

                        <div className="space-y-3">
                          {reservedBlock ? (
                            <div className="rounded-2xl bg-surface-container-high px-4 py-3 text-sm text-slate-500">Reserved: {detail(item.slot)}</div>
                          ) : item.slot.bookings.length > 0 ? (
                            <div className="space-y-2">
                              {item.slot.bookings.map((booking) => (
                                <button
                                  aria-label={`Open booking ${booking.id}`}
                                  className={`flex w-full items-start justify-between gap-3 rounded-2xl bg-white px-4 py-4 text-left shadow-sm transition-colors hover:bg-slate-50 ${movingBookingId === booking.id ? "opacity-60" : ""}`}
                                  draggable
                                  key={booking.id}
                                  onClick={() => open(item)}
                                  onDragEnd={endDrag}
                                  onDragStart={(event) => startDrag(event, booking.id, item)}
                                  type="button"
                                >
                                  <div className="min-w-0 space-y-2">
                                    <p className="truncate text-sm font-bold text-on-surface">
                                      {booking.participants.map((participant: BookingParticipantSummary) => participant.display_name).join(", ") || `${booking.party_size} players`}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${paymentClass(booking.payment_status)}`}>
                                        {paymentLabel(booking.payment_status)}
                                      </span>
                                      <span className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface">
                                        {booking.fee_label ?? "Rate pending"}
                                      </span>
                                      {booking.cart_flag ? <span className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface">Cart</span> : null}
                                      {booking.caddie_flag ? <span className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface">Caddie</span> : null}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-2">
                                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(item.slot.display_status)}`}>
                                      {statusLabel(item.slot.display_status)}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                                      <MaterialSymbol className="text-sm" icon="drag_indicator" />
                                      Move
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-2xl bg-surface-container-high px-4 py-4 text-sm text-slate-500">Open for booking.</div>
                          )}

                          {activeDropKey === targetKey ? (
                            <div className="rounded-2xl bg-primary-container/60 px-4 py-3 text-sm font-medium text-on-primary-container">Drop booking to move here.</div>
                          ) : null}
                        </div>

                        <div className="flex flex-col items-end justify-between gap-4">
                          <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Availability</p>
                            <p className="mt-1 text-sm font-semibold text-on-surface">{item.slot.occupancy.remaining_player_capacity ?? 0} spaces</p>
                            <p className="mt-1 text-xs text-slate-500">{detail(item.slot)}</p>
                          </div>
                          {canManage(item.slot) || canCreate(item.slot) ? (
                            <button
                              aria-label={`${canManage(item.slot) ? "Manage bookings" : "Create booking"} for ${item.laneLabel} ${bucket.localTime.slice(0, 5)}`}
                              className="rounded-2xl bg-primary px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-primary-dim"
                              onClick={() => open(item)}
                              type="button"
                            >
                              {canManage(item.slot) ? "Manage Booking" : "Create Booking"}
                            </button>
                          ) : (
                            <div className="rounded-2xl bg-surface-container-high px-4 py-3 text-xs font-semibold text-slate-400">Read only</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {configuredForSheet ? (
          <div className="flex items-center justify-between rounded-2xl bg-surface-container-low px-6 py-4">
            <span className="text-xs font-medium text-slate-500">Showing {slots.length} of {slots.length} lane slots</span>
            <div className="flex gap-2">
              <button className="rounded-2xl bg-white px-4 py-2 text-xs font-bold text-on-surface transition-colors hover:bg-slate-50" onClick={() => setSelectedDate((current) => addDays(current, -1))} type="button">
                Previous
              </button>
              <button className="rounded-2xl bg-white px-4 py-2 text-xs font-bold text-on-surface transition-colors hover:bg-slate-50" onClick={() => setSelectedDate((current) => addDays(current, 1))} type="button">
                Next
              </button>
            </div>
          </div>
        ) : null}
      </AdminWorkspace>

      {selectedSlot
        ? canManage(selectedSlot.slot)
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
          : (
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
