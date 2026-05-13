// Path: frontend/src/pages/admin-tee-sheet-page.tsx — Phase 10 Slices 2–5.
// Read-only tee-sheet skeleton at /admin/tee-sheet. Lives parallel to the
// pre-rebuild admin-golf-tee-sheet-page.tsx until later slices land.
//
// What's here:
// - Slice 2: date strip / legend / grid header / row list / loading-empty-error
// - Slice 3: multi-course portfolio strip above the date strip
// - Slice 4: single-row selection state + SelectionFooter mount; esc clears;
//            course/date change clears; vanished-slot clears silently
// - Slice 5: pricing popover wired to price-button clicks. Click selects row
//            AND opens popover. Popover owns outside-click + esc dismiss;
//            the Slice 4 page-level esc handler bails when popover is open.
//
// What's NOT here (later slices): shortcut modal (6), waitlist rail (7),
// drag-and-drop (8), real lock acquisition (9), full keyboard shortcuts (10),
// slot-interval + density toggles (11), tournament mode (12),
// marshal-on-phone (13).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CardHead } from "../components/ui/CardHead";
import { Icon } from "../components/ui/Icon";
import { Pill } from "../components/ui/Pill";
import { TeeStateChip } from "../components/ui/TeeStateChip";
import { useCoursesQuery } from "../features/golf-settings/hooks";
import { PortfolioStrip } from "../features/tee-sheet/components/PortfolioStrip";
import { SelectionFooter } from "../features/tee-sheet/components/SelectionFooter";
import { TeeRow, rowStateFromDisplayStatus } from "../features/tee-sheet/components/TeeRow";
import { useTeeSheetDayQuery } from "../features/tee-sheet/hooks";
import { usePriceBreakdown } from "../features/tee-sheet/use-price-breakdown";
import { currentDateInTimezone } from "../features/tee-sheet/sheet-shared";
import { PricePopover } from "../components/ui/PricePopover";
import { useSession } from "../session/session-context";

const LEGEND_STATES = ["open", "booked", "checkedin", "atrisk", "noshow", "blocked"] as const;
const LEGEND_CHANNELS: Array<{ key: string; label: string; color: string }> = [
  { key: "direct", label: "Direct", color: "var(--gl-heritage-500)" },
  { key: "app", label: "Member app", color: "var(--gl-waterway)" },
  { key: "agg", label: "Aggregator", color: "var(--gl-honey)" },
  { key: "walk", label: "Walk-in", color: "var(--gl-slate)" },
];
const SKELETON_ROW_COUNT = 12;

function formatDateLabel(value: string, timezone?: string | null): string {
  // value is YYYY-MM-DD. We render in en-ZA, day-first, in the supplied tz
  // (falls back to runtime tz). Read-only, no interaction wired up yet.
  const localDate = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: timezone ?? undefined,
  })
    .format(localDate)
    .toUpperCase();
}

