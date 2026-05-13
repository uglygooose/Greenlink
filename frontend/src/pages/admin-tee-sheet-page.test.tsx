import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminTeeSheetPage } from "./admin-tee-sheet-page";
import type { TeeSheetDayResponse, TeeSheetSlotView } from "../types/tee-sheet";

const mockUseSession = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseTeeSheetDayQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/golf-settings/hooks", () => ({
  useCoursesQuery: () => mockUseCoursesQuery(),
}));

vi.mock("../features/tee-sheet/hooks", () => ({
  useTeeSheetDayQuery: () => mockUseTeeSheetDayQuery(),
}));

vi.mock("../features/tee-sheet/components/PortfolioStrip", () => ({
  PortfolioStrip: ({ activeCourseId, selectedDate }: { activeCourseId: string | null; selectedDate: string }) => (
    <div
      data-testid="portfolio-strip-stub"
      data-active-course={activeCourseId ?? ""}
      data-date={selectedDate}
    />
  ),
}));

function renderPage(initialUrl = "/admin/tee-sheet?course_id=course-1&date=2026-05-12") {
  return render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={[initialUrl]}
    >
      <AdminTeeSheetPage />
    </MemoryRouter>,
  );
}

function makeSlot(overrides: Partial<TeeSheetSlotView> = {}): TeeSheetSlotView {
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

function makeDay(slots: TeeSheetSlotView[]): TeeSheetDayResponse {
  return {
    club_id: "club-1",
    course_id: "course-1",
    course_name: "The Bluff",
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

describe("AdminTeeSheetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: {
          id: "club-1",
          name: "Umhlali CC",
          slug: "umhlali",
          location: "Umhlali",
          timezone: "Africa/Johannesburg",
          branding: { logo_object_key: null, name: "Umhlali CC" },
        },
      },
    });
    mockUseCoursesQuery.mockReturnValue({
      data: [{ id: "course-1", name: "The Bluff" }],
      isLoading: false,
    });
  });

  test("renders portfolio strip, date strip, legend and grid header even while loading", () => {
    mockUseTeeSheetDayQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });
    renderPage();
    const strip = screen.getByTestId("portfolio-strip-stub");
    expect(strip).toBeInTheDocument();
    expect(strip.getAttribute("data-active-course")).toBe("course-1");
    expect(strip.getAttribute("data-date")).toBe("2026-05-12");
    expect(screen.getByTestId("tee-sheet-date")).toBeInTheDocument();
    expect(screen.getByLabelText(/tee sheet legend/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tee sheet column headers/i)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /loading tee sheet/i })).toBeInTheDocument();
  });

  test("renders N rows when day response carries slots", () => {
    const slots = [
      makeSlot({ slot_datetime: "2026-05-12T06:30:00+02:00", local_time: "06:30:00" }),
      makeSlot({ slot_datetime: "2026-05-12T06:38:00+02:00", local_time: "06:38:00", display_status: "reserved" }),
      makeSlot({
        slot_datetime: "2026-05-12T06:46:00+02:00",
        local_time: "06:46:00",
        display_status: "warning",
        warnings: [{ code: "incomplete", message: "Incomplete fourball" }],
      }),
    ];
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: makeDay(slots),
      isPending: false,
      isError: false,
    });
    const { container } = renderPage();
    const rows = container.querySelectorAll("[data-row-state]");
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute("data-row-state")).toBe("open");
    expect(rows[1].getAttribute("data-row-state")).toBe("booked");
    expect(rows[2].getAttribute("data-row-state")).toBe("atrisk");
  });

  test("empty state when day has no rows", () => {
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: { ...makeDay([]), rows: [] },
      isPending: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByText(/no tee times scheduled/i)).toBeInTheDocument();
  });

  test("empty state when day's first lane has no slots", () => {
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: makeDay([]),
      isPending: false,
      isError: false,
    });
    renderPage();
    expect(screen.getByText(/no tee times scheduled/i)).toBeInTheDocument();
  });

  test("error panel + retry calls refetch", () => {
    const refetch = vi.fn();
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error("Network down"),
      refetch,
    });
    renderPage();
    expect(screen.getByText(/backend request failed/i)).toBeInTheDocument();
    expect(screen.getByText(/network down/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  test("adjacent blocked slots coalesce — second block is hidden", () => {
    const slots = [
      makeSlot({
        slot_datetime: "2026-05-12T07:18:00+02:00",
        local_time: "07:18:00",
        display_status: "blocked",
        blockers: [{ code: "aeration", reason: "Aeration · 07:18–07:34", details: {} }],
      }),
      makeSlot({
        slot_datetime: "2026-05-12T07:26:00+02:00",
        local_time: "07:26:00",
        display_status: "blocked",
        blockers: [{ code: "aeration", reason: "Aeration · 07:18–07:34", details: {} }],
      }),
    ];
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: makeDay(slots),
      isPending: false,
      isError: false,
    });
    const { container } = renderPage();
    const rows = container.querySelectorAll("[data-row-state]");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-row-state")).toBe("blocked");
  });

  test("falls back to first course when course_id is absent from URL", () => {
    mockUseTeeSheetDayQuery.mockReturnValue({
      data: makeDay([]),
      isPending: false,
      isError: false,
    });
    renderPage("/admin/tee-sheet?date=2026-05-12");
    // Empty state still renders — no crash on missing course_id param
    expect(screen.getByText(/no tee times scheduled/i)).toBeInTheDocument();
  });

  describe("selection (Slice 4)", () => {
    test("clicking a row hydrates the SelectionFooter", () => {
      const slots = [
        makeSlot({ slot_datetime: "2026-05-12T06:30:00+02:00", local_time: "06:30:00", display_status: "reserved" }),
      ];
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slots), isPending: false, isError: false });
      const { container } = renderPage();
      const footer = screen.getByTestId("selection-footer");
      expect(footer.getAttribute("data-has-selection")).toBe("false");
      fireEvent.click(container.querySelector("[data-row-state]") as HTMLElement);
      expect(footer.getAttribute("data-has-selection")).toBe("true");
      expect(screen.getByTestId("selection-label").textContent).toContain("06:30");
    });

    test("pressing Escape clears the selection", () => {
      const slots = [
        makeSlot({ slot_datetime: "2026-05-12T06:30:00+02:00", local_time: "06:30:00", display_status: "reserved" }),
      ];
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slots), isPending: false, isError: false });
      const { container } = renderPage();
      fireEvent.click(container.querySelector("[data-row-state]") as HTMLElement);
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("true");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("false");
    });

    test("changing the active course clears the selection", () => {
      // MemoryRouter only consults initialEntries at mount, so re-rendering
      // with new initialEntries doesn't change the URL. Inject a probe that
      // mutates the URL via useSearchParams within the same router instance.
      function CourseSwitchProbe(): JSX.Element {
        const [, setSearchParams] = useSearchParams();
        return (
          <button
            type="button"
            data-testid="course-switch-probe"
            onClick={() => {
              setSearchParams((prev) => {
                prev.set("course_id", "course-2");
                return prev;
              });
            }}
          >
            switch
          </button>
        );
      }
      const slots = [
        makeSlot({ slot_datetime: "2026-05-12T06:30:00+02:00", local_time: "06:30:00", display_status: "reserved" }),
      ];
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slots), isPending: false, isError: false });
      const { container } = render(
        <MemoryRouter
          future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
          initialEntries={["/admin/tee-sheet?course_id=course-1&date=2026-05-12"]}
        >
          <AdminTeeSheetPage />
          <CourseSwitchProbe />
        </MemoryRouter>,
      );
      fireEvent.click(container.querySelector("[data-row-state]") as HTMLElement);
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("true");
      fireEvent.click(screen.getByTestId("course-switch-probe"));
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("false");
    });

    test("clicking a blocked row does not hydrate the footer", () => {
      const slots = [
        makeSlot({
          slot_datetime: "2026-05-12T07:18:00+02:00",
          local_time: "07:18:00",
          display_status: "blocked",
          blockers: [{ code: "aeration", reason: "Aeration", details: {} }],
        }),
      ];
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slots), isPending: false, isError: false });
      const { container } = renderPage();
      fireEvent.click(container.querySelector("[data-row-state='blocked']") as HTMLElement);
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("false");
    });
  });
});
