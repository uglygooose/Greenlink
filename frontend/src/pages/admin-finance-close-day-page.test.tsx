import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminFinancePage } from "./admin-finance-page";

const mockUseSession = vi.fn();
const mockUseFinanceExceptionsQuery = vi.fn();
const mockUseFinanceExportBatchesQuery = vi.fn();
const mockUseFinanceExportBatchDetailQuery = vi.fn();
const mockUseFinanceExportBatchReconciliationQuery = vi.fn();
const mockUseAccountingExportProfilesQuery = vi.fn();
const mockUseAccountingMappedExportPreviewQuery = vi.fn();
const mockUseCreateFinanceExportBatchMutation = vi.fn();
const mockUseVoidFinanceExportBatchMutation = vi.fn();
const mockUseRegenerateFinanceExportBatchMutation = vi.fn();
const mockDownloadFinanceExportBatch = vi.fn();
const mockDownloadMappedFinanceExport = vi.fn();

let latestMappedPreviewArgs: Record<string, unknown> | null = null;

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceExceptionsQuery: (args: unknown) => mockUseFinanceExceptionsQuery(args),
  useFinanceExportBatchesQuery: (args: unknown) => mockUseFinanceExportBatchesQuery(args),
  useFinanceExportBatchDetailQuery: (args: unknown) => mockUseFinanceExportBatchDetailQuery(args),
  useFinanceExportBatchReconciliationQuery: (args: unknown) => mockUseFinanceExportBatchReconciliationQuery(args),
  useAccountingExportProfilesQuery: (args: unknown) => mockUseAccountingExportProfilesQuery(args),
  useAccountingMappedExportPreviewQuery: (args: unknown) => mockUseAccountingMappedExportPreviewQuery(args),
  useCreateFinanceExportBatchMutation: () => mockUseCreateFinanceExportBatchMutation(),
  useVoidFinanceExportBatchMutation: () => mockUseVoidFinanceExportBatchMutation(),
  useRegenerateFinanceExportBatchMutation: () => mockUseRegenerateFinanceExportBatchMutation(),
  downloadFinanceExportBatch: (args: unknown) => mockDownloadFinanceExportBatch(args),
  downloadMappedFinanceExport: (args: unknown) => mockDownloadMappedFinanceExport(args),
}));

function buildQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function todayInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function renderPage(): void {
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/finance"]}>
      <QueryClientProvider client={buildQueryClient()}>
        <AdminFinancePage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function buildExceptions(
  overrides: Partial<{
    unpaid_bookings: Array<{
      id: string;
      course_id: string;
      slot_datetime: string;
      party_size: number;
      fee_label: string | null;
      primary_person_id: string | null;
    }>;
    unresolved_orders: object[];
  }> = {},
) {
  const unpaid_bookings = overrides.unpaid_bookings ?? [];
  const unresolved_orders = overrides.unresolved_orders ?? [];
  return {
    date: "2026-04-10",
    unpaid_bookings,
    unresolved_orders,
    total_exception_count: unpaid_bookings.length + unresolved_orders.length,
  };
}

function buildBatchSummary() {
  return {
    id: "batch-1",
    club_id: "club-1",
    export_profile: "journal_basic" as const,
    date_from: "2026-04-01",
    date_to: "2026-04-10",
    status: "generated" as const,
    created_by_person_id: "person-1",
    generated_at: "2026-04-10T08:00:00Z",
    file_name: "greenlink-journal_basic-2026-04-01-to-2026-04-10.csv",
    content_hash: "hash-1",
    transaction_count: 5,
    total_debits: "500.00",
    total_credits: "500.00",
    metadata_json: { export_events: [] },
  };
}

function buildBatchDetail() {
  return {
    ...buildBatchSummary(),
    rows: [],
  };
}

function buildAccountingProfile(
  id: string,
  name: string,
  isActive: boolean,
  targetSystem = "generic_journal",
) {
  return {
    id,
    club_id: "club-1",
    code: `${id}_code`,
    name,
    target_system: targetSystem,
    is_active: isActive,
    created_by_person_id: "person-1",
    created_at: "2026-04-01T09:00:00Z",
    updated_at: "2026-04-01T09:00:00Z",
    mapping_config: {
      reference_prefix: "GL",
      fallback_customer_code: "UNASSIGNED",
      transaction_mappings: {
        charge: { debit_account_code: "1100-AR", credit_account_code: "4000-SALES", description_prefix: "Charge" },
        payment: { debit_account_code: "1000-BANK", credit_account_code: "1100-AR", description_prefix: "Payment" },
        adjustment: { debit_account_code: "9990-ADJUST", credit_account_code: "9990-ADJUST", description_prefix: "Adjust" },
      },
    },
  };
}

function buildMappedPreview() {
  return {
    batch_id: "batch-1",
    profile_id: "profile-1",
    target_system: "generic_journal",
    file_name: "mapped-export.csv",
    row_count: 5,
    download_ready: true,
    validation_errors: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  latestMappedPreviewArgs = null;

  mockUseSession.mockReturnValue({
    accessToken: "token",
    bootstrap: {
      selected_club_id: "club-1",
      selected_club: {
        id: "club-1",
        name: "Test Club",
        slug: "test-club",
        location: "Durban",
        timezone: "Africa/Johannesburg",
        branding: { logo_object_key: null, name: "Test Club" },
      },
      user: { display_name: "Admin" },
    },
  });

  mockUseFinanceExceptionsQuery.mockReturnValue({
    data: buildExceptions(),
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });

  mockUseFinanceExportBatchesQuery.mockReturnValue({
    data: { batches: [buildBatchSummary()], total_count: 1 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });

  mockUseFinanceExportBatchDetailQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });

  mockUseFinanceExportBatchReconciliationQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });

  mockUseAccountingExportProfilesQuery.mockReturnValue({
    data: {
      profiles: [buildAccountingProfile("profile-1", "Generic Journal Ops", true)],
      total_count: 1,
    },
    isLoading: false,
    isError: false,
  });

  mockUseAccountingMappedExportPreviewQuery.mockImplementation((args: Record<string, unknown>) => {
    latestMappedPreviewArgs = args;
    return {
      data: buildMappedPreview(),
      isLoading: false,
      isError: false,
    };
  });

  mockUseCreateFinanceExportBatchMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ created: true, batch: buildBatchDetail() }),
    isPending: false,
  });

  mockUseVoidFinanceExportBatchMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ void_applied: true, batch: { ...buildBatchDetail(), status: "void" } }),
    isPending: false,
  });

  mockUseRegenerateFinanceExportBatchMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ superseded_batch_id: "batch-1", batch: buildBatchDetail() }),
    isPending: false,
  });

  mockDownloadFinanceExportBatch.mockResolvedValue("finance-export.csv");
  mockDownloadMappedFinanceExport.mockResolvedValue("mapped-export.csv");
});

