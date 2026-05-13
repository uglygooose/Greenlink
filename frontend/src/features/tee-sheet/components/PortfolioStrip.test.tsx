import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { PortfolioStrip, aggregateDay } from "./PortfolioStrip";
import type { TeeSheetDayResponse, TeeSheetSlotView } from "../../../types/tee-sheet";

const mockUseSession = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseQueries = vi.fn();

vi.mock("../../../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../../golf-settings/hooks", () => ({
  useCoursesQuery: () => mockUseCoursesQuery(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueries: (args: { queries: unknown[] }) => mockUseQueries(args),
}));

function slot(overrides: Partial<TeeSheetSlotView> = {}): TeeSheetSlotView {
  return {
    slot_datetime: "2026-05-12T06:30:00+02:00",
    local_time: "06:30:00",
    display_status: "available",
    state_flags: {},
    occupancy: {
      player_capacity: 4,
      occupied_player_count: 0,
      reserved_player_count: 0,
      confirmed_booking_count: 0,
      reserved_booking_count: 0,
      remaining_player_capacity: 4,
    },
    party_summary: {
      member_count: 0,
      guest_count: 0,
      staff_count: 0,
      total_players: 0,
      has_activity: false,
    },
    policy_summary: {
      applies_to: "staff",
      availability_status: "available",
      blocker_count: 0,
      unresolved_count: 0,
      warning_count: 0,
    },
    blockers: [],
    unresolved_checks: [],
    warnings: [],
    bookings: [],
    ...overrides,
  } as TeeSheetSlotView;
}

function day(slots: TeeSheetSlotView[]): TeeSheetDayResponse {
  return {
    club_id: "club-1",
    course_id: "course-1",
    course_name: "C",
    date: "2026-05-12",
    timezone: "Africa/Johannesburg",
    interval_minutes: 8,
    membership_type: "staff",
    reference_datetime: "2026-05-12T06:00:00+02:00",
    rows: [
      {
        row_key: "lane-0",
        tee_id: "tee-1",
        start_lane: null,
        label: "1st Tee",
        color_code: null,
        slots,
      },
    ],
    warnings: [],
  };
}

describe("aggregateDay", () => {
  test("zero on empty day", () => {
    expect(aggregateDay(undefined)).toMatchObject({
      utilisationPercent: 0,
      teeTimesBooked: 0,
      teeTimesTotal: 0,
      revenueAmount: 0,
    });
  });

  test("sums occupied/capacity, counts booked slots, totals revenue", () => {
    const agg = aggregateDay(
      day([
        slot({
          occupancy: { ...slot().occupancy, occupied_player_count: 4, player_capacity: 4 },
          bookings: [
            {
              id: "b1",
              status: "checked_in",
              party_size: 4,
              holes: 18,
              slot_datetime: "2026-05-12T06:30:00+02:00",
              fee_amount: "2240.00",
              fee_currency: "ZAR",
              participants: [],
            },
          ],
        }),
        slot({
          occupancy: { ...slot().occupancy, occupied_player_count: 0, player_capacity: 4 },
        }),
        slot({
          occupancy: { ...slot().occupancy, occupied_player_count: 2, player_capacity: 4 },
          bookings: [
            {
              id: "b2",
              status: "checked_in",
              party_size: 2,
              holes: 18,
              slot_datetime: "2026-05-12T06:38:00+02:00",
              fee_amount: "1100.00",
              fee_currency: "ZAR",
              participants: [],
            },
          ],
        }),
      ]),
    );
    expect(agg.utilisationPercent).toBe(50); // 6/12
    expect(agg.teeTimesBooked).toBe(2);
    expect(agg.teeTimesTotal).toBe(3);
    expect(agg.revenueAmount).toBe(3340);
    expect(agg.revenueCurrency).toBe("ZAR");
  });
});

function renderStrip({
  selectedDate = "2026-05-12",
  activeCourseId = "course-1",
  initialUrl = "/admin/tee-sheet?course_id=course-1&date=2026-05-12",
}: { selectedDate?: string; activeCourseId?: string | null; initialUrl?: string } = {}) {
  let lastSearch = "";
  function LocationProbe(): JSX.Element {
    const location = useLocation();
    lastSearch = location.search;
    return <PortfolioStrip selectedDate={selectedDate} activeCourseId={activeCourseId} />;
  }
  const ui = render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={[initialUrl]}
    >
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...ui, get search(): string { return lastSearch; } };
}

