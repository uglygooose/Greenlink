import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import type { StartLane } from "../../types/bookings";
import type { TeeSheetSlotDisplayStatus } from "../../types/tee-sheet";
import {
  OccupiedBookingCard,
  OpenPlayerSlotContent,
  canCreate,
  canDrop,
  canManage,
  clockMinutes,
  currentDateInTimezone,
  detail,
  laneOrder,
  nowTimeKey,
  slotBookingSegments,
  slotPlayerCount,
  slotRemainingCapacity,
  slotSummaryClass,
  statusClass,
  statusLabel,
  timeKey,
  type Action,
  type LaneSlot,
  type QuickAction,
  type TeeSheetBucket,
} from "./sheet-shared";

type SwimLaneRow = {
  colorCode: string | null;
  laneLabel: string;
  laneKey: string;
  rowLabel: string;
  startLane: StartLane | null;
  teeId: string | null;
};

type TeeSheetSwimLaneGridProps = {
  activeDropKey: string | null;
  checkingInAllBucket: string | null;
  columns: TeeSheetBucket[];
  dragged: { bookingId: string; rowKey: string; slotDatetime: string } | null;
  dropAllowed: (target: LaneSlot) => boolean;
  dropKey: (slot: LaneSlot) => string;
  highlightedSlotKey: string | null;
  intervalMinutes: number;
  movingBookingId: string | null;
  onCheckInAll: (slotDatetime: string) => void;
  onEndDrag: () => void;
  onMoveBooking: (target: LaneSlot) => void;
  onOpenCreate: (slot: LaneSlot) => void;
  onOpenManage: (slot: LaneSlot) => void;
  onQuickAction: (action: QuickAction, bookingId: string) => void;
  onSetActiveDropKey: (value: string | null) => void;
  onStartDrag: (event: DragEvent<HTMLElement>, bookingId: string, slot: LaneSlot) => void;
  pendingAction: Action | null;
  pendingBookingId: string | null;
  selectedDate: string;
  timezone?: string | null;
};

const LEFT_RAIL_WIDTH = 144;
const HEADER_HEIGHT = 116;
const COLUMN_WIDTH = 160;
const ROW_HEIGHT = 128;

