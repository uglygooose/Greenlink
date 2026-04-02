import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { createBooking } from "../api/operations";
import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { MobileTabBar } from "../components/benchmark/mobile-tab-bar";
import { UserAvatar } from "../components/benchmark/user-avatar";
import { useCoursesQuery } from "../features/golf-settings/hooks";
import { teeSheetKeys, useTeeSheetDayQuery } from "../features/tee-sheet/hooks";
import { useSession } from "../session/session-context";
import type { BookingCreateResult, StartLane } from "../types/bookings";
import type { TeeSheetSlotView } from "../types/tee-sheet";

type SelectedSlot = {
  rowKey: string;
  rowLabel: string;
  startLane: StartLane | null;
  teeId: string | null;
  slot: TeeSheetSlotView;
};

type Bucket = {
  localTime: string;
  slotDatetime: string;
  slots: SelectedSlot[];
};

function todayValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
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

function laneLabel(value: StartLane | null): string {
  return value === "hole_10" ? "10th Tee" : "1st Tee";
}

function laneOrder(value: StartLane | null): number {
  return value === "hole_10" ? 1 : 0;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function asMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "Booking request failed";
}

function bookingFeedback(result: BookingCreateResult): string {
  if (result.failures[0]) return result.failures[0].message;
  if (result.availability?.blockers[0]) return result.availability.blockers[0].reason;
  if (result.availability?.unresolved_checks[0]) return result.availability.unresolved_checks[0].reason;
  return result.decision === "indeterminate"
    ? "Booking could not be resolved for this slot."
    : "Booking creation blocked.";
}

function slotDetail(slot: TeeSheetSlotView): string {
  if (slot.occupancy.remaining_player_capacity != null) {
    return `${slot.occupancy.remaining_player_capacity} place${slot.occupancy.remaining_player_capacity === 1 ? "" : "s"} remaining`;
  }
  return slot.blockers[0]?.reason ?? slot.unresolved_checks[0]?.reason ?? slot.warnings[0]?.message ?? "Availability pending";
}

function canBook(slot: TeeSheetSlotView): boolean {
  if (slot.display_status === "blocked" || slot.display_status === "reserved") {
    return false;
  }
  if (slot.occupancy.remaining_player_capacity === 0) {
    return false;
  }
  return true;
}

