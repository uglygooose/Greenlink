import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminGolfSettingsPage } from "./admin-golf-settings-page";

const mockUseSession = vi.fn();
const mockUseCoursesQuery = vi.fn();
const mockUseTeesQuery = vi.fn();
const mockUseRuleSetsQuery = vi.fn();
const mockUsePricingMatricesQuery = vi.fn();
const mockUseGolfSettingsReadinessQuery = vi.fn();
const mockUseCreateCourseMutation = vi.fn();
const mockUseCreateTeeMutation = vi.fn();
const mockUseCreateRuleSetMutation = vi.fn();
const mockUseCreatePricingMatrixMutation = vi.fn();
const mockUseUpdatePricingMatrixMutation = vi.fn();
const mockUsePublishGolfRuleSetMutation = vi.fn();
const mockUseRollbackGolfRuleSetMutation = vi.fn();
const mockUsePublishGolfPricingMatrixMutation = vi.fn();
const mockUseRollbackGolfPricingMatrixMutation = vi.fn();

const createCourseMutateAsync = vi.fn();
const createTeeMutateAsync = vi.fn();
const createRuleSetMutateAsync = vi.fn();
const createPricingMatrixMutateAsync = vi.fn();
const updatePricingMatrixMutateAsync = vi.fn();
const publishRuleSetMutateAsync = vi.fn();
const rollbackRuleSetMutateAsync = vi.fn();
const publishPricingMutateAsync = vi.fn();
const rollbackPricingMutateAsync = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/golf-settings/hooks", () => ({
  useCoursesQuery: () => mockUseCoursesQuery(),
  useTeesQuery: () => mockUseTeesQuery(),
  useRuleSetsQuery: () => mockUseRuleSetsQuery(),
  usePricingMatricesQuery: () => mockUsePricingMatricesQuery(),
  useGolfSettingsReadinessQuery: () => mockUseGolfSettingsReadinessQuery(),
  useCreateCourseMutation: () => mockUseCreateCourseMutation(),
  useCreateTeeMutation: () => mockUseCreateTeeMutation(),
  useCreateRuleSetMutation: () => mockUseCreateRuleSetMutation(),
  useCreatePricingMatrixMutation: () => mockUseCreatePricingMatrixMutation(),
  useUpdatePricingMatrixMutation: () => mockUseUpdatePricingMatrixMutation(),
  usePublishGolfRuleSetMutation: () => mockUsePublishGolfRuleSetMutation(),
  useRollbackGolfRuleSetMutation: () => mockUseRollbackGolfRuleSetMutation(),
  usePublishGolfPricingMatrixMutation: () => mockUsePublishGolfPricingMatrixMutation(),
  useRollbackGolfPricingMatrixMutation: () => mockUseRollbackGolfPricingMatrixMutation(),
}));

function buildMutation(mutateAsync: ReturnType<typeof vi.fn>) {
  return {
    mutateAsync,
    isPending: false,
  };
}

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <AdminGolfSettingsPage />
    </QueryClientProvider>,
  );
}

describe("AdminGolfSettingsPage", () => {
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

    createCourseMutateAsync.mockResolvedValue({});
    createTeeMutateAsync.mockResolvedValue({});
    createRuleSetMutateAsync.mockResolvedValue({});
    createPricingMatrixMutateAsync.mockResolvedValue({});
    updatePricingMatrixMutateAsync.mockResolvedValue({});
    publishRuleSetMutateAsync.mockResolvedValue({});
    rollbackRuleSetMutateAsync.mockResolvedValue({});
    publishPricingMutateAsync.mockResolvedValue({});
    rollbackPricingMutateAsync.mockResolvedValue({});

    mockUseCreateCourseMutation.mockReturnValue(buildMutation(createCourseMutateAsync));
    mockUseCreateTeeMutation.mockReturnValue(buildMutation(createTeeMutateAsync));
    mockUseCreateRuleSetMutation.mockReturnValue(buildMutation(createRuleSetMutateAsync));
    mockUseCreatePricingMatrixMutation.mockReturnValue(buildMutation(createPricingMatrixMutateAsync));
    mockUseUpdatePricingMatrixMutation.mockReturnValue(buildMutation(updatePricingMatrixMutateAsync));
    mockUsePublishGolfRuleSetMutation.mockReturnValue(buildMutation(publishRuleSetMutateAsync));
    mockUseRollbackGolfRuleSetMutation.mockReturnValue(buildMutation(rollbackRuleSetMutateAsync));
    mockUsePublishGolfPricingMatrixMutation.mockReturnValue(buildMutation(publishPricingMutateAsync));
    mockUseRollbackGolfPricingMatrixMutation.mockReturnValue(buildMutation(rollbackPricingMutateAsync));
  });

  test("shows backend-driven readiness and keeps later sections visibly locked", () => {
    renderPage();

    expect(screen.getByText("0 / 4 complete")).toBeInTheDocument();
    expect(screen.getByText("Not ready for live operation")).toBeInTheDocument();
    expect(screen.getByText("Complete Courses before Tees unlock.")).toBeInTheDocument();
    expect(screen.getByText("Complete Tees before Booking Rules unlock.")).toBeInTheDocument();
    expect(screen.getByText("Activate Booking Rules before Pricing unlocks.")).toBeInTheDocument();
  });

  test("submits the course form through the canonical mutation hook", async () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText("Championship"), { target: { value: "  Championship  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add course" }));

    await waitFor(() => {
      expect(createCourseMutateAsync).toHaveBeenCalledWith({
        name: "Championship",
        holes: 18,
        active: true,
      });
    });
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
          rules: [{ applies_to: "member", player_type: "member_standard", holes: 18, day_type: "weekday", season: "any", time_band: "morning", price: "325.00", currency: "ZAR" }],
        },
        {
          id: "pricing-draft",
          name: "Guest Pricing",
          status: "draft",
          rules: [{ applies_to: "guest", player_type: "visitor_affiliated", holes: 18, day_type: "weekday", season: "off_peak", time_band: "any", price: "450.00", currency: "ZAR" }],
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
      expect(publishRuleSetMutateAsync).toHaveBeenCalledWith("rule-draft");
      expect(publishPricingMutateAsync).toHaveBeenCalledWith("pricing-draft");
      expect(rollbackRuleSetMutateAsync).toHaveBeenCalled();
      expect(rollbackPricingMutateAsync).toHaveBeenCalled();
    });
  });
});
