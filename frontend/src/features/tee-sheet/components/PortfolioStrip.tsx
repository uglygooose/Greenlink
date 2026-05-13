// Path: frontend/src/features/tee-sheet/components/PortfolioStrip.tsx — Phase 10 Slice 3.
// Owns the course-list query, fans out one tee-sheet-day query per course
// (cache-shared with the page's main day query via the canonical query key),
// computes per-tile and portfolio-wide aggregates from the day responses,
// and writes the active course back to the URL search param on tile click.
//
// All aggregations here are presentation read-side concatenations of
// backend-validated values, per ENGINEERING_STANDARDS.md §6.
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { CardHead } from "../../../components/ui/CardHead";
import { Icon } from "../../../components/ui/Icon";
import { Pill } from "../../../components/ui/Pill";
import { useCoursesQuery } from "../../golf-settings/hooks";
import { teeSheetDayQueryOptions } from "../hooks";
import type { Course } from "../../../types/operations";
import type { TeeSheetDayResponse } from "../../../types/tee-sheet";
import { useSession } from "../../../session/session-context";

import { PortfolioTile } from "./PortfolioTile";

export interface PortfolioStripProps {
  selectedDate: string;
  activeCourseId: string | null;
}

interface DayAggregate {
  utilisationPercent: number;
  teeTimesBooked: number;
  teeTimesTotal: number;
  revenueAmount: number;
  revenueCurrency: string | null;
}

const EMPTY_AGGREGATE: DayAggregate = {
  utilisationPercent: 0,
  teeTimesBooked: 0,
  teeTimesTotal: 0,
  revenueAmount: 0,
  revenueCurrency: null,
};

export function aggregateDay(day: TeeSheetDayResponse | undefined): DayAggregate {
  if (!day) return EMPTY_AGGREGATE;
  let totalOccupied = 0;
  let totalCapacity = 0;
  let teeTimesTotal = 0;
  let teeTimesBooked = 0;
  let revenueAmount = 0;
  let revenueCurrency: string | null = null;
  for (const row of day.rows) {
    for (const slot of row.slots) {
      teeTimesTotal += 1;
      if (slot.bookings.length > 0) teeTimesBooked += 1;
      totalOccupied += slot.occupancy.occupied_player_count ?? 0;
      totalCapacity += slot.occupancy.player_capacity ?? 0;
      for (const booking of slot.bookings) {
        if (!booking.fee_amount) continue;
        const value = Number.parseFloat(booking.fee_amount);
        if (!Number.isFinite(value)) continue;
        revenueAmount += value;
        revenueCurrency = revenueCurrency ?? booking.fee_currency ?? null;
      }
    }
  }
  const utilisationPercent = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;
  return { utilisationPercent, teeTimesBooked, teeTimesTotal, revenueAmount, revenueCurrency };
}

function formatStripDate(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(new Date(`${value}T00:00:00`))
    .replace(/,/g, "");
}

function formatRevenueTotal(amount: number, currency: string | null): string {
  const prefix = currency && currency !== "ZAR" ? currency : "R";
  return `${prefix} ${amount.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`;
}