export function AdminTeeSheetPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const [searchParams] = useSearchParams();

  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const clubTimezone = bootstrap?.selected_club?.timezone ?? null;

  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const courseIdParam = searchParams.get("course_id");
  const courseId = courseIdParam ?? coursesQuery.data?.[0]?.id ?? null;

  const dateParam = searchParams.get("date");
  const dateValid = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam);
  const selectedDate = dateValid ? dateParam : currentDateInTimezone(clubTimezone);

  const teeSheetQuery = useTeeSheetDayQuery({
    accessToken,
    selectedClubId,
    courseId,
    date: selectedDate,
    membershipType: "staff",
    teeId: null,
  });

  const day = teeSheetQuery.data;
  // Slice 2: render the first lane only. Multi-lane (shotgun) + multi-course
  // is Slice 3. coalesceWithPrevious flag is derived from adjacency of
  // blocked slots per recon B.4-13.
  const slotRows = useMemo(() => {
    if (!day || day.rows.length === 0) return [];
    const lane = day.rows[0];
    return lane.slots.map((slot, i) => {
      const prev = lane.slots[i - 1];
      const coalesce =
        i > 0 &&
        prev !== undefined &&
        rowStateFromDisplayStatus(prev.display_status) === "blocked" &&
        rowStateFromDisplayStatus(slot.display_status) === "blocked";
      return { slot, coalesce };
    });
  }, [day]);

  const isLoading = teeSheetQuery.isPending && !day;
  const isError = teeSheetQuery.isError;
  const isEmpty = !isLoading && !isError && day !== undefined && slotRows.length === 0;

  // Slice 4: selection state. Single source of truth; passed to TeeRow rows
  // and the SelectionFooter. Identity key is slot_datetime — unique per row
  // in the current single-lane render (Slice 12 will need to compose with
  // lane once multi-lane lands).
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);

  // Slice 5: pricing popover state. Single instance — anchor swaps when the
  // user clicks another row's price button. Popover owns its own outside-
  // click + esc dismiss listeners; the page only sets/clears the anchor.
  const [pricePopover, setPricePopover] = useState<{ slotKey: string; anchorEl: HTMLElement } | null>(null);

  // Clear selection AND popover when the active course or date changes —
  // both reference rows that no longer exist on the new sheet.
  useEffect(() => {
    setSelectedSlotKey(null);
    setPricePopover(null);
  }, [courseId, selectedDate]);

  // Esc at the page level clears selection ONLY when the popover is not
  // open. When the popover is open its own keydown listener fires onDismiss
  // (which clears pricePopover). Without this guard, esc would clear both
  // popover AND selection in one keypress — the user would lose context
  // they didn't intend to drop.
  const pricePopoverOpenRef = useRef(false);
  pricePopoverOpenRef.current = pricePopover != null;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (pricePopoverOpenRef.current) return;
      setSelectedSlotKey(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const selectedSlot = useMemo(() => {
    if (selectedSlotKey == null) return null;
    const match = slotRows.find((row) => row.slot.slot_datetime === selectedSlotKey);
    return match ? match.slot : null;
  }, [selectedSlotKey, slotRows]);

  const popoverSlot = useMemo(() => {
    if (pricePopover == null) return null;
    const match = slotRows.find((row) => row.slot.slot_datetime === pricePopover.slotKey);
    return match ? match.slot : null;
  }, [pricePopover, slotRows]);

  const priceBreakdown = usePriceBreakdown({ slot: popoverSlot });

  // Silently clear when the selected slot disappears (data refetch, course
  // change race, etc). The user shouldn't see a footer pointing at a row
  // that no longer renders.
  useEffect(() => {
    if (selectedSlotKey != null && selectedSlot == null && slotRows.length > 0) {
      setSelectedSlotKey(null);
    }
  }, [selectedSlotKey, selectedSlot, slotRows]);

  // Same silent clear for the popover anchor.
  useEffect(() => {
    if (pricePopover != null && popoverSlot == null && slotRows.length > 0) {
      setPricePopover(null);
    }
  }, [pricePopover, popoverSlot, slotRows]);

  const handlePriceClick = useCallback((slotKey: string, anchorEl: HTMLButtonElement) => {
    setPricePopover({ slotKey, anchorEl });
  }, []);

  const dismissPricePopover = useCallback(() => {
    setPricePopover(null);
  }, []);

  return (
    <div className="gl" style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PortfolioStrip selectedDate={selectedDate} activeCourseId={courseId} />
      <DateStrip date={selectedDate} timezone={day?.timezone ?? clubTimezone} />
      <LegendStrip />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        <GridHeader />
        <div style={{ flex: 1, overflow: "auto" }}>
          {isLoading ? (
            <SkeletonRows />
          ) : isError ? (
            <ErrorPanel
              message={teeSheetQuery.error instanceof Error ? teeSheetQuery.error.message : "Failed to load tee sheet"}
              onRetry={() => {
                void teeSheetQuery.refetch();
              }}
            />
          ) : isEmpty ? (
            <EmptyPanel date={selectedDate} />
          ) : (
            slotRows.map(({ slot, coalesce }) => (
              <TeeRow
                key={slot.slot_datetime}
                slot={slot}
                coalesceWithPrevious={coalesce}
                isSelected={selectedSlotKey === slot.slot_datetime}
                onSelect={setSelectedSlotKey}
                onPriceClick={handlePriceClick}
              />
            ))
          )}
        </div>
        <SelectionFooter selectedSlot={selectedSlot} />
      </div>
      {pricePopover ? (
        <PricePopover
          anchorEl={pricePopover.anchorEl}
          title={priceBreakdown.title}
          currency={priceBreakdown.currency}
          breakdown={priceBreakdown.breakdown}
          loading={priceBreakdown.loading}
          error={priceBreakdown.error}
          onDismiss={dismissPricePopover}
        />
      ) : null}
    </div>
  );
}

