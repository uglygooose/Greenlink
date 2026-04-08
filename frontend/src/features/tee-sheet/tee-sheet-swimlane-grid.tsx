import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import type { StartLane } from "../../types/bookings";
import type { TeeSheetSlotDisplayStatus } from "../../types/tee-sheet";
import {
  OccupiedBookingCell,
  OpenPlayerSlotContent,
  canCreate,
  canDrop,
  canManage,
  clockMinutes,
  currentDateInTimezone,
  detail,
  laneOrder,
  nowTimeKey,
  slotPlayerCells,
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
  type TimelineDensity,
} from "./sheet-shared";

type SwimLaneRow = {
  colorCode: string | null;
  laneLabel: string;
  rowKey: string;
  rowLabel: string;
  startLane: StartLane | null;
  teeId: string | null;
};

type ViewportMetrics = {
  clientWidth: number;
  scrollLeft: number;
};

type TeeSheetSwimLaneGridProps = {
  activeDropKey: string | null;
  checkingInAllBucket: string | null;
  columns: TeeSheetBucket[];
  density: TimelineDensity;
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

function densityColumnWidth(density: TimelineDensity): number {
  return density === "compact" ? 118 : 156;
}

function densityRowHeight(density: TimelineDensity): number {
  return density === "compact" ? 92 : 128;
}

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

export function TeeSheetSwimLaneGrid({
  activeDropKey,
  checkingInAllBucket,
  columns,
  density,
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
  const [viewportMetrics, setViewportMetrics] = useState<ViewportMetrics>({ clientWidth: 0, scrollLeft: 0 });

  const columnWidth = densityColumnWidth(density);
  const rowHeight = densityRowHeight(density);
  const compact = density === "compact";

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
        if (!rowMap.has(slot.rowKey)) {
          rowMap.set(slot.rowKey, {
            colorCode: slot.colorCode,
            laneLabel: slot.laneLabel,
            rowKey: slot.rowKey,
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
        const rowMap = lookup.get(slot.rowKey) ?? new Map<string, LaneSlot>();
        rowMap.set(bucket.slotDatetime, slot);
        lookup.set(slot.rowKey, rowMap);
      }
    }
    return lookup;
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

  const overviewViewport = useMemo(() => {
    const maxScrollLeft = Math.max(totalColumnWidth - viewportMetrics.clientWidth, 0);
    const availableWidth = Math.max(viewportMetrics.clientWidth - LEFT_RAIL_WIDTH, 0);
    if (totalColumnWidth <= 0 || availableWidth <= 0) {
      return { leftPercent: 0, widthPercent: 0 };
    }
    const widthPercent = clamp((availableWidth / totalColumnWidth) * 100, 0, 100);
    const leftPercent = maxScrollLeft === 0 ? 0 : clamp((viewportMetrics.scrollLeft / maxScrollLeft) * (100 - widthPercent), 0, 100 - widthPercent);
    return { leftPercent, widthPercent };
  }, [totalColumnWidth, viewportMetrics.clientWidth, viewportMetrics.scrollLeft]);

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
    const updateViewport = (): void => {
      setViewportMetrics({ clientWidth: element.clientWidth, scrollLeft: element.scrollLeft });
    };
    updateViewport();
    element.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      element.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

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

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/70 bg-white shadow-sm" data-testid="tee-sheet-swimlane-grid">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-32 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Day Overview</p>
            <p className="text-xs text-slate-500">Click to jump across the visible timeline.</p>
          </div>
          <div className="relative flex-1 overflow-hidden rounded-full bg-surface-container-low px-1 py-1">
            <div className="flex h-6 items-stretch gap-px">
              {columns.map((bucket, index) => {
                const status = bucketPriorityStatus(bucket.slots);
                return (
                  <button
                    aria-label={`Jump to ${timeKey(bucket.localTime)}`}
                    className={`min-w-0 flex-1 rounded-full transition-opacity hover:opacity-80 ${statusClass(status)}`}
                    data-testid={`timeline-overview-${timeKey(bucket.localTime)}`}
                    key={bucket.slotDatetime}
                    onClick={() => {
                      const element = scrollRef.current;
                      if (!element) return;
                      scrollElementTo(element, columnScrollLeft(index, "center"), "smooth");
                    }}
                    title={`Jump to ${timeKey(bucket.localTime)}`}
                    type="button"
                  />
                );
              })}
            </div>
            {overviewViewport.widthPercent > 0 ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 rounded-full border border-red-400/70 bg-red-100/20"
                style={{ left: `${overviewViewport.leftPercent}%`, width: `${overviewViewport.widthPercent}%` }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <div
        className="relative max-h-[70vh] overflow-auto bg-surface-container-lowest"
        data-testid="timeline-scroll-region"
        ref={scrollRef}
      >
        <div style={{ minWidth: `${LEFT_RAIL_WIDTH + totalColumnWidth}px`, width: LEFT_RAIL_WIDTH + totalColumnWidth }}>
          <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90" style={{ height: HEADER_HEIGHT }}>
            <div
              className="sticky left-0 z-40 flex h-full items-end border-r border-slate-200 bg-white px-4 py-3 shadow-sm"
              style={columns[0]?.slots[0]?.colorCode ? { borderLeft: `4px solid ${columns[0].slots[0].colorCode}` } : undefined}
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Tee / Lane</p>
                <p className="font-headline text-lg font-extrabold text-on-surface">Timeline</p>
              </div>
            </div>

            <div aria-hidden="true" className="pointer-events-none absolute bottom-0 top-0 z-10" style={{ left: LEFT_RAIL_WIDTH, width: totalColumnWidth }}>
              {currentTimeOffset != null ? (
                <div
                  className="absolute bottom-0 top-0 w-0.5 bg-red-500/80"
                  data-testid="timeline-current-time-indicator"
                  style={{ left: currentTimeOffset }}
                />
              ) : null}
            </div>

            {renderedColumns.map((virtualColumn) => {
              const bucket = columns[virtualColumn.index];
              const reservedBookings = bucket.slots.flatMap((slot) => slot.slot.bookings.filter((booking) => booking.status === "reserved"));
              const bookedPlayers = bucket.slots.reduce((sum, slot) => sum + slotPlayerCount(slot.slot), 0);
              const canCreateInBucket = bucket.slots.some((slot) => canCreate(slot.slot));
              return (
                <div
                  className="absolute top-0 border-r border-slate-100 px-3 py-3"
                  id={`bucket-${timeKey(bucket.localTime)}`}
                  key={bucket.slotDatetime}
                  style={{ height: HEADER_HEIGHT, left: LEFT_RAIL_WIDTH + virtualColumn.start, width: virtualColumn.size }}
                >
                  <div className="flex h-full flex-col justify-between rounded-[18px] bg-surface-container px-3 py-2 shadow-sm">
                    <div>
                      <p className="font-headline text-lg font-extrabold text-on-surface">{timeKey(bucket.localTime)}</p>
                      {bookedPlayers > 0 ? <p className="mt-0.5 text-[10px] text-slate-400">{bookedPlayers} booked</p> : null}
                    </div>
                    <div className="space-y-1">
                      {canCreateInBucket ? (
                        <button
                          aria-label={`Create new booking at ${timeKey(bucket.localTime)}`}
                          className="w-full rounded-lg bg-primary px-2 py-1 text-[9px] font-bold uppercase tracking-[0.10em] text-white transition-colors hover:bg-primary-dim"
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
              const rowSlots = slotLookup.get(row.rowKey) ?? new Map<string, LaneSlot>();
              return (
                <div
                  className="relative border-b border-slate-100"
                  key={row.rowKey}
                  style={{ minHeight: rowHeight }}
                >
                  <div
                    className="sticky left-0 z-20 flex h-full items-center border-r border-slate-200 bg-white px-4 py-3 shadow-sm"
                    style={row.colorCode ? { borderLeft: `4px solid ${row.colorCode}`, width: LEFT_RAIL_WIDTH } : { width: LEFT_RAIL_WIDTH }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-on-surface">{row.rowLabel}</p>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{row.laneLabel}</p>
                    </div>
                  </div>

                  {renderedColumns.map((virtualColumn) => {
                    const bucket = columns[virtualColumn.index];
                    const slot = rowSlots.get(bucket.slotDatetime) ?? null;
                    const slotKey = slot ? dropKey(slot) : `${row.rowKey}:${bucket.slotDatetime}`;
                    const isHighlighted = highlightedSlotKey === slotKey;
                    const isActiveDrop = slot ? activeDropKey === dropKey(slot) : false;
                    const allowedDrop = slot ? dropAllowed(slot) : false;
                    const reservedBlock = slot ? slot.slot.display_status === "blocked" || slot.slot.display_status === "reserved" : false;
                    const playerCells = slot ? slotPlayerCells(slot.slot) : [];
                    const occupiedCells = playerCells.filter((cell) => cell.kind === "occupied");
                    const remainingCapacity = slot ? slotRemainingCapacity(slot.slot) : 0;
                    const createAllowed = slot ? canCreate(slot.slot) : false;
                    const manageAllowed = slot ? canManage(slot.slot) : false;
                    const droppable = slot ? canDrop(slot.slot) : false;

                    return (
                      <div
                        aria-label={slot ? `${row.laneLabel} timeline row ${timeKey(bucket.localTime)}` : undefined}
                        className={`absolute top-0 border-r border-slate-100 px-2 py-2 ${isActiveDrop ? "bg-primary-container/10" : ""}`}
                        data-slot-anchor={slotKey}
                        key={`${row.rowKey}:${bucket.slotDatetime}`}
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
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{row.laneLabel}</p>
                                <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ${statusClass(slot.slot.display_status)}`}>
                                  {statusLabel(slot.slot.display_status)}
                                </span>
                              </div>
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
                              {occupiedCells.map((cell) =>
                                cell.kind === "occupied" ? (
                                  <OccupiedBookingCell
                                    booking={cell.booking}
                                    column={cell.column}
                                    compact={compact}
                                    key={`${cell.booking.id}-${cell.column}-${cell.participant.display_name}`}
                                    movingBookingId={movingBookingId}
                                    onEndDrag={onEndDrag}
                                    onOpenManage={onOpenManage}
                                    onQuickAction={onQuickAction}
                                    onStartDrag={onStartDrag}
                                    participant={cell.participant}
                                    pendingAction={pendingAction}
                                    pendingBookingId={pendingBookingId}
                                    primaryHandle={cell.primaryHandle}
                                    slot={slot}
                                  />
                                ) : null,
                              )}

                              {occupiedCells.length === 0 && createAllowed ? (
                                <button
                                  aria-label={`Create booking for ${row.laneLabel} ${timeKey(bucket.localTime)}`}
                                  className="flex min-h-[3rem] w-full items-center gap-2 rounded-[14px] border border-dashed border-outline-variant/40 bg-white px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary-container/10"
                                  onClick={() => onOpenCreate(slot)}
                                  type="button"
                                >
                                  <OpenPlayerSlotContent column={1} compact={compact} enabled />
                                  <span className="ml-auto text-[10px] font-semibold text-slate-400">{remainingCapacity} open</span>
                                </button>
                              ) : null}
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                {manageAllowed ? (
                                  <p className="truncate text-[10px] text-slate-500">
                                    {slot.slot.bookings.length} booking{slot.slot.bookings.length === 1 ? "" : "s"}
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
