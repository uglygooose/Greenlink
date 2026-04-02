import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type DragEvent } from "react";

import {
  cancelBooking,
  checkInBooking,
  completeBooking,
  createBooking,
  markBookingNoShow,
  moveBooking,
} from "../api/operations";
import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminShell from "../components/shell/AdminShell";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useCoursesQuery } from "../features/golf-settings/hooks";
import { useClubDirectoryQuery } from "../features/people/hooks";
import { BookingCreateDrawer } from "../features/tee-sheet/booking-create-drawer";
import { BookingManagementDrawer } from "../features/tee-sheet/booking-management-drawer";
import { teeSheetKeys, useTeeSheetDayQuery } from "../features/tee-sheet/hooks";
import { useSession } from "../session/session-context";
import type {
  BookingCreateInput,
  BookingCreateParticipantInput,
  BookingCreateResult,
  BookingLifecycleMutationResult,
  BookingParticipantType,
  BookingPaymentStatus,
  StartLane,
} from "../types/bookings";
import type { BookingRuleAppliesTo } from "../types/operations";
import type { TeeSheetSlotDisplayStatus, TeeSheetSlotView } from "../types/tee-sheet";

const MEMBERSHIP_OPTIONS: BookingRuleAppliesTo[] = ["member", "guest", "staff"];

type Action = "cancel" | "check_in" | "complete" | "no_show";
type Notice = { message: string; tone: "success" | "info" | "error" };
type SelectedSlotKey = { rowKey: string; slotDatetime: string };
type Dragged = { bookingId: string; rowKey: string; slotDatetime: string };
type Draft = {
  key: string;
  participant_type: BookingParticipantType;
  person_id: string | null;
  guest_name: string;
  is_primary: boolean;
};
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
    case "available":
      return "Confirmed";
    case "blocked":
      return "Blocked";
    case "reserved":
      return "Reserved";
    case "warning":
      return "Attention";
    default:
      return "Open";
  }
}

