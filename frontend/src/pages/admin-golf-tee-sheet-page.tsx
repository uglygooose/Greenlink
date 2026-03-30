import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";

import {
  cancelBooking,
  checkInBooking,
  completeBooking,
  markBookingNoShow,
} from "../api/operations";
import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { MobileTabBar } from "../components/benchmark/mobile-tab-bar";
import { UserAvatar } from "../components/benchmark/user-avatar";
import { useCoursesQuery } from "../features/golf-settings/hooks";
import { BookingManagementDrawer } from "../features/tee-sheet/booking-management-drawer";
import { teeSheetKeys, useTeeSheetDayQuery } from "../features/tee-sheet/hooks";
import { useSession } from "../session/session-context";
import type { BookingLifecycleMutationResult } from "../types/bookings";
import type { BookingRuleAppliesTo } from "../types/operations";
import type { TeeSheetSlotDisplayStatus, TeeSheetSlotView } from "../types/tee-sheet";

const MEMBERSHIP_OPTIONS: BookingRuleAppliesTo[] = ["member", "guest", "staff"];

type OccupantChip = {
  label: string;
  state: "filled" | "alert" | "empty";
};

type FlattenedSlot = {
  rowKey: string;
  rowLabel: string;
  colorCode: string | null;
  slot: TeeSheetSlotView;
  occupants: OccupantChip[];
};

type SelectedSlotKey = {
  rowKey: string;
  slotDatetime: string;
};

type OperationNotice = {
  tone: "success" | "info";
  message: string;
};

type LifecycleAction = "cancel" | "check_in" | "complete" | "no_show";

const LIFECYCLE_NOTICE_COPY: Record<
  LifecycleAction,
  {
    blockedFallback: string;
    success: string;
    already: string;
  }
