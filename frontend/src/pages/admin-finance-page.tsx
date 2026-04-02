import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminShell from "../components/shell/AdminShell";
import { useFinanceAccountsQuery, useFinanceJournalQuery } from "../features/finance/hooks";
import { useSession } from "../session/session-context";
import type { FinanceTransactionType } from "../types/finance";


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

function txTypeLabel(type: FinanceTransactionType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function txStatusClass(type: FinanceTransactionType): string {
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

export function AdminFinancePage(): JSX.Element {
  const { bootstrap, accessToken } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const accountsQuery = useFinanceAccountsQuery({ accessToken, selectedClubId });
  const journalQuery = useFinanceJournalQuery({ accessToken, selectedClubId });

  const accounts = accountsQuery.data ?? [];
  const journal = journalQuery.data;

  // Derive metrics from live accounts data
  const totalUnpaid = accounts
    .reduce((sum, a) => {
      const bal = parseFloat(a.balance);
      return bal < 0 ? sum + Math.abs(bal) : sum;
    }, 0)
    .toFixed(2);

  const unpaidCount = accounts.filter((a) => parseFloat(a.balance) < 0).length;
  const totalTxCount = accounts.reduce((sum, a) => sum + a.transaction_count, 0);

  const totalCollected = (journal?.entries ?? [])
    .filter((e) => e.type === "payment")
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  return (
    <AdminShell title="Cashbook Flow" searchPlaceholder="Search transactions...">
        <div className="p-8">
          {/* Metrics */}
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-error">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Unpaid</span>
                <MaterialSymbol className="text-error" icon="pending_actions" />
              </div>
              <div className="flex items-baseline gap-2">
                {accountsQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">R{totalUnpaid}</span>
                    <span className="text-xs font-medium text-error">{unpaidCount} accounts</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-primary">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Transactions</span>
                <MaterialSymbol className="text-primary" icon="receipt_long" />
              </div>
              <div className="flex items-baseline gap-2">
                {accountsQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">{totalTxCount}</span>
                    <span className="text-xs font-medium text-primary">{accounts.length} accounts</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-secondary">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Collected</span>
                <MaterialSymbol className="text-secondary" icon="price_check" />
              </div>
              <div className="flex items-baseline gap-2">
                {journalQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">R{totalCollected.toFixed(2)}</span>
                    <span className="text-xs font-medium text-secondary">payments</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Journal table */}
          <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-50 px-6 py-4">
              <div className="flex items-center gap-2">
                <h3 className="font-headline font-bold text-slate-800">Cashbook Journal</h3>
                {journal && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {journal.total_count} records
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50" type="button">
                  <MaterialSymbol className="text-lg" icon="filter_list" />
                  Filter
                </button>
                <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition-all active:scale-95 hover:shadow-md" type="button">
                  <MaterialSymbol className="text-lg" icon="publish" />
                  Trigger Export
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Description</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Account</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Source</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Amount</th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Type</th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {journalQuery.isLoading && (
                    <tr>
                      <td className="px-6 py-8 text-center text-sm text-slate-400" colSpan={7}>
                        Loading transactions…
                      </td>
                    </tr>
                  )}
                  {journalQuery.isError && (
                    <tr>
                      <td className="px-6 py-8 text-center text-sm text-error" colSpan={7}>
                        Failed to load journal.
                      </td>
                    </tr>
                  )}
                  {journal && journal.entries.length === 0 && (
                    <tr>
                      <td className="px-6 py-8 text-center text-sm text-slate-400" colSpan={7}>
                        No transactions yet.
                      </td>
                    </tr>
                  )}
                  {journal?.entries.map((entry) => (
                    <tr className="group transition-colors hover:bg-surface-container-low" key={entry.id}>
                      <td className="px-6 py-4 text-sm text-slate-600">{formatDate(entry.created_at)}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-on-surface">{entry.description}</span>
                          {entry.reference_id && (
                            <span className="text-[11px] text-slate-400">{entry.reference_id}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                          {entry.account_customer_code ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 capitalize">{entry.source}</td>
                      <td className="px-6 py-4 text-sm font-bold text-on-surface">{formatAmount(entry.amount)}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${txStatusClass(entry.type)}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                          {txTypeLabel(entry.type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-slate-400 transition-colors hover:text-primary" type="button">
                          <MaterialSymbol icon="more_vert" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/30 p-4">
              <span className="text-xs font-medium text-slate-500">
                {journal
                  ? `Showing ${journal.entries.length} of ${journal.total_count} records.`
                  : "Loading…"}
              </span>
              <div className="flex gap-2">
                <button className="rounded border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 transition-all hover:bg-white" type="button">
                  Previous
                </button>
                <button className="rounded border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-800 shadow-sm" type="button">
                  1
                </button>
                <button className="rounded border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600 transition-all hover:bg-white" type="button">
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

      <aside className="fixed inset-y-0 right-0 z-50 hidden w-[420px] translate-x-0 flex-col border-l border-slate-200 bg-white shadow-2xl xl:flex">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <div>
            <h3 className="font-headline text-lg font-extrabold text-slate-900">Export Preview</h3>
            <p className="text-xs text-slate-500">
              {journal ? `Reviewing ${journal.total_count} records for General Ledger sync` : "Loading…"}
            </p>
          </div>
          <button className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50" type="button">
            <MaterialSymbol icon="close" />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          <div className="rounded-xl border border-primary/20 bg-primary-container/30 p-4">
            <div className="flex gap-3">
              <MaterialSymbol className="text-primary" icon="info" />
              <div>
                <p className="text-sm font-bold text-on-primary-container">Ready to Trigger Export</p>
                <p className="mt-1 text-xs leading-relaxed text-on-primary-container/80">
                  Are you sure you want to export {journal?.total_count ?? "—"} records to Xero? This will mark them as exported and lock them for further editing.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Recent Entries</span>
            </div>
            <div className="space-y-2">
              {journal?.entries.slice(0, 5).map((entry) => (
                <div className="group flex items-center justify-between rounded-lg border border-transparent bg-surface p-3 transition-all hover:border-slate-200 hover:bg-slate-50" key={entry.id}>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary"></div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-on-surface">{entry.account_customer_code ?? "—"}</span>
                      <span className="text-[10px] text-slate-500 capitalize">{entry.source}</span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-on-surface">{formatAmount(entry.amount)}</span>
                </div>
              ))}
              {journal && journal.total_count > 5 && (
                <div className="py-2 text-center">
                  <span className="text-[10px] font-medium text-slate-400">… and {journal.total_count - 5} more records</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-slate-50 p-6">
          <button className="rounded-xl border border-slate-300 bg-white py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50" type="button">
            Cancel
          </button>
          <button className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-dim" type="button">
            <MaterialSymbol className="text-sm" icon="sync" />
            Confirm Export
          </button>
        </div>
      </aside>

    </AdminShell>
  );
}