describe("PortfolioStrip rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { timezone: "Africa/Johannesburg" },
      },
    });
  });

  test("loading: skeleton tiles render", () => {
    mockUseCoursesQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });
    mockUseQueries.mockReturnValue([]);
    renderStrip();
    expect(screen.getByTestId("portfolio-strip-loading")).toBeInTheDocument();
  });

  test("empty: zero courses → renders nothing", () => {
    mockUseCoursesQuery.mockReturnValue({ data: [], isPending: false, isError: false });
    mockUseQueries.mockReturnValue([]);
    const { container } = renderStrip();
    expect(container.querySelector("[data-testid='portfolio-strip']")).toBeNull();
    expect(container.querySelector("[data-testid='portfolio-strip-loading']")).toBeNull();
  });

  test("error: course list fetch fails → error card with retry", () => {
    const refetch = vi.fn();
    mockUseCoursesQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("Network down"),
      refetch,
    });
    mockUseQueries.mockReturnValue([]);
    renderStrip();
    expect(screen.getByText(/course list request failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  test("renders N tiles for N courses with aggregated metrics + portfolio summary", () => {
    mockUseCoursesQuery.mockReturnValue({
      data: [
        { id: "course-1", club_id: "club-1", name: "The Bluff", holes: 18, active: true, created_at: "", updated_at: "" },
        { id: "course-2", club_id: "club-1", name: "The Estuary", holes: 18, active: true, created_at: "", updated_at: "" },
      ],
      isPending: false,
      isError: false,
    });
    mockUseQueries.mockReturnValue([
      {
        data: day([
          slot({
            occupancy: { ...slot().occupancy, occupied_player_count: 4, player_capacity: 4 },
            bookings: [
              {
                id: "b1",
                status: "checked_in",
                party_size: 4,
                holes: 18,
                slot_datetime: "2026-05-12T06:30:00+02:00",
                fee_amount: "2240.00",
                fee_currency: "ZAR",
                participants: [],
              },
            ],
          }),
        ]),
      },
      {
        data: day([
          slot({
            occupancy: { ...slot().occupancy, occupied_player_count: 2, player_capacity: 4 },
            bookings: [
              {
                id: "b2",
                status: "checked_in",
                party_size: 2,
                holes: 18,
                slot_datetime: "2026-05-12T06:30:00+02:00",
                fee_amount: "1100.00",
                fee_currency: "ZAR",
                participants: [],
              },
            ],
          }),
        ]),
      },
    ]);
    renderStrip();
    expect(screen.getByRole("tab", { name: /the bluff/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /the estuary/i })).toBeInTheDocument();
    // Aggregate utilisation = (4+2) / (4+4) = 75%
    const summaryText = screen.getByText(/portfolio utilisation/i).textContent ?? "";
    expect(summaryText).toContain("75%");
    // en-ZA toLocaleString uses U+202F narrow no-break space as thousands
    // separator; assert on the digits with whitespace-tolerant matching.
    expect(summaryText.replace(/\s+/g, " ")).toContain("R 3 340");
  });

  test("active tile reflects activeCourseId prop", () => {
    mockUseCoursesQuery.mockReturnValue({
      data: [
        { id: "course-1", club_id: "club-1", name: "The Bluff", holes: 18, active: true, created_at: "", updated_at: "" },
        { id: "course-2", club_id: "club-1", name: "The Estuary", holes: 18, active: true, created_at: "", updated_at: "" },
      ],
      isPending: false,
      isError: false,
    });
    mockUseQueries.mockReturnValue([{ data: undefined }, { data: undefined }]);
    renderStrip({ activeCourseId: "course-2" });
    const bluff = screen.getByRole("tab", { name: /the bluff/i });
    const estuary = screen.getByRole("tab", { name: /the estuary/i });
    expect(bluff.getAttribute("aria-selected")).toBe("false");
    expect(estuary.getAttribute("aria-selected")).toBe("true");
  });

  test("click on inactive tile updates ?course_id and preserves ?date", () => {
    mockUseCoursesQuery.mockReturnValue({
      data: [
        { id: "course-1", club_id: "club-1", name: "The Bluff", holes: 18, active: true, created_at: "", updated_at: "" },
        { id: "course-2", club_id: "club-1", name: "The Estuary", holes: 18, active: true, created_at: "", updated_at: "" },
      ],
      isPending: false,
      isError: false,
    });
    mockUseQueries.mockReturnValue([{ data: undefined }, { data: undefined }]);
    const probe = renderStrip({ activeCourseId: "course-1" });
    fireEvent.click(screen.getByRole("tab", { name: /the estuary/i }));
    expect(probe.search).toContain("course_id=course-2");
    expect(probe.search).toContain("date=2026-05-12");
  });
});
