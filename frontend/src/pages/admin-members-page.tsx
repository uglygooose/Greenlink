import { useState } from "react";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import {
  useFinanceAccountLedgerQuery,
  useFinanceAccountsQuery,
  useFinanceOutstandingSummaryQuery,
} from "../features/finance/hooks";
import {
  useClubDirectoryQuery,
  useCreateAccountCustomerMutation,
  useCreateMembershipMutation,
  useCreatePersonMutation,
  useUpdateMembershipMutation,
  useUpdatePersonMutation,
} from "../features/people/hooks";
import { useReportsSummaryQuery } from "../features/admin-dashboard/reports-hooks";
import { useSession } from "../session/session-context";
import type { FinanceAccountSummary } from "../types/finance";
import type {
  ClubMembershipRole,
  ClubMembershipStatus,
  ClubPersonEntry,
} from "../types/people";

function initials(name: string | undefined): string {
  return (
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "GL"
  );
}

function roleChipClass(role: ClubMembershipRole): string {
  switch (role) {
    case "CLUB_ADMIN":
      return "bg-primary-container text-on-primary-container";
    case "CLUB_STAFF":
      return "bg-secondary-container text-on-secondary-container";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function roleLabel(role: ClubMembershipRole): string {
  switch (role) {
    case "CLUB_ADMIN":
      return "Admin";
    case "CLUB_STAFF":
      return "Staff";
    default:
      return "Member";
  }
}

function statusDot(status: ClubMembershipStatus): string {
  return status === "ACTIVE" ? "bg-emerald-400" : "bg-slate-300";
}

function formatAmount(amount: string): string {
  const n = parseFloat(amount);
  const abs = Math.abs(n).toFixed(2);
  return n < 0 ? `-R${abs}` : `R${abs}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function txTypeClass(type: string): string {
  switch (type) {
    case "charge":
      return "bg-error-container text-on-error-container";
    case "payment":
      return "bg-secondary-container text-on-secondary-container";
    case "refund":
      return "bg-primary-container text-on-primary-container";
    default:
      return "border border-outline-variant text-slate-600";
  }
}

function asMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "Request failed.";
}

const MEMBER_ERROR_FIELD_MAP: Record<string, MemberFormField> = {
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  billing_email: "email",
  phone: "phone",
  billing_phone: "phone",
  role: "role",
  status: "status",
  membership_number: "membershipNumber",
  joined_at: "joinedDate",
  account_code: "accountCode",
};

function normalizeOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function dateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

function joinedAtPayload(date: string): string | null {
  return date ? `${date}T00:00:00Z` : null;
}

type NoticeTone = "error" | "success";
type EditorMode = "create" | "edit";
type MemberFormField = keyof MemberFormValues;
type MemberFieldErrors = Partial<Record<MemberFormField, string>>;

interface MemberFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: ClubMembershipRole;
  status: ClubMembershipStatus;
  membershipNumber: string;
  joinedDate: string;
  createFinanceAccount: boolean;
  accountCode: string;
}

interface MemberEditorState {
  mode: EditorMode;
  entry: ClubPersonEntry | null;
  account: FinanceAccountSummary | null;
  defaults: MemberFormValues;
}

interface MemberWorkspaceSelection {
  selectedMember: ClubPersonEntry | null;
  selectedAccount: FinanceAccountSummary | null;
}

const ROLE_OPTIONS: Array<{ label: string; value: ClubMembershipRole }> = [
  { label: "Member", value: "MEMBER" },
  { label: "Staff", value: "CLUB_STAFF" },
  { label: "Admin", value: "CLUB_ADMIN" },
];

const STATUS_OPTIONS: Array<{ label: string; value: ClubMembershipStatus }> = [
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
];

function defaultMemberFormValues(): MemberFormValues {
  return {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "MEMBER",
    status: "ACTIVE",
    membershipNumber: "",
    joinedDate: dateInputValue(new Date().toISOString()),
    createFinanceAccount: false,
    accountCode: "",
  };
}

function memberFormValues(
  entry: ClubPersonEntry | null,
  forceAccountCreation = false,
): MemberFormValues {
  if (!entry) {
    return {
      ...defaultMemberFormValues(),
      createFinanceAccount: forceAccountCreation,
    };
  }

  return {
    firstName: entry.person.first_name ?? "",
    lastName: entry.person.last_name ?? "",
    email: entry.person.email ?? "",
    phone: entry.person.phone ?? "",
    role: entry.membership.role,
    status: entry.membership.status,
    membershipNumber: entry.membership.membership_number ?? "",
    joinedDate: dateInputValue(entry.membership.joined_at),
    createFinanceAccount: forceAccountCreation,
    accountCode: "",
  };
}

function buildMemberEditorState(
  mode: EditorMode,
  entry: ClubPersonEntry | null,
  account: FinanceAccountSummary | null,
  forceAccountCreation = false,
): MemberEditorState {
  return {
    mode,
    entry,
    account,
    defaults: memberFormValues(entry, forceAccountCreation),
  };
}

function noticeClassName(tone: NoticeTone): string {
  return tone === "error"
    ? "rounded-xl bg-error-container/60 px-4 py-2 text-sm font-semibold text-on-error-container"
    : "rounded-xl bg-primary-container/50 px-4 py-2 text-sm font-semibold text-on-primary-container";
}

function memberFieldClassName(hasError: boolean): string {
  return `w-full rounded-xl border px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 ${
    hasError
      ? "border-error bg-error-container/10 focus:border-error focus:ring-error/20"
      : "border-slate-200 focus:border-primary focus:ring-primary/20"
  }`;
}

function simplifyMemberFieldError(field: MemberFormField, message: string): string {
  const normalized = message.trim();
  if (/field required|required/i.test(normalized)) {
    switch (field) {
      case "firstName":
        return "Enter a first name.";
      case "lastName":
        return "Enter a last name.";
      case "email":
        return "Enter an email address.";
      case "phone":
        return "Enter a phone number.";
      case "membershipNumber":
        return "Enter a membership number.";
      case "joinedDate":
        return "Select a joined date.";
      case "accountCode":
        return "Enter an account code.";
      default:
        return "This field is required.";
    }
  }

  if (field === "email" && /valid email/i.test(normalized)) {
    return "Enter a valid email address.";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function parseMemberEditorError(error: unknown): {
  bannerMessage: string;
  fieldErrors: MemberFieldErrors;
} {
  const message = asMessage(error);
  const [fieldSegment, ...detailParts] = message.split(":");
  if (detailParts.length === 0) {
    return { bannerMessage: message, fieldErrors: {} };
  }

  const mappedField = MEMBER_ERROR_FIELD_MAP[fieldSegment.trim().toLowerCase()];
  if (!mappedField) {
    return { bannerMessage: message, fieldErrors: {} };
  }

  const detail = detailParts.join(":").trim() || "Invalid value.";
  return {
    bannerMessage: "Please correct the highlighted fields.",
    fieldErrors: {
      [mappedField]: simplifyMemberFieldError(mappedField, detail),
    },
  };
}

function canSubmitMemberForm(values: MemberFormValues, canManageAccounts: boolean): boolean {
  if (!values.firstName.trim() || !values.joinedDate) {
    return false;
  }
  if (values.createFinanceAccount && canManageAccounts && !values.accountCode.trim()) {
    return false;
  }
  return true;
}

function buildAccountByPersonId(
  accounts: FinanceAccountSummary[],
): Map<string, FinanceAccountSummary> {
  const accountByPersonId = new Map<string, FinanceAccountSummary>();
  for (const account of accounts) {
    accountByPersonId.set(account.account_customer.person_id, account);
  }
  return accountByPersonId;
}

function resolveMemberSelection(
  members: ClubPersonEntry[],
  accountByPersonId: Map<string, FinanceAccountSummary>,
  selectedPersonId: string | null,
): MemberWorkspaceSelection {
  const selectedMember = members.find((member) => member.person.id === selectedPersonId) ?? null;
  const selectedAccount = selectedPersonId ? accountByPersonId.get(selectedPersonId) ?? null : null;
  return { selectedMember, selectedAccount };
}

function matchesMemberSearch(
  entry: ClubPersonEntry,
  searchValue: string,
  accountByPersonId: Map<string, FinanceAccountSummary>,
): boolean {
  const accountCode = accountByPersonId.get(entry.person.id)?.account_customer.account_code ?? "";
  return (
    entry.person.full_name.toLowerCase().includes(searchValue) ||
    entry.person.email?.toLowerCase().includes(searchValue) ||
    entry.membership.membership_number?.toLowerCase().includes(searchValue) ||
    accountCode.toLowerCase().includes(searchValue)
  );
}

function filterMembers(
  members: ClubPersonEntry[],
  searchValue: string,
  accountByPersonId: Map<string, FinanceAccountSummary>,
): ClubPersonEntry[] {
  if (!searchValue) {
    return members;
  }
  return members.filter((entry) => matchesMemberSearch(entry, searchValue, accountByPersonId));
}

function buildPersonPayload(values: MemberFormValues) {
  return {
    first_name: values.firstName.trim(),
    last_name: values.lastName.trim(),
    email: normalizeOptional(values.email),
    phone: normalizeOptional(values.phone),
  };
}

function buildMembershipPayload(values: MemberFormValues) {
  return {
    role: values.role,
    status: values.status,
    joined_at: joinedAtPayload(values.joinedDate),
    membership_number: normalizeOptional(values.membershipNumber),
  };
}

function buildAccountCustomerPayload(personId: string, values: MemberFormValues) {
  return {
    person_id: personId,
    account_code: values.accountCode.trim(),
    billing_email: normalizeOptional(values.email),
    billing_phone: normalizeOptional(values.phone),
  };
}

function updateSuccessMessage(
  editorState: MemberEditorState,
  values: MemberFormValues,
  canManageAccounts: boolean,
): string {
  return !editorState.account && values.createFinanceAccount && canManageAccounts
    ? "Member updated and finance account linked."
    : "Member updated.";
}

interface MemberRowProps {
  entry: ClubPersonEntry;
  account: FinanceAccountSummary | undefined;
  isSelected: boolean;
  onSelect: () => void;
}

function MemberRow({ entry, account, isSelected, onSelect }: MemberRowProps): JSX.Element {
  const { person, membership } = entry;
  const balance = account ? parseFloat(account.balance) : null;

  return (
    <tr
      className={`cursor-pointer transition-colors hover:bg-surface-container-low ${isSelected ? "bg-primary-container/20" : ""}`}
      onClick={onSelect}
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-container text-sm font-bold text-on-primary-container">
            {initials(person.full_name)}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-on-surface">{person.full_name}</span>
            <span className="text-[11px] text-slate-400">{person.email ?? "—"}</span>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <div className={`h-1.5 w-1.5 rounded-full ${statusDot(membership.status)}`} />
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${roleChipClass(membership.role)}`}>
            {roleLabel(membership.role)}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 text-xs text-slate-500">
        {membership.membership_number ?? "—"}
      </td>
      <td className="px-6 py-4">
        {account ? (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
            {account.account_customer.account_code}
          </span>
        ) : (
          <span className="text-xs text-slate-300">No account</span>
        )}
      </td>
      <td className="px-6 py-4 text-sm font-bold">
        {balance !== null ? (
          <span className={balance < 0 ? "text-error" : "text-on-surface"}>
            {formatAmount(account!.balance)}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      <td className="px-6 py-4 text-right">
        <MaterialSymbol className={`transition-colors ${isSelected ? "text-primary" : "text-slate-300 group-hover:text-slate-400"}`} icon="chevron_right" />
      </td>
    </tr>
  );
}

interface MemberEditorModalProps {
  canManageAccounts: boolean;
  errorMessage: string | null;
  fieldErrors: MemberFieldErrors;
  onClose: () => void;
  onFieldInteraction: (field: MemberFormField) => void;
  onSubmit: (values: MemberFormValues) => Promise<void>;
  pending: boolean;
  state: MemberEditorState;
}

function MemberEditorModal({
  canManageAccounts,
  errorMessage,
  fieldErrors,
  onClose,
  onFieldInteraction,
  onSubmit,
  pending,
  state,
}: MemberEditorModalProps): JSX.Element {
  const [form, setForm] = useState<MemberFormValues>(state.defaults);
  const isEdit = state.mode === "edit";
  const hasExistingAccount = Boolean(state.account);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div aria-modal="true" className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl" role="dialog">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="font-headline text-xl font-extrabold text-slate-900">
              {isEdit ? "Edit Member" : "Create Member"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {isEdit
                ? "Update the member profile, membership assignment, and optional finance account linkage."
                : "Create the person record first, then attach the club membership and optional finance account."}
            </p>
          </div>
          <button
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <MaterialSymbol icon="close" />
          </button>
        </div>

        {errorMessage ? (
          <div className="px-6 pt-5">
            <div
              className="rounded-2xl bg-error-container/60 px-4 py-3 text-sm font-semibold text-on-error-container"
              role="alert"
            >
              {errorMessage}
            </div>
          </div>
        ) : null}

        <div className="grid gap-6 p-6 lg:grid-cols-2">
          <section className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400" htmlFor="member-first-name">
                First Name
              </label>
              <input
                id="member-first-name"
                aria-invalid={fieldErrors.firstName ? "true" : "false"}
                className={memberFieldClassName(Boolean(fieldErrors.firstName))}
                onChange={(event) => {
                  onFieldInteraction("firstName");
                  setForm((current) => ({ ...current, firstName: event.target.value }));
                }}
                value={form.firstName}
              />
              {fieldErrors.firstName ? <p className="text-xs font-medium text-error">{fieldErrors.firstName}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400" htmlFor="member-last-name">
                Last Name
              </label>
              <input
                id="member-last-name"
                aria-invalid={fieldErrors.lastName ? "true" : "false"}
                className={memberFieldClassName(Boolean(fieldErrors.lastName))}
                onChange={(event) => {
                  onFieldInteraction("lastName");
                  setForm((current) => ({ ...current, lastName: event.target.value }));
                }}
                value={form.lastName}
              />
              {fieldErrors.lastName ? <p className="text-xs font-medium text-error">{fieldErrors.lastName}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400" htmlFor="member-email">
                Email
              </label>
              <input
                id="member-email"
                aria-invalid={fieldErrors.email ? "true" : "false"}
                className={memberFieldClassName(Boolean(fieldErrors.email))}
                onChange={(event) => {
                  onFieldInteraction("email");
                  setForm((current) => ({ ...current, email: event.target.value }));
                }}
                type="email"
                value={form.email}
              />
              {fieldErrors.email ? <p className="text-xs font-medium text-error">{fieldErrors.email}</p> : null}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400" htmlFor="member-phone">
                Phone
              </label>
              <input
                id="member-phone"
                aria-invalid={fieldErrors.phone ? "true" : "false"}
                className={memberFieldClassName(Boolean(fieldErrors.phone))}
                onChange={(event) => {
                  onFieldInteraction("phone");
                  setForm((current) => ({ ...current, phone: event.target.value }));
                }}
                value={form.phone}
              />
              {fieldErrors.phone ? <p className="text-xs font-medium text-error">{fieldErrors.phone}</p> : null}
            </div>
          </section>

          <section className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400" htmlFor="member-role">
                  Role
                </label>
                <select
                  id="member-role"
                  aria-invalid={fieldErrors.role ? "true" : "false"}
                  className={memberFieldClassName(Boolean(fieldErrors.role))}
                  onChange={(event) => {
                    onFieldInteraction("role");
                    setForm((current) => ({ ...current, role: event.target.value as ClubMembershipRole }));
                  }}
                  value={form.role}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.role ? <p className="text-xs font-medium text-error">{fieldErrors.role}</p> : null}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400" htmlFor="member-status">
                  Status
                </label>
                <select
                  id="member-status"
                  aria-invalid={fieldErrors.status ? "true" : "false"}
                  className={memberFieldClassName(Boolean(fieldErrors.status))}
                  onChange={(event) => {
                    onFieldInteraction("status");
                    setForm((current) => ({ ...current, status: event.target.value as ClubMembershipStatus }));
                  }}
                  value={form.status}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.status ? <p className="text-xs font-medium text-error">{fieldErrors.status}</p> : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400" htmlFor="member-number">
                  Membership Number
                </label>
                <input
                  id="member-number"
                  aria-invalid={fieldErrors.membershipNumber ? "true" : "false"}
                  className={memberFieldClassName(Boolean(fieldErrors.membershipNumber))}
                  onChange={(event) => {
                    onFieldInteraction("membershipNumber");
                    setForm((current) => ({ ...current, membershipNumber: event.target.value }));
                  }}
                  value={form.membershipNumber}
                />
                {fieldErrors.membershipNumber ? <p className="text-xs font-medium text-error">{fieldErrors.membershipNumber}</p> : null}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400" htmlFor="member-joined">
                  Joined
                </label>
                <input
                  id="member-joined"
                  aria-invalid={fieldErrors.joinedDate ? "true" : "false"}
                  className={memberFieldClassName(Boolean(fieldErrors.joinedDate))}
                  onChange={(event) => {
                    onFieldInteraction("joinedDate");
                    setForm((current) => ({ ...current, joinedDate: event.target.value }));
                  }}
                  type="date"
                  value={form.joinedDate}
                />
                {fieldErrors.joinedDate ? <p className="text-xs font-medium text-error">{fieldErrors.joinedDate}</p> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-900">Finance Account</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {hasExistingAccount
                      ? `Linked to ${state.account?.account_customer.account_code}.`
                      : canManageAccounts
                        ? "Create the linked finance account as part of this member setup."
                        : "Read-only. Account linking requires club-admin finance permissions."}
                  </p>
                </div>
                {!hasExistingAccount && canManageAccounts ? (
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      checked={form.createFinanceAccount}
                      className="accent-primary"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          createFinanceAccount: event.target.checked,
                          accountCode: event.target.checked ? current.accountCode : "",
                        }))
                      }
                      type="checkbox"
                    />
                    Create now
                  </label>
                ) : null}
              </div>

              {hasExistingAccount ? (
                <div className="mt-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  Account code: {state.account?.account_customer.account_code}
                </div>
              ) : null}

              {!hasExistingAccount && form.createFinanceAccount && canManageAccounts ? (
                <div className="mt-3 space-y-1">
                  <label className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400" htmlFor="member-account-code">
                    Account Code
                  </label>
                  <input
                    id="member-account-code"
                    aria-invalid={fieldErrors.accountCode ? "true" : "false"}
                    className={`${memberFieldClassName(Boolean(fieldErrors.accountCode))} bg-white`}
                    onChange={(event) => {
                      onFieldInteraction("accountCode");
                      setForm((current) => ({ ...current, accountCode: event.target.value }));
                    }}
                    value={form.accountCode}
                  />
                  {fieldErrors.accountCode ? <p className="text-xs font-medium text-error">{fieldErrors.accountCode}</p> : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
          <button
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dim disabled:opacity-50"
            disabled={pending || !canSubmitMemberForm(form, canManageAccounts)}
            onClick={() => {
              void onSubmit(form);
            }}
            type="button"
          >
            {pending ? "Saving..." : isEdit ? "Save Member" : "Create Member"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminMembersPage(): JSX.Element {
  const { bootstrap, accessToken } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const permissions = new Set(bootstrap?.permissions ?? []);
  const canManageMembers =
    permissions.has("people:write") && permissions.has("memberships:manage");
  const canManageAccounts = permissions.has("account_customers:manage");

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editorState, setEditorState] = useState<MemberEditorState | null>(null);
  const [editorErrorMessage, setEditorErrorMessage] = useState<string | null>(null);
  const [editorFieldErrors, setEditorFieldErrors] = useState<MemberFieldErrors>({});
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);

  const directoryQuery = useClubDirectoryQuery({ accessToken, selectedClubId });
  const accountsQuery = useFinanceAccountsQuery({ accessToken, selectedClubId });
  const outstandingSummaryQuery = useFinanceOutstandingSummaryQuery({ accessToken, selectedClubId });
  const reportsSummaryQuery = useReportsSummaryQuery({ accessToken, selectedClubId });
  const createPersonMutation = useCreatePersonMutation({ accessToken, selectedClubId });
  const updatePersonMutation = useUpdatePersonMutation({ accessToken, selectedClubId });
  const createMembershipMutation = useCreateMembershipMutation({ accessToken, selectedClubId });
  const updateMembershipMutation = useUpdateMembershipMutation({ accessToken, selectedClubId });
  const createAccountCustomerMutation = useCreateAccountCustomerMutation({ accessToken, selectedClubId });

  const members = directoryQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const outstandingSummary = outstandingSummaryQuery.data;

  // Build a person_id → FinanceAccountSummary lookup
  const accountByPersonId = buildAccountByPersonId(accounts);
  const { selectedMember, selectedAccount } = resolveMemberSelection(
    members,
    accountByPersonId,
    selectedPersonId,
  );

  const ledgerQuery = useFinanceAccountLedgerQuery({
    accessToken,
    selectedClubId,
    accountId: selectedAccount?.id ?? null,
  });

  const searchValue = search.trim().toLowerCase();
  const filtered = filterMembers(members, searchValue, accountByPersonId);

  const reports = reportsSummaryQuery.data;
  const mutationPending =
    createPersonMutation.isPending ||
    updatePersonMutation.isPending ||
    createMembershipMutation.isPending ||
    updateMembershipMutation.isPending ||
    createAccountCustomerMutation.isPending;

  function openCreateMember(): void {
    setNotice(null);
    setEditorErrorMessage(null);
    setEditorFieldErrors({});
    setEditorState(buildMemberEditorState("create", null, null));
  }

  function openEditMember(forceAccountCreation = false): void {
    if (!selectedMember) {
      return;
    }
    setNotice(null);
    setEditorErrorMessage(null);
    setEditorFieldErrors({});
    setEditorState(
      buildMemberEditorState("edit", selectedMember, selectedAccount, forceAccountCreation),
    );
  }

  function closeEditor(): void {
    setEditorState(null);
    setEditorErrorMessage(null);
    setEditorFieldErrors({});
  }

  function clearEditorFieldError(field: MemberFormField): void {
    setEditorFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }
      return { ...current, [field]: undefined };
    });
  }

  async function handleEditorSubmit(values: MemberFormValues): Promise<void> {
    if (!editorState) {
      return;
    }

    setNotice(null);
    setEditorErrorMessage(null);
    setEditorFieldErrors({});

    try {
      if (editorState.mode === "create") {
        const person = await createPersonMutation.mutateAsync(buildPersonPayload(values));

        await createMembershipMutation.mutateAsync({
          person_id: person.id,
          ...buildMembershipPayload(values),
        });

        if (values.createFinanceAccount && canManageAccounts) {
          await createAccountCustomerMutation.mutateAsync(
            buildAccountCustomerPayload(person.id, values),
          );
        }

        setNotice({ tone: "success", message: "Member created." });
      } else if (editorState.entry) {
        await updatePersonMutation.mutateAsync({
          personId: editorState.entry.person.id,
          payload: buildPersonPayload(values),
        });

        await updateMembershipMutation.mutateAsync({
          membershipId: editorState.entry.membership.id,
          payload: buildMembershipPayload(values),
        });

        if (!editorState.account && values.createFinanceAccount && canManageAccounts) {
          await createAccountCustomerMutation.mutateAsync(
            buildAccountCustomerPayload(editorState.entry.person.id, values),
          );
        }

        setNotice({
          tone: "success",
          message: updateSuccessMessage(editorState, values, canManageAccounts),
        });
      }

      closeEditor();
    } catch (error) {
      const parsedError = parseMemberEditorError(error);
      setEditorErrorMessage(parsedError.bannerMessage);
      setEditorFieldErrors(parsedError.fieldErrors);
    }
  }

  return (
    <>
      <AdminWorkspace
        actions={
          <>
            <label className="relative">
              <span className="sr-only">Search members</span>
              <input
                className="w-72 rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, member number, or account"
                value={search}
              />
              <MaterialSymbol className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" icon="search" />
            </label>
            {canManageMembers ? (
              <button
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-dim"
                onClick={openCreateMember}
                type="button"
              >
                New Member
              </button>
            ) : null}
            {notice ? <div className={noticeClassName(notice.tone)}>{notice.message}</div> : null}
          </>
        }
        description="Directory visibility, finance account coverage, and live member maintenance."
        kpis={
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-primary">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Members</span>
                <MaterialSymbol className="text-primary" icon="group" />
              </div>
              <div className="flex items-baseline gap-2">
                {directoryQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">{members.length}</span>
                    <span className="text-xs font-medium text-primary">club directory</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-emerald-500">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Finance Accounts</span>
                <MaterialSymbol className="text-emerald-500" icon="account_balance_wallet" />
              </div>
              <div className="flex items-baseline gap-2">
                {outstandingSummaryQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">{outstandingSummary?.total_accounts ?? 0}</span>
                    <span className="text-xs font-medium text-emerald-600">backend summary</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-error">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">In Arrears / Outstanding</span>
                <MaterialSymbol className="text-error" icon="pending_actions" />
              </div>
              <div className="flex items-baseline gap-2">
                {outstandingSummaryQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">
                      {formatAmount(outstandingSummary?.total_outstanding_amount ?? "0.00")}
                    </span>
                    <span className="text-xs font-medium text-error">{outstandingSummary?.accounts_in_arrears ?? 0} accounts</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-secondary">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">No Account / New Members</span>
                <MaterialSymbol className="text-secondary" icon="person_add" />
              </div>
              <div className="flex items-baseline gap-2">
                {reportsSummaryQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">
                      {reports?.member_breakdown.no_account_count ?? 0}
                    </span>
                    <span className="text-xs font-medium text-secondary">
                      {reports?.member_breakdown.new_member_count ?? 0} new and awaiting account coverage
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        }
        title="Members"
      >
          <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Name</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Role</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Member #</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Account</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Balance</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {directoryQuery.isLoading && (
                    <tr>
                      <td className="px-6 py-8 text-center text-sm text-slate-400" colSpan={6}>
                        Loading members…
                      </td>
                    </tr>
                  )}
                  {directoryQuery.isError && (
                    <tr>
                      <td className="px-6 py-8 text-center text-sm text-error" colSpan={6}>
                        Failed to load members.
                      </td>
                    </tr>
                  )}
                  {!directoryQuery.isLoading && filtered.length === 0 && (
                    <tr>
                      <td className="px-6 py-8 text-center text-sm text-slate-400" colSpan={6}>
                        {searchValue ? "No members match your search." : "No members yet."}
                      </td>
                    </tr>
                  )}
                  {filtered.map((entry) => (
                    <MemberRow
                      key={entry.person.id}
                      entry={entry}
                      account={accountByPersonId.get(entry.person.id)}
                      isSelected={selectedPersonId === entry.person.id}
                      onSelect={() =>
                        setSelectedPersonId(
                          selectedPersonId === entry.person.id ? null : entry.person.id,
                        )
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
      </AdminWorkspace>

      {/* Member detail panel */}
      {selectedPersonId && selectedMember && (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-sm font-bold text-on-primary-container">
                {initials(selectedMember.person.full_name)}
              </div>
              <div>
                <h3 className="font-headline text-base font-extrabold text-slate-900">
                  {selectedMember.person.full_name}
                </h3>
                <p className="text-xs text-slate-500">{selectedMember.person.email ?? "No email"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canManageMembers ? (
                <button
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => openEditMember(false)}
                  type="button"
                >
                  Edit Member
                </button>
              ) : null}
              {!selectedAccount && canManageMembers && canManageAccounts ? (
                <button
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-dim"
                  onClick={() => openEditMember(true)}
                  type="button"
                >
                  Add Finance Account
                </button>
              ) : null}
              <button
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50"
                type="button"
                onClick={() => setSelectedPersonId(null)}
              >
                <MaterialSymbol icon="close" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Member info */}
            <div className="border-b border-slate-100 p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Role</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">
                    {roleLabel(selectedMember.membership.role)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface capitalize">
                    {selectedMember.membership.status.toLowerCase()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Member #</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">
                    {selectedMember.membership.membership_number ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Joined</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">
                    {formatDate(selectedMember.membership.joined_at)}
                  </p>
                </div>
              </div>
            </div>

            {/* Finance account */}
            {selectedAccount ? (
              <div className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    Finance Account
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {selectedAccount.account_customer.account_code}
                  </span>
                </div>

                {/* Balance card */}
                <div className="mb-4 rounded-xl bg-slate-900 p-4 text-white">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Current Balance</span>
                    <span className={`text-xs font-bold ${parseFloat(selectedAccount.balance) < 0 ? "text-red-400" : "text-emerald-400"}`}>
                      {selectedAccount.transaction_count} transactions
                    </span>
                  </div>
                  <div className={`font-headline text-2xl font-extrabold ${parseFloat(selectedAccount.balance) < 0 ? "text-red-300" : "text-white"}`}>
                    {formatAmount(selectedAccount.balance)}
                  </div>
                </div>

                {/* Ledger entries */}
                <div className="space-y-1">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Transaction History
                  </p>
                  {ledgerQuery.isLoading && (
                    <p className="py-4 text-center text-xs text-slate-400">Loading ledger…</p>
                  )}
                  {ledgerQuery.data?.transactions.map((tx) => (
                    <div
                      className="flex items-center justify-between rounded-lg bg-surface p-3 hover:bg-slate-50"
                      key={tx.id}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold text-on-surface">{tx.description}</span>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${txTypeClass(tx.type)}`}>
                            {tx.type}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatDate(tx.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-xs font-bold ${parseFloat(tx.amount) < 0 ? "text-error" : "text-emerald-600"}`}>
                          {formatAmount(tx.amount)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          bal {formatAmount(tx.running_balance)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {ledgerQuery.data?.transactions.length === 0 && (
                    <p className="py-4 text-center text-xs text-slate-400">No transactions yet.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                <MaterialSymbol className="text-4xl text-slate-200" icon="account_balance_wallet" />
                <p className="text-sm font-medium text-slate-400">No finance account linked</p>
              </div>
            )}
          </div>
        </aside>
      )}
        {editorState ? (
          <MemberEditorModal
            canManageAccounts={canManageAccounts}
            errorMessage={editorErrorMessage}
            fieldErrors={editorFieldErrors}
            onClose={closeEditor}
            onFieldInteraction={clearEditorFieldError}
            onSubmit={handleEditorSubmit}
            pending={mutationPending}
            state={editorState}
          />
        ) : null}
    </>
  );
}
