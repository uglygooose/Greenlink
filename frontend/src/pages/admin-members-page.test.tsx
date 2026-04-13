import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AdminMembersPage } from "./admin-members-page";

const mockUseSession = vi.fn();
const mockUseClubDirectoryQuery = vi.fn();
const mockUseCreateAccountCustomerMutation = vi.fn();
const mockUseCreateMembershipMutation = vi.fn();
const mockUseCreatePersonMutation = vi.fn();
const mockUseUpdateMembershipMutation = vi.fn();
const mockUseUpdatePersonMutation = vi.fn();
const mockUseFinanceAccountsQuery = vi.fn();
const mockUseFinanceOutstandingSummaryQuery = vi.fn();
const mockUseFinanceAccountLedgerQuery = vi.fn();
const mockUseReportsSummaryQuery = vi.fn();

const createPersonMutateAsync = vi.fn();
const updatePersonMutateAsync = vi.fn();
const createMembershipMutateAsync = vi.fn();
const updateMembershipMutateAsync = vi.fn();
const createAccountCustomerMutateAsync = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/people/hooks", () => ({
  useClubDirectoryQuery: () => mockUseClubDirectoryQuery(),
  useCreateAccountCustomerMutation: () => mockUseCreateAccountCustomerMutation(),
  useCreateMembershipMutation: () => mockUseCreateMembershipMutation(),
  useCreatePersonMutation: () => mockUseCreatePersonMutation(),
  useUpdateMembershipMutation: () => mockUseUpdateMembershipMutation(),
  useUpdatePersonMutation: () => mockUseUpdatePersonMutation(),
}));

vi.mock("../features/finance/hooks", () => ({
  useFinanceAccountsQuery: () => mockUseFinanceAccountsQuery(),
  useFinanceOutstandingSummaryQuery: () => mockUseFinanceOutstandingSummaryQuery(),
  useFinanceAccountLedgerQuery: () => mockUseFinanceAccountLedgerQuery(),
}));

vi.mock("../features/admin-dashboard/reports-hooks", () => ({
  useReportsSummaryQuery: () => mockUseReportsSummaryQuery(),
}));

function renderPage(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <MemoryRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      initialEntries={["/admin/members"]}
    >
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
        permissions: ["people:write", "memberships:manage", "account_customers:manage"],
        user: { display_name: "Club Admin" },
      },
    });

    mockUseClubDirectoryQuery.mockReturnValue({
      data: [
        {
          person: {
            id: "person-1",
            first_name: "Avery",
            last_name: "Green",
            full_name: "Avery Green",
            email: "avery@example.com",
            phone: "0820000001",
          },
          membership: {
            id: "membership-1",
            role: "MEMBER",
            status: "ACTIVE",
            membership_number: "M-001",
            joined_at: "2026-03-15T00:00:00Z",
          },
        },
        {
          person: {
            id: "person-2",
            first_name: "Jamie",
            last_name: "Reed",
            full_name: "Jamie Reed",
            email: "jamie@example.com",
            phone: null,
          },
          membership: {
            id: "membership-2",
            role: "CLUB_ADMIN",
            status: "ACTIVE",
            membership_number: "A-002",
            joined_at: "2025-12-01T00:00:00Z",
          },
        },
      ],
      isLoading: false,
      isError: false,
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

    mockUseReportsSummaryQuery.mockReturnValue({
      data: {
        member_breakdown: {
          total: 2,
          admin_count: 1,
          staff_count: 0,
          member_count: 1,
          admin_pct: 50,
          staff_pct: 0,
          member_pct: 50,
          no_account_count: 1,
          new_member_count: 1,
        },
        order_status_breakdown: { total: 0, collected_count: 0, by_status: [] },
        course_count: 0,
      },
      isLoading: false,
    });

    mockUseCreatePersonMutation.mockReturnValue({
      mutateAsync: createPersonMutateAsync,
      isPending: false,
    });
    mockUseUpdatePersonMutation.mockReturnValue({
      mutateAsync: updatePersonMutateAsync,
      isPending: false,
    });
    mockUseCreateMembershipMutation.mockReturnValue({
      mutateAsync: createMembershipMutateAsync,
      isPending: false,
    });
    mockUseUpdateMembershipMutation.mockReturnValue({
      mutateAsync: updateMembershipMutateAsync,
      isPending: false,
    });
    mockUseCreateAccountCustomerMutation.mockReturnValue({
      mutateAsync: createAccountCustomerMutateAsync,
      isPending: false,
    });

    createPersonMutateAsync.mockResolvedValue({ id: "person-new" });
    updatePersonMutateAsync.mockResolvedValue({});
    createMembershipMutateAsync.mockResolvedValue({});
    updateMembershipMutateAsync.mockResolvedValue({});
    createAccountCustomerMutateAsync.mockResolvedValue({});
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

  test("creates a member and optional finance account from the members workspace", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "New Member" }));

    fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Casey" } });
    fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Stone" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "casey@example.com" } });
    fireEvent.change(screen.getByLabelText("Membership Number"), { target: { value: "M-777" } });
    fireEvent.click(screen.getByLabelText("Create now"));
    fireEvent.change(screen.getByLabelText("Account Code"), { target: { value: "GL-777" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Member" }));

    await waitFor(() => {
      expect(createPersonMutateAsync).toHaveBeenCalledWith({
        first_name: "Casey",
        last_name: "Stone",
        email: "casey@example.com",
        phone: null,
      });
      expect(createMembershipMutateAsync).toHaveBeenCalledWith({
        person_id: "person-new",
        role: "MEMBER",
        status: "ACTIVE",
        joined_at: expect.any(String),
        membership_number: "M-777",
      });
      expect(createAccountCustomerMutateAsync).toHaveBeenCalledWith({
        person_id: "person-new",
        account_code: "GL-777",
        billing_email: "casey@example.com",
        billing_phone: null,
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Member created.")).toBeInTheDocument();
  });

  test("keeps the create modal open and renders the error inside the modal on create failure", async () => {
    createPersonMutateAsync.mockRejectedValueOnce(new Error("email: value is not a valid email address"));

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "New Member" }));
    fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Casey" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bad-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Member" }));

    const dialog = await screen.findByRole("dialog");
    const emailInput = within(dialog).getByLabelText("Email");

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Please correct the highlighted fields.");
    expect(emailInput).toHaveAttribute("aria-invalid", "true");
    expect(within(dialog).getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("Casey")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("bad-email")).toBeInTheDocument();
    expect(screen.queryByText("Member created.")).not.toBeInTheDocument();
    expect(createMembershipMutateAsync).not.toHaveBeenCalled();
    expect(createAccountCustomerMutateAsync).not.toHaveBeenCalled();
  });

  test("updates an existing member from the detail panel", async () => {
    renderPage();

    fireEvent.click(screen.getByText("Jamie Reed"));
    fireEvent.click(screen.getByRole("button", { name: "Edit Member" }));
    fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Reed-Smith" } });
    fireEvent.change(screen.getByLabelText("Membership Number"), { target: { value: "A-900" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Member" }));

    await waitFor(() => {
      expect(updatePersonMutateAsync).toHaveBeenCalledWith({
        personId: "person-2",
        payload: {
          first_name: "Jamie",
          last_name: "Reed-Smith",
          email: "jamie@example.com",
          phone: null,
        },
      });
      expect(updateMembershipMutateAsync).toHaveBeenCalledWith({
        membershipId: "membership-2",
        payload: {
          role: "CLUB_ADMIN",
          status: "ACTIVE",
          joined_at: expect.any(String),
          membership_number: "A-900",
        },
      });
    });
  });
});