export function PlayerBookPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const queryClient = useQueryClient();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const displayName = bootstrap?.user.display_name ?? "Member";
  const selectedClubName = bootstrap?.selected_club?.name ?? "GreenLink";

  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);

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
    membershipType: "member",
  });

  const slots = useMemo<SelectedSlot[]>(
    () =>
      (teeSheetQuery.data?.rows ?? [])
        .flatMap((row) =>
          row.slots.map((slot) => ({
            rowKey: row.row_key,
            rowLabel: row.label,
            startLane: row.start_lane,
            teeId: row.tee_id,
            slot,
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

  const buckets = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>();
    for (const slot of slots) {
      const current = map.get(slot.slot.slot_datetime);
      if (current) {
        current.slots.push(slot);
        continue;
      }
      map.set(slot.slot.slot_datetime, {
        localTime: slot.slot.local_time,
        slotDatetime: slot.slot.slot_datetime,
        slots: [slot],
      });
    }
    return Array.from(map.values()).map((bucket) => ({
      ...bucket,
      slots: bucket.slots.sort(
        (a, b) => laneOrder(a.startLane) - laneOrder(b.startLane) || a.rowLabel.localeCompare(b.rowLabel),
      ),
    }));
  }, [slots]);

  useEffect(() => {
    if (!slots.some((slot) => `${slot.rowKey}:${slot.slot.slot_datetime}` === selectedSlotKey)) {
      setSelectedSlotKey(null);
    }
  }, [selectedSlotKey, slots]);

  const selectedSlot = selectedSlotKey
    ? slots.find((slot) => `${slot.rowKey}:${slot.slot.slot_datetime}` === selectedSlotKey) ?? null
    : null;

  const createBookingMutation = useMutation({
    mutationFn: (slot: SelectedSlot) =>
      createBooking(
        {
          course_id: courseId as string,
          tee_id: slot.teeId,
          start_lane: slot.startLane,
          slot_datetime: slot.slot.slot_datetime,
          source: "member_portal",
          participants: [],
        },
        {
          accessToken: accessToken as string,
          selectedClubId: selectedClubId as string,
        },
      ),
    onSuccess: async (result) => {
      if (result.decision !== "allowed" || !result.booking) {
        setConfirmationId(null);
        setFeedbackMessage(bookingFeedback(result));
        return;
      }
      setFeedbackMessage("Booking confirmed. Admin tee sheet reflects backend state immediately.");
      setConfirmationId(result.booking.id);
      setSelectedSlotKey(null);
      await queryClient.invalidateQueries({
        queryKey: teeSheetKeys.day(selectedClubId ?? "none", courseId ?? "none", selectedDate, "member"),
      });
    },
    onError: (error) => {
      setConfirmationId(null);
      setFeedbackMessage(asMessage(error));
    },
  });

  function selectSlot(slot: SelectedSlot): void {
    if (!canBook(slot.slot)) {
      return;
    }
    setConfirmationId(null);
    setFeedbackMessage(null);
    setSelectedSlotKey(`${slot.rowKey}:${slot.slot.slot_datetime}`);
  }

  function handleCreate(): void {
    if (!selectedSlot || createBookingMutation.isPending) {
      return;
    }
    setFeedbackMessage(null);
    setConfirmationId(null);
    createBookingMutation.mutate(selectedSlot);
  }

  return (
    <div className="min-h-screen bg-background pb-28 text-on-surface">
      <header className="fixed top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-100/50 bg-white/80 px-6 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-900/80">
        <div className="flex items-center gap-3">
          <Link
            aria-label="Back to player home"
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-50"
            to="/player/home"
          >
            <MaterialSymbol icon="arrow_back" />
          </Link>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Golf booking</p>
            <h1 className="font-headline text-lg font-bold text-on-surface">Book your round</h1>
          </div>
        </div>
        <UserAvatar
          alt={`${displayName} profile`}
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-container text-slate-700"
          initials={initials(displayName)}
        />
      </header>

      <main className="mx-auto max-w-md space-y-6 px-6 pt-20">
        <section className="rounded-2xl bg-surface-container-lowest px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-on-surface-variant">{selectedClubName}</p>
          <h2 className="mt-1 font-headline text-2xl font-extrabold tracking-tight text-on-surface">Choose a tee time</h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            Availability comes directly from the live tee-sheet read model. Select a slot and send booking intent.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <label className="rounded-2xl bg-surface-container-lowest px-4 py-3 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Course</span>
            <select
              className="mt-2 w-full bg-transparent text-sm font-medium text-on-surface outline-none"
              onChange={(event) => {
                setCourseId(event.target.value || null);
                setSelectedSlotKey(null);
                setConfirmationId(null);
                setFeedbackMessage(null);
              }}
              value={courseId ?? ""}
            >
              {(coursesQuery.data ?? []).map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-2xl bg-surface-container-lowest px-4 py-3 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Date</span>
            <input
              className="mt-2 w-full bg-transparent text-sm font-medium text-on-surface outline-none"
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setSelectedSlotKey(null);
                setConfirmationId(null);
                setFeedbackMessage(null);
              }}
              type="date"
              value={selectedDate}
            />
          </label>
        </section>

        <section className="flex gap-2">
          {[0, 1, 2].map((offset) => {
            const value = addDays(selectedDate, offset);
            const active = value === selectedDate;
            return (
              <button
                className={
                  active
                    ? "flex-1 rounded-full bg-primary px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-on-primary"
                    : "flex-1 rounded-full bg-surface-container px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-on-surface"
                }
                key={value}
                onClick={() => {
                  setSelectedDate(value);
                  setSelectedSlotKey(null);
                  setConfirmationId(null);
                  setFeedbackMessage(null);
                }}
                type="button"
              >
                {dateLabel(value)}
              </button>
            );
          })}
        </section>

        {feedbackMessage ? (
          <section
            className={
              confirmationId
                ? "rounded-2xl bg-primary-container/60 px-5 py-4 text-sm font-medium text-on-primary-container"
                : "rounded-2xl bg-error-container/60 px-5 py-4 text-sm font-medium text-on-error-container"
            }
          >
            {feedbackMessage}
          </section>
        ) : null}

        <section className="space-y-3">
          {coursesQuery.isLoading || teeSheetQuery.isLoading ? (
            <div className="rounded-2xl bg-surface-container-lowest px-5 py-6 text-sm text-on-surface-variant shadow-sm">
              Loading booking availability...
            </div>
          ) : null}
          {coursesQuery.error ? (
            <div className="rounded-2xl bg-error-container/60 px-5 py-6 text-sm font-medium text-on-error-container shadow-sm">
              {coursesQuery.error.message}
            </div>
          ) : null}
          {teeSheetQuery.error ? (
            <div className="rounded-2xl bg-error-container/60 px-5 py-6 text-sm font-medium text-on-error-container shadow-sm">
              {teeSheetQuery.error.message}
            </div>
          ) : null}
          {!coursesQuery.isLoading && (coursesQuery.data?.length ?? 0) === 0 ? (
            <div className="rounded-2xl bg-surface-container-lowest px-5 py-6 text-sm text-on-surface-variant shadow-sm">
              No active courses are available for booking.
            </div>
          ) : null}
          {!teeSheetQuery.isLoading && buckets.length === 0 && courseId ? (
            <div className="rounded-2xl bg-surface-container-lowest px-5 py-6 text-sm text-on-surface-variant shadow-sm">
              No tee-sheet availability was returned for this date.
            </div>
          ) : null}

          {buckets.map((bucket) => (
            <article className="rounded-2xl bg-surface-container-lowest px-5 py-4 shadow-sm" key={bucket.slotDatetime}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Tee Time</p>
                  <h3 className="mt-1 font-headline text-xl font-bold text-on-surface">{bucket.localTime}</h3>
                </div>
                <span className="rounded-full bg-surface-container px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
                  {bucket.slots.length} lane{bucket.slots.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="space-y-3">
                {bucket.slots.map((slot) => {
                  const key = `${slot.rowKey}:${slot.slot.slot_datetime}`;
                  const active = key === selectedSlotKey;
                  const selectable = canBook(slot.slot);
                  return (
                    <button
                      aria-label={`Select ${bucket.localTime} ${slot.rowLabel} ${laneLabel(slot.startLane)}`}
                      className={
                        active
                          ? "w-full rounded-2xl bg-primary-container/50 px-4 py-4 text-left text-on-primary-container ring-2 ring-primary"
                          : selectable
                            ? "w-full rounded-2xl bg-surface-container px-4 py-4 text-left text-on-surface transition-colors hover:bg-surface-container-high"
                            : "w-full rounded-2xl bg-surface-container px-4 py-4 text-left text-on-surface-variant opacity-70"
                      }
                      disabled={!selectable}
                      key={key}
                      onClick={() => selectSlot(slot)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold text-on-surface">{slot.rowLabel}</p>
                          <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-primary">
                            {laneLabel(slot.startLane)}
                          </p>
                        </div>
                        <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface">
                          {slot.slot.occupancy.reserved_player_count ?? 0}/{slot.slot.occupancy.player_capacity ?? "?"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-on-surface-variant">{slotDetail(slot.slot)}</p>
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-md px-6">
        <div className="rounded-2xl bg-surface-container-lowest px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Selected Slot</p>
              <p className="mt-1 text-sm text-on-surface-variant">
                {selectedSlot
                  ? `${selectedSlot.slot.local_time} • ${selectedSlot.rowLabel} • ${laneLabel(selectedSlot.startLane)}`
                  : "Choose a tee-sheet slot to send booking intent"}
              </p>
            </div>
            <MaterialSymbol className="text-primary" filled icon="golf_course" />
          </div>
          <button
            className="w-full rounded-xl bg-primary py-4 text-center font-headline text-lg font-bold text-on-primary transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:bg-surface-container-high disabled:text-on-surface-variant"
            disabled={!selectedSlot || createBookingMutation.isPending}
            onClick={handleCreate}
            type="button"
          >
            {createBookingMutation.isPending ? "Confirming..." : "Confirm Booking"}
          </button>
        </div>
      </div>

      <MobileTabBar
        activeClassName="rounded-xl bg-emerald-100 text-emerald-800 scale-95"
        className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-slate-200 bg-white/90 px-4 pb-6 pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 lg:hidden"
        inactiveClassName="text-slate-500 active:bg-slate-100 scale-95"
        items={[
          { label: "Home", icon: "home", to: "/player/home" },
          { label: "Book", icon: "golf_course", to: "/player/book", isActive: true },
          { label: "Order", icon: "local_cafe", to: "/player/order" },
          { label: "Profile", icon: "person" },
        ]}
        labelClassName="font-label font-medium text-[10px]"
      />
    </div>
  );
}
