import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminFinancePage } from "./admin-finance-page";

const mockUseSession = vi.fn();
const mockUseFinanceAccountsQuery = vi.fn();
const mockUseFinanceJournalQuery = vi.fn();
const mockUseFinanceExportBatchesQuery = vi.fn();
const mockUseFinanceExportBatchDetailQuery = vi.fn();
const mockUseAccountingExportProfilesQuery = vi.fn();
const mockUseAccountingMappedExportPreviewQuery = vi.fn();
const mockUseCreateFinanceExportBatchMutation = vi.fn();
const mockUseVoidFinanceExportBatchMutation = vi.fn();
const mockUseCreateAccountingExportProfileMutation = vi.fn();
const mockUseUpdateAccountingExportProfileMutation = vi.fn();
const mockDownloadFinanceExportBatch = vi.fn();
const mockDownloadMappedFinanceExport = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceAccountsQuery: (args: unknown) => mockUseFinanceAccountsQuery(args),
  useFinanceJournalQuery: (args: unknown) => mockUseFinanceJournalQuery(args),
  useFinanceExportBatchesQuery: (args: unknown) => mockUseFinanceExportBatchesQuery(args),
  useFinanceExportBatchDetailQuery: (args: unknown) => mockUseFinanceExportBatchDetailQuery(args),
  useAccountingExportProfilesQuery: (args: unknown) => mockUseAccountingExportProfilesQuery(args),
  useAccountingMappedExportPreviewQuery: (args: unknown) => mockUseAccountingMappedExportPreviewQuery(args),
  useCreateFinanceExportBatchMutation: () => mockUseCreateFinanceExportBatchMutation(),
  useVoidFinanceExportBatchMutation: () => mockUseVoidFinanceExportBatchMutation(),
  useCreateAccountingExportProfileMutation: () => mockUseCreateAccountingExportProfileMutation(),
  useUpdateAccountingExportProfileMutation: () => mockUseUpdateAccountingExportProfileMutation(),
  downloadFinanceExportBatch: (args: unknown) => mockDownloadFinanceExportBatch(args),
  downloadMappedFinanceExport: (args: unknown) => mockDownloadMappedFinanceExport(args),
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
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/finance"]}>
      <QueryClientProvider client={buildQueryClient()}>
        <AdminFinancePage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function buildBatchDetail() {
  return {
    id: "batch-1",
    club_id: "club-1",
    export_profile: "journal_basic" as const,
    date_from: "2026-04-01",
    date_to: "2026-04-02",
    status: "generated" as const,
    created_by_person_id: "person-1",
    generated_at: "2026-04-02T10:00:00Z",
    file_name: "greenlink-journal_basic-2026-04-01-to-2026-04-02.csv",
    content_hash: "hash-123",
    transaction_count: 2,
    total_debits: "25.00",
    total_credits: "25.00",
    metadata_json: {
      selection_timezone: "Africa/Johannesburg",
      source_counts: { manual: 1, order: 1 },
      transaction_type_counts: { charge: 1, payment: 1 },
    },
    rows: [
      {
        entry_date: "2026-04-01",
        transaction_id: "txn-1",
        account_customer_code: "GL-001",
        transaction_type: "charge",
        source: "manual",
        reference_id: "ref-1",
        description: "Manual charge",
        amount: "-25.00",
        debit_amount: "25.00",
        credit_amount: "0.00",
      },
      {
        entry_date: "2026-04-02",
        transaction_id: "txn-2",
        account_customer_code: "GL-001",
        transaction_type: "payment",
        source: "order",
        reference_id: "ref-2",
        description: "Order settlement",
        amount: "25.00",
        debit_amount: "0.00",
        credit_amount: "25.00",
      },
    ],
  };
}

function buildAccountingProfile() {
  return {
    id: "profile-1",
    club_id: "club-1",
    code: "generic_journal_ops",
    name: "Generic Journal Ops",
    target_system: "generic_journal",
    is_active: true,
    created_by_person_id: "person-1",
    created_at: "2026-04-02T09:00:00Z",
    updated_at: "2026-04-02T09:30:00Z",
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
    source_batch_id: "batch-1",
    source_export_profile: "journal_basic" as const,
    accounting_profile_id: "profile-1",
    accounting_profile_code: "generic_journal_ops",
    accounting_profile_name: "Generic Journal Ops",
    target_system: "generic_journal",
    generated_at: "2026-04-02T10:15:00Z",
    file_name: "greenlink-generic_journal_mapped-generic_journal_ops-2026-04-01-to-2026-04-02.csv",
    content_hash: "mapped-hash-1",
    row_count: 2,
    metadata_json: { output_mode: "generic_journal_mapped" },
    rows: [
      {
        date: "2026-04-01",
        reference: "GL-ref-1",
        description: "Charge Manual charge",
        debit_account_code: "1100-AR",
        credit_account_code: "4000-SALES",
        amount: "25.00",
        customer_account_code: "GL-001",
        source_type: "manual",
      },
    ],
  };
}

