import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminTargetsPage } from "./admin-targets-page";

const mockUseSession = vi.fn();
const mockUseTargetMetricCatalogQuery = vi.fn();
const mockUseClubTargetsQuery = vi.fn();
const mockUseCreateClubTargetMutation = vi.fn();
const mockUseUpdateClubTargetMutation = vi.fn();
const mockUseArchiveClubTargetMutation = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/targets/hooks", () => ({
  useTargetMetricCatalogQuery: () => mockUseTargetMetricCatalogQuery(),
  useClubTargetsQuery: () => mockUseClubTargetsQuery(),
  useCreateClubTargetMutation: () => mockUseCreateClubTargetMutation(),
  useUpdateClubTargetMutation: () => mockUseUpdateClubTargetMutation(),
  useArchiveClubTargetMutation: () => mockUseArchiveClubTargetMutation(),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AdminTargetsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("AdminTargetsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: { selected_club_id: "club-1" },
    });

    mockUseTargetMetricCatalogQuery.mockReturnValue({
      data: {
        items: [
          {
            domain_key: "golf",
            domain_label: "Golf",
            metrics: [{ metric_key: "rounds_booked", label: "Rounds booked", unit: "count" }],
          },
        ],
      },
    });

    mockUseClubTargetsQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "target-1",
            club_id: "club-1",
            domain_key: "golf",
            domain_label: "Golf",
            metric_key: "rounds_booked",
            metric_label: "Rounds booked",
            unit: "count",
            period_key: "monthly",
            period_start: "2026-05-01",
            period_end: "2026-05-31",
            target_value: 240,
            archived: false,
            archived_at: null,
            created_at: "2026-04-06T10:00:00Z",
            updated_at: "2026-04-06T10:00:00Z",
          },
        ],
        total_count: 1,
      },
      isLoading: false,
    });

    mockUseCreateClubTargetMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: "target-2" }),
    });
    mockUseUpdateClubTargetMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: "target-1" }),
    });
    mockUseArchiveClubTargetMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: "target-1", archived: true }),
    });
  });

  test("creates and archives club targets from backend-driven inputs", async () => {
    const createMutate = vi.fn().mockResolvedValue({ id: "target-2" });
    const archiveMutate = vi.fn().mockResolvedValue({ id: "target-1", archived: true });
    mockUseCreateClubTargetMutation.mockReturnValue({ mutateAsync: createMutate });
    mockUseArchiveClubTargetMutation.mockReturnValue({ mutateAsync: archiveMutate });

    renderPage();
    fireEvent.change(screen.getByLabelText(/target value/i), { target: { value: "320" } });
    fireEvent.click(screen.getByRole("button", { name: /create target/i }));

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledWith({
        domain_key: "golf",
        metric_key: "rounds_booked",
        period_key: "monthly",
        period_start: "2026-05-01",
        period_end: "2026-05-31",
        target_value: 320,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /archive/i }));

    await waitFor(() => {
      expect(archiveMutate).toHaveBeenCalledWith("target-1");
    });
  });
});
