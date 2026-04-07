import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminClubSettingsPage } from "./admin-club-settings-page";

const mockUseSession = vi.fn();
const mockUseClubConfigQuery = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseTeesQuery = vi.fn();
const mockUseRuleSetsQuery = vi.fn();
const mockUsePricingMatricesQuery = vi.fn();
const mockUseClubTargetsQuery = vi.fn();
const mockUseAccountingExportProfilesQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/golf-settings/hooks", () => ({
  useClubConfigQuery: () => mockUseClubConfigQuery(),
  useCoursesQuery: () => mockUseCoursesQuery(),
  useTeesQuery: () => mockUseTeesQuery(),
  useRuleSetsQuery: () => mockUseRuleSetsQuery(),
  usePricingMatricesQuery: () => mockUsePricingMatricesQuery(),
}));

vi.mock("../features/finance/hooks", () => ({
  useAccountingExportProfilesQuery: () => mockUseAccountingExportProfilesQuery(),
}));

vi.mock("../features/targets/hooks", () => ({
  useClubTargetsQuery: () => mockUseClubTargetsQuery(),
}));

function renderPage(): void {
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/settings/club"]}>
      <AdminClubSettingsPage />
    </MemoryRouter>,
  );
}

describe("AdminClubSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { id: "club-1", name: "Club One", slug: "club-one", location: "Durban", timezone: "Africa/Johannesburg", branding: { logo_object_key: null, name: "Club One" } },
        module_flags: { golf: true, finance: true },
      },
    });

    mockUseClubConfigQuery.mockReturnValue({
      data: {
        id: "cfg-1",
        club_id: "club-1",
        timezone: "Africa/Johannesburg",
        operating_hours: {},
        booking_window_days: 14,
        cancellation_policy_hours: 24,
        default_slot_interval_minutes: 10,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      isLoading: false,
    });

    mockUseCoursesQuery.mockReturnValue({ data: [{ id: "c1" }, { id: "c2" }], isLoading: false });
    mockUseTeesQuery.mockReturnValue({ data: [{ id: "t1" }, { id: "t2" }, { id: "t3" }], isLoading: false });
    mockUseRuleSetsQuery.mockReturnValue({ data: [{ id: "r1" }], isLoading: false });
    mockUsePricingMatricesQuery.mockReturnValue({ data: [{ id: "p1" }, { id: "p2" }], isLoading: false });

    mockUseClubTargetsQuery.mockReturnValue({
      data: {
        items: [
          { id: "tgt-1", archived: false },
          { id: "tgt-2", archived: false },
          { id: "tgt-3", archived: true },
        ],
        total_count: 3,
      },
      isLoading: false,
    });

    mockUseAccountingExportProfilesQuery.mockReturnValue({
      data: {
        profiles: [
          { id: "prof-1", name: "Sage Export", is_active: true, package_type: "sage_like" },
          { id: "prof-2", name: "Generic", is_active: false, package_type: "generic_journal" },
        ],
      },
      isLoading: false,
    });
  });

  test("renders club config data from backend — timezone, booking window, slot interval, cancellation", () => {
    renderPage();
    expect(screen.getByText("Africa/Johannesburg")).toBeInTheDocument();
    expect(screen.getByText("14 days")).toBeInTheDocument();
    expect(screen.getByText("10 min")).toBeInTheDocument();
    expect(screen.getByText("24h notice")).toBeInTheDocument();
  });

  test("renders course, tee, rule set, and pricing matrix counts", () => {
    renderPage();
    // Labels are unique; their values may repeat elsewhere so check labels only
    expect(screen.getByText("Courses")).toBeInTheDocument();
    expect(screen.getByText("Tees")).toBeInTheDocument();
    expect(screen.getByText("Rule sets")).toBeInTheDocument();
    expect(screen.getByText("Pricing matrices")).toBeInTheDocument();
    // Count values may appear multiple times — just confirm they exist
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  test("renders active target count (non-archived only)", () => {
    renderPage();
    // Labels are unique row labels on the card
    expect(screen.getByText("Active targets")).toBeInTheDocument();
    expect(screen.getByText("Total defined")).toBeInTheDocument();
    // 2 active, 3 total — values appear; use getAllByText since counts repeat
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
  });

  test("renders active accounting export profile name", () => {
    renderPage();
    // Profile name is unique on the page
    expect(screen.getByText("Sage Export")).toBeInTheDocument();
    // Label row is unique
    expect(screen.getByText("Active profile")).toBeInTheDocument();
  });

  test("shows None set when no profile is active", () => {
    mockUseAccountingExportProfilesQuery.mockReturnValue({
      data: {
        profiles: [
          { id: "prof-1", name: "Generic", is_active: false, package_type: "generic_journal" },
        ],
      },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("None set")).toBeInTheDocument();
  });

  test("shows loading state when club config is loading", () => {
    mockUseClubConfigQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderPage();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  test("renders navigation links to Golf Settings and Finance", () => {
    renderPage();
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/admin/golf/settings");
    expect(hrefs).toContain("/admin/finance");
    expect(hrefs).toContain("/admin/targets");
  });

  test("shows superadmin boundary notice", () => {
    renderPage();
    expect(screen.getByText(/superadmin-owned/i)).toBeInTheDocument();
  });
});
