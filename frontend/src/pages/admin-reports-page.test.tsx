import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminReportsPage } from "./admin-reports-page";
import type { ClubTarget, ClubTargetUpsertInput } from "../types/targets";

// --- Mocks ---

const mockUseSession = vi.fn();
const mockUseReportsSummaryQuery = vi.fn();
const mockUseFinanceRevenueSummaryQuery = vi.fn();
const mockUseFinanceOutstandingSummaryQuery = vi.fn();
const mockUseFinanceTransactionVolumeSummaryQuery = vi.fn();
const mockUseClubTargetsQuery = vi.fn();
const mockUseTargetMetricCatalogQuery = vi.fn();
const mockUseCreateClubTargetMutation = vi.fn();
const mockUseUpdateClubTargetMutation = vi.fn();
const mockUseArchiveClubTargetMutation = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/admin-dashboard/reports-hooks", () => ({
  useReportsSummaryQuery: () => mockUseReportsSummaryQuery(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceRevenueSummaryQuery: () => mockUseFinanceRevenueSummaryQuery(),
  useFinanceOutstandingSummaryQuery: () => mockUseFinanceOutstandingSummaryQuery(),
  useFinanceTransactionVolumeSummaryQuery: () => mockUseFinanceTransactionVolumeSummaryQuery(),
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

// --- Helpers ---

function buildQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderPage(): void {
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/reports"]}>
      <QueryClientProvider client={buildQueryClient()}>
        <AdminReportsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function buildTarget(overrides: Partial<{
  id: string;
  domain_key: string;
  domain_label: string;
  metric_key: string;
  metric_label: string;
  unit: string;
  period_key: string;
  period_start: string;
  period_end: string;
  target_value: number;
  archived: boolean;
}> = {}) {
  return {
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
    ...overrides,
  };
}

// --- beforeEach ---

beforeEach(() => {
  vi.clearAllMocks();

  mockUseSession.mockReturnValue({
    accessToken: "token",
    bootstrap: { selected_club_id: "club-1", user: { display_name: "Club Admin" } },
  });

  mockUseReportsSummaryQuery.mockReturnValue({
    data: {
      member_breakdown: {
        total: 3,
        admin_count: 1,
        staff_count: 1,
        member_count: 1,
        admin_pct: 33,
        staff_pct: 33,
        member_pct: 34,
      },
      order_status_breakdown: {
        total: 2,
        collected_count: 1,
        by_status: [
          { status: "placed", count: 1, pct: 50 },
          { status: "collected", count: 1, pct: 50 },
        ],
      },
      course_count: 1,
    },
    isLoading: false,
  });

  mockUseFinanceRevenueSummaryQuery.mockReturnValue({
    data: {
      timezone: "Africa/Johannesburg",
      reference_datetime: "2026-04-02T10:00:00Z",
      day: { period: "day", date_from: "2026-04-02", date_to: "2026-04-02", total_revenue: "100.00", operational_revenue: "80.00", charge_count: 1, by_source: [] },
      week: { period: "week", date_from: "2026-03-30", date_to: "2026-04-05", total_revenue: "900.00", operational_revenue: "600.00", charge_count: 8, by_source: [] },
      month: {
        period: "month",
        date_from: "2026-04-01",
        date_to: "2026-04-30",
        total_revenue: "2500.00",
        operational_revenue: "1900.00",
        charge_count: 12,
        by_source: [
          { source: "pos", total_revenue: "1700.00", charge_count: 7, revenue_share_pct: 68 },
          { source: "order", total_revenue: "800.00", charge_count: 5, revenue_share_pct: 32 },
        ],
      },
    },
    isLoading: false,
  });

  mockUseFinanceOutstandingSummaryQuery.mockReturnValue({
    data: {
      total_accounts: 8,
      accounts_in_arrears: 2,
      accounts_in_credit: 3,
      accounts_settled: 3,
      accounts_in_arrears_pct: "25",
      accounts_in_credit_pct: "37.5",
      accounts_settled_pct: "37.5",
      total_outstanding_amount: "410.00",
      unpaid_order_postings_count: 2,
      unpaid_order_postings_amount: "150.00",
      pending_items_count: 0,
    },
    isLoading: false,
  });

  mockUseFinanceTransactionVolumeSummaryQuery.mockReturnValue({
    data: {
      timezone: "Africa/Johannesburg",
      reference_datetime: "2026-04-02T10:00:00Z",
      day: { period: "day", date_from: "2026-04-02", date_to: "2026-04-02", total_transaction_count: 2, by_type: [] },
      week: { period: "week", date_from: "2026-03-30", date_to: "2026-04-05", total_transaction_count: 6, by_type: [] },
      month: {
        period: "month",
        date_from: "2026-04-01",
        date_to: "2026-04-30",
        total_transaction_count: 15,
        by_type: [
          { type: "charge", transaction_count: 12, total_absolute_amount: "2500.00", volume_share_pct: 80 },
          { type: "payment", transaction_count: 3, total_absolute_amount: "900.00", volume_share_pct: 20 },
        ],
      },
    },
    isLoading: false,
  });

  mockUseClubTargetsQuery.mockReturnValue({
    data: { items: [buildTarget()], total_count: 1 },
    isLoading: false,
  });

  mockUseTargetMetricCatalogQuery.mockReturnValue({
    data: {
      items: [
        {
          domain_key: "golf",
          domain_label: "Golf",
          metrics: [{ metric_key: "rounds_booked", label: "Rounds booked", unit: "count" }],
        },
        {
          domain_key: "members",
          domain_label: "Members",
          metrics: [{ metric_key: "active_members", label: "Active members", unit: "count" }],
        },
        {
          domain_key: "finance",
          domain_label: "Finance",
          metrics: [{ metric_key: "total_revenue", label: "Total revenue", unit: "currency" }],
        },
      ],
    },
    isLoading: false,
  });

  mockUseCreateClubTargetMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: "target-new" }),
    isPending: false,
  });

  mockUseUpdateClubTargetMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: "target-1" }),
    isPending: false,
  });

  mockUseArchiveClubTargetMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: "target-1", archived: true }),
    isPending: false,
  });
});

