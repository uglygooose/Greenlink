import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SuperadminClubsPage } from "./superadmin-clubs-page";

const mockUseSession = vi.fn();
const mockUseSuperadminClubsQuery = vi.fn();
const mockUseSuperadminClubOnboardingQuery = vi.fn();
const mockUseSuperadminAssignmentCandidatesQuery = vi.fn();
const mockUseCreateSuperadminClubMutation = vi.fn();
const mockUseUpdateSuperadminClubOnboardingMutation = vi.fn();
const mockUseAssignSuperadminClubUserMutation = vi.fn();
const mockUseRuleSetsQuery = vi.fn();
const mockUsePricingMatricesQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/superadmin/hooks", () => ({
  useSuperadminClubsQuery: (args: unknown) => mockUseSuperadminClubsQuery(args),
  useSuperadminClubOnboardingQuery: (args: unknown) => mockUseSuperadminClubOnboardingQuery(args),
  useSuperadminAssignmentCandidatesQuery: (args: unknown) => mockUseSuperadminAssignmentCandidatesQuery(args),
  useCreateSuperadminClubMutation: () => mockUseCreateSuperadminClubMutation(),
  useUpdateSuperadminClubOnboardingMutation: () => mockUseUpdateSuperadminClubOnboardingMutation(),
  useAssignSuperadminClubUserMutation: () => mockUseAssignSuperadminClubUserMutation(),
}));

vi.mock("../features/golf-settings/hooks", () => ({
  useRuleSetsQuery: (args: unknown) => mockUseRuleSetsQuery(args),
  usePricingMatricesQuery: (args: unknown) => mockUsePricingMatricesQuery(args),
}));

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={["/superadmin/clubs"]}>
      <QueryClientProvider client={buildQueryClient()}>
        <SuperadminClubsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function buildClub() {
  return {
    id: "club-1",
    name: "Pine Valley",
    slug: "pine-valley",
    location: "Clementon, NJ",
    timezone: "America/New_York",
    active: true,
    onboarding_state: "setup_in_progress" as const,
    onboarding_current_step: "finance" as const,
    registry_status: "onboarding" as const,
    finance_ready: false,
    finance_profile_count: 1,
    active_assignment_count: 1,
    created_at: "2026-04-02T10:00:00Z",
    updated_at: "2026-04-02T10:00:00Z",
  };
}

function buildOnboardingDetail() {
  return {
    club: buildClub(),
    progress_percent: 38,
    steps: [
      { key: "basic_info" as const, label: "Basic Info", status: "complete" as const, ready: true },
      { key: "finance" as const, label: "Finance", status: "current" as const, ready: false },
      { key: "rules" as const, label: "Rules", status: "upcoming" as const, ready: false },
      { key: "modules" as const, label: "Modules", status: "upcoming" as const, ready: false },
    ],
    finance: {
      selected_accounting_profile_id: null,
      selected_accounting_profile_name: null,
      profile_count: 1,
      active_profile_count: 1,
      setup_complete: false,
      mapping_ready: true,
      profiles: [
        { id: "profile-1", code: "generic_ops", name: "Generic Ops", target_system: "generic_journal", is_active: true },
      ],
    },
    rules: {
      rule_set_count: 0,
      pricing_matrix_count: 0,
      setup_complete: false,
    },
    modules: {
      enabled_module_keys: ["golf"],
      setup_complete: true,
    },
    assignments: [
      {
        membership_id: "membership-1",
        user_id: "user-2",
        person_id: "person-2",
        display_name: "Club Ops",
        email: "ops@example.com",
        role: "club_admin" as const,
        status: "active" as const,
        is_primary: true,
      },
    ],
  };
}

describe("SuperadminClubsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        user: { display_name: "Root Admin", user_type: "superadmin" },
      },
      setSelectedClub: vi.fn().mockResolvedValue(undefined),
    });

    mockUseSuperadminClubsQuery.mockReturnValue({
      data: { items: [buildClub()], total_count: 1 },
      isLoading: false,
    });

    mockUseSuperadminClubOnboardingQuery.mockReturnValue({
      data: buildOnboardingDetail(),
    });

    mockUseSuperadminAssignmentCandidatesQuery.mockReturnValue({
      data: {
        items: [{ user_id: "user-3", person_id: "person-3", display_name: "Shift Lead", email: "shift@example.com" }],
        total_count: 1,
      },
      isLoading: false,
    });

    mockUseCreateSuperadminClubMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(buildClub()),
      isPending: false,
    });

    mockUseUpdateSuperadminClubOnboardingMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(buildOnboardingDetail()),
      isPending: false,
    });

    mockUseAssignSuperadminClubUserMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ status: "active" }),
      isPending: false,
    });

    mockUseRuleSetsQuery.mockReturnValue({
      data: [{ id: "rules-1", name: "Member Base", applies_to: "member", priority: 10, active: true, rules: [{}, {}] }],
      isLoading: false,
    });

    mockUsePricingMatricesQuery.mockReturnValue({
      data: [{ id: "pricing-1", name: "Standard", active: true, rules: [{}, {}] }],
      isLoading: false,
    });
  });

  test("renders the selected club onboarding workspace", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Pine Valley", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Finance", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("Generic Ops (generic journal)")).toBeInTheDocument();
  });

  test("creates a club from the onboarding drawer", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(buildClub());
    mockUseCreateSuperadminClubMutation.mockReturnValue({ mutateAsync, isPending: false });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /add new club/i }));
    fireEvent.change(screen.getByLabelText(/create club name/i), { target: { value: "Royal Cape" } });
    fireEvent.change(screen.getByLabelText(/create club location/i), { target: { value: "Cape Town" } });
    fireEvent.change(screen.getByLabelText(/create club timezone/i), { target: { value: "Africa/Johannesburg" } });
    fireEvent.click(screen.getByRole("button", { name: /^create club$/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        name: "Royal Cape",
        location: "Cape Town",
        timezone: "Africa/Johannesburg",
      });
    });
  });

  test("assigns a searched user as staff", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ status: "active" });
    mockUseAssignSuperadminClubUserMutation.mockReturnValue({ mutateAsync, isPending: false });

    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/search linked users/i), { target: { value: "shift" } });
    fireEvent.click(await screen.findByRole("button", { name: /assign staff/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        clubId: "club-1",
        payload: { person_id: "person-3", role: "club_staff" },
      });
    });
  });

  test("persists module toggles through the onboarding update flow", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      ...buildOnboardingDetail(),
      club: { ...buildClub(), onboarding_current_step: "modules" },
      modules: {
        enabled_module_keys: ["communications", "finance"],
        setup_complete: true,
      },
    });
    mockUseUpdateSuperadminClubOnboardingMutation.mockReturnValue({ mutateAsync, isPending: false });
    mockUseSuperadminClubOnboardingQuery.mockReturnValue({
      data: {
        ...buildOnboardingDetail(),
        club: { ...buildClub(), onboarding_current_step: "modules" },
      },
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /4\. modules/i }));
    fireEvent.click(screen.getByRole("button", { name: /communications/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save draft$/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        clubId: "club-1",
        payload: {
          onboarding_current_step: "modules",
          enabled_module_keys: ["communications", "golf"],
        },
      });
    });
  });
});
