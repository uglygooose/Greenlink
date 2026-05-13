// Path: frontend/src/pages/admin-tee-sheet-page.tsx — Phase 10 Slices 2–7.
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
// - Slice 6: shortcut help modal wired to "?" key and the two "?" buttons
//            (selection footer + topbar via ShortcutsProvider context). The
//            page registers its 21-entry tee-sheet shortcut map on mount.
//            Esc priority is now modal > popover > selection.
// - Slice 7: walk-in waitlist rail mounted to the right of the row list
//            (308 px). Empty stub today — backend has no waitlist entity
//            (DRIFT_LOG 2026-05-13 Slice 7). Slice 8a wires drop targets.
//
// What's NOT here (later slices): drag-and-drop wiring (8), real lock
// acquisition (9), full keyboard shortcuts (10), slot-interval + density
// toggles (11), tournament mode (12), marshal-on-phone (13).
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
import { WaitlistRail } from "../features/tee-sheet/components/WaitlistRail";
import { useTeeSheetDayQuery } from "../features/tee-sheet/hooks";
import { usePriceBreakdown } from "../features/tee-sheet/use-price-breakdown";
import { useWaitlist } from "../features/tee-sheet/use-waitlist";
import { useCreateWalkinBooking } from "../features/tee-sheet/use-create-walkin-booking";
import { useDragState } from "../features/tee-sheet/dnd/use-drag-state";
import type {
  CellOccupant,
  DragPayload,
  ParticipantDragPayload,
  SlotDropTarget,
} from "../features/tee-sheet/dnd/types";
import { useParticipantSwap } from "../features/tee-sheet/use-participant-swap";
import { useMoveParticipant } from "../features/tee-sheet/use-move-participant";
import { PartialSwapPill } from "../features/tee-sheet/components/PartialSwapPill";
import { currentDateInTimezone } from "../features/tee-sheet/sheet-shared";
import { TEE_SHEET_SHORTCUTS } from "../features/tee-sheet/shortcuts";
import { PricePopover } from "../components/ui/PricePopover";
import { ShortcutHelpModal } from "../components/ui/ShortcutHelpModal";
import { useShortcuts } from "../components/admin-shell/shortcuts-context";
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

  // Slice 6: shortcut help modal. Modal owns its own esc + backdrop dismiss;
  // the page only sets/clears the open flag and registers its shortcut map
  // with the shell so the topbar's "?" chip can reach `openShortcuts`.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { setOpenHandler } = useShortcuts();
  useEffect(() => {
    setOpenHandler(() => setShortcutsOpen(true));
    return () => setOpenHandler(null);
  }, [setOpenHandler]);

  // Clear selection AND popover when the active course or date changes —
  // both reference rows that no longer exist on the new sheet. The modal
  // is help, not data, so it survives navigation.
  useEffect(() => {
    setSelectedSlotKey(null);
    setPricePopover(null);
  }, [courseId, selectedDate]);

  // Esc priority: modal first, popover second, selection third. Both
  // sub-components (modal + popover) own their own esc handlers and fire
  // onDismiss directly; the page handler only needs to keep its OWN tier
  // (selection clear) silent when a higher tier is on screen.
  const pricePopoverOpenRef = useRef(false);
  pricePopoverOpenRef.current = pricePopover != null;
  const shortcutsOpenRef = useRef(false);
  shortcutsOpenRef.current = shortcutsOpen;
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (shortcutsOpenRef.current) return;
      if (pricePopoverOpenRef.current) return;
      setSelectedSlotKey(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // "?" opens the modal. Skipped when the user is typing — input, textarea,
  // and contenteditable surfaces own that keystroke. Mirrors the Phase 8
  // a11y note: "no shortcut steals focus from a search input."
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "?") return;
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (active.isContentEditable) return;
      }
      event.preventDefault();
      setShortcutsOpen(true);
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

  const openShortcuts = useCallback(() => {
    setShortcutsOpen(true);
  }, []);

  const dismissShortcuts = useCallback(() => {
    setShortcutsOpen(false);
  }, []);

  const waitlist = useWaitlist({ clubId: selectedClubId, courseId, date: selectedDate });

  // Slice 8a — DnD state + walk-in booking mutation. The drag controller
  // lives at the page level so WaitlistCard (source) and TeeRow (target)
  // can coordinate through one source of truth.
  const dragController = useDragState();
  const createWalkinBooking = useCreateWalkinBooking({
    accessToken,
    selectedClubId,
    selectedDate,
    membershipType: "staff",
    teeId: null,
  });
  const optimisticallyRemovedEntryIds = useMemo<Set<string>>(() => {
    if (!createWalkinBooking.isPending || !createWalkinBooking.variables) return new Set();
    return new Set([createWalkinBooking.variables.entry.id]);
  }, [createWalkinBooking.isPending, createWalkinBooking.variables]);

  // Slice 8b — participant move + sequential swap orchestrator. The
  // move hook is mounted twice in effect: once standalone (for cross-row
  // move onto an open cell) and once embedded inside the swap orchestrator
  // (for the two-step swap onto a filled cell). Both share the same
  // tee-sheet day cache.
  const moveParticipant = useMoveParticipant({
    accessToken,
    selectedClubId,
    selectedDate,
    membershipType: "staff",
    teeId: null,
  });
  const participantSwap = useParticipantSwap({
    accessToken,
    selectedClubId,
    selectedDate,
    membershipType: "staff",
    teeId: null,
  });

  const handleDropOnSlot = useCallback(
    (target: SlotDropTarget, payload: DragPayload, occupant: CellOccupant | null) => {
      if (!courseId) return;
      if (payload.kind === "waitlist") {
        dragController.endDrag();
        createWalkinBooking.mutate({
          entry: payload.entry,
          slotDatetime: target.slot_datetime,
          courseId,
        });
        return;
      }
      if (payload.kind === "participant") {
        // Same-row drops are already short-circuited inside the cell. Defensive guard.
        if (payload.source_row_key === target.row_key) {
          dragController.endDrag();
          return;
        }
        dragController.endDrag();
        if (occupant === null) {
          moveParticipant.mutate({
            bookingId: payload.booking_id,
            participantId: payload.participant_id,
            targetSlotDatetime: target.slot_datetime,
            sourceSlotDatetime: payload.source_slot_datetime,
            displayName: payload.display_name,
          });
          return;
        }
        // Cross-row swap — orchestrator needs the live target row to
        // gate on intermediate-cell viability.
        const targetRow = day?.rows.find((row) =>
          row.slots.some((slot) => slot.slot_datetime === target.slot_datetime),
        );
        if (!targetRow) return;
        participantSwap.initiate(
          {
            participantA: {
              bookingId: payload.booking_id,
              participantId: payload.participant_id,
              displayName: payload.display_name,
              partySize: payload.party_size,
              slotDatetime: payload.source_slot_datetime,
              rowKey: payload.source_row_key,
            },
            participantB: {
              bookingId: occupant.booking_id,
              participantId: occupant.participant_id,
              displayName: occupant.display_name,
              partySize: occupant.party_size,
              slotDatetime: target.slot_datetime,
              rowKey: target.row_key,
            },
          },
          targetRow,
        );
      }
    },
    [
      courseId,
      createWalkinBooking,
      dragController,
      day,
      moveParticipant,
      participantSwap,
    ],
  );

  const handleParticipantDragStart = useCallback(
    (payload: ParticipantDragPayload) => {
      dragController.startDrag(payload);
    },
    [dragController],
  );

  // Post-drop aria-live announcements. The drag controller's announcement
  // covers in-flight drags; this state carries the announcement of the
  // most recent mutation outcome until the next drag begins.
  const [postDropAnnouncement, setPostDropAnnouncement] = useState("");
  useEffect(() => {
    if (
      moveParticipant.isSuccess &&
      moveParticipant.variables &&
      participantSwap.state.kind === "idle"
    ) {
      setPostDropAnnouncement(
        `Moved ${moveParticipant.variables.displayName} to slot ${moveParticipant.variables.targetSlotDatetime}`,
      );
    }
  }, [moveParticipant.isSuccess, moveParticipant.variables, participantSwap.state.kind]);
  useEffect(() => {
    const kind = participantSwap.state.kind;
    if (kind === "succeeded") {
      setPostDropAnnouncement("Swap complete");
    } else if (kind === "partial-failure-second") {
      setPostDropAnnouncement(
        `Partial swap — ${participantSwap.state.input.participantB.displayName} pending`,
      );
    } else if (kind === "restored") {
      setPostDropAnnouncement("First move restored");
    } else if (kind === "rejected-target-row-full") {
      setPostDropAnnouncement("Swap not possible — target row is full");
    }
  }, [participantSwap.state]);
  useEffect(() => {
    if (dragController.announcement) setPostDropAnnouncement("");
  }, [dragController.announcement]);

  return (
    <div className="gl" style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <PortfolioStrip selectedDate={selectedDate} activeCourseId={courseId} />
      <DateStrip date={selectedDate} timezone={day?.timezone ?? clubTimezone} />
      <LegendStrip />
      <div style={{ flex: 1, display: "flex", flexDirection: "row", minHeight: 0, overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <GridHeader />
          {createWalkinBooking.isError ? (
            <WalkinBookingErrorBanner
              message={createWalkinBooking.error.message}
              onDismiss={() => createWalkinBooking.reset()}
            />
          ) : null}
          {moveParticipant.isError ? (
            <WalkinBookingErrorBanner
              message={moveParticipant.error.message}
              onDismiss={() => moveParticipant.reset()}
            />
          ) : null}
          {participantSwap.state.kind === "rejected-target-row-full" ? (
            <WalkinBookingErrorBanner
              message="Swap not possible — target row is full."
              onDismiss={() => participantSwap.reset()}
            />
          ) : null}
          {participantSwap.state.kind === "partial-failure-second" ? (
            <PartialSwapPill
              participantAName={participantSwap.state.input.participantA.displayName}
              participantBName={participantSwap.state.input.participantB.displayName}
              isRetrying={participantSwap.state.kind === "partial-failure-second" && participantSwap.moveMutation.isPending}
              isRestoring={false}
              onRetry={participantSwap.retrySecond}
              onRestore={participantSwap.restoreFirst}
            />
          ) : participantSwap.state.kind === "restoring" ? (
            <PartialSwapPill
              participantAName={participantSwap.state.input.participantA.displayName}
              participantBName={participantSwap.state.input.participantB.displayName}
              isRetrying={false}
              isRestoring
              onRetry={participantSwap.retrySecond}
              onRestore={participantSwap.restoreFirst}
            />
          ) : participantSwap.state.kind === "restore-failed" ? (
            <WalkinBookingErrorBanner
              message={`Restore failed: ${
                participantSwap.state.error instanceof Error
                  ? participantSwap.state.error.message
                  : "Unknown error"
              }`}
              onDismiss={() => participantSwap.reset()}
            />
          ) : null}
          <div style={{ flex: 1, overflow: "auto" }} data-testid="tee-sheet-row-list">
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
                  dragPayload={dragController.state.payload}
                  activeDropTarget={dragController.state.activeTarget}
                  onDragEnterSlot={dragController.setActiveTarget}
                  onDragLeaveSlot={(target) => {
                    if (
                      dragController.state.activeTarget?.slot_datetime === target.slot_datetime
                    ) {
                      dragController.setActiveTarget(null);
                    }
                  }}
                  onDropOnSlot={handleDropOnSlot}
                  onParticipantDragStart={handleParticipantDragStart}
                  onParticipantDragEnd={dragController.endDrag}
                />
              ))
            )}
          </div>
        </div>
        <WaitlistRail
          waitlist={waitlist.waitlist}
          loading={waitlist.loading}
          error={waitlist.error}
          onDragStart={dragController.startDrag}
          onDragEnd={dragController.endDrag}
          optimisticallyRemovedEntryIds={optimisticallyRemovedEntryIds}
        />
      </div>
      <SelectionFooter selectedSlot={selectedSlot} onOpenShortcuts={openShortcuts} />
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
      <ShortcutHelpModal
        isOpen={shortcutsOpen}
        onDismiss={dismissShortcuts}
        title="Tee sheet shortcuts"
        shortcuts={TEE_SHEET_SHORTCUTS}
      />
      {/* Polite aria-live region: announces drag pickups for screen readers.
          Empty when no drag is active; updated by useDragState's
          announcement field on drag start. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="tee-sheet-dnd-live"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {dragController.announcement || postDropAnnouncement}
      </div>
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

function WalkinBookingErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <div
      role="alert"
      data-testid="walkin-booking-error"
      style={{
        margin: "8px 12px 0",
        padding: "8px 12px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: "var(--gl-radius-sm)",
        background: "color-mix(in oklab, var(--gl-caddie) 7%, var(--gl-surface-raised))",
        border: "1px solid color-mix(in oklab, var(--gl-caddie) 35%, var(--gl-border-subtle))",
        fontSize: 12,
      }}
    >
      <Icon name="error" size={14} color="var(--gl-caddie)" />
      <span style={{ flex: 1 }}>Couldn&apos;t place walk-in: {message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss booking error"
        className="gl-btn gl-btn--tertiary"
        data-size="sm"
        style={{ height: 22, padding: "0 8px" }}
      >
        Dismiss
      </button>
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
