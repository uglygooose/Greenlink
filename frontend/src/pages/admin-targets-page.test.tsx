import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminTargetsPage } from "./admin-targets-page";
import type { ClubTarget, ClubTargetUpsertInput } from "../types/targets";

const mockUseSession = vi.fn();
const mockUseTargetMetricCatalogQuery = vi.fn();
const mockUseClubTargetsQuery = vi.fn();
const mockUseCreateClubTargetMutation = vi.fn();
const mockUseUpdateClubTargetMutation = vi.fn();
const mockUseArchiveClubTargetMutation = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/targets/hooks", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const actual = await vi.importActual<typeof import("../features/targets/hooks")>("../features/targets/hooks");
  return {
    ...actual,
    useClubTargetCrudController: ({
      defaultForm,
      mapTargetToForm,
    }: {
      defaultForm: () => ClubTargetUpsertInput;
      mapTargetToForm: (target: ClubTarget) => ClubTargetUpsertInput;
    }) => {
      const catalogQuery = mockUseTargetMetricCatalogQuery();
      const targetsQuery = mockUseClubTargetsQuery();
      const createTargetMutation = mockUseCreateClubTargetMutation();
      const updateTargetMutation = mockUseUpdateClubTargetMutation();
      const archiveTargetMutation = mockUseArchiveClubTargetMutation();
      const [editingTargetId, setEditingTargetId] = React.useState<string | null>(null);
      const [form, setForm] = React.useState<ClubTargetUpsertInput>(() => defaultForm());
      const [notice, setNotice] = React.useState<string | null>(null);
      const selectedDomain =
        catalogQuery.data?.items.find((item: { domain_key: string }) => item.domain_key === form.domain_key) ?? null;
      const availableMetrics = selectedDomain?.metrics ?? [];

      React.useEffect(() => {
        if (selectedDomain && !availableMetrics.some((item: { metric_key: string }) => item.metric_key === form.metric_key)) {
          setForm((current) => ({ ...current, metric_key: availableMetrics[0]?.metric_key ?? "" }));
        }
      }, [availableMetrics, form.metric_key, selectedDomain]);

      React.useEffect(() => {
        if (catalogQuery.data?.items.length && !form.metric_key) {
          const firstDomain = catalogQuery.data.items[0];
          setForm((current) => ({
            ...current,
            domain_key: firstDomain.domain_key,
            metric_key: firstDomain.metrics[0]?.metric_key ?? "",
          }));
        }
      }, [catalogQuery.data, form.metric_key]);

      function resetForm(): void {
        setEditingTargetId(null);
        setForm(defaultForm());
      }

      return {
        availableMetrics,
        beginCreate: () => {
          resetForm();
          setNotice(null);
        },
        beginEdit: (target: ClubTarget) => {
          setEditingTargetId(target.id);
          setForm(mapTargetToForm(target));
          setNotice(null);
        },
        catalogQuery,
        editingTargetId,
        form,
        handleArchive: async (targetId: string) => {
          setNotice(null);
          await archiveTargetMutation.mutateAsync(targetId);
          setNotice("Target archived.");
        },
        handleSubmit: async () => {
          setNotice(null);
          if (editingTargetId) {
            await updateTargetMutation.mutateAsync({ targetId: editingTargetId, payload: form });
            setNotice("Target updated.");
          } else {
            await createTargetMutation.mutateAsync(form);
            setNotice("Target created.");
          }
          resetForm();
        },
        notice,
        resetForm,
        setForm,
        targetsQuery,
      };
    },
  };
});

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

function getDateValue(label: RegExp): string {
  return (screen.getByLabelText(label) as HTMLInputElement).value;
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

  test("yearly target creation derives a full-year payload from the selected period", async () => {
    const createMutate = vi.fn().mockResolvedValue({ id: "target-2" });
    mockUseCreateClubTargetMutation.mockReturnValue({ mutateAsync: createMutate });

    renderPage();
    fireEvent.change(screen.getByLabelText(/period/i), { target: { value: "yearly" } });
    expect(getDateValue(/start/i)).toBe("2026-01-01");
    expect(getDateValue(/end/i)).toBe("2026-12-31");
    fireEvent.change(screen.getByLabelText(/target value/i), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: /create target/i }));

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledWith({
        domain_key: "golf",
        metric_key: "rounds_booked",
        period_key: "yearly",
        period_start: "2026-01-01",
        period_end: "2026-12-31",
        target_value: 999,
      });
    });
  });

  test("weekly target creation normalizes the visible range and payload to a Monday-Sunday week", async () => {
    const createMutate = vi.fn().mockResolvedValue({ id: "target-2" });
    mockUseCreateClubTargetMutation.mockReturnValue({ mutateAsync: createMutate });

    renderPage();
    fireEvent.change(screen.getByLabelText(/period/i), { target: { value: "weekly" } });

    expect(getDateValue(/start/i)).toBe("2026-04-27");
    expect(getDateValue(/end/i)).toBe("2026-05-03");

    fireEvent.click(screen.getByRole("button", { name: /create target/i }));

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledWith({
        domain_key: "golf",
        metric_key: "rounds_booked",
        period_key: "weekly",
        period_start: "2026-04-27",
        period_end: "2026-05-03",
        target_value: 1,
      });
    });
  });

  test("monthly target date edits normalize the visible range and payload to the full month", async () => {
    const createMutate = vi.fn().mockResolvedValue({ id: "target-2" });
    mockUseCreateClubTargetMutation.mockReturnValue({ mutateAsync: createMutate });

    renderPage();
    fireEvent.change(screen.getByLabelText(/start/i), { target: { value: "2026-05-17" } });

    expect(getDateValue(/start/i)).toBe("2026-05-01");
    expect(getDateValue(/end/i)).toBe("2026-05-31");

    fireEvent.click(screen.getByRole("button", { name: /create target/i }));

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledWith({
        domain_key: "golf",
        metric_key: "rounds_booked",
        period_key: "monthly",
        period_start: "2026-05-01",
        period_end: "2026-05-31",
        target_value: 1,
      });
    });
  });

  test("renders yearly targets with the saved full-year range", () => {
    mockUseClubTargetsQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "target-yearly",
            club_id: "club-1",
            domain_key: "finance",
            domain_label: "Finance",
            metric_key: "total_revenue",
            metric_label: "Revenue",
            unit: "currency",
            period_key: "yearly",
            period_start: "2026-01-01",
            period_end: "2026-12-31",
            target_value: 180000,
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

    renderPage();

    expect(screen.getByText("Finance · yearly · 2026-01-01 to 2026-12-31")).toBeInTheDocument();
  });

  test("archived targets are removed from the active register list", () => {
    mockUseClubTargetsQuery.mockReturnValue({
      data: {
        items: [
          {
            id: "target-archived",
            club_id: "club-1",
            domain_key: "finance",
            domain_label: "Finance",
            metric_key: "total_revenue",
            metric_label: "Revenue",
            unit: "currency",
            period_key: "yearly",
            period_start: "2026-01-01",
            period_end: "2026-12-31",
            target_value: 180000,
            archived: true,
            archived_at: "2026-05-20T10:00:00Z",
            created_at: "2026-04-06T10:00:00Z",
            updated_at: "2026-05-20T10:00:00Z",
          },
        ],
        total_count: 1,
      },
      isLoading: false,
    });

    renderPage();

    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
    expect(screen.getByText(/no club targets have been defined yet/i)).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
