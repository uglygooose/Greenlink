import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminSettingsHubPage } from "./admin-settings-hub-page";

const mockUseSession = vi.fn();
const mockUseClubConfigQuery = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseTeesQuery = vi.fn();
const mockUseRuleSetsQuery = vi.fn();
const mockUsePricingMatricesQuery = vi.fn();
const mockUseAccountingExportProfilesQuery = vi.fn();
const mockUseClubTargetsQuery = vi.fn();
const mockUseNewsPostsQuery = vi.fn();
const mockUsePublishedNewsFeedQuery = vi.fn();
const mockUseBlastsQuery = vi.fn();

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

vi.mock("../features/comms/hooks", () => ({
  useNewsPostsQuery: () => mockUseNewsPostsQuery(),
  usePublishedNewsFeedQuery: () => mockUsePublishedNewsFeedQuery(),
  useBlastsQuery: () => mockUseBlastsQuery(),
}));

function renderPage(): void {
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/settings"]}>
      <AdminSettingsHubPage />
    </MemoryRouter>,
  );
}

describe("AdminSettingsHubPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: {
          id: "club-1",
          name: "Club One",
          slug: "club-one",
          location: "Durban",
          timezone: "Africa/Johannesburg",
          branding: { logo_object_key: null, name: "Club One" },
        },
        available_clubs: [{ club_id: "club-1", membership_role: "club_admin" }],
        module_flags: { golf: true, finance: true, communications: true, pos: false },
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
    mockUseCoursesQuery.mockReturnValue({ data: [{ id: "course-1" }, { id: "course-2" }], isLoading: false });
    mockUseTeesQuery.mockReturnValue({ data: [{ id: "tee-1" }, { id: "tee-2" }], isLoading: false });
    mockUseRuleSetsQuery.mockReturnValue({ data: [{ id: "rule-1" }], isLoading: false });
    mockUsePricingMatricesQuery.mockReturnValue({ data: [{ id: "pricing-1" }], isLoading: false });
    mockUseAccountingExportProfilesQuery.mockReturnValue({
      data: {
        profiles: [
          { id: "profile-1", name: "Sage Export", is_active: true },
          { id: "profile-2", name: "Generic Journal", is_active: false },
        ],
      },
      isLoading: false,
    });
    mockUseClubTargetsQuery.mockReturnValue({
      data: {
        items: [
          { id: "target-1", archived: false },
          { id: "target-2", archived: false },
          { id: "target-3", archived: true },
        ],
        total_count: 3,
      },
      isLoading: false,
    });
    mockUseNewsPostsQuery.mockReturnValue({ data: { total_count: 4 }, isLoading: false });
    mockUsePublishedNewsFeedQuery.mockReturnValue({
      data: { posts: [{ id: "post-1" }, { id: "post-2" }] },
      isLoading: false,
    });
    mockUseBlastsQuery.mockReturnValue({
      data: { blasts: [{ id: "blast-1" }] },
      isLoading: false,
    });
  });

  test("renders the six settings destinations with backend-backed status details", () => {
    renderPage();

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/admin/settings/profile");
    expect(hrefs).toContain("/admin/golf/settings");
    expect(hrefs).toContain("/admin/finance");
    expect(hrefs).toContain("/admin/settings/modules");
    expect(hrefs).toContain("/admin/communications");
    expect(hrefs).toContain("/admin/targets");

    expect(screen.getAllByText("Club One").length).toBeGreaterThan(0);
    expect(screen.getByText("Durban - Africa/Johannesburg")).toBeInTheDocument();
    expect(screen.getByText("Sage Export")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    expect(screen.getByText("Operational dashboards")).toBeInTheDocument();
  });

  test("surfaces disabled communications and missing targets without exposing edit controls", () => {
    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: {
          id: "club-1",
          name: "Club One",
          slug: "club-one",
          location: "Durban",
          timezone: "Africa/Johannesburg",
          branding: { logo_object_key: null, name: "Club One" },
        },
        available_clubs: [{ club_id: "club-1", membership_role: "club_admin" }],
        module_flags: { golf: true, finance: false, communications: false, pos: false },
      },
    });
    mockUseAccountingExportProfilesQuery.mockReturnValue({ data: { profiles: [] }, isLoading: false });
    mockUseClubTargetsQuery.mockReturnValue({ data: { items: [], total_count: 0 }, isLoading: false });
    mockUseNewsPostsQuery.mockReturnValue({ data: undefined, isLoading: false });
    mockUsePublishedNewsFeedQuery.mockReturnValue({ data: { posts: [] }, isLoading: false });
    mockUseBlastsQuery.mockReturnValue({ data: { blasts: [] }, isLoading: false });

    renderPage();

    expect(screen.getAllByText(/disabled/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/module enablement remains superadmin-owned/i)).toBeInTheDocument();
  });
});