describe("AdminFinancePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        selected_club: { name: "Club One" },
        user: { display_name: "Club Admin" },
      },
    });

    mockUseFinanceAccountsQuery.mockReturnValue({
      data: [
        {
          id: "account-1",
          club_id: "club-1",
          account_customer_id: "customer-1",
          account_customer: { id: "customer-1", account_code: "GL-001", person_id: "person-1" },
          status: "active",
          balance: "-25.00",
          transaction_count: 2,
        },
      ],
      isLoading: false,
      isError: false,
    });

    mockUseFinanceJournalQuery.mockReturnValue({
      data: {
        entries: [
          {
            id: "txn-1",
            club_id: "club-1",
            account_id: "account-1",
            amount: "-25.00",
            type: "charge",
            source: "manual",
            reference_id: "ref-1",
            description: "Manual charge",
            created_at: "2026-04-01T09:00:00Z",
            account_customer_code: "GL-001",
          },
        ],
        total_count: 1,
      },
      isLoading: false,
      isError: false,
    });

    mockUseFinanceExportBatchesQuery.mockReturnValue({
      data: {
        batches: [{ ...buildBatchDetail(), rows: undefined }],
        total_count: 1,
      },
      isLoading: false,
      isError: false,
    });

    mockUseFinanceExportBatchDetailQuery.mockImplementation(({ batchId }: { batchId: string | null }) => ({
      data: batchId ? buildBatchDetail() : undefined,
      isLoading: false,
      isError: false,
    }));

    mockUseAccountingExportProfilesQuery.mockReturnValue({
      data: { profiles: [buildAccountingProfile()], total_count: 1 },
      isLoading: false,
      isError: false,
    });

    mockUseAccountingMappedExportPreviewQuery.mockImplementation(({ batchId, profileId }: { batchId: string | null; profileId: string | null }) => ({
      data: batchId && profileId ? buildMappedPreview() : undefined,
      isLoading: false,
      isError: false,
    }));

    mockUseCreateFinanceExportBatchMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ created: true, batch: buildBatchDetail() }),
      isPending: false,
    });

    mockUseVoidFinanceExportBatchMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ void_applied: true, batch: { ...buildBatchDetail(), status: "void" } }),
      isPending: false,
    });

    mockUseCreateAccountingExportProfileMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(buildAccountingProfile()),
      isPending: false,
    });

    mockUseUpdateAccountingExportProfileMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(buildAccountingProfile()),
      isPending: false,
    });

    mockDownloadFinanceExportBatch.mockResolvedValue("greenlink-export.csv");
    mockDownloadMappedFinanceExport.mockResolvedValue("greenlink-mapped.csv");
  });

  test("generates a finance export batch and opens the preview drawer", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ created: true, batch: buildBatchDetail() });
    mockUseCreateFinanceExportBatchMutation.mockReturnValue({ mutateAsync, isPending: false });

    renderPage();

    fireEvent.change(screen.getByLabelText(/date from/i), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText(/date to/i), { target: { value: "2026-04-02" } });
    fireEvent.click(screen.getByRole("button", { name: /generate batch/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        export_profile: "journal_basic",
        date_from: "2026-04-01",
        date_to: "2026-04-02",
      });
    });

    expect(await screen.findByText(/Export batch generated for .*Apr 2026 to .*Apr 2026\./i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Batch Preview", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("greenlink-journal_basic-2026-04-01-to-2026-04-02.csv")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download canonical csv/i })).toBeInTheDocument();
  });

  test("shows the idempotent reopen notice when the backend returns an existing batch", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ created: false, batch: buildBatchDetail() });
    mockUseCreateFinanceExportBatchMutation.mockReturnValue({ mutateAsync, isPending: false });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /generate batch/i }));

    expect(await screen.findByText(/Existing export batch reopened for .*Apr 2026 to .*Apr 2026\./i)).toBeInTheDocument();
  });

  test("shows mapped preview once a batch and accounting profile are both selected", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /01 apr 2026 to 02 apr 2026/i }));

    expect(await screen.findByRole("heading", { name: "Mapped Export Preview", level: 3 })).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("Generic Journal Ops")).toHaveLength(2);
    expect(screen.getByText("greenlink-generic_journal_mapped-generic_journal_ops-2026-04-01-to-2026-04-02.csv")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download mapped csv/i })).toBeInTheDocument();
  });

  test("creates an accounting profile from the finance page form", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(buildAccountingProfile());
    mockUseCreateAccountingExportProfileMutation.mockReturnValue({ mutateAsync, isPending: false });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^new profile$/i }));
    fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: "sage_ops" } });
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Sage Ops" } });
    fireEvent.click(screen.getByRole("button", { name: /create profile/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
    });

    expect(await screen.findByText("Accounting profile Generic Journal Ops created.")).toBeInTheDocument();
  });
});