function statusClass(value: TeeSheetSlotDisplayStatus): string {
  switch (value) {
    case "available":
      return "bg-primary-container text-on-primary-container";
    case "blocked":
      return "border border-error-container bg-error-container/30 text-on-error-container";
    case "reserved":
      return "bg-slate-100 text-slate-500";
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

function initialDrafts(value: BookingRuleAppliesTo): Draft[] {
  return [{ key: "primary", participant_type: primaryType(value), person_id: null, guest_name: "", is_primary: true }];
}

function nextKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function bookingFeedback(result: BookingCreateResult): { message: string; tone: "error" | "info" } {
  if (result.failures[0]) return { tone: "error", message: result.failures[0].message };
  if (result.availability?.blockers[0]) return { tone: "error", message: result.availability.blockers[0].reason };
  if (result.availability?.unresolved_checks[0]) return { tone: "info", message: result.availability.unresolved_checks[0].reason };
  return { tone: "error", message: result.decision === "indeterminate" ? "Booking could not be resolved for this slot." : "Booking creation blocked." };
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
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts("member"));
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [activeDropKey, setActiveDropKey] = useState<string | null>(null);

  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const directoryQuery = useClubDirectoryQuery({ accessToken, selectedClubId });

  useEffect(() => {
    if (!courseId && coursesQuery.data?.length) setCourseId(coursesQuery.data[0].id);
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
    setSelectedSlotKey(null);
    setNotice({ tone: result.transition_applied ? "success" : "info", message: result.transition_applied ? COPY[action].success : COPY[action].already });
    await invalidate();
  }

  const cancelMutation = useMutation({ mutationFn: (id: string) => cancelBooking(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }), onSuccess: async (r) => onLifecycleSuccess("cancel", r), onError: (e) => { setDrawerFeedbackTone("error"); setDrawerFeedbackMessage(asMessage(e)); } });
  const checkInMutation = useMutation({ mutationFn: (id: string) => checkInBooking(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }), onSuccess: async (r) => onLifecycleSuccess("check_in", r), onError: (e) => { setDrawerFeedbackTone("error"); setDrawerFeedbackMessage(asMessage(e)); } });
  const completeMutation = useMutation({ mutationFn: (id: string) => completeBooking(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }), onSuccess: async (r) => onLifecycleSuccess("complete", r), onError: (e) => { setDrawerFeedbackTone("error"); setDrawerFeedbackMessage(asMessage(e)); } });
  const noShowMutation = useMutation({ mutationFn: (id: string) => markBookingNoShow(id, { accessToken: accessToken as string, selectedClubId: selectedClubId as string }), onSuccess: async (r) => onLifecycleSuccess("no_show", r), onError: (e) => { setDrawerFeedbackTone("error"); setDrawerFeedbackMessage(asMessage(e)); } });

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
    onError: (e) => {
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(asMessage(e));
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
      setNotice({ tone: result.transition_applied ? "success" : "info", message: result.transition_applied ? "Booking moved. Tee sheet refreshed from backend state." : "Booking was already at the requested slot." });
      await invalidate();
    },
    onError: (e) => {
      setDragged(null);
      setActiveDropKey(null);
      setNotice({ tone: "error", message: asMessage(e) });
    },
  });

  const activeCourse = coursesQuery.data?.find((course) => course.id === courseId) ?? null;
  const warningMessage = teeSheetQuery.data?.warnings[0]?.message ?? "No weather or policy alerts for this day.";
  const totalSlots = slots.length;
  const occupiedSlots = slots.filter((item) => item.slot.bookings.length > 0).length;
  const checkedInBookings = slots.reduce((sum, item) => sum + item.slot.bookings.filter((b) => b.status === "checked_in").length, 0);
  const checkedInPlayers = slots.reduce((sum, item) => sum + item.slot.bookings.filter((b) => b.status === "checked_in").reduce((inner, b) => inner + b.party_size, 0), 0);
  const openSlots = statusCounts.available + statusCounts.indeterminate + statusCounts.warning;
  const openPlayerCapacity = slots.reduce((sum, item) => sum + Math.max(item.slot.occupancy.remaining_player_capacity ?? 0, 0), 0);
  const alertSignals = (teeSheetQuery.data?.warnings.length ?? 0) + statusCounts.warning + statusCounts.blocked;
  const occupancyPct = totalSlots === 0 ? 0 : Math.round((occupiedSlots / totalSlots) * 100);
  const pendingAction = cancelMutation.isPending ? "cancel" : checkInMutation.isPending ? "check_in" : completeMutation.isPending ? "complete" : noShowMutation.isPending ? "no_show" : null;
  const pendingBookingId = cancelMutation.isPending ? cancelMutation.variables ?? null : checkInMutation.isPending ? checkInMutation.variables ?? null : completeMutation.isPending ? completeMutation.variables ?? null : noShowMutation.isPending ? noShowMutation.variables ?? null : null;
  const movingBookingId = moveMutation.isPending ? moveMutation.variables?.bookingId ?? null : null;
  const directory = directoryQuery.data ?? [];

  function open(slot: LaneSlot): void {
    if (!canManage(slot.slot) && !canCreate(slot.slot)) return;
    setNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setDrafts(initialDrafts(membershipType));
    setSelectedSlotKey({ rowKey: slot.rowKey, slotDatetime: slot.slot.slot_datetime });
  }

  function close(): void {
    setSelectedSlotKey(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
  }

  function updateDraft(key: string, patch: Partial<Draft>): void {
    setDrafts((current) => current.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function addDraft(): void {
    setDrafts((current) => (current.length >= 4 ? current : [...current, { key: nextKey(), participant_type: "guest", person_id: null, guest_name: "", is_primary: false }]));
  }

  function removeDraft(key: string): void {
    setDrafts((current) => current.filter((p) => p.key !== key || p.is_primary));
  }

  function createPayload(slot: LaneSlot): BookingCreateInput {
    const participants: BookingCreateParticipantInput[] = drafts.map((p) => ({
      participant_type: p.participant_type,
      person_id: p.participant_type === "guest" ? null : p.person_id,
      guest_name: p.participant_type === "guest" ? p.guest_name.trim() : null,
      is_primary: p.is_primary,
    }));
    const primary = drafts.find((p) => p.is_primary);
    return {
      course_id: courseId as string,
      tee_id: slot.teeId,
      start_lane: slot.startLane,
      slot_datetime: slot.slot.slot_datetime,
      slot_interval_minutes: teeSheetQuery.data?.interval_minutes ?? null,
      source: "admin",
      applies_to:
        primary?.participant_type === "staff" ? "staff" : primary?.participant_type === "member" ? "member" : undefined,
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

  return (
    <AdminShell title="Tee Sheet" searchPlaceholder="Search tee times...">
      <AdminWorkspace
        title="Daily Tee Sheet"
        dateLabel={dateLabel(selectedDate)}
        description={`Course: ${activeCourse?.name ?? "Loading course"} · ${membershipType} preview`}
        actions={
          <>
            <label className="relative flex items-center gap-2 rounded-xl border border-outline-variant/10 bg-surface-container-low px-3 py-2.5"><MaterialSymbol className="text-sm text-on-surface-variant" icon="calendar_month" /><span className="text-sm font-medium">{dateLabel(selectedDate)}</span><MaterialSymbol className="text-sm text-on-surface-variant" icon="expand_more" /><input className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => setSelectedDate(e.target.value)} type="date" value={selectedDate} /></label>
            <div className="flex gap-1"><button className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100" onClick={() => setSelectedDate((c) => addDays(c, -1))} type="button"><MaterialSymbol icon="chevron_left" /></button><button className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100" onClick={() => setSelectedDate((c) => addDays(c, 1))} type="button"><MaterialSymbol icon="chevron_right" /></button></div>
            <label className="flex items-center gap-2 rounded-xl bg-surface-container-highest px-4 py-2.5 text-sm font-semibold text-on-surface"><MaterialSymbol className="text-sm" icon="group_add" /><select className="border-none bg-transparent pr-5 text-sm font-semibold focus:ring-0" onChange={(e) => setCourseId(e.target.value || null)} value={courseId ?? ""}>{(coursesQuery.data ?? []).map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
            <label className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white"><MaterialSymbol className="text-sm" icon="person_add" /><select className="border-none bg-transparent pr-5 text-sm font-bold text-white focus:ring-0" onChange={(e) => setMembershipType(e.target.value as BookingRuleAppliesTo)} value={membershipType}>{MEMBERSHIP_OPTIONS.map((option) => <option className="text-on-surface" key={option} value={option}>{option}</option>)}</select></label>
          </>
        }
        kpis={
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border-l-4 border-primary bg-surface-container-lowest p-6 shadow-sm"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tee Occupancy</span><MaterialSymbol className="text-primary" icon="golf_course" /></div><div className="flex items-baseline gap-2">{teeSheetQuery.isLoading ? <span className="font-headline text-3xl font-extrabold text-slate-300">-</span> : <><span className="font-headline text-3xl font-extrabold text-on-surface">{occupancyPct}%</span><span className="text-xs font-medium text-primary">{occupiedSlots}/{totalSlots} lane slots</span></>}</div></div>
            <div className="rounded-xl border-l-4 border-emerald-500 bg-surface-container-lowest p-6 shadow-sm"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Checked In / On Course</span><MaterialSymbol className="text-emerald-500" icon="flag" /></div><div className="flex items-baseline gap-2">{teeSheetQuery.isLoading ? <span className="font-headline text-3xl font-extrabold text-slate-300">-</span> : <><span className="font-headline text-3xl font-extrabold text-on-surface">{checkedInBookings}</span><span className="text-xs font-medium text-emerald-600">{checkedInPlayers} players</span></>}</div></div>
            <div className="rounded-xl border-l-4 border-secondary bg-surface-container-lowest p-6 shadow-sm"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Open Slots</span><MaterialSymbol className="text-secondary" icon="grid_view" /></div><div className="flex items-baseline gap-2">{teeSheetQuery.isLoading ? <span className="font-headline text-3xl font-extrabold text-slate-300">-</span> : <><span className="font-headline text-3xl font-extrabold text-on-surface">{openSlots}</span><span className="text-xs font-medium text-secondary">{openPlayerCapacity} player spaces</span></>}</div></div>
            <div className="rounded-xl border-l-4 border-amber-500 bg-surface-container-lowest p-6 shadow-sm"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Flags / Pace / Alerts</span><MaterialSymbol className="text-amber-500" icon="warning" /></div><div className="flex items-baseline gap-2">{teeSheetQuery.isLoading ? <span className="font-headline text-3xl font-extrabold text-slate-300">-</span> : <><span className="font-headline text-3xl font-extrabold text-on-surface">{alertSignals}</span><span className="text-xs font-medium text-amber-600">{statusCounts.warning} flags · {statusCounts.blocked} blocked</span></>}</div><p className="mt-3 text-xs text-on-surface-variant">{warningMessage}</p></div>
          </div>
        }
      >
        {notice ? <div className={notice.tone === "success" ? "mb-4 rounded-2xl bg-primary-container/50 px-4 py-3 text-sm font-medium text-on-primary-container" : notice.tone === "error" ? "mb-4 rounded-2xl bg-error-container/40 px-4 py-3 text-sm font-medium text-on-error-container" : "mb-4 rounded-2xl bg-secondary-container px-4 py-3 text-sm font-medium text-on-secondary-container"}>{notice.message}</div> : null}
        <div className="space-y-4">
          {teeSheetQuery.isLoading ? <div className="rounded-xl bg-surface-container-lowest px-6 py-5 text-sm text-slate-500 shadow-sm">Loading tee sheet...</div> : null}
          {teeSheetQuery.error ? <div className="rounded-xl bg-error-container/30 px-6 py-5 text-sm text-error shadow-sm">{teeSheetQuery.error.message}</div> : null}
          {!teeSheetQuery.isLoading && !teeSheetQuery.error && buckets.length === 0 ? <div className="rounded-xl bg-surface-container-lowest px-6 py-5 text-sm text-slate-500 shadow-sm">No active tee-sheet rows were generated for the selected day.</div> : null}
          {buckets.map((bucket) => <section className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm" key={bucket.slotDatetime}>
            <div className="flex items-center justify-between bg-surface-container-low px-6 py-4"><div><h3 className="font-headline text-xl font-extrabold text-primary">{bucket.localTime.slice(0, 5)}</h3><p className="text-xs text-on-surface-variant">{bucket.slots.reduce((sum, slot) => sum + slot.slot.bookings.length, 0)} bookings · {bucket.slots.reduce((sum, slot) => sum + (slot.slot.party_summary.total_players ?? 0), 0)} players</p></div><span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{bucket.slots.length} lanes</span></div>
            <div className="divide-y divide-slate-100">{bucket.slots.map((item) => {
              const reservedBlock = (item.slot.display_status === "blocked" || item.slot.display_status === "reserved") && (item.slot.party_summary.total_players ?? 0) === 0;
              const allowedDrop = dropAllowed(item);
              const targetKey = dropKey(item);
              return <div aria-label={`${item.laneLabel} lane row ${bucket.localTime.slice(0, 5)}`} className={`grid gap-4 px-6 py-4 md:grid-cols-[160px_minmax(0,1fr)_auto] ${item.slot.display_status === "blocked" ? "bg-red-50/30" : ""} ${activeDropKey === targetKey ? "bg-primary-container/25" : ""}`} data-testid={`lane-row-${item.rowKey}`} key={targetKey} onDragEnter={() => { if (allowedDrop) setActiveDropKey(targetKey); }} onDragLeave={() => { if (activeDropKey === targetKey) setActiveDropKey(null); }} onDragOver={(event) => { if (allowedDrop) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move"; setActiveDropKey(targetKey); } }} onDrop={(event) => { event.preventDefault(); if (allowedDrop && dragged) void moveMutation.mutateAsync({ bookingId: dragged.bookingId, target: item }); }}>
                <div className="space-y-1"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">{item.laneLabel}</p><p className="text-sm font-bold text-on-surface">{item.rowLabel}</p><p className="text-xs text-slate-500">{item.colorCode ? `${item.colorCode} · ` : ""}{item.slot.occupancy.remaining_player_capacity ?? 0} spaces left</p></div>
                <div className="space-y-3">{reservedBlock ? <div className="rounded-xl bg-surface-container-low px-4 py-3 text-sm text-slate-500">Reserved: {detail(item.slot)}</div> : item.slot.bookings.length > 0 ? <div className="space-y-2">{item.slot.bookings.map((booking) => <button aria-label={`Open booking ${booking.id}`} className={`flex w-full items-start justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-slate-50 ${movingBookingId === booking.id ? "opacity-60" : ""}`} draggable key={booking.id} onClick={() => open(item)} onDragEnd={endDrag} onDragStart={(event) => startDrag(event, booking.id, item)} type="button"><div className="min-w-0 space-y-2"><p className="truncate text-sm font-bold text-on-surface">{booking.participants.map((p) => p.display_name).join(", ") || `${booking.party_size} players`}</p><div className="flex flex-wrap gap-2"><span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${paymentClass(booking.payment_status)}`}>{paymentLabel(booking.payment_status)}</span><span className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface">{booking.fee_label ?? "Rate pending"}</span>{booking.cart_flag ? <span className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface">Cart</span> : null}{booking.caddie_flag ? <span className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface">Caddie</span> : null}</div></div><div className="flex flex-col items-end gap-2"><span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(item.slot.display_status)}`}>{statusLabel(item.slot.display_status)}</span><span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500"><MaterialSymbol className="text-sm" icon="drag_indicator" />Move</span></div></button>)}</div> : <div className="rounded-xl bg-surface-container-low px-4 py-3 text-sm text-slate-500">Open for booking.</div>}{activeDropKey === targetKey ? <div className="rounded-xl bg-primary-container/50 px-4 py-3 text-sm font-medium text-on-primary-container">Drop booking to move here.</div> : null}</div>
                <div className="flex flex-col items-end gap-3"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClass(item.slot.display_status)}`}>{statusLabel(item.slot.display_status)}</span>{canManage(item.slot) || canCreate(item.slot) ? <button aria-label={`${canManage(item.slot) ? "Manage bookings" : "Create booking"} for ${item.laneLabel} ${bucket.localTime.slice(0, 5)}`} className="rounded-lg bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight text-white transition-colors hover:bg-primary-dim" onClick={() => open(item)} type="button">{canManage(item.slot) ? "Manage" : "Create"}</button> : <button className="rounded p-1 text-slate-300" disabled type="button"><MaterialSymbol className="text-slate-400" icon="more_vert" /></button>}</div>
              </div>;
            })}</div>
          </section>)}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-container-low px-6 py-4"><span className="text-xs font-medium text-slate-500">Showing {slots.length} of {slots.length} lane slots</span><div className="flex gap-2"><button className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold transition-colors hover:bg-slate-50" onClick={() => setSelectedDate((c) => addDays(c, -1))} type="button">Previous</button><button className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold transition-colors hover:bg-slate-50" onClick={() => setSelectedDate((c) => addDays(c, 1))} type="button">Next</button></div></div>
      </AdminWorkspace>
      {selectedSlot ? canManage(selectedSlot.slot) ? <BookingManagementDrawer colorCode={selectedSlot.colorCode} feedbackMessage={drawerFeedbackMessage} feedbackTone={drawerFeedbackTone} laneLabel={selectedSlot.laneLabel} onCancel={(id) => { setNotice(null); setDrawerFeedbackMessage(null); setDrawerFeedbackTone(null); cancelMutation.mutate(id); }} onCheckIn={(id) => { setNotice(null); setDrawerFeedbackMessage(null); setDrawerFeedbackTone(null); checkInMutation.mutate(id); }} onClose={close} onComplete={(id) => { setNotice(null); setDrawerFeedbackMessage(null); setDrawerFeedbackTone(null); completeMutation.mutate(id); }} onNoShow={(id) => { setNotice(null); setDrawerFeedbackMessage(null); setDrawerFeedbackTone(null); noShowMutation.mutate(id); }} pendingAction={pendingAction} pendingBookingId={pendingBookingId} selectedDate={selectedDate} slot={selectedSlot.slot} teeLabel={selectedSlot.rowLabel} /> : <BookingCreateDrawer colorCode={selectedSlot.colorCode} creating={createMutation.isPending} directory={directory} feedbackMessage={drawerFeedbackMessage} feedbackTone={drawerFeedbackTone} laneLabel={selectedSlot.laneLabel} onAddParticipant={addDraft} onChangeParticipant={updateDraft} onClose={close} onCreate={() => { setNotice(null); setDrawerFeedbackMessage(null); setDrawerFeedbackTone(null); void createMutation.mutateAsync(createPayload(selectedSlot)); }} onRemoveParticipant={removeDraft} participants={drafts} selectedDate={selectedDate} slot={selectedSlot.slot} teeLabel={selectedSlot.rowLabel} /> : null}
    </AdminShell>
  );
}
