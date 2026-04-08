import { useEffect, useRef, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";

import { MaterialSymbol } from "../../components/benchmark/material-symbol";
import { teeSheetKeys } from "./hooks";
import type { BookingRuleAppliesTo } from "../../types/operations";
import type { TeeSheetDayResponse } from "../../types/tee-sheet";

interface DatePickerPopoverProps {
  clubId: string | null;
  courseId: string | null;
  membershipType: BookingRuleAppliesTo;
  onChange: (date: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  queryClient: QueryClient;
  teeId: string | null;
  value: string;
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

// Returns the Monday of the week containing `dateStr`.
function startOfWeek(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.getDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return localDateString(date);
}

type OccupancySignal = "green" | "amber" | "red" | "none";

function occupancySignal(
  queryClient: QueryClient,
  clubId: string,
  courseId: string,
  date: string,
  membershipType: BookingRuleAppliesTo,
  teeId: string | null,
): OccupancySignal {
  const key = teeSheetKeys.day(clubId, courseId, date, membershipType, teeId);
  const data = queryClient.getQueryData<TeeSheetDayResponse>(key);
  if (!data) return "none";

  let total = 0;
  let open = 0;
  let blocked = 0;

  for (const row of data.rows) {
    for (const slot of row.slots) {
      total++;
      if (slot.display_status === "blocked") blocked++;
      else if (slot.display_status === "available" && (slot.occupancy.remaining_player_capacity ?? 0) > 0) open++;
    }
  }

  if (total === 0) return "none";
  if (blocked > total * 0.3) return "red";
  if (open > 0) return "green";
  return "amber";
}

const SIGNAL_DOT: Record<OccupancySignal, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-400",
  red: "bg-red-400",
  none: "bg-slate-200",
};

const DAY_ABBREVS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function DatePickerPopover({
  clubId,
  courseId,
  membershipType,
  onChange,
  onOpenChange,
  open,
  queryClient,
  teeId,
  value,
}: DatePickerPopoverProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const today = localDateString(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(value));

  // Sync week strip when date changes externally (keyboard ← →, Today button).
  useEffect(() => {
    setWeekStart(startOfWeek(value));
  }, [value]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open, onOpenChange]);

  // Close on Escape — capture phase so it doesn't bubble to the page shortcut handler.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.stopPropagation();
        onOpenChange(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [open, onOpenChange]);

  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDays(weekStart, i));

  const formattedValue = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(`${weekStart}T00:00:00`),
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Open date picker"
        className="flex items-center gap-2 rounded-2xl bg-surface-container-low px-3 py-2.5 text-sm text-on-surface transition-colors hover:bg-surface-container"
        onClick={() => onOpenChange(!open)}
        type="button"
      >
        <MaterialSymbol className="text-sm text-on-surface-variant" icon="calendar_month" />
        <span className="font-medium">{formattedValue}</span>
        <MaterialSymbol className="text-sm text-on-surface-variant" icon={open ? "expand_less" : "expand_more"} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-xl">
          {/* Week navigation */}
          <div className="mb-3 flex items-center justify-between">
            <button
              aria-label="Previous week"
              className="rounded-xl p-1 text-slate-400 transition-colors hover:bg-surface-container-low hover:text-slate-700"
              onClick={() => setWeekStart((w) => shiftDays(w, -7))}
              type="button"
            >
              <MaterialSymbol icon="chevron_left" />
            </button>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{monthLabel}</span>
            <button
              aria-label="Next week"
              className="rounded-xl p-1 text-slate-400 transition-colors hover:bg-surface-container-low hover:text-slate-700"
              onClick={() => setWeekStart((w) => shiftDays(w, 7))}
              type="button"
            >
              <MaterialSymbol icon="chevron_right" />
            </button>
          </div>

          {/* Day strip */}
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day, i) => {
              const isSelected = day === value;
              const isToday = day === today;
              const signal =
                clubId && courseId
                  ? occupancySignal(queryClient, clubId, courseId, day, membershipType, teeId)
                  : "none";
              return (
                <button
                  aria-label={`Select ${day}`}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center gap-0.5 rounded-xl py-2 transition-colors ${
                    isSelected
                      ? "bg-primary text-white"
                      : isToday
                        ? "bg-primary-container/60 text-on-surface hover:bg-primary-container"
                        : "text-on-surface hover:bg-surface-container-low"
                  }`}
                  key={day}
                  onClick={() => {
                    onChange(day);
                    onOpenChange(false);
                  }}
                  type="button"
                >
                  <span className={`text-[8px] font-bold uppercase tracking-[0.08em] ${isSelected ? "text-white/70" : "text-slate-400"}`}>
                    {DAY_ABBREVS[i]}
                  </span>
                  <span className="text-sm font-bold leading-none">{new Date(`${day}T00:00:00`).getDate()}</span>
                  {/* Occupancy dot — colour from prefetched cache */}
                  <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white/60" : SIGNAL_DOT[signal]}`} />
                </button>
              );
            })}
          </div>

          {/* Quick Today button — only shown when not already on today */}
          {value !== today ? (
            <button
              className="mt-3 w-full rounded-xl bg-surface-container-low py-2 text-xs font-bold text-on-surface transition-colors hover:bg-surface-container"
              onClick={() => {
                onChange(today);
                setWeekStart(startOfWeek(today));
                onOpenChange(false);
              }}
              type="button"
            >
              Today
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
