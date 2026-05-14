import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminTeeSheetPage } from "./admin-tee-sheet-page";
import type { TeeSheetDayResponse, TeeSheetSlotView } from "../types/tee-sheet";

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

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
  useTeeSheetDayQuery: (args: unknown) => mockUseTeeSheetDayQuery(args),
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
    <QueryClientProvider client={buildQueryClient()}>
      <MemoryRouter
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
        initialEntries={[initialUrl]}
      >
        <AdminTeeSheetPage />
      </MemoryRouter>
    </QueryClientProvider>,
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
        <QueryClientProvider client={buildQueryClient()}>
          <MemoryRouter
            future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
            initialEntries={["/admin/tee-sheet?course_id=course-1&date=2026-05-12"]}
          >
            <AdminTeeSheetPage />
            <CourseSwitchProbe />
          </MemoryRouter>
        </QueryClientProvider>,
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

  describe("price popover (Slice 5)", () => {
    function slotsWithFee(): TeeSheetSlotView[] {
      return [
        makeSlot({
          slot_datetime: "2026-05-12T06:30:00+02:00",
          local_time: "06:30:00",
          display_status: "reserved",
          bookings: [
            {
              id: "b1",
              status: "reserved",
              party_size: 2,
              holes: 18,
              slot_datetime: "2026-05-12T06:30:00+02:00",
              fee_label: "Member · Sat AM",
              fee_amount: "870.00",
              fee_currency: "ZAR",
              participants: [
                { id: "p1", display_name: "M. Dlamini", participant_type: "member", is_primary: true },
              ],
            },
          ],
        }),
        makeSlot({
          slot_datetime: "2026-05-12T06:38:00+02:00",
          local_time: "06:38:00",
          display_status: "reserved",
          bookings: [
            {
              id: "b2",
              status: "reserved",
              party_size: 1,
              holes: 18,
              slot_datetime: "2026-05-12T06:38:00+02:00",
              fee_label: "Member · Sat AM",
              fee_amount: "435.00",
              fee_currency: "ZAR",
              participants: [
                { id: "p2", display_name: "T. Botha", participant_type: "member", is_primary: true },
              ],
            },
          ],
        }),
      ];
    }

    test("clicking a row's price button opens the popover AND selects the row", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slotsWithFee()), isPending: false, isError: false });
      renderPage();
      expect(screen.queryByTestId("price-popover")).toBeNull();
      fireEvent.click(screen.getAllByTestId("row-price-button")[0]);
      expect(screen.getByTestId("price-popover")).toBeInTheDocument();
      expect(screen.getByTestId("price-popover-total")).toHaveTextContent("R 870");
      // Row is also selected per Phase 8 parity
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("true");
    });

    test("outside-click dismisses popover but keeps selection", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slotsWithFee()), isPending: false, isError: false });
      renderPage();
      fireEvent.click(screen.getAllByTestId("row-price-button")[0]);
      expect(screen.getByTestId("price-popover")).toBeInTheDocument();
      const outside = document.createElement("div");
      document.body.appendChild(outside);
      fireEvent.mouseDown(outside);
      expect(screen.queryByTestId("price-popover")).toBeNull();
      // Selection persists
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("true");
      outside.remove();
    });

    test("esc with popover open clears popover only, keeps selection", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slotsWithFee()), isPending: false, isError: false });
      renderPage();
      fireEvent.click(screen.getAllByTestId("row-price-button")[0]);
      expect(screen.getByTestId("price-popover")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByTestId("price-popover")).toBeNull();
      // Selection persists — popover's esc handler clears popover; page's
      // esc handler bails (popover-open guard).
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("true");
    });

    test("esc with no popover open still clears selection (Slice 4 behaviour preserved)", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slotsWithFee()), isPending: false, isError: false });
      const { container } = renderPage();
      fireEvent.click(container.querySelector("[data-row-state]") as HTMLElement);
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("true");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("false");
    });

    test("clicking another row's price button moves the popover, doesn't dismiss", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slotsWithFee()), isPending: false, isError: false });
      renderPage();
      const buttons = screen.getAllByTestId("row-price-button");
      fireEvent.click(buttons[0]);
      expect(screen.getByTestId("price-popover-total")).toHaveTextContent("R 870");
      fireEvent.mouseDown(buttons[1]);
      fireEvent.click(buttons[1]);
      // Popover still rendered, anchor swapped, total updated to second row's fee
      expect(screen.getByTestId("price-popover")).toBeInTheDocument();
      expect(screen.getByTestId("price-popover-total")).toHaveTextContent("R 435");
    });

    test("changing the active course closes the popover (parallel to selection clear)", () => {
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
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slotsWithFee()), isPending: false, isError: false });
      render(
        <QueryClientProvider client={buildQueryClient()}>
          <MemoryRouter
            future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
            initialEntries={["/admin/tee-sheet?course_id=course-1&date=2026-05-12"]}
          >
            <AdminTeeSheetPage />
            <CourseSwitchProbe />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      fireEvent.click(screen.getAllByTestId("row-price-button")[0]);
      expect(screen.getByTestId("price-popover")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("course-switch-probe"));
      expect(screen.queryByTestId("price-popover")).toBeNull();
    });
  });

  describe("shortcut help modal (Slice 6)", () => {
    test('"?" key opens the modal', () => {
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay([]), isPending: false, isError: false });
      renderPage();
      expect(screen.queryByTestId("shortcut-help-modal")).toBeNull();
      fireEvent.keyDown(document, { key: "?" });
      expect(screen.getByTestId("shortcut-help-modal")).toBeInTheDocument();
    });

    test('"?" key with focus on an input does NOT open the modal', () => {
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay([]), isPending: false, isError: false });
      renderPage();
      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();
      expect(document.activeElement).toBe(input);
      fireEvent.keyDown(document, { key: "?" });
      expect(screen.queryByTestId("shortcut-help-modal")).toBeNull();
      input.remove();
    });

    test("? button in the selection footer opens the modal", () => {
      const slots = [
        makeSlot({ slot_datetime: "2026-05-12T06:30:00+02:00", local_time: "06:30:00", display_status: "reserved" }),
      ];
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slots), isPending: false, isError: false });
      renderPage();
      expect(screen.queryByTestId("shortcut-help-modal")).toBeNull();
      fireEvent.click(screen.getByTestId("selection-shortcuts-button"));
      expect(screen.getByTestId("shortcut-help-modal")).toBeInTheDocument();
    });

    test("esc with modal open dismisses modal; selection survives", () => {
      const slots = [
        makeSlot({ slot_datetime: "2026-05-12T06:30:00+02:00", local_time: "06:30:00", display_status: "reserved" }),
      ];
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slots), isPending: false, isError: false });
      const { container } = renderPage();
      // Select a row first
      fireEvent.click(container.querySelector("[data-row-state]") as HTMLElement);
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("true");
      // Open the modal
      fireEvent.keyDown(document, { key: "?" });
      expect(screen.getByTestId("shortcut-help-modal")).toBeInTheDocument();
      // Esc closes modal — selection survives (page handler bails when modal open)
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByTestId("shortcut-help-modal")).toBeNull();
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("true");
    });

    test("esc with modal open dismisses modal; popover survives", () => {
      const slots = [
        makeSlot({
          slot_datetime: "2026-05-12T06:30:00+02:00",
          local_time: "06:30:00",
          display_status: "reserved",
          bookings: [
            {
              id: "b1",
              status: "reserved",
              party_size: 2,
              holes: 18,
              slot_datetime: "2026-05-12T06:30:00+02:00",
              fee_label: "Member · Sat AM",
              fee_amount: "870.00",
              fee_currency: "ZAR",
              participants: [
                { id: "p1", display_name: "M. Dlamini", participant_type: "member", is_primary: true },
              ],
            },
          ],
        }),
      ];
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slots), isPending: false, isError: false });
      renderPage();
      // Open the popover
      fireEvent.click(screen.getByTestId("row-price-button"));
      expect(screen.getByTestId("price-popover")).toBeInTheDocument();
      // Open the modal on top
      fireEvent.keyDown(document, { key: "?" });
      expect(screen.getByTestId("shortcut-help-modal")).toBeInTheDocument();
      // Esc dismisses the modal. Popover survives because the popover's own
      // esc handler defers when an aria-modal dialog is mounted.
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByTestId("shortcut-help-modal")).toBeNull();
      expect(screen.getByTestId("price-popover")).toBeInTheDocument();
    });

    test("esc with everything closed but selection set clears selection (Slice 4 behaviour preserved)", () => {
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
  });

  describe("waitlist rail (Slice 7)", () => {
    test("rail mounts to the right of the row list", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay([]), isPending: false, isError: false });
      renderPage();
      expect(screen.getByTestId("waitlist-rail")).toBeInTheDocument();
      expect(screen.getByTestId("tee-sheet-row-list")).toBeInTheDocument();
    });

    test("rail renders empty-state drop hint (Path 1 stub: no backend waitlist)", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay([]), isPending: false, isError: false });
      renderPage();
      expect(screen.getByTestId("waitlist-rail-empty")).toBeInTheDocument();
      // Header counts reflect zero
      expect(screen.getByTestId("waitlist-rail-counts")).toHaveTextContent("0 parties · 0 players");
      // Running total reflects zero
      expect(screen.getByTestId("waitlist-rail-total")).toHaveTextContent("R 0");
    });

    test("rail is full-width 308 px (FlexBox shrink prevented)", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay([]), isPending: false, isError: false });
      renderPage();
      const rail = screen.getByTestId("waitlist-rail");
      expect(rail.style.width).toBe("308px");
      expect(rail.style.flexShrink).toBe("0");
    });

    test("popover still positions correctly with rail mounted (Slice 5 preserved)", () => {
      const slots = [
        makeSlot({
          slot_datetime: "2026-05-12T06:30:00+02:00",
          local_time: "06:30:00",
          display_status: "reserved",
          bookings: [
            {
              id: "b1",
              status: "reserved",
              party_size: 2,
              holes: 18,
              slot_datetime: "2026-05-12T06:30:00+02:00",
              fee_label: "Member · Sat AM",
              fee_amount: "870.00",
              fee_currency: "ZAR",
              participants: [
                { id: "p1", display_name: "M. Dlamini", participant_type: "member", is_primary: true },
              ],
            },
          ],
        }),
      ];
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay(slots), isPending: false, isError: false });
      renderPage();
      fireEvent.click(screen.getByTestId("row-price-button"));
      expect(screen.getByTestId("price-popover")).toBeInTheDocument();
      expect(screen.getByTestId("waitlist-rail")).toBeInTheDocument();
    });

    test("modal still mounts with rail present (Slice 6 preserved)", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({ data: makeDay([]), isPending: false, isError: false });
      renderPage();
      fireEvent.keyDown(document, { key: "?" });
      expect(screen.getByTestId("shortcut-help-modal")).toBeInTheDocument();
      expect(screen.getByTestId("waitlist-rail")).toBeInTheDocument();
    });
  });

  describe("slot-interval toggle (Slice 11b)", () => {
    test("date strip mounts the SlotIntervalToggle with the four allowed values", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({
        data: makeDay([]),
        isPending: false,
        isError: false,
      });
      renderPage();
      const group = screen.getByRole("radiogroup", { name: /slot interval/i });
      const buttons = within(group).getAllByRole("radio");
      expect(buttons.map((b) => b.textContent)).toEqual(["6m", "8m", "10m", "12m"]);
    });

    test("active button reflects the response's interval_minutes (truth-from-server)", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({
        data: { ...makeDay([]), interval_minutes: 10 },
        isPending: false,
        isError: false,
      });
      renderPage();
      const buttons = within(
        screen.getByRole("radiogroup", { name: /slot interval/i }),
      ).getAllByRole("radio");
      expect(buttons.map((b) => b.getAttribute("aria-checked"))).toEqual([
        "false",
        "false",
        "true",
        "false",
      ]);
    });

    test("clicking an interval button re-calls the hook with the new intervalMinutes", () => {
      mockUseTeeSheetDayQuery.mockReturnValue({
        data: makeDay([]),
        isPending: false,
        isError: false,
      });
      renderPage();
      const initialArgs = mockUseTeeSheetDayQuery.mock.calls[0][0] as { intervalMinutes: number | null };
      expect(initialArgs.intervalMinutes).toBeNull();

      const buttons = within(
        screen.getByRole("radiogroup", { name: /slot interval/i }),
      ).getAllByRole("radio");
      fireEvent.click(buttons[2]); // 10m

      const latestArgs = mockUseTeeSheetDayQuery.mock.calls.at(-1)![0] as {
        intervalMinutes: number | null;
      };
      expect(latestArgs.intervalMinutes).toBe(10);
    });

    test("changing the interval clears the active row selection", () => {
      const slots = [
        makeSlot({
          slot_datetime: "2026-05-12T06:30:00+02:00",
          local_time: "06:30:00",
          display_status: "reserved",
        }),
      ];
      mockUseTeeSheetDayQuery.mockReturnValue({
        data: makeDay(slots),
        isPending: false,
        isError: false,
      });
      const { container } = renderPage();
      fireEvent.click(container.querySelector("[data-row-state]") as HTMLElement);
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("true");

      const buttons = within(
        screen.getByRole("radiogroup", { name: /slot interval/i }),
      ).getAllByRole("radio");
      fireEvent.click(buttons[2]); // 10m
      expect(screen.getByTestId("selection-footer").getAttribute("data-has-selection")).toBe("false");
    });
  });
});