describe("AdminFinancePage - Close Day wizard", () => {
  test("renders the wizard with Exceptions step active by default", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Resolve Exceptions", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /exceptions/i })).toBeInTheDocument();
  });

  test("shows no-exceptions clear state when no unpaid bookings or orders", () => {
    renderPage();
    expect(screen.getByText(/No unpaid bookings for this date/i)).toBeInTheDocument();
    expect(screen.getByText(/No unresolved orders for this date/i)).toBeInTheDocument();
  });

  test("shows exception count badge and blocks Next when exceptions exist", () => {
    mockUseFinanceExceptionsQuery.mockReturnValue({
      data: buildExceptions({
        unpaid_bookings: [
          {
            id: "b-1",
            course_id: "course-1",
            slot_datetime: "2026-04-10T06:00:00Z",
            party_size: 2,
            fee_label: "Member Rate",
            primary_person_id: null,
          },
        ],
        unresolved_orders: [],
      }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText(/1 exception.*must be resolved/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next: generate batch/i })).toBeDisabled();
  });

  test("unpaid booking links deep-link to tee sheet with filter=unpaid and date param", () => {
    mockUseFinanceExceptionsQuery.mockReturnValue({
      data: buildExceptions({
        unpaid_bookings: [
          {
            id: "b-1",
            course_id: "course-2",
            slot_datetime: "2026-04-10T06:00:00Z",
            party_size: 4,
            fee_label: "Weekend Rate",
            primary_person_id: null,
          },
        ],
        unresolved_orders: [],
      }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderPage();

    const link = screen.getByRole("link", { name: /resolve unpaid booking.*on tee sheet/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("/admin/golf/tee-sheet"));
    expect(link).toHaveAttribute("href", expect.stringContaining("filter=unpaid"));
    expect(link).toHaveAttribute("href", expect.stringContaining(`date=${todayInputValue()}`));
    expect(link).toHaveAttribute("href", expect.stringContaining("courseId=course-2"));
  });

  test("view-all unpaid link targets the shared course when all unpaid bookings are on one course", () => {
    mockUseFinanceExceptionsQuery.mockReturnValue({
      data: buildExceptions({
        unpaid_bookings: [
          {
            id: "b-1",
            course_id: "course-2",
            slot_datetime: "2026-04-10T06:00:00Z",
            party_size: 4,
            fee_label: "Weekend Rate",
            primary_person_id: null,
          },
          {
            id: "b-2",
            course_id: "course-2",
            slot_datetime: "2026-04-10T07:00:00Z",
            party_size: 2,
            fee_label: "Guest Rate",
            primary_person_id: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderPage();

    const link = screen.getByRole("link", { name: /view all unpaid on tee sheet/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("courseId=course-2"));
  });

  test("suppresses the shared unpaid tee-sheet link when exceptions span multiple courses", () => {
    mockUseFinanceExceptionsQuery.mockReturnValue({
      data: buildExceptions({
        unpaid_bookings: [
          {
            id: "b-1",
            course_id: "course-1",
            slot_datetime: "2026-04-10T06:00:00Z",
            party_size: 4,
            fee_label: "Weekend Rate",
            primary_person_id: null,
          },
          {
            id: "b-2",
            course_id: "course-2",
            slot_datetime: "2026-04-10T07:00:00Z",
            party_size: 2,
            fee_label: "Guest Rate",
            primary_person_id: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.queryByRole("link", { name: /view all unpaid on tee sheet/i })).not.toBeInTheDocument();
    expect(screen.getByText(/open each unpaid booking from its row/i)).toBeInTheDocument();
  });

  test("Next button is enabled and navigates to Generate Batch step when no exceptions", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /next: generate batch/i }));
    expect(screen.getByRole("heading", { name: /generate export batch/i, level: 2 })).toBeInTheDocument();
  });

  test("navigates through all steps via step nav buttons", () => {
    renderPage();

    const nav = screen.getByRole("navigation", { name: /close day steps/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^publish generate batch/i }));
    expect(screen.getByRole("heading", { name: /generate export batch/i, level: 2 })).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole("button", { name: /^balance reconcile/i }));
    expect(screen.getByRole("heading", { name: /reconcile/i, level: 2 })).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole("button", { name: /^history audit trail/i }));
    expect(screen.getByRole("heading", { name: /audit trail/i, level: 2 })).toBeInTheDocument();
  });

  test("generate batch calls mutation and advances to Reconcile step", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ created: true, batch: buildBatchDetail() });
    mockUseCreateFinanceExportBatchMutation.mockReturnValue({ mutateAsync, isPending: false });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /next: generate batch/i }));
    fireEvent.click(screen.getByRole("button", { name: /^publish generate batch$/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        export_profile: "journal_basic",
        date_from: expect.any(String),
        date_to: expect.any(String),
      });
    });

    expect(await screen.findByRole("heading", { name: /reconcile/i, level: 2 })).toBeInTheDocument();
  });

  test("reconcile step shows drift state and regenerate button when batch has drift", () => {
    mockUseFinanceExportBatchDetailQuery.mockReturnValue({
      data: buildBatchDetail(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseFinanceExportBatchReconciliationQuery.mockReturnValue({
      data: {
        batch_id: "batch-1",
        batch_status: "generated" as const,
        reconciled_at: "2026-04-10T09:00:00Z",
        matches_live_state: false,
        persisted_content_hash: "hash-old",
        current_content_hash: "hash-new",
        persisted_transaction_count: 5,
        current_transaction_count: 6,
        missing_transaction_count: 0,
        new_transaction_count: 1,
        missing_transactions: [],
        new_transactions: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /reconcile/i }));

    expect(screen.getByText(/drift detected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /regenerate batch/i })).toBeInTheDocument();
  });

  test("audit trail shows batch history and clicking a batch navigates to reconcile", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /audit trail/i }));

    expect(screen.getByRole("heading", { name: /audit trail/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/1 Apr 2026 to 10 Apr 2026/i)).toBeInTheDocument();
  });

  test("auto-selects the first active accounting profile for export", async () => {
    mockUseFinanceExportBatchDetailQuery.mockReturnValue({
      data: buildBatchDetail(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseAccountingExportProfilesQuery.mockReturnValue({
      data: {
        profiles: [
          buildAccountingProfile("profile-1", "Generic Journal Ops", true),
          buildAccountingProfile("profile-2", "Secondary Ledger", false, "xero"),
        ],
        total_count: 2,
      },
      isLoading: false,
      isError: false,
    });

    renderPage();
    const nav = screen.getByRole("navigation", { name: /close day steps/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^upload_file export/i }));

    const select = await screen.findByRole("combobox", { name: /select accounting profile/i });
    await waitFor(() => {
      expect(select).toHaveValue("profile-1");
      expect(latestMappedPreviewArgs).toMatchObject({ batchId: null, profileId: "profile-1" });
    });
    expect(screen.getAllByText("Generic Journal Ops").length).toBeGreaterThan(0);
  });

  test("does not reset the selected accounting profile after manual change", async () => {
    mockUseFinanceExportBatchDetailQuery.mockReturnValue({
      data: buildBatchDetail(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseAccountingExportProfilesQuery.mockReturnValue({
      data: {
        profiles: [
          buildAccountingProfile("profile-1", "Generic Journal Ops", true),
          buildAccountingProfile("profile-2", "Secondary Ledger", false, "xero"),
        ],
        total_count: 2,
      },
      isLoading: false,
      isError: false,
    });

    renderPage();
    const nav = screen.getByRole("navigation", { name: /close day steps/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^upload_file export/i }));

    const select = await screen.findByRole("combobox", { name: /select accounting profile/i });
    await waitFor(() => expect(select).toHaveValue("profile-1"));

    fireEvent.change(select, { target: { value: "profile-2" } });
    await waitFor(() => expect(select).toHaveValue("profile-2"));

    fireEvent.click(screen.getByRole("button", { name: /next: audit trail/i }));
    fireEvent.click(within(nav).getByRole("button", { name: /^upload_file export/i }));

    expect(await screen.findByRole("combobox", { name: /select accounting profile/i })).toHaveValue("profile-2");
    expect(screen.getAllByText("Secondary Ledger").length).toBeGreaterThan(0);
  });

  test("preview and export use the same selected accounting profile", async () => {
    mockUseFinanceExportBatchDetailQuery.mockReturnValue({
      data: buildBatchDetail(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseAccountingExportProfilesQuery.mockReturnValue({
      data: {
        profiles: [
          buildAccountingProfile("profile-1", "Generic Journal Ops", true),
          buildAccountingProfile("profile-2", "Secondary Ledger", false, "xero"),
        ],
        total_count: 2,
      },
      isLoading: false,
      isError: false,
    });
    mockUseAccountingMappedExportPreviewQuery.mockImplementation((args: Record<string, unknown>) => {
      latestMappedPreviewArgs = args;
      return {
        data: { ...buildMappedPreview(), profile_id: String(args.profileId ?? "profile-1"), target_system: "xero" },
        isLoading: false,
        isError: false,
      };
    });

    renderPage();
    const nav = screen.getByRole("navigation", { name: /close day steps/i });
    fireEvent.click(within(nav).getByRole("button", { name: /^upload_file export/i }));

    const select = await screen.findByRole("combobox", { name: /select accounting profile/i });
    await waitFor(() => expect(select).toHaveValue("profile-1"));

    fireEvent.change(select, { target: { value: "profile-2" } });

    await waitFor(() => {
      expect(latestMappedPreviewArgs).toMatchObject({ profileId: "profile-2" });
    });

    fireEvent.click(screen.getByRole("button", { name: /export mapped csv/i }));

    await waitFor(() => {
      expect(mockDownloadMappedFinanceExport).toHaveBeenCalledWith({
        accessToken: "token",
        selectedClubId: "club-1",
        batchId: "batch-1",
        profileId: "profile-2",
      });
    });
  });
});
