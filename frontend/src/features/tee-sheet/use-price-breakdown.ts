// Path: frontend/src/features/tee-sheet/use-price-breakdown.ts — Phase 10 Slice 5.
// Synthesises a Phase-8-style PriceBreakdown from the data already in the
// tee-sheet day response (TeeSheetBookingSummary.fee_label / fee_amount /
// fee_currency). Slice 5 ships a single-line stub per booking — the
// additive rule stack Phase 8 designed doesn't exist in the backend yet
// (see DRIFT_LOG 2026-05-13 Path-1 entry).
//
// Hook signature anticipates the future swap to a real React Query fetch
// against a per-slot breakdown endpoint without changing the call site.
import { useMemo } from "react";

import type { PriceBreakdown, PriceBreakdownLine } from "../../components/ui/PricePopover";
import type { TeeSheetSlotView } from "../../types/tee-sheet";

import { timeKey } from "./sheet-shared";

export interface UsePriceBreakdownParams {
  slot: TeeSheetSlotView | null;
}

export interface UsePriceBreakdownResult {
  breakdown: PriceBreakdown | null;
  loading: boolean;
  error: Error | null;
  title: string;
  currency: string;
}

// FROZEN — backend gap. Do not extend, branch, or duplicate.
// Replace when the backend exposes an additive price-breakdown shape per
// TeeSheetBookingSummary (e.g. `breakdown: list[PriceLine]`) or via a new
// `GET /api/golf/tee-sheet/slot-breakdown` endpoint that returns
// { lines, channel, total, currency } per the Phase 8 design. Until then,
// the popover renders one "base" line per booking sourced from
// fee_label + fee_amount and a row-level total via sum. No premium /
// discount / addon / channel lines are derivable without backend support.

export function usePriceBreakdown({ slot }: UsePriceBreakdownParams): UsePriceBreakdownResult {
  return useMemo(() => synthesizePriceBreakdown(slot), [slot]);
}

export function synthesizePriceBreakdown(slot: TeeSheetSlotView | null): UsePriceBreakdownResult {
  if (slot == null) {
    return { breakdown: null, loading: false, error: null, title: "", currency: "ZAR" };
  }

  const title = `${timeKey(slot.local_time)} · ${slot.bookings.length === 0 ? "No bookings" : "Booking"}`;

  if (slot.bookings.length === 0) {
    return {
      breakdown: { lines: [], channel: "—", total: "—" },
      loading: false,
      error: null,
      title,
      currency: "ZAR",
    };
  }

  const lines: PriceBreakdownLine[] = [];
  let total = 0;
  let currency: string | null = null;

  for (const booking of slot.bookings) {
    const amountText = formatBookingValue(booking.fee_amount, booking.fee_currency);
    const value = Number.parseFloat(booking.fee_amount ?? "");
    if (Number.isFinite(value)) {
      total += value;
      currency = currency ?? booking.fee_currency ?? null;
    }
    const leadName =
      booking.participants.find((participant) => participant.is_primary)?.display_name ??
      booking.participants[0]?.display_name ??
      `Party of ${booking.party_size}`;
    lines.push({
      kind: "base",
      label: booking.fee_label ?? "Booking fee",
      source: `Booking · ${leadName}`,
      value: amountText,
    });
  }

  const resolvedCurrency = currency ?? "ZAR";
  return {
    breakdown: {
      lines,
      // Channel intentionally renders "—" — booking source field is not in
      // TeeSheetBookingSummary (recorded in DRIFT_LOG 2026-05-13 #1).
      channel: "—",
      total: formatTotal(total, resolvedCurrency),
    },
    loading: false,
    error: null,
    title,
    currency: resolvedCurrency,
  };
}

function formatBookingValue(amount: string | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return "—";
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) return "—";
  return formatTotal(value, currency ?? "ZAR");
}

function formatTotal(amount: number, currency: string): string {
  const prefix = currency === "ZAR" ? "R" : currency;
  return `${prefix} ${amount.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}
