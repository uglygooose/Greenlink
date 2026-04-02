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
const mockUseCreateFinanceExportBatchMutation = vi.fn();
const mockUseVoidFinanceExportBatchMutation = vi.fn();
const mockDownloadFinanceExportBatch = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceAccountsQuery: (args: unknown) => mockUseFinanceAccountsQuery(args),
  useFinanceJournalQuery: (args: unknown) => mockUseFinanceJournalQuery(args),
  useFinanceExportBatchesQuery: (args: unknown) => mockUseFinanceExportBatchesQuery(args),
  useFinanceExportBatchDetailQuery: (args: unknown) => mockUseFinanceExportBatchDetailQuery(args),
  useCreateFinanceExportBatchMutation: () => mockUseCreateFinanceExportBatchMutation(),
  useVoidFinanceExportBatchMutation: () => mockUseVoidFinanceExportBatchMutation(),
  downloadFinanceExportBatch: (args: unknown) => mockDownloadFinanceExportBatch(args),
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
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={["/admin/finance"]}
    >
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
        batches: [
          {
            ...buildBatchDetail(),
            rows: undefined,
          },
        ],
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

    mockUseCreateFinanceExportBatchMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        created: true,
        batch: buildBatchDetail(),
      }),
      isPending: false,
    });

    mockUseVoidFinanceExportBatchMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        void_applied: true,
        batch: { ...buildBatchDetail(), status: "void" },
      }),
      isPending: false,
    });

    mockDownloadFinanceExportBatch.mockResolvedValue("greenlink-export.csv");
  });

  test("generates a finance export batch and opens the preview drawer", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      created: true,
      batch: buildBatchDetail(),
    });
    mockUseCreateFinanceExportBatchMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

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

    expect(
      await screen.findByText(/Export batch generated for .*Apr 2026 to .*Apr 2026\./i),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Batch Preview", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("greenlink-journal_basic-2026-04-01-to-2026-04-02.csv")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download csv/i })).toBeInTheDocument();
  });

  test("shows the idempotent reopen notice when the backend returns an existing batch", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      created: false,
      batch: buildBatchDetail(),
    });
    mockUseCreateFinanceExportBatchMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /generate batch/i }));

    expect(
      await screen.findByText(/Existing export batch reopened for .*Apr 2026 to .*Apr 2026\./i),
    ).toBeInTheDocument();
  });

  test("only shows the download control after batch detail is loaded", async () => {
    renderPage();

    expect(screen.queryByRole("button", { name: /download csv/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /01 apr 2026 to 02 apr 2026/i }));

    expect(await screen.findByRole("button", { name: /download csv/i })).toBeInTheDocument();
  });
});
