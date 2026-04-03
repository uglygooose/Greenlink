import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminMembersPage } from "./admin-members-page";

const mockUseSession = vi.fn();
const mockUseClubDirectoryQuery = vi.fn();
const mockUseFinanceAccountsQuery = vi.fn();
const mockUseFinanceOutstandingSummaryQuery = vi.fn();
const mockUseFinanceAccountLedgerQuery = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/people/hooks", () => ({
  useClubDirectoryQuery: () => mockUseClubDirectoryQuery(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceAccountsQuery: () => mockUseFinanceAccountsQuery(),
  useFinanceOutstandingSummaryQuery: () => mockUseFinanceOutstandingSummaryQuery(),
  useFinanceAccountLedgerQuery: () => mockUseFinanceAccountLedgerQuery(),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }} initialEntries={["/admin/members"]}>
      <QueryClientProvider client={queryClient}>
        <AdminMembersPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("AdminMembersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        user: { display_name: "Club Admin" },
      },
    });

    mockUseClubDirectoryQuery.mockReturnValue({
      data: [
        {
          person: { id: "person-1", full_name: "Avery Green", email: "avery@example.com" },
          membership: { role: "MEMBER", status: "ACTIVE", membership_number: "M-001", joined_at: "2026-03-15T00:00:00Z" },
        },
        {
          person: { id: "person-2", full_name: "Jamie Reed", email: "jamie@example.com" },
          membership: { role: "CLUB_ADMIN", status: "ACTIVE", membership_number: "A-002", joined_at: "2025-12-01T00:00:00Z" },
        },
      ],
      isLoading: false,
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
    });

    mockUseFinanceOutstandingSummaryQuery.mockReturnValue({
      data: {
        total_accounts: 8,
        accounts_in_arrears: 2,
        accounts_in_credit: 3,
        accounts_settled: 3,
        total_outstanding_amount: "410.00",
        unpaid_order_postings_count: 2,
        unpaid_order_postings_amount: "150.00",
        pending_items_count: 4,
      },
      isLoading: false,
    });

    mockUseFinanceAccountLedgerQuery.mockReturnValue({
      data: null,
      isLoading: false,
    });
  });

  test("renders member finance KPIs from the outstanding summary instead of account aggregation", () => {
    renderPage();
    const normalizedText = (document.body.textContent ?? "").replace(/[^\dA-Za-z]/g, "");

    expect(screen.getByText("Finance Accounts")).toBeInTheDocument();
    expect(normalizedText).toContain("8backendsummary");
    expect(normalizedText).toContain("R41000");
    expect(screen.getByText("2 accounts")).toBeInTheDocument();
    expect(screen.queryByText("R25.00")).not.toBeInTheDocument();
  });
});