function bucketPriorityStatus(slots: LaneSlot[]): TeeSheetSlotDisplayStatus {
  if (slots.some((slot) => slot.slot.display_status === "blocked")) return "blocked";
  if (slots.some((slot) => slot.slot.display_status === "warning")) return "warning";
  if (slots.some((slot) => slot.slot.display_status === "reserved")) return "reserved";
  if (slots.some((slot) => slot.slot.display_status === "indeterminate")) return "indeterminate";
  return "available";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function scrollElementTo(element: HTMLElement, left: number, behavior: ScrollBehavior): void {
  const nextLeft = Math.max(left, 0);
  const scrollable = element as HTMLElement & { scrollTo?: (options: ScrollToOptions) => void };
  if (typeof scrollable.scrollTo === "function") {
    scrollable.scrollTo({ left: nextLeft, behavior });
    return;
  }
  element.scrollLeft = nextLeft;
}

function swimLaneKey(startLane: StartLane | null): string {
  return startLane ?? "hole_1";
}

export function TeeSheetSwimLaneGrid({
  activeDropKey,
  checkingInAllBucket,
  columns,
  dragged,
  dropAllowed,
  dropKey,
  highlightedSlotKey,
  intervalMinutes,
  movingBookingId,
  onCheckInAll,
  onEndDrag,
  onMoveBooking,
  onOpenCreate,
  onOpenManage,
  onQuickAction,
  onSetActiveDropKey,
  onStartDrag,
  pendingAction,
  pendingBookingId,
  selectedDate,
  timezone,
}: TeeSheetSwimLaneGridProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrolledDateRef = useRef<string | null>(null);
  const [minuteTick, setMinuteTick] = useState(0);

  const columnWidth = COLUMN_WIDTH;
  const rowHeight = ROW_HEIGHT;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMinuteTick((value) => value + 1);
    }, 60_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const rows = useMemo<SwimLaneRow[]>(() => {
    const rowMap = new Map<string, SwimLaneRow>();
    for (const bucket of columns) {
      for (const slot of bucket.slots) {
        const laneKey = swimLaneKey(slot.startLane);
        if (!rowMap.has(laneKey)) {
          rowMap.set(laneKey, {
            colorCode: slot.colorCode,
            laneLabel: slot.laneLabel,
            laneKey,
            rowLabel: slot.rowLabel,
            startLane: slot.startLane,
            teeId: slot.teeId,
          });
        }
      }
    }
    return Array.from(rowMap.values()).sort(
      (a, b) => laneOrder(a.startLane) - laneOrder(b.startLane) || a.rowLabel.localeCompare(b.rowLabel),
    );
  }, [columns]);

  const slotLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, LaneSlot>>();
    for (const bucket of columns) {
      for (const slot of bucket.slots) {
        const laneKey = swimLaneKey(slot.startLane);
        const rowMap = lookup.get(laneKey) ?? new Map<string, LaneSlot>();
        rowMap.set(bucket.slotDatetime, slot);
        lookup.set(laneKey, rowMap);
      }
    }
    return lookup;
  }, [columns]);

  const hourGroups = useMemo(() => {
    const statusPriority: Record<string, number> = { available: 0, indeterminate: 1, reserved: 2, warning: 3, blocked: 4 };
    const groupMap = new Map<string, { hour: string; firstIndex: number; priorityStatus: TeeSheetSlotDisplayStatus }>();
    for (let i = 0; i < columns.length; i++) {
      const bucket = columns[i];
      const hour = timeKey(bucket.localTime).slice(0, 2);
      if (!groupMap.has(hour)) {
        groupMap.set(hour, { hour, firstIndex: i, priorityStatus: "available" });
      }
      const group = groupMap.get(hour)!;
      const status = bucketPriorityStatus(bucket.slots);
      if ((statusPriority[status] ?? 0) > (statusPriority[group.priorityStatus] ?? 0)) {
        group.priorityStatus = status;
      }
    }
    return Array.from(groupMap.values());
  }, [columns]);

  const virtualizer = useVirtualizer({
    count: columns.length,
    estimateSize: () => columnWidth,
    getScrollElement: () => scrollRef.current,
    horizontal: true,
    initialRect: { height: 640, width: 1280 },
    overscan: 3,
  });

  const virtualColumns = virtualizer.getVirtualItems();
  const renderedColumns = virtualColumns.length > 0
    ? virtualColumns
    : columns.map((_, index) => ({
        index,
        key: index,
        size: columnWidth,
        start: index * columnWidth,
      }));
  const totalColumnWidth = virtualColumns.length > 0 ? virtualizer.getTotalSize() : columns.length * columnWidth;

  const currentTimeOffset = useMemo(() => {
    void minuteTick;
    if (columns.length === 0) return null;
    if (selectedDate !== currentDateInTimezone(timezone)) return null;
    const firstMinutes = clockMinutes(timeKey(columns[0].localTime));
    const nowMinutes = clockMinutes(nowTimeKey(timezone));
    const fractionalIndex = clamp((nowMinutes - firstMinutes) / Math.max(intervalMinutes, 1), 0, columns.length);
    return fractionalIndex * columnWidth;
  }, [columnWidth, columns, intervalMinutes, minuteTick, selectedDate, timezone]);

  const currentBucketIndex = useMemo(() => {
    void minuteTick;
    if (columns.length === 0) return null;
    if (selectedDate !== currentDateInTimezone(timezone)) return null;

    const nowMinutes = clockMinutes(nowTimeKey(timezone));
    let activeIndex = 0;

    for (let index = 0; index < columns.length; index += 1) {
      if (clockMinutes(timeKey(columns[index].localTime)) <= nowMinutes) {
        activeIndex = index;
        continue;
      }
      break;
    }

    return activeIndex;
  }, [columns, minuteTick, selectedDate, timezone]);

  const currentHour = currentBucketIndex !== null && columns[currentBucketIndex]
    ? timeKey(columns[currentBucketIndex].localTime).slice(0, 2)
    : null;


  function columnScrollLeft(index: number, align: "center" | "start"): number {
    const viewportWidth = scrollRef.current?.clientWidth ?? 0;
    const usableWidth = Math.max(viewportWidth - LEFT_RAIL_WIDTH, columnWidth);
    const baseLeft = index * columnWidth;
    if (align === "start") return baseLeft;
    return baseLeft - (usableWidth - columnWidth) / 2;
  }

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (columns.length === 0) return;
    if (selectedDate !== currentDateInTimezone(timezone)) return;
    if (autoScrolledDateRef.current === selectedDate) return;
    if (currentTimeOffset == null) return;

    scrollElementTo(
      element,
      currentTimeOffset - Math.max((element.clientWidth - LEFT_RAIL_WIDTH) / 2, columnWidth / 2),
      "smooth",
    );
    autoScrolledDateRef.current = selectedDate;
  }, [columnWidth, columns.length, currentTimeOffset, selectedDate, timezone]);

  useEffect(() => {
    if (autoScrolledDateRef.current === selectedDate) return;
    autoScrolledDateRef.current = null;
  }, [selectedDate]);

  function bucketRhythmClass(index: number): string {
    if (currentBucketIndex === null) return "border-slate-200 bg-surface-container";
    if (index === currentBucketIndex) return "border-red-200 bg-red-50";
    if (index > currentBucketIndex && index <= currentBucketIndex + 2) return "border-amber-200 bg-amber-50/70";
    return "border-slate-200 bg-surface-container";
  }

  function bucketCellClass(index: number): string {
    if (currentBucketIndex === null) return "border-slate-200/80";
    if (index === currentBucketIndex) return "border-red-200 bg-red-50/30";
    if (index > currentBucketIndex && index <= currentBucketIndex + 2) return "border-amber-100 bg-amber-50/20";
    return "border-slate-200/80";
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-sm" data-testid="tee-sheet-swimlane-grid">
      {hourGroups.length > 0 ? (
        <div className="border-b border-slate-100 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-32 shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Jump to Hour</p>
            </div>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {hourGroups.map((group) => {
                const isCurrent = group.hour === currentHour;
                return (
                  <button
                    aria-label={`Jump to ${group.hour}:00`}
                    className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-center transition-colors ${
                      isCurrent
                        ? "bg-red-50 ring-2 ring-red-400/60"
                        : "bg-surface-container-low hover:bg-surface-container"
                    }`}
                    data-testid={`timeline-overview-${group.hour}:00`}
                    key={group.hour}
                    onClick={() => {
                      const element = scrollRef.current;
                      if (!element) return;
                      scrollElementTo(element, columnScrollLeft(group.firstIndex, "start"), "smooth");
                    }}
                    title={`Jump to ${group.hour}:00`}
                    type="button"
                  >
                    <span className={`text-[11px] font-bold leading-none ${isCurrent ? "text-red-600" : "text-slate-700"}`}>
                      {group.hour}:00
                    </span>
                    <span className={`mt-0.5 h-1 w-8 rounded-full ${statusClass(group.priorityStatus)}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div
        className="relative max-h-[70vh] overflow-auto bg-surface-container-lowest"
        data-testid="timeline-scroll-region"
        ref={scrollRef}
      >
        <div style={{ minWidth: `${LEFT_RAIL_WIDTH + totalColumnWidth}px`, width: LEFT_RAIL_WIDTH + totalColumnWidth }}>
          <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90" style={{ height: HEADER_HEIGHT }}>
            <div
              className="sticky left-0 top-0 z-40 flex h-full items-end border-r border-slate-200 bg-white px-4 py-3 shadow-sm"
              style={{ width: LEFT_RAIL_WIDTH }}
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Starting Lane</p>
                <p className="font-headline text-lg font-extrabold text-on-surface">Timeline</p>
              </div>
            </div>

            <div aria-hidden="true" className="pointer-events-none absolute bottom-0 top-0 z-10" style={{ left: LEFT_RAIL_WIDTH, width: totalColumnWidth }}>
              {currentTimeOffset != null ? (
                <>
                  <div
                    className="absolute -top-0.5 flex -translate-x-1/2 flex-col items-center gap-1"
                    style={{ left: currentTimeOffset }}
                  >
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-red-500">
                      Now
                    </span>
                  </div>
                  <div
                    className="absolute bottom-0 top-0 w-0.5 bg-red-500/80"
                    data-testid="timeline-current-time-indicator"
                    style={{ left: currentTimeOffset }}
                  />
                </>
              ) : null}
            </div>

            {renderedColumns.map((virtualColumn) => {
              const bucket = columns[virtualColumn.index];
              const reservedBookings = bucket.slots.flatMap((slot) => slot.slot.bookings.filter((booking) => booking.status === "reserved"));
              const bookedPlayers = bucket.slots.reduce((sum, slot) => sum + slotPlayerCount(slot.slot), 0);
              const canCreateInBucket = bucket.slots.some((slot) => canCreate(slot.slot));
              const isCurrentBucket = currentBucketIndex === virtualColumn.index;
              const isUpcomingBucket = currentBucketIndex !== null && virtualColumn.index > currentBucketIndex && virtualColumn.index <= currentBucketIndex + 2;
              return (
                <div
                  className="absolute top-0 border-r border-slate-200 px-3 py-3"
                  data-testid={`timeline-header-${timeKey(bucket.localTime)}`}
                  id={`bucket-${timeKey(bucket.localTime)}`}
                  key={bucket.slotDatetime}
                  style={{ height: HEADER_HEIGHT, left: LEFT_RAIL_WIDTH + virtualColumn.start, width: virtualColumn.size }}
                >
                  <div className={`flex h-full flex-col justify-between rounded-[18px] border px-3 py-2 shadow-sm ${bucketRhythmClass(virtualColumn.index)}`}>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        {isCurrentBucket ? "Now" : isUpcomingBucket ? "Next Up" : "Tee Time"}
                      </p>
                      <p className="font-headline text-xl font-extrabold leading-none text-on-surface">{timeKey(bucket.localTime)}</p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {bookedPlayers > 0 ? `${bookedPlayers} booked` : "Open bucket"}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {canCreateInBucket ? (
                        <button
                          aria-label={`Create new booking at ${timeKey(bucket.localTime)}`}
                          className="w-full rounded-lg border border-primary/15 bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-[0.10em] text-primary transition-colors hover:bg-primary-container/20"
                          onClick={() => {
                            const available = bucket.slots.find((slot) => canCreate(slot.slot));
                            if (available) onOpenCreate(available);
                          }}
                          type="button"
                        >
                          + New
                        </button>
                      ) : null}
                      {reservedBookings.length > 0 ? (
                        <button
                          aria-label={`Check in all reserved bookings at ${timeKey(bucket.localTime)}`}
                          className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.10em] text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                          disabled={checkingInAllBucket === bucket.slotDatetime}
                          onClick={() => onCheckInAll(bucket.slotDatetime)}
                          title={`Check in all reserved bookings in the ${timeKey(bucket.localTime)} bucket`}
                          type="button"
                        >
                          {checkingInAllBucket === bucket.slotDatetime ? "Checking..." : `Check In All (${reservedBookings.length})`}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative">
            {currentTimeOffset != null ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute z-20 w-0.5 bg-red-500/70"
                style={{ bottom: 0, left: LEFT_RAIL_WIDTH + currentTimeOffset, top: 0 }}
              />
            ) : null}

            {rows.map((row) => {
              const rowSlots = slotLookup.get(row.laneKey) ?? new Map<string, LaneSlot>();
              return (
                <div
                  className="relative border-b border-slate-100"
                  key={row.laneKey}
                  style={{ minHeight: rowHeight }}
                >
                  <div
                    className="sticky left-0 z-20 flex h-full items-center border-r border-slate-200 bg-white px-4 py-3 shadow-sm"
                    data-testid={`timeline-lane-row-${row.startLane ?? "hole_1"}`}
                    style={{ width: LEFT_RAIL_WIDTH }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-on-surface">{row.laneLabel}</p>
                    </div>
                  </div>

                  {renderedColumns.map((virtualColumn) => {
                    const bucket = columns[virtualColumn.index];
                    const slot = rowSlots.get(bucket.slotDatetime) ?? null;
                    const slotKey = slot ? dropKey(slot) : `${row.laneKey}:${bucket.slotDatetime}`;
                    const isHighlighted = highlightedSlotKey === slotKey;
                    const isActiveDrop = slot ? activeDropKey === dropKey(slot) : false;
                    const allowedDrop = slot ? dropAllowed(slot) : false;
                    const reservedBlock = slot ? slot.slot.display_status === "blocked" || slot.slot.display_status === "reserved" : false;
                    const bookingSegments = slot ? slotBookingSegments(slot.slot) : [];
                    const bookingCards = bookingSegments.filter((segment) => segment.kind === "booking");
                    const remainingCapacity = slot ? slotRemainingCapacity(slot.slot) : 0;
                    const createAllowed = slot ? canCreate(slot.slot) : false;
                    const manageAllowed = slot ? canManage(slot.slot) : false;
                    const droppable = slot ? canDrop(slot.slot) : false;

                    return (
                      <div
                        aria-label={slot ? `${row.laneLabel} timeline row ${timeKey(bucket.localTime)}` : undefined}
                        className={`absolute top-0 border-r px-2 py-2 ${bucketCellClass(virtualColumn.index)} ${isActiveDrop ? "bg-primary-container/10" : ""}`}
                        data-slot-anchor={slotKey}
                        key={`${row.laneKey}:${bucket.slotDatetime}`}
                        onDragEnter={(event) => {
                          event.preventDefault();
                          if (slot && allowedDrop) onSetActiveDropKey(dropKey(slot));
                        }}
                        onDragLeave={() => {
                          if (slot && isActiveDrop) onSetActiveDropKey(null);
                        }}
                        onDragOver={(event) => {
                          if (!slot || !allowedDrop) return;
                          event.preventDefault();
                          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                          onSetActiveDropKey(dropKey(slot));
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (slot && allowedDrop && dragged) onMoveBooking(slot);
                        }}
                        style={{ height: rowHeight, left: LEFT_RAIL_WIDTH + virtualColumn.start, width: virtualColumn.size }}
                      >
                        {!slot ? (
                          <div className="h-full rounded-[18px] border border-dashed border-slate-200/80 bg-white/50" />
                        ) : reservedBlock && !manageAllowed ? (
                          <div
                            className={`flex h-full items-center justify-between rounded-[18px] px-3 py-2 ${slotSummaryClass(slot.slot)} ${isHighlighted ? "ring-2 ring-primary/40" : ""}`}
                            style={slot.slot.display_status === "blocked"
                              ? {
                                  backgroundImage:
                                    "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.06) 5px, rgba(0,0,0,0.06) 10px)",
                                }
                              : undefined}
                          >
                            <div className="min-w-0">
                              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                {slot.slot.display_status === "blocked" ? "Blocked Slot" : "Reserved Slot"}
                              </p>
                              <p className="truncate text-xs font-semibold">{detail(slot.slot)}</p>
                            </div>
                            {isActiveDrop ? <span className="text-xs font-semibold text-primary">Drop here</span> : null}
                          </div>
                        ) : (
                          <div
                            className={`flex h-full flex-col rounded-[18px] border px-2 py-2 ${
                              isHighlighted ? "ring-2 ring-primary/40" : ""
                            } ${
                              droppable ? "border-outline-variant/30 bg-white" : "border-outline-variant/20 bg-surface-container-low"
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ${statusClass(slot.slot.display_status)}`}>
                                {statusLabel(slot.slot.display_status)}
                              </span>
                              <span className="text-[10px] font-medium text-slate-500">
                                {slot.slot.bookings.length > 0 ? `${slot.slot.bookings.length} booking${slot.slot.bookings.length === 1 ? "" : "s"}` : `${remainingCapacity} open`}
                              </span>
                              {slot.slot.warnings.length > 0 && slot.slot.display_status !== "blocked" ? (
                                <span className="flex items-center gap-0.5" title={slot.slot.warnings[0].message}>
                                  <MaterialSymbol className="text-xs text-amber-500" icon="warning" />
                                  <span className="text-[8px] font-semibold text-amber-600">
                                    {slot.slot.warnings.length > 1 ? `${slot.slot.warnings.length}` : ""}
                                  </span>
                                </span>
                              ) : null}
                            </div>

                            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                              {bookingCards.map((segment) =>
                                segment.kind === "booking" ? (
                                  <OccupiedBookingCard
                                    booking={segment.booking}
                                    compact={false}
                                    key={`${segment.booking.id}-${segment.startColumn}-${segment.span}`}
                                    movingBookingId={movingBookingId}
                                    onEndDrag={onEndDrag}
                                    onOpenManage={onOpenManage}
                                    onQuickAction={onQuickAction}
                                    onStartDrag={onStartDrag}
                                    participantNames={segment.participantNames}
                                    pendingAction={pendingAction}
                                    pendingBookingId={pendingBookingId}
                                    slot={slot}
                                    span={segment.span}
                                    startColumn={segment.startColumn}
                                  />
                                ) : null,
                              )}

                              {bookingCards.length === 0 && createAllowed ? (
                                <button
                                  aria-label={`Create booking for ${row.laneLabel} ${timeKey(bucket.localTime)}`}
                                  className="flex min-h-[3rem] w-full items-center gap-2 rounded-[14px] border border-dashed border-outline-variant/40 bg-white px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary-container/10"
                                  onClick={() => onOpenCreate(slot)}
                                  type="button"
                                >
                                  <OpenPlayerSlotContent compact={false} enabled span={remainingCapacity} />
                                  <span className="ml-auto text-[10px] font-semibold text-slate-400">{remainingCapacity} open</span>
                                </button>
                              ) : null}
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                {manageAllowed ? (
                                  <p className="truncate text-[10px] text-slate-500">
                                    {detail(slot.slot)}
                                  </p>
                                ) : createAllowed ? (
                                  <p className="truncate text-[10px] text-slate-500">{remainingCapacity} player spots open</p>
                                ) : (
                                  <p className="truncate text-[10px] text-slate-400">{detail(slot.slot)}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {manageAllowed ? (
                                  <button
                                    aria-label={`Manage bookings for ${row.laneLabel} ${timeKey(bucket.localTime)}`}
                                    className="rounded-lg bg-surface-container-low px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface transition-colors hover:bg-surface-container"
                                    onClick={() => onOpenManage(slot)}
                                    type="button"
                                  >
                                    Details
                                  </button>
                                ) : null}
                                {createAllowed ? (
                                  <button
                                    aria-label={`Add booking for ${row.laneLabel} ${timeKey(bucket.localTime)}`}
                                    className="rounded-lg bg-primary-container/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-on-primary-container transition-colors hover:bg-primary-container"
                                    onClick={() => onOpenCreate(slot)}
                                    type="button"
                                  >
                                    Add
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
