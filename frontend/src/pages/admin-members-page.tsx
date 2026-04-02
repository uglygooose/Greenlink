import { useState } from "react";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminShell from "../components/shell/AdminShell";
import { useFinanceAccountLedgerQuery, useFinanceAccountsQuery } from "../features/finance/hooks";
import { useClubDirectoryQuery } from "../features/people/hooks";
import { useSession } from "../session/session-context";
import type { FinanceAccountSummary } from "../types/finance";
import type { ClubPersonEntry } from "../types/people";

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

function roleChipClass(role: string): string {
  switch (role) {
    case "CLUB_ADMIN":
      return "bg-primary-container text-on-primary-container";
    case "CLUB_STAFF":
      return "bg-secondary-container text-on-secondary-container";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function roleLabel(role: string): string {
  switch (role) {
    case "CLUB_ADMIN":
      return "Admin";
    case "CLUB_STAFF":
      return "Staff";
    default:
      return "Member";
  }
}

function statusDot(status: string): string {
  return status === "ACTIVE" ? "bg-emerald-400" : "bg-slate-300";
}

function formatAmount(amount: string): string {
  const n = parseFloat(amount);
  const abs = Math.abs(n).toFixed(2);
  return n < 0 ? `-$${abs}` : `$${abs}`;
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

export function AdminMembersPage(): JSX.Element {
  const { bootstrap, accessToken } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const directoryQuery = useClubDirectoryQuery({ accessToken, selectedClubId });
  const accountsQuery = useFinanceAccountsQuery({ accessToken, selectedClubId });

  const members = directoryQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];

  // Build a person_id → FinanceAccountSummary lookup
  const accountByPersonId = new Map<string, FinanceAccountSummary>();
  for (const acc of accounts) {
    accountByPersonId.set(acc.account_customer.person_id, acc);
  }

  // Find selected member's account id
  const selectedMember = members.find((m) => m.person.id === selectedPersonId) ?? null;
  const selectedAccount = selectedPersonId ? accountByPersonId.get(selectedPersonId) ?? null : null;

  const ledgerQuery = useFinanceAccountLedgerQuery({
    accessToken,
    selectedClubId,
    accountId: selectedAccount?.id ?? null,
  });

  const filtered = search.trim()
    ? members.filter(
        (m) =>
          m.person.full_name.toLowerCase().includes(search.toLowerCase()) ||
          m.person.email?.toLowerCase().includes(search.toLowerCase()) ||
          accountByPersonId.get(m.person.id)?.account_customer.account_code
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
    : members;

  return (
    <AdminShell title="Members" searchPlaceholder="Search members...">
        <div className="p-8">
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
                        {search ? "No members match your search." : "No members yet."}
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
        </div>

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
            <button
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50"
              type="button"
              onClick={() => setSelectedPersonId(null)}
            >
              <MaterialSymbol icon="close" />
            </button>
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
    </AdminShell>
  );
}