function DateStrip({ date, timezone }: { date: string; timezone: string | null }): JSX.Element {
  const label = formatDateLabel(date, timezone);
  return (
    <div
      style={{
        padding: "8px 16px",
        borderBottom: "1px solid var(--gl-border-subtle)",
        background: "var(--gl-surface-2)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Button variant="secondary" size="sm" disabled aria-label="Previous day — ships in slice 6">
          <Icon name="chevron_left" size={13} />
        </Button>
        <Button variant="secondary" size="sm" disabled aria-label="Jump to today — ships in slice 6">
          Today
        </Button>
        <Button variant="secondary" size="sm" disabled aria-label="Next day — ships in slice 6">
          <Icon name="chevron_right" size={13} />
        </Button>
        <div className="gl-mono" style={{ fontSize: 12, fontWeight: 500, marginLeft: 4 }} data-testid="tee-sheet-date">
          {label}
        </div>
        <Button variant="tertiary" size="sm" disabled aria-label="Pick date — ships in slice 6">
          <Icon name="calendar_today" size={13} />
        </Button>
      </div>
    </div>
  );
}

function LegendStrip(): JSX.Element {
  return (
    <div
      style={{
        padding: "6px 16px",
        borderBottom: "1px solid var(--gl-border-subtle)",
        background: "var(--gl-surface)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
      aria-label="Tee sheet legend"
    >
      <span className="gl-t-xs gl-muted">States</span>
      {LEGEND_STATES.map((state) => (
        <TeeStateChip key={state} state={state} compact />
      ))}
      <span style={{ width: 1, height: 14, background: "var(--gl-border)", margin: "0 2px" }} />
      <span className="gl-t-xs gl-muted">Channel</span>
      {LEGEND_CHANNELS.map((channel) => (
        <span
          key={channel.key}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: channel.color,
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          {channel.label}
        </span>
      ))}
    </div>
  );
}

function GridHeader(): JSX.Element {
  return (
    <div
      role="row"
      aria-label="Tee sheet column headers"
      style={{
        display: "flex",
        alignItems: "stretch",
        background: "var(--gl-surface)",
        color: "var(--gl-text-secondary)",
        fontSize: 10,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontWeight: 500,
        borderBottom: "1px solid var(--gl-border)",
      }}
    >
      <span style={{ width: 18 }} aria-hidden="true" />
      <span style={{ width: 52, padding: "6px 10px" }}>Time</span>
      <span style={{ flex: 1, padding: "6px 10px", borderLeft: "1px solid var(--gl-border-subtle)" }}>Slot 1</span>
      <span style={{ flex: 1, padding: "6px 10px", borderLeft: "1px solid var(--gl-border-subtle)" }}>Slot 2</span>
      <span style={{ flex: 1, padding: "6px 10px", borderLeft: "1px solid var(--gl-border-subtle)" }}>Slot 3</span>
      <span style={{ flex: 1, padding: "6px 10px", borderLeft: "1px solid var(--gl-border-subtle)" }}>Slot 4</span>
      <span style={{ width: 32, padding: "6px 6px", borderLeft: "1px solid var(--gl-border-subtle)", textAlign: "center" }}>
        Pace
      </span>
      <span style={{ width: 76, padding: "6px 10px", borderLeft: "1px solid var(--gl-border-subtle)", textAlign: "right" }}>
        Price
      </span>
      <span style={{ width: 32, borderLeft: "1px solid var(--gl-border-subtle)" }} aria-hidden="true" />
    </div>
  );
}

function SkeletonRows(): JSX.Element {
  return (
    <div aria-label="Loading tee sheet" role="status">
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "stretch",
            background: "var(--gl-surface-raised)",
            borderBottom: "1px solid var(--gl-border-subtle)",
            minHeight: 32,
          }}
        >
          <span style={{ width: 18, background: "var(--gl-surface-2)" }} aria-hidden="true" />
          <span style={{ width: 52, padding: "8px 10px", borderRight: "1px solid var(--gl-border-subtle)" }}>
            <span className="gl-skeleton" style={{ display: "block", width: 34, height: 12 }} />
          </span>
          {[0, 1, 2, 3].map((c) => (
            <span
              key={c}
              style={{
                flex: 1,
                borderLeft: "1px solid var(--gl-border-subtle)",
                padding: "8px",
              }}
            >
              <span className="gl-skeleton" style={{ display: "block", width: "70%", height: 12 }} />
            </span>
          ))}
          <span
            style={{ width: 32, borderLeft: "1px solid var(--gl-border-subtle)" }}
            aria-hidden="true"
          />
          <span style={{ width: 76, borderLeft: "1px solid var(--gl-border-subtle)", padding: "8px 10px" }}>
            <span className="gl-skeleton" style={{ display: "block", width: 50, height: 12, marginLeft: "auto" }} />
          </span>
          <span
            style={{ width: 32, borderLeft: "1px solid var(--gl-border-subtle)" }}
            aria-hidden="true"
          />
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ date }: { date: string }): JSX.Element {
  return (
    <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
      <Card
        style={{
          maxWidth: 480,
          textAlign: "center",
          padding: 32,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: "var(--gl-surface-2)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="event_busy" size={26} color="var(--gl-text-secondary)" />
        </span>
        <h2
          className="gl-serif"
          style={{ marginTop: 18, marginBottom: 8, fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em" }}
        >
          No tee times scheduled
        </h2>
        <p className="gl-muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
          The day has no rows or every slot is closed.
        </p>
        <div className="gl-mono" style={{ marginTop: 14, fontSize: 12, color: "var(--gl-text-secondary)" }}>
          {date}
        </div>
      </Card>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }): JSX.Element {
  return (
    <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
      <Card
        style={{
          maxWidth: 520,
          padding: 0,
          background: "color-mix(in oklab, var(--gl-caddie) 7%, var(--gl-surface-raised))",
          borderColor: "color-mix(in oklab, var(--gl-caddie) 35%, var(--gl-border-subtle))",
        }}
      >
        <CardHead
          eyebrow="Couldn't load tee sheet"
          title="Backend request failed"
          right={<Pill kind="err">Error</Pill>}
        />
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "var(--gl-text-primary)" }}>{message}</p>
          <div>
            <Button variant="secondary" onClick={onRetry} leadingIcon={<Icon name="refresh" size={14} />}>
              Retry
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
