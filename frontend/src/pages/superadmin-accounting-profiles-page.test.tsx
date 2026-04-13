import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { SuperadminLayout } from "../routes/superadmin-layout";
import { SuperadminAccountingProfilesPage } from "./superadmin-accounting-profiles-page";

const mockUseSession = vi.fn();
const mockUseSuperadminClubsQuery = vi.fn();
const mockUseSuperadminAccountingProfilesQuery = vi.fn();
const mockUseSuperadminAccountingSampleLayoutQuery = vi.fn();
const mockUseCreateSuperadminAccountingProfileMutation = vi.fn();
const mockUseUpdateSuperadminAccountingProfileActiveMutation = vi.fn();
const mockUseBindSuperadminAccountingProfileMutation = vi.fn();
const mockUseParseSuperadminAccountingTemplateMutation = vi.fn();

vi.mock("../session/session-context", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("../features/superadmin/hooks", () => ({
  useSuperadminClubsQuery: (args: unknown) => mockUseSuperadminClubsQuery(args),
  useSuperadminAccountingProfilesQuery: (args: unknown) => mockUseSuperadminAccountingProfilesQuery(args),
  useSuperadminAccountingSampleLayoutQuery: (args: unknown) => mockUseSuperadminAccountingSampleLayoutQuery(args),
  useCreateSuperadminAccountingProfileMutation: () => mockUseCreateSuperadminAccountingProfileMutation(),
  useUpdateSuperadminAccountingProfileActiveMutation: () => mockUseUpdateSuperadminAccountingProfileActiveMutation(),
  useBindSuperadminAccountingProfileMutation: () => mockUseBindSuperadminAccountingProfileMutation(),
  useParseSuperadminAccountingTemplateMutation: () => mockUseParseSuperadminAccountingTemplateMutation(),
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
    <MemoryRouter initialEntries={["/superadmin/accounting-profiles"]}>
      <QueryClientProvider client={buildQueryClient()}>
        <Routes>
          <Route path="/superadmin" element={<SuperadminLayout />}>
            <Route path="accounting-profiles" element={<SuperadminAccountingProfilesPage />} />
          </Route>
        </Routes>
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

function buildProfile() {
  return {
    id: "profile-1",
    club_id: "club-1",
    club_name: "Pine Valley",
    club_slug: "pine-valley",
    code: "generic_ops",
    name: "Generic Ops",
    target_system: "generic_journal",
    is_active: true,
    mapping_config: {
      reference_prefix: "GL",
      fallback_customer_code: "UNASSIGNED",
      transaction_mappings: {
        charge: {
          debit_account_code: "1100-AR",
          credit_account_code: "4000-SALES",
          description_prefix: "Charge",
        },
        payment: {
          debit_account_code: "1000-BANK",
          credit_account_code: "1100-AR",
          description_prefix: "Payment",
        },
        adjustment: {
          debit_account_code: "9990-ADJUST",
          credit_account_code: "9990-ADJUST",
          description_prefix: "Adjustment",
        },
      },
    },
    created_by_person_id: "person-1",
    created_at: "2026-04-10T10:00:00Z",
    updated_at: "2026-04-10T10:00:00Z",
  };
}

function buildSampleLayout() {
  return {
    target_system: "generic_journal",
    file_name: "greenlink-generic_journal-sample.csv",
    headerless: false,
    delimiter: ",",
    headers: [
      "date",
      "reference",
      "description",
      "debit_account_code",
      "credit_account_code",
      "amount",
      "customer_account_code",
      "source_type",
    ],
    sample_csv:
      "date,reference,description,debit_account_code,credit_account_code,amount,customer_account_code,source_type\n2026-04-10,GL-12345,Charge Green fee,1100-AR,4000-SALES,450.00,MEM001,booking\n",
    notes: ["Generic Journal uses explicit headers in GreenLink canonical order."],
  };
}

describe("SuperadminAccountingProfilesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSession.mockReturnValue({
      accessToken: "token",
      bootstrap: {
        selected_club_id: "club-1",
        user: { display_name: "Root Admin", user_type: "superadmin" },
      },
    });

    mockUseSuperadminClubsQuery.mockReturnValue({
      data: { items: [buildClub()], total_count: 1 },
      isLoading: false,
    });

    mockUseSuperadminAccountingProfilesQuery.mockReturnValue({
      data: { profiles: [buildProfile()], total_count: 1 },
      isLoading: false,
    });

    mockUseSuperadminAccountingSampleLayoutQuery.mockReturnValue({
      data: buildSampleLayout(),
      isLoading: false,
    });

    mockUseCreateSuperadminAccountingProfileMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockUseUpdateSuperadminAccountingProfileActiveMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockUseBindSuperadminAccountingProfileMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        club: buildClub(),
        finance: { selected_accounting_profile_name: "Generic Ops" },
      }),
      isPending: false,
    });

    mockUseParseSuperadminAccountingTemplateMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        file_name: "club-template.csv",
        headers_detected: ["Date", "Reference", "Description", "Debit", "Credit", "Amount"],
        headerless: false,
        suggested_target_system: "sage_like",
        suggested_mapping: {
          date: "Date",
          reference: "Reference",
          description: "Description",
          debit_account_code: "Debit",
          credit_account_code: "Credit",
          amount: "Amount",
        },
        sample_rows: [{ values: ["2026-04-10", "GL-123", "Charge Green fee", "1100-AR", "4000-SALES", "450.00"] }],
        warnings: ["Sage-like layout detected."],
      }),
      isPending: false,
    });
  });

  test("renders the profile list and sample layout support", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Accounting Profiles", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Generic Ops")).toBeInTheDocument();
    expect(screen.getByText(/pine valley - generic_ops - generic journal/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download sample csv/i })).toBeInTheDocument();
    expect(screen.getByText(/generic journal uses explicit headers/i)).toBeInTheDocument();
  });

  test("parses a CSV template and shows grounded mapping guidance", async () => {
    renderPage();

    const file = new File(["Date,Reference,Description,Debit,Credit,Amount\n"], "club-template.csv", {
      type: "text/csv",
    });

    fireEvent.change(screen.getByLabelText(/upload csv template/i), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("club-template.csv")).toBeInTheDocument();
      expect(screen.getByText("Sage-like layout detected.")).toBeInTheDocument();
      expect(screen.getAllByText("Date").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Reference").length).toBeGreaterThan(0);
      expect(screen.getByLabelText(/target system/i)).toHaveValue("sage_like");
      expect(screen.getAllByText(/charge green fee/i).length).toBeGreaterThan(0);
    });
  });

  test("keeps the JSON template loader available as a fallback", async () => {
    renderPage();

    const templateJson = JSON.stringify({
      code: "sage_ops",
      name: "Sage Ops",
      target_system: "sage_like",
      mapping_config: {
        reference_prefix: "SAGE",
        fallback_customer_code: "FALLBACK",
        transaction_mappings: {
          charge: {
            debit_account_code: "AR100",
            credit_account_code: "REV400",
            description_prefix: "Charge",
          },
          payment: {
            debit_account_code: "BANK1",
            credit_account_code: "AR100",
            description_prefix: "Payment",
          },
          adjustment: {
            debit_account_code: "ADJ1",
            credit_account_code: "ADJ1",
            description_prefix: "Adjustment",
          },
        },
      },
    });
    const file = new File([templateJson], "template.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue(templateJson),
    });

    fireEvent.change(screen.getByLabelText(/load json template/i), { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByLabelText(/profile code/i)).toHaveValue("sage_ops");
      expect(screen.getByLabelText(/profile name/i)).toHaveValue("Sage Ops");
      expect(screen.getByLabelText(/target system/i)).toHaveValue("sage_like");
      expect(screen.getByLabelText(/reference prefix/i)).toHaveValue("SAGE");
    });
  });

  test("binds a profile to the selected club", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      club: buildClub(),
      finance: { selected_accounting_profile_name: "Generic Ops" },
    });
    mockUseBindSuperadminAccountingProfileMutation.mockReturnValue({ mutateAsync, isPending: false });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /bind profile/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        clubId: "club-1",
        payload: { profile_id: "profile-1" },
      });
    });
  });
});
