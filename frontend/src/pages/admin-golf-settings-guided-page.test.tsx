import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminGolfSettingsGuidedPage } from "./admin-golf-settings-guided-page";

const mockUseSession = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseTeesQuery = vi.fn();
const mockUseRuleSetsQuery = vi.fn();
const mockUsePricingMatricesQuery = vi.fn();
const mockUseGolfSettingsReadinessQuery = vi.fn();

const mockCreateCourse = vi.fn();
const mockCreateTee = vi.fn();
const mockCreateRuleSet = vi.fn();
const mockCreatePricingMatrix = vi.fn();
const mockPublishGolfRuleSet = vi.fn();
const mockRollbackGolfRuleSet = vi.fn();
const mockPublishGolfPricingMatrix = vi.fn();
const mockRollbackGolfPricingMatrix = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/golf-settings/hooks", () => ({
  operationsKeys: {
    courses: (clubId: string) => ["operations", clubId, "courses"],
    tees: (clubId: string) => ["operations", clubId, "tees"],
    rules: (clubId: string) => ["operations", clubId, "rules"],
    pricing: (clubId: string) => ["operations", clubId, "pricing"],
    readiness: (clubId: string) => ["operations", clubId, "readiness"],
  },
  useCoursesQuery: () => mockUseCoursesQuery(),
  useTeesQuery: () => mockUseTeesQuery(),
  useRuleSetsQuery: () => mockUseRuleSetsQuery(),
  usePricingMatricesQuery: () => mockUsePricingMatricesQuery(),
  useGolfSettingsReadinessQuery: () => mockUseGolfSettingsReadinessQuery(),
}));

vi.mock("../api/operations", () => ({
  createCourse: (...args: unknown[]) => mockCreateCourse(...args),
  createTee: (...args: unknown[]) => mockCreateTee(...args),
  createRuleSet: (...args: unknown[]) => mockCreateRuleSet(...args),
  createPricingMatrix: (...args: unknown[]) => mockCreatePricingMatrix(...args),
  publishGolfRuleSet: (...args: unknown[]) => mockPublishGolfRuleSet(...args),
  rollbackGolfRuleSet: (...args: unknown[]) => mockRollbackGolfRuleSet(...args),
  publishGolfPricingMatrix: (...args: unknown[]) => mockPublishGolfPricingMatrix(...args),
  rollbackGolfPricingMatrix: (...args: unknown[]) => mockRollbackGolfPricingMatrix(...args),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <AdminGolfSettingsGuidedPage />
    </QueryClientProvider>,
  );
}

describe("AdminGolfSettingsGuidedPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: {
          id: "club-1",
          name: "GreenLink Development Club",
          slug: "greenlink-development-club",
          location: "Joburg",
          timezone: "Africa/Johannesburg",
          branding: { logo_object_key: null, name: "GreenLink Development Club" },
        },
        available_clubs: [{ club_id: "club-1", membership_role: "club_admin" }],
      },
    });

    mockUseCoursesQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseTeesQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseRuleSetsQuery.mockReturnValue({ data: [], isLoading: false });
    mockUsePricingMatricesQuery.mockReturnValue({ data: [], isLoading: false });
    mockUseGolfSettingsReadinessQuery.mockReturnValue({
      data: {
        courses_configured: false,
        tees_configured: false,
        rules_configured: false,
        pricing_configured: false,
        overall_ready: false,
      },
      isLoading: false,
    });

    mockCreateCourse.mockResolvedValue({});
    mockCreateTee.mockResolvedValue({});
    mockCreateRuleSet.mockResolvedValue({});
    mockCreatePricingMatrix.mockResolvedValue({});
    mockPublishGolfRuleSet.mockResolvedValue({});
    mockRollbackGolfRuleSet.mockResolvedValue({});
    mockPublishGolfPricingMatrix.mockResolvedValue({});
    mockRollbackGolfPricingMatrix.mockResolvedValue({});
  });

  test("shows backend-driven readiness and keeps later sections visibly locked", () => {
    renderPage();

    expect(screen.getByText("0 / 4 complete")).toBeInTheDocument();
    expect(screen.getByText("Not ready for live operation")).toBeInTheDocument();
    expect(screen.getByText("Complete Courses before Tees unlock.")).toBeInTheDocument();
    expect(screen.getByText("Complete Tees before Booking Rules unlock.")).toBeInTheDocument();
    expect(screen.getByText("Activate Booking Rules before Pricing unlocks.")).toBeInTheDocument();
  });

  test("renders publish and rollback controls for active and draft rule and pricing versions", async () => {
    mockUseCoursesQuery.mockReturnValue({
      data: [{ id: "course-1", name: "Championship", holes: 18 }],
      isLoading: false,
    });
    mockUseTeesQuery.mockReturnValue({
      data: [
        {
          id: "tee-1",
          course_name: "Championship",
          name: "Blue",
          slope_rating: 128,
          course_rating: "72.4",
          color_code: "#1b4d8f",
        },
      ],
      isLoading: false,
    });
    mockUseRuleSetsQuery.mockReturnValue({
      data: [
        {
          id: "rule-active",
          name: "Live Rules",
          applies_to: "member",
          status: "active",
          rules: [{ type: "advance_window", config: { days: 14 } }],
        },
        {
          id: "rule-draft",
          name: "Guest Rules",
          applies_to: "guest",
          status: "draft",
          rules: [{ type: "guest_limit", config: { count: 2 } }],
        },
      ],
      isLoading: false,
    });
    mockUsePricingMatricesQuery.mockReturnValue({
      data: [
        {
          id: "pricing-active",
          name: "Live Pricing",
          status: "active",
          rules: [{ applies_to: "member", time_band: "morning", price: "325.00", currency: "ZAR" }],
        },
        {
          id: "pricing-draft",
          name: "Guest Pricing",
          status: "draft",
          rules: [{ applies_to: "guest", time_band: "afternoon", price: "450.00", currency: "ZAR" }],
        },
      ],
      isLoading: false,
    });
    mockUseGolfSettingsReadinessQuery.mockReturnValue({
      data: {
        courses_configured: true,
        tees_configured: true,
        rules_configured: true,
        pricing_configured: true,
        overall_ready: true,
      },
      isLoading: false,
    });

    renderPage();

    expect(screen.getByText("4 / 4 complete")).toBeInTheDocument();
    expect(screen.getByText("Ready for live operation")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Draft version").length).toBeGreaterThan(0);

    const publishButtons = screen.getAllByRole("button", { name: "Publish" });
    fireEvent.click(publishButtons[0]);
    fireEvent.click(publishButtons[1]);

    const rollbackButtons = screen.getAllByRole("button", { name: "Rollback" });
    fireEvent.click(rollbackButtons[0]);
    fireEvent.click(rollbackButtons[1]);

    await waitFor(() => {
      expect(mockPublishGolfRuleSet).toHaveBeenCalledWith(
        "rule-draft",
        expect.objectContaining({ accessToken: "token", selectedClubId: "club-1" }),
      );
      expect(mockPublishGolfPricingMatrix).toHaveBeenCalledWith(
        "pricing-draft",
        expect.objectContaining({ accessToken: "token", selectedClubId: "club-1" }),
      );
      expect(mockRollbackGolfRuleSet).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: "token", selectedClubId: "club-1" }),
      );
      expect(mockRollbackGolfPricingMatrix).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: "token", selectedClubId: "club-1" }),
      );
    });
  });
});