export function PortfolioStrip({ selectedDate, activeCourseId }: PortfolioStripProps): JSX.Element | null {
  const { accessToken, bootstrap } = useSession();
  const [, setSearchParams] = useSearchParams();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const courses = useMemo<Course[]>(() => coursesQuery.data ?? [], [coursesQuery.data]);

  // One per-course day query. Shares cache with the page's main day query
  // because both call sites use teeSheetDayQueryOptions with the same key
  // composition: ["tee-sheet", clubId, courseId, date, membershipType, teeId].
  const dayQueries = useQueries({
    queries: courses.map((course) =>
      teeSheetDayQueryOptions({
        accessToken,
        selectedClubId,
        courseId: course.id,
        date: selectedDate,
        membershipType: "staff",
        teeId: null,
      }),
    ),
  });

  const tileAggregates = useMemo(
    () => dayQueries.map((q) => aggregateDay(q.data)),
    [dayQueries],
  );

  const eyebrowAggregate = useMemo<DayAggregate>(() => {
    let totalOccupied = 0;
    let totalCapacity = 0;
    let revenueAmount = 0;
    let revenueCurrency: string | null = null;
    for (let i = 0; i < courses.length; i += 1) {
      const day = dayQueries[i]?.data;
      if (!day) continue;
      for (const row of day.rows) {
        for (const slot of row.slots) {
          totalOccupied += slot.occupancy.occupied_player_count ?? 0;
          totalCapacity += slot.occupancy.player_capacity ?? 0;
          for (const booking of slot.bookings) {
            if (!booking.fee_amount) continue;
            const value = Number.parseFloat(booking.fee_amount);
            if (!Number.isFinite(value)) continue;
            revenueAmount += value;
            revenueCurrency = revenueCurrency ?? booking.fee_currency ?? null;
          }
        }
      }
    }
    const utilisationPercent = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;
    return { utilisationPercent, teeTimesBooked: 0, teeTimesTotal: 0, revenueAmount, revenueCurrency };
  }, [courses, dayQueries]);

  if (coursesQuery.isError) {
    return (
      <div style={{ padding: 16, borderBottom: "1px solid var(--gl-border-subtle)" }}>
        <Card
          style={{
            maxWidth: 520,
            margin: "0 auto",
            padding: 0,
            background: "color-mix(in oklab, var(--gl-caddie) 7%, var(--gl-surface-raised))",
            borderColor: "color-mix(in oklab, var(--gl-caddie) 35%, var(--gl-border-subtle))",
          }}
        >
          <CardHead
            eyebrow="Couldn't load courses"
            title="Course list request failed"
            right={<Pill kind="err">Error</Pill>}
          />
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
              {coursesQuery.error instanceof Error
                ? coursesQuery.error.message
                : "Could not load the course list for this club."}
            </p>
            <div>
              <Button
                variant="secondary"
                onClick={() => {
                  void coursesQuery.refetch();
                }}
                leadingIcon={<Icon name="refresh" size={14} />}
              >
                Retry
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Loading: courses still resolving → render skeleton tiles. Once the course
  // list lands, per-tile metrics may still be loading; PortfolioTile carries
  // its own zero-state in that case.
  if (coursesQuery.isPending) {
    return (
      <div
        data-testid="portfolio-strip-loading"
        style={{ padding: "10px 16px 6px 16px", borderBottom: "1px solid var(--gl-border-subtle)" }}
      >
        <div className="gl-skeleton" style={{ height: 12, width: 280, marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="gl-skeleton"
              style={{ flex: 1, height: 56, borderRadius: "var(--gl-radius-sm)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Empty: club has zero courses. Strip renders nothing — page is still
  // functional, just without portfolio context.
  if (courses.length === 0) return null;

  return (
    <div
      data-testid="portfolio-strip"
      style={{ padding: "10px 16px 6px 16px", borderBottom: "1px solid var(--gl-border-subtle)" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div className="gl-t-xs gl-muted">Courses · today · {formatStripDate(selectedDate)}</div>
        <div className="gl-muted" style={{ fontSize: 11 }}>
          Portfolio utilisation{" "}
          <b className="gl-tabular" style={{ color: "var(--gl-text-primary)" }}>
            {eyebrowAggregate.utilisationPercent}%
          </b>
          {" · combined revenue "}
          <b className="gl-tabular" style={{ color: "var(--gl-text-primary)" }}>
            {formatRevenueTotal(eyebrowAggregate.revenueAmount, eyebrowAggregate.revenueCurrency)}
          </b>
        </div>
      </div>
      <div role="tablist" aria-label="Course portfolio" style={{ display: "flex", gap: 8 }}>
        {courses.map((course, i) => {
          const agg = tileAggregates[i] ?? EMPTY_AGGREGATE;
          return (
            <PortfolioTile
              key={course.id}
              courseName={course.name}
              utilisationPercent={agg.utilisationPercent}
              teeTimesBooked={agg.teeTimesBooked}
              teeTimesTotal={agg.teeTimesTotal}
              revenueAmount={agg.revenueAmount}
              revenueCurrency={agg.revenueCurrency}
              active={activeCourseId === course.id}
              onClick={() => {
                setSearchParams(
                  (prev) => {
                    prev.set("course_id", course.id);
                    return prev;
                  },
                  { replace: true },
                );
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