// --- Tests ---

describe("AdminReportsPage (Performance hub)", () => {
  // ── Legacy reporting data ──────────────────────────────

  test("renders finance KPIs from backend summaries", () => {
    renderPage();
    const normalizedText = (document.body.textContent ?? "").replace(/[^\dA-Za-z]/g, "");
    expect(normalizedText).toContain("R250000");
    expect(screen.getByText("12 charges")).toBeInTheDocument();
    expect(screen.getByText("POS")).toBeInTheDocument();
  });

  test("renders member breakdown from reports summary", () => {
    renderPage();
    expect(screen.getAllByText("Members").length).toBeGreaterThan(0);
    expect(screen.getByText("Staff")).toBeInTheDocument();
    expect(screen.getByText("Admins")).toBeInTheDocument();
    expect(screen.getByText("1 courses")).toBeInTheDocument();
  });

  test("renders order status breakdown from reports summary", () => {
    renderPage();
    expect(screen.getByText("placed")).toBeInTheDocument();
    expect(screen.getByText("collected")).toBeInTheDocument();
  });

  // ── Targets section ────────────────────────────────────

  test("renders targets section at the top with active targets", () => {
    renderPage();
    expect(screen.getByRole("region", { name: /performance targets/i })).toBeInTheDocument();
    expect(screen.getByText("Rounds booked")).toBeInTheDocument();
    expect(screen.getByText("240")).toBeInTheDocument();
  });

  test("shows empty state when no active targets defined", () => {
    mockUseClubTargetsQuery.mockReturnValue({
      data: { items: [], total_count: 0 },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText(/no active targets defined/i)).toBeInTheDocument();
  });

  test("archived targets are not shown in the active targets list", () => {
    mockUseClubTargetsQuery.mockReturnValue({
      data: {
        items: [buildTarget({ archived: true })],
        total_count: 1,
      },
      isLoading: false,
    });
    renderPage();
    expect(screen.queryByText("Rounds booked")).not.toBeInTheDocument();
    expect(screen.getByText(/no active targets defined/i)).toBeInTheDocument();
  });

  // ── Action links on off-target metrics ─────────────────

  test("golf domain target has action link to tee sheet", () => {
    renderPage();
    const link = screen.getByRole("link", { name: /take action on rounds booked/i });
    expect(link).toHaveAttribute("href", "/admin/golf/tee-sheet");
  });

  test("finance domain target has action link to close day", () => {
    mockUseClubTargetsQuery.mockReturnValue({
      data: {
        items: [buildTarget({ domain_key: "finance", domain_label: "Finance", metric_key: "revenue", metric_label: "Revenue" })],
        total_count: 1,
      },
      isLoading: false,
    });
    renderPage();
    const link = screen.getByRole("link", { name: /take action on revenue/i });
    expect(link).toHaveAttribute("href", "/admin/finance");
  });

  test("members domain target has action link to members page", () => {
    mockUseClubTargetsQuery.mockReturnValue({
      data: {
        items: [buildTarget({ domain_key: "members", domain_label: "Members", metric_key: "active_members", metric_label: "Active Members" })],
        total_count: 1,
      },
      isLoading: false,
    });
    renderPage();
    const link = screen.getByRole("link", { name: /take action on active members/i });
    expect(link).toHaveAttribute("href", "/admin/members");
  });

  test("accounts in arrears KPI shows action link to finance when arrears > 0", () => {
    renderPage();
    // accounts_in_arrears = 2 → should be a clickable link
    const link = screen.getByRole("link", { name: /resolve arrears in finance/i });
    expect(link).toHaveAttribute("href", "/admin/finance");
  });

  test("pending items signal shows close day action link when pending_items_count > 0", () => {
    mockUseFinanceOutstandingSummaryQuery.mockReturnValue({
      data: {
        total_accounts: 8,
        accounts_in_arrears: 0,
        accounts_in_credit: 4,
        accounts_settled: 4,
        accounts_in_arrears_pct: "0",
        accounts_in_credit_pct: "50",
        accounts_settled_pct: "50",
        total_outstanding_amount: "0.00",
        unpaid_order_postings_count: 0,
        unpaid_order_postings_amount: "0.00",
        pending_items_count: 3,
      },
      isLoading: false,
    });
    renderPage();
    const link = screen.getByRole("link", { name: /close day to resolve pending finance items/i });
    expect(link).toHaveAttribute("href", "/admin/finance");
  });

  // ── Target management (inline form) ───────────────────

  test("Add Target button reveals the inline create form with catalog dropdowns", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: /^create target$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add target/i }));
    // Form appears with catalog-driven dropdowns (no free-text metric input)
    expect(screen.getByRole("button", { name: /^create target$/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /domain/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /metric/i })).toBeInTheDocument();
    // Free-text metric key input must NOT exist
    expect(screen.queryByPlaceholderText(/rounds_booked/i)).not.toBeInTheDocument();
  });

  test("reports target creation keeps a yearly payload and annual label", async () => {
    const createMutate = vi.fn().mockResolvedValue({ id: "target-new" });
    mockUseCreateClubTargetMutation.mockReturnValue({
      mutateAsync: createMutate,
      isPending: false,
    });
    mockUseClubTargetsQuery.mockReturnValue({
      data: {
        items: [
          buildTarget({
            domain_key: "finance",
            domain_label: "Finance",
            metric_key: "total_revenue",
            metric_label: "Total revenue",
            period_key: "yearly",
            period_start: "2026-01-01",
            period_end: "2026-12-31",
            target_value: 250000,
            unit: "currency",
          }),
        ],
        total_count: 1,
      },
      isLoading: false,
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /add target/i }));
    fireEvent.change(screen.getByLabelText(/annual target/i), { target: { value: "300000" } });
    fireEvent.click(screen.getByRole("button", { name: /^create target$/i }));

    await waitFor(() => {
      expect(createMutate).toHaveBeenCalledWith({
        domain_key: "golf",
        metric_key: "rounds_booked",
        period_key: "yearly",
        period_start: `${new Date().getFullYear()}-01-01`,
        period_end: `${new Date().getFullYear()}-12-31`,
        target_value: 300000,
      });
    });

    expect(screen.getByText("Finance · 2026 annual")).toBeInTheDocument();
  });

  test("archive button calls mutation with the target id", async () => {
    const archiveMutate = vi.fn().mockResolvedValue({ id: "target-1", archived: true });
    mockUseArchiveClubTargetMutation.mockReturnValue({ mutateAsync: archiveMutate, isPending: false });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /archive rounds booked target/i }));

    await waitFor(() => {
      expect(archiveMutate).toHaveBeenCalledWith("target-1");
    });
  });
});