> = {
  cancel: {
    blockedFallback: "Cancellation blocked.",
    success: "Booking cancelled. Tee sheet refreshed from backend state.",
    already: "Booking was already cancelled. Tee sheet refreshed from backend state.",
  },
  check_in: {
    blockedFallback: "Check-in blocked.",
    success: "Booking checked in. Tee sheet refreshed from backend state.",
    already: "Booking was already checked in. Tee sheet refreshed from backend state.",
  },
  complete: {
    blockedFallback: "Completion blocked.",
    success: "Booking completed. Tee sheet refreshed from backend state.",
    already: "Booking was already completed. Tee sheet refreshed from backend state.",
  },
  no_show: {
    blockedFallback: "No-show blocked.",
    success: "Booking marked no-show. Tee sheet refreshed from backend state.",
    already: "Booking was already marked no-show. Tee sheet refreshed from backend state.",
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

function statusLabel(status: TeeSheetSlotDisplayStatus): string {
  switch (status) {
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

function statusClassName(status: TeeSheetSlotDisplayStatus): string {
  switch (status) {
    case "available":
      return "bg-primary-container text-on-primary-container";
    case "blocked":
      return "border border-error-container bg-error-container/30 text-on-error-container";
    case "reserved":
      return "bg-slate-100 text-slate-500";
    case "warning":
      return "bg-secondary-container text-on-secondary-container";
    default:
      return "bg-secondary-container text-on-secondary-container";
  }
}

function firstDetail(slot: TeeSheetSlotView): string {
  if (slot.blockers[0]) {
    return slot.blockers[0].reason;
  }
  if (slot.unresolved_checks[0]) {
    return slot.unresolved_checks[0].reason;
  }
  if (slot.warnings[0]) {
    return slot.warnings[0].message;
  }
  return "Open for booking";
}

function initials(name: string | undefined): string {
  return (
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "GL"
  );
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function sidebarLinkClass(isActive: boolean): string {
  return isActive
    ? "group flex items-center rounded-xl border-r-4 border-emerald-600 bg-emerald-50/50 px-4 py-3 font-bold text-emerald-800 transition-all duration-200 ease-in-out dark:bg-emerald-900/20 dark:text-emerald-400"
    : "group flex items-center rounded-xl px-4 py-3 text-slate-600 transition-all duration-200 ease-in-out hover:bg-slate-100 hover:text-emerald-700 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-emerald-300";
}

function buildOccupants(slot: TeeSheetSlotView): OccupantChip[] {
  const totalPlayers = Math.min(slot.party_summary.total_players ?? 0, 4);
  const items: OccupantChip[] = [];
  const pushMany = (count: number | null, label: string, state: OccupantChip["state"]) => {
    for (let index = 0; index < Math.min(count ?? 0, 4 - items.length); index += 1) {
      items.push({ label: `${label} ${index + 1}`, state });
    }
  };
  const playerState: OccupantChip["state"] =
    slot.display_status === "blocked" || slot.display_status === "warning" ? "alert" : "filled";

  pushMany(slot.party_summary.member_count, "Member", playerState);
  pushMany(slot.party_summary.guest_count, "Guest", playerState);
  pushMany(slot.party_summary.staff_count, "Staff", playerState);

  while (items.length < totalPlayers) {
    items.push({ label: `Player ${items.length + 1}`, state: playerState });
  }
  while (items.length < 4) {
    items.push({ label: "Empty", state: "empty" });
  }
  return items;
}

function isManageableSlot(slot: TeeSheetSlotView): boolean {
  return slot.bookings.length > 0;
}

function asMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Request failed";
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
  const [operationNotice, setOperationNotice] = useState<OperationNotice | null>(null);

  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const displayName = bootstrap?.user.display_name ?? "Club Admin";
  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });

  useEffect(() => {
    if (!courseId && coursesQuery.data?.length) {
      setCourseId(coursesQuery.data[0].id);
    }
  }, [courseId, coursesQuery.data]);

  const teeSheetQuery = useTeeSheetDayQuery({
    accessToken,
    selectedClubId,
    courseId,
    date: selectedDate,
    membershipType,
  });

  const flattenedSlots = useMemo<FlattenedSlot[]>(() => {
    const rows = teeSheetQuery.data?.rows ?? [];
    return rows
      .flatMap((row) =>
        row.slots.map((slot) => ({
          rowKey: row.row_key,
          rowLabel: row.label,
          colorCode: row.color_code,
          slot,
          occupants: buildOccupants(slot),
        })),
      )
      .sort((left, right) => {
        const timeCompare = left.slot.local_time.localeCompare(right.slot.local_time);
        return timeCompare !== 0 ? timeCompare : left.rowLabel.localeCompare(right.rowLabel);
      });
  }, [teeSheetQuery.data]);

  const statusCounts = useMemo(() => {
    return flattenedSlots.reduce(
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
    );
  }, [flattenedSlots]);

  const selectedSlot = useMemo(
    () =>
      selectedSlotKey
        ? flattenedSlots.find(
            (item) =>
              item.rowKey === selectedSlotKey.rowKey &&
              item.slot.slot_datetime === selectedSlotKey.slotDatetime,
          ) ?? null
        : null,
    [flattenedSlots, selectedSlotKey],
  );

  useEffect(() => {
    if (selectedSlotKey && selectedSlot === null) {
      setSelectedSlotKey(null);
      setDrawerFeedbackMessage(null);
      setDrawerFeedbackTone(null);
    }
  }, [selectedSlot, selectedSlotKey]);

  async function invalidateTeeSheetReadModel(): Promise<void> {
    if (!selectedClubId || !courseId) {
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: teeSheetKeys.day(selectedClubId, courseId, selectedDate, membershipType),
    });
  }

  async function handleLifecycleSuccess(
    action: LifecycleAction,
    result: BookingLifecycleMutationResult,
  ): Promise<void> {
    const copy = LIFECYCLE_NOTICE_COPY[action];
    if (result.decision === "blocked") {
      setDrawerFeedbackTone("error");
      setDrawerFeedbackMessage(result.failures[0]?.message ?? copy.blockedFallback);
      return;
    }

    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setSelectedSlotKey(null);
    setOperationNotice({
      tone: result.transition_applied ? "success" : "info",
      message: result.transition_applied ? copy.success : copy.already,
    });
    await invalidateTeeSheetReadModel();
  }

  function handleLifecycleError(error: unknown): void {
    setDrawerFeedbackTone("error");
    setDrawerFeedbackMessage(asMessage(error));
  }

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) =>
      cancelBooking(bookingId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async (result) => handleLifecycleSuccess("cancel", result),
    onError: handleLifecycleError,
  });

  const checkInMutation = useMutation({
    mutationFn: (bookingId: string) =>
      checkInBooking(bookingId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async (result) => handleLifecycleSuccess("check_in", result),
    onError: handleLifecycleError,
  });

  const completeMutation = useMutation({
    mutationFn: (bookingId: string) =>
      completeBooking(bookingId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async (result) => handleLifecycleSuccess("complete", result),
    onError: handleLifecycleError,
  });

  const noShowMutation = useMutation({
    mutationFn: (bookingId: string) =>
      markBookingNoShow(bookingId, {
        accessToken: accessToken as string,
        selectedClubId: selectedClubId as string,
      }),
    onSuccess: async (result) => handleLifecycleSuccess("no_show", result),
    onError: handleLifecycleError,
  });

  const activeCourse = coursesQuery.data?.find((course) => course.id === courseId) ?? null;
  const warningMessage = teeSheetQuery.data?.warnings[0]?.message ?? "No weather or policy alerts for this day.";

  function openBookingDrawer(slot: FlattenedSlot): void {
    if (!isManageableSlot(slot.slot)) {
      return;
    }
    setOperationNotice(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
    setSelectedSlotKey({
      rowKey: slot.rowKey,
      slotDatetime: slot.slot.slot_datetime,
    });
  }

  function closeBookingDrawer(): void {
    setSelectedSlotKey(null);
    setDrawerFeedbackMessage(null);
    setDrawerFeedbackTone(null);
  }

  const pendingAction = cancelMutation.isPending
    ? "cancel"
    : checkInMutation.isPending
      ? "check_in"
      : completeMutation.isPending
        ? "complete"
        : noShowMutation.isPending
          ? "no_show"
      : null;
  const pendingBookingId = cancelMutation.isPending
    ? cancelMutation.variables ?? null
    : checkInMutation.isPending
      ? checkInMutation.variables ?? null
      : completeMutation.isPending
        ? completeMutation.variables ?? null
        : noShowMutation.isPending
          ? noShowMutation.variables ?? null
      : null;

  return (
    <div className="bg-background text-on-background selection:bg-primary-container">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 flex-col border-r border-slate-100/50 bg-slate-50 dark:bg-slate-950 lg:flex">
        <div className="p-6">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-on-primary">
              <MaterialSymbol filled icon="landscape" />
            </div>
            <div>
              <h1 className="font-bold leading-none text-emerald-900">{bootstrap?.selected_club?.name ?? "GreenLink"}</h1>
              <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">Golf Operations</span>
            </div>
          </div>
          <nav className="space-y-1">
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/dashboard">
              <MaterialSymbol className="mr-3" icon="dashboard" />
              <span className="font-medium">Dashboard</span>
            </NavLink>
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/golf/tee-sheet">
              <MaterialSymbol className="mr-3" icon="calendar_today" />
              <span className="font-medium">Tee Sheet</span>
            </NavLink>
            <button className={sidebarLinkClass(false)} type="button">
              <MaterialSymbol className="mr-3" icon="group" />
              <span className="font-medium">Members</span>
            </button>
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/finance">
              <MaterialSymbol className="mr-3" icon="payments" />
              <span className="font-medium">Finance</span>
            </NavLink>
            <button className={sidebarLinkClass(false)} type="button">
              <MaterialSymbol className="mr-3" icon="inventory_2" />
              <span className="font-medium">Inventory</span>
            </button>
            <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/communications">
              <MaterialSymbol className="mr-3" icon="chat_bubble" />
              <span className="font-medium">Comms</span>
            </NavLink>
          </nav>
          <div className="mt-8">
            <NavLink
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-white transition-all hover:bg-primary-dim"
              to="/admin/pos-terminal"
            >
              <MaterialSymbol className="text-sm" icon="add" />
              <span>Open POS</span>
            </NavLink>
          </div>
        </div>
        <div className="mt-auto space-y-1 p-6">
          <NavLink className={({ isActive }) => sidebarLinkClass(isActive)} to="/admin/golf/settings">
            <MaterialSymbol className="mr-3" icon="settings" />
            <span className="text-sm font-medium">Settings</span>
          </NavLink>
          <button className={sidebarLinkClass(false)} type="button">
            <MaterialSymbol className="mr-3" icon="contact_support" />
            <span className="text-sm font-medium">Support</span>
          </button>
        </div>
      </aside>

      <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-slate-100/50 bg-white/80 px-6 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-900/80 lg:left-64">
        <div className="flex items-center gap-6">
          <label className="relative flex items-center gap-2 rounded-xl border border-outline-variant/10 bg-surface-container-low px-3 py-1.5">
            <MaterialSymbol className="text-sm text-on-surface-variant" icon="calendar_month" />
            <span className="text-sm font-medium">{dateLabel(selectedDate)}</span>
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
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              onClick={() => setSelectedDate((current) => addDays(current, -1))}
              type="button"
            >
              <MaterialSymbol icon="chevron_left" />
            </button>
            <button
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              onClick={() => setSelectedDate((current) => addDays(current, 1))}
              type="button"
            >
              <MaterialSymbol icon="chevron_right" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <MaterialSymbol className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" icon="search" />
            <input
              className="w-64 rounded-xl border-none bg-surface-container-low py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20"
              placeholder="Search tee times..."
              type="text"
            />
          </div>
          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
            <button className="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100" type="button">
              <MaterialSymbol icon="notifications" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-error"></span>
            </button>
            <button className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100" type="button">
              <MaterialSymbol icon="settings" />
            </button>
            <UserAvatar
              alt={`${displayName} profile`}
              className="ml-2 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-surface-container-low text-slate-700"
              initials={initials(displayName)}
            />
          </div>
        </div>
      </header>

      <main className="min-h-screen pt-16 lg:pl-64">
        <div className="p-6">
          <div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="font-headline text-2xl font-bold tracking-tight text-on-surface">Daily Tee Sheet</h2>
              <p className="text-sm text-on-surface-variant">
                Course: {activeCourse?.name ?? "Loading course"} • {membershipType} preview
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 rounded-xl bg-surface-container-highest px-4 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-high">
                <MaterialSymbol className="text-sm" icon="group_add" />
                <select
                  className="border-none bg-transparent pr-5 text-sm font-semibold focus:ring-0"
                  onChange={(event) => setCourseId(event.target.value || null)}
                  value={courseId ?? ""}
                >
                  {(coursesQuery.data ?? []).map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary-dim">
                <MaterialSymbol className="text-sm" icon="person_add" />
                <select
                  className="border-none bg-transparent pr-5 text-sm font-bold text-white focus:ring-0"
                  onChange={(event) => setMembershipType(event.target.value as BookingRuleAppliesTo)}
                  value={membershipType}
                >
                  {MEMBERSHIP_OPTIONS.map((option) => (
                    <option className="text-on-surface" key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {operationNotice ? (
            <div
              className={
                operationNotice.tone === "success"
                  ? "mb-4 rounded-2xl bg-primary-container/50 px-4 py-3 text-sm font-medium text-on-primary-container"
                  : "mb-4 rounded-2xl bg-secondary-container px-4 py-3 text-sm font-medium text-on-secondary-container"
              }
            >
              {operationNotice.message}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-left">
                    <th className="border-b border-outline-variant/10 px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Time
                    </th>
                    <th className="border-b border-outline-variant/10 px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Player 1
                    </th>
                    <th className="border-b border-outline-variant/10 px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Player 2
                    </th>
                    <th className="border-b border-outline-variant/10 px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Player 3
                    </th>
                    <th className="border-b border-outline-variant/10 px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Player 4
                    </th>
                    <th className="border-b border-outline-variant/10 px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Status
                    </th>
                    <th className="border-b border-outline-variant/10 px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teeSheetQuery.isLoading ? (
                    <tr className="tee-row transition-colors group">
                      <td className="px-6 py-4 text-sm text-slate-500" colSpan={7}>
                        Loading tee sheet...
                      </td>
                    </tr>
                  ) : null}
                  {teeSheetQuery.error ? (
                    <tr className="tee-row transition-colors group bg-red-50/30">
                      <td className="px-6 py-4 text-sm text-error" colSpan={7}>
                        {teeSheetQuery.error.message}
                      </td>
                    </tr>
                  ) : null}
                  {flattenedSlots.map((item) => {
                    const isReservedBlock =
                      (item.slot.display_status === "blocked" || item.slot.display_status === "reserved") &&
                      (item.slot.party_summary.total_players ?? 0) === 0;
                    const isManageable = isManageableSlot(item.slot);
                    const rowClassName =
                      item.slot.display_status === "blocked"
                        ? "tee-row transition-colors group bg-red-50/30"
                        : "tee-row transition-colors group";

                    return (
                      <tr
                        className={`${rowClassName}${isManageable ? " cursor-pointer" : ""}`}
                        key={`${item.rowLabel}-${item.slot.slot_datetime}`}
                        onClick={() => openBookingDrawer(item)}
                        onKeyDown={(event) => {
                          if (!isManageable) {
                            return;
                          }
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openBookingDrawer(item);
                          }
                        }}
                        role={isManageable ? "button" : undefined}
                        tabIndex={isManageable ? 0 : undefined}
                      >
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <span className="font-headline font-bold text-primary">{item.slot.local_time.slice(0, 5)}</span>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                              {item.rowLabel}
                              {item.colorCode ? ` • ${item.colorCode}` : ""}
                            </p>
                          </div>
                        </td>
                        {isReservedBlock ? (
                          <td className="px-6 py-4" colSpan={4}>
                            <div className="flex items-center gap-3">
                              <MaterialSymbol className="text-sm text-slate-400" icon="lock" />
                              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                Reserved: {firstDetail(item.slot)}
                              </span>
                            </div>
                          </td>
                        ) : (
                          item.occupants.map((occupant, index) => (
                            <td className={occupant.state === "empty" ? "px-6 py-4 text-sm italic text-slate-300" : "px-6 py-4"} key={`${item.slot.slot_datetime}-${index}`}>
                              {occupant.state === "empty" ? (
                                occupant.label
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div
                                    className={
                                      occupant.state === "alert"
                                        ? "h-2 w-2 rounded-full border border-error bg-white"
                                        : "h-2 w-2 rounded-full bg-primary"
                                    }
                                    title={occupant.state === "alert" ? "Attention required" : "Confirmed"}
                                  ></div>
                                  <span className="text-sm font-medium">{occupant.label}</span>
                                </div>
                              )}
                            </td>
                          ))
                        )}
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClassName(item.slot.display_status)}`}
                          >
                            {statusLabel(item.slot.display_status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isManageable ? (
                            <button
                              aria-label={`Manage bookings for ${item.rowLabel} ${item.slot.local_time.slice(0, 5)}`}
                              className="rounded-lg bg-primary px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight text-white transition-colors hover:bg-primary-dim"
                              onClick={(event) => {
                                event.stopPropagation();
                                openBookingDrawer(item);
                              }}
                              type="button"
                            >
                              Manage
                            </button>
                          ) : (
                            <button className="rounded p-1 text-slate-300" disabled type="button">
                              <MaterialSymbol className="text-slate-400" icon="more_vert" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!teeSheetQuery.isLoading && !teeSheetQuery.error && flattenedSlots.length === 0 ? (
                    <tr className="tee-row transition-colors group">
                      <td className="px-6 py-4 text-sm text-slate-500" colSpan={7}>
                        No active tee-sheet rows were generated for the selected day.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between bg-surface-container-low px-6 py-4">
              <span className="text-xs font-medium text-slate-500">
                Showing {flattenedSlots.length} of {flattenedSlots.length} tee times
              </span>
              <div className="flex gap-2">
                <button
                  className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold transition-colors hover:bg-slate-50"
                  onClick={() => setSelectedDate((current) => addDays(current, -1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold transition-colors hover:bg-slate-50"
                  onClick={() => setSelectedDate((current) => addDays(current, 1))}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="flex flex-col justify-between rounded-xl bg-primary p-6 text-white">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Utilization</span>
                <h3 className="mt-1 font-headline text-3xl font-extrabold">
                  {flattenedSlots.length === 0
                    ? "0%"
                    : `${Math.round(((statusCounts.available + statusCounts.warning) / flattenedSlots.length) * 100)}%`}
                </h3>
              </div>
              <p className="mt-4 text-sm opacity-90">{statusCounts.available} slots currently available before sunset.</p>
            </div>
            <div className="rounded-xl border-l-4 border-emerald-500 bg-surface-container-lowest p-6 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Pace of Play</span>
              <div className="mt-1 flex items-end gap-2">
                <h3 className="font-headline text-3xl font-extrabold text-on-surface">
                  {statusCounts.blocked > 0 ? "Watch" : "Ahead"}
                </h3>
                <span className="mb-1 text-sm font-bold text-primary">
                  {statusCounts.warning + statusCounts.indeterminate} flags
                </span>
              </div>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${flattenedSlots.length === 0 ? 0 : Math.min(100, ((statusCounts.available + statusCounts.warning) / flattenedSlots.length) * 100)}%`,
                  }}
                ></div>
              </div>
            </div>
            <div className="rounded-xl border-l-4 border-amber-500 bg-surface-container-lowest p-6 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Weather Alert</span>
              <div className="mt-1 flex items-center gap-3">
                <MaterialSymbol className="text-3xl text-amber-500" icon="thunderstorm" />
                <div>
                  <h3 className="text-lg font-bold font-headline text-on-surface">
                    {teeSheetQuery.data?.warnings.length ? "Operational Notice" : "All Clear"}
                  </h3>
                  <p className="text-xs text-on-surface-variant">{warningMessage}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {selectedSlot ? (
        <BookingManagementDrawer
          colorCode={selectedSlot.colorCode}
          feedbackMessage={drawerFeedbackMessage}
          feedbackTone={drawerFeedbackTone}
          onCheckIn={(bookingId) => {
            setOperationNotice(null);
            setDrawerFeedbackMessage(null);
            setDrawerFeedbackTone(null);
            checkInMutation.mutate(bookingId);
          }}
          onComplete={(bookingId) => {
            setOperationNotice(null);
            setDrawerFeedbackMessage(null);
            setDrawerFeedbackTone(null);
            completeMutation.mutate(bookingId);
          }}
          onNoShow={(bookingId) => {
            setOperationNotice(null);
            setDrawerFeedbackMessage(null);
            setDrawerFeedbackTone(null);
            noShowMutation.mutate(bookingId);
          }}
          onCancel={(bookingId) => {
            setOperationNotice(null);
            setDrawerFeedbackMessage(null);
            setDrawerFeedbackTone(null);
            cancelMutation.mutate(bookingId);
          }}
          onClose={closeBookingDrawer}
          pendingAction={pendingAction}
          pendingBookingId={pendingBookingId}
          rowLabel={selectedSlot.rowLabel}
          selectedDate={selectedDate}
          slot={selectedSlot.slot}
        />
      ) : null}

      <MobileTabBar
        activeClassName="rounded-xl bg-emerald-100 text-emerald-800 scale-95"
        className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-xl border-t border-slate-200 bg-white/90 px-4 pb-6 pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 lg:hidden"
        inactiveClassName="text-slate-500"
        items={[
          { label: "Home", icon: "home", to: "/admin/dashboard" },
          { label: "Book", icon: "add_circle", to: "/admin/golf/tee-sheet", isActive: true },
          { label: "Activity", icon: "history" },
          { label: "Profile", icon: "person" },
        ]}
        labelClassName="mt-1 text-[10px] font-medium"
      />
    </div>
  );
}
