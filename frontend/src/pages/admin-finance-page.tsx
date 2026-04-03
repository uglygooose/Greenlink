import { useEffect, useState } from "react";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import {
  downloadFinanceExportBatch,
  downloadMappedFinanceExport,
  useAccountingExportProfilesQuery,
  useAccountingMappedExportPreviewQuery,
  useCreateAccountingExportProfileMutation,
  useCreateFinanceExportBatchMutation,
  useFinanceAccountsQuery,
  useFinanceExportBatchDetailQuery,
  useFinanceExportBatchesQuery,
  useFinanceJournalQuery,
  useFinanceOutstandingSummaryQuery,
  useFinanceRevenueSummaryQuery,
  useFinanceTransactionVolumeSummaryQuery,
  useUpdateAccountingExportProfileMutation,
  useVoidFinanceExportBatchMutation,
} from "../features/finance/hooks";
import { useSession } from "../session/session-context";
import type {
  AccountingExportProfile,
  AccountingExportProfileInput,
  AccountingExportProfileMappingConfig,
  FinanceExportBatchStatus,
  FinanceExportProfile,
  FinanceTargetSystem,
  FinanceTransactionType,
} from "../types/finance";

type NoticeTone = "success" | "info" | "error";
type ProfileMappingType = "charge" | "payment" | "adjustment";
type ProfileMappingField = "debit_account_code" | "credit_account_code" | "description_prefix";

const supportedMappingTypes: ProfileMappingType[] = ["charge", "payment", "adjustment"];
const targetSystemOptions: FinanceTargetSystem[] = ["generic_journal", "pastel_like", "sage_like"];

function todayInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function firstDayOfMonthInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function defaultProfileForm(): AccountingExportProfileInput {
  return {
    code: "generic_journal_ops",
    name: "Generic Journal Ops",
    target_system: "generic_journal",
    is_active: true,
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

function toProfileForm(profile: AccountingExportProfile): AccountingExportProfileInput {
  return {
    code: profile.code,
    name: profile.name,
    target_system: profile.target_system,
    is_active: profile.is_active,
    mapping_config: profile.mapping_config,
  };
}

function formatCurrency(amount: string, signed = true): string {
  const value = parseFloat(amount);
  const absolute = Math.abs(value).toFixed(2);
  return signed && value < 0 ? `-R${absolute}` : `R${absolute}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function batchRangeLabel(dateFrom: string, dateTo: string): string {
  return dateFrom === dateTo ? formatDate(dateFrom) : `${formatDate(dateFrom)} to ${formatDate(dateTo)}`;
}

function txTypeLabel(type: FinanceTransactionType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function txStatusClass(type: FinanceTransactionType): string {
  if (type === "charge") return "bg-error-container text-on-error-container";
  if (type === "payment") return "bg-secondary-container text-on-secondary-container";
  if (type === "refund") return "bg-primary-container text-on-primary-container";
  return "border border-outline-variant text-slate-600";
}

function batchStatusClass(status: FinanceExportBatchStatus): string {
  if (status === "generated") return "bg-secondary-container text-on-secondary-container";
  if (status === "void") return "bg-error-container text-on-error-container";
  if (status === "exported") return "bg-primary-container text-on-primary-container";
  return "bg-slate-100 text-slate-700";
}

function noticeClassName(tone: NoticeTone): string {
  if (tone === "success") return "border-secondary/20 bg-secondary-container/40 text-on-secondary-container";
  if (tone === "error") return "border-error/20 bg-error-container/50 text-on-error-container";
  return "border-primary/20 bg-primary-container/35 text-on-primary-container";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function exportProfileLabel(profile: FinanceExportProfile): string {
  return profile === "journal_basic" ? "Journal Basic" : profile;
}

function targetSystemLabel(targetSystem: string): string {
  return targetSystem.replace(/_/g, " ");
}

function mapTypeLabel(type: ProfileMappingType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function AdminFinancePage(): JSX.Element {
  const { bootstrap, accessToken } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const [dateFrom, setDateFrom] = useState(firstDayOfMonthInputValue);
  const [dateTo, setDateTo] = useState(todayInputValue);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedAccountingProfileId, setSelectedAccountingProfileId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<AccountingExportProfileInput>(defaultProfileForm);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [isDownloadingCanonical, setIsDownloadingCanonical] = useState(false);
  const [isDownloadingMapped, setIsDownloadingMapped] = useState(false);
  const exportProfile: FinanceExportProfile = "journal_basic";

  const accountsQuery = useFinanceAccountsQuery({ accessToken, selectedClubId });
  const journalQuery = useFinanceJournalQuery({ accessToken, selectedClubId });
  const outstandingSummaryQuery = useFinanceOutstandingSummaryQuery({ accessToken, selectedClubId });
  const revenueSummaryQuery = useFinanceRevenueSummaryQuery({ accessToken, selectedClubId });
  const transactionVolumeSummaryQuery = useFinanceTransactionVolumeSummaryQuery({ accessToken, selectedClubId });
  const exportBatchesQuery = useFinanceExportBatchesQuery({ accessToken, selectedClubId });
  const exportBatchDetailQuery = useFinanceExportBatchDetailQuery({ accessToken, selectedClubId, batchId: selectedBatchId });
  const accountingProfilesQuery = useAccountingExportProfilesQuery({ accessToken, selectedClubId });
  const mappedExportPreviewQuery = useAccountingMappedExportPreviewQuery({
    accessToken,
    selectedClubId,
    batchId: selectedBatchId,
    profileId: selectedAccountingProfileId,
  });
  const createExportBatchMutation = useCreateFinanceExportBatchMutation();
  const voidExportBatchMutation = useVoidFinanceExportBatchMutation();
  const createAccountingProfileMutation = useCreateAccountingExportProfileMutation();
  const updateAccountingProfileMutation = useUpdateAccountingExportProfileMutation();

  const accounts = accountsQuery.data ?? [];
  const journal = journalQuery.data;
  const exportBatches = exportBatchesQuery.data?.batches ?? [];
  const selectedBatch = exportBatchDetailQuery.data;
  const accountingProfiles = accountingProfilesQuery.data?.profiles ?? [];
  const mappedPreview = mappedExportPreviewQuery.data;
  const outstandingSummary = outstandingSummaryQuery.data;
  const revenueSummary = revenueSummaryQuery.data;
  const transactionVolumeSummary = transactionVolumeSummaryQuery.data;

  useEffect(() => {
    if (accountingProfiles.length === 0) {
      setSelectedAccountingProfileId(null);
      return;
    }
    if (!selectedAccountingProfileId || !accountingProfiles.some((profile) => profile.id === selectedAccountingProfileId)) {
      setSelectedAccountingProfileId(accountingProfiles.find((profile) => profile.is_active)?.id ?? accountingProfiles[0].id);
    }
  }, [accountingProfiles, selectedAccountingProfileId]);

  useEffect(() => {
    if (!editingProfileId) {
      return;
    }
    const profile = accountingProfiles.find((item) => item.id === editingProfileId);
    if (profile) {
      setProfileForm(toProfileForm(profile));
    }
  }, [accountingProfiles, editingProfileId]);

  function startNewProfile(): void {
    setEditingProfileId(null);
    setProfileForm(defaultProfileForm());
  }

  function startEditingProfile(profile: AccountingExportProfile): void {
    setEditingProfileId(profile.id);
    setSelectedAccountingProfileId(profile.id);
    setProfileForm(toProfileForm(profile));
  }

  function updateProfileField<K extends keyof AccountingExportProfileInput>(field: K, value: AccountingExportProfileInput[K]): void {
    setProfileForm((current) => ({ ...current, [field]: value }));
  }

  function updateMappingField(
    transactionType: ProfileMappingType,
    field: ProfileMappingField,
    value: string,
  ): void {
    setProfileForm((current) => ({
      ...current,
      mapping_config: {
        ...current.mapping_config,
        transaction_mappings: {
          ...current.mapping_config.transaction_mappings,
          [transactionType]: {
            ...current.mapping_config.transaction_mappings[transactionType],
            [field]: value,
          },
        },
      },
    }));
  }

  async function handleGenerateBatch(): Promise<void> {
    setNotice(null);
    try {
      const result = await createExportBatchMutation.mutateAsync({
        export_profile: exportProfile,
        date_from: dateFrom,
        date_to: dateTo,
      });
      setSelectedBatchId(result.batch.id);
      setNotice({
        tone: result.created ? "success" : "info",
        message: result.created
          ? `Export batch generated for ${batchRangeLabel(result.batch.date_from, result.batch.date_to)}.`
          : `Existing export batch reopened for ${batchRangeLabel(result.batch.date_from, result.batch.date_to)}.`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "Failed to generate export batch.") });
    }
  }

  async function handleSaveProfile(): Promise<void> {
    setNotice(null);
    try {
      const payload = {
        ...profileForm,
        code: profileForm.code.trim().toLowerCase(),
        name: profileForm.name.trim(),
        target_system: profileForm.target_system.trim(),
      };
      const profile = editingProfileId
        ? await updateAccountingProfileMutation.mutateAsync({ profileId: editingProfileId, payload })
        : await createAccountingProfileMutation.mutateAsync(payload);
      setEditingProfileId(profile.id);
      setSelectedAccountingProfileId(profile.id);
      setNotice({
        tone: "success",
        message: editingProfileId ? `Accounting profile ${profile.name} updated.` : `Accounting profile ${profile.name} created.`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "Failed to save accounting profile.") });
    }
  }

  async function handleDownloadBatch(): Promise<void> {
    if (!selectedBatch || !accessToken || !selectedClubId) return;
    setNotice(null);
    setIsDownloadingCanonical(true);
    try {
      const fileName = await downloadFinanceExportBatch({ accessToken, selectedClubId, batchId: selectedBatch.id });
      setNotice({ tone: "success", message: `${fileName} downloaded successfully.` });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "Failed to download export batch.") });
    } finally {
      setIsDownloadingCanonical(false);
    }
  }

  async function handleDownloadMappedExport(): Promise<void> {
    if (!selectedBatch || !selectedAccountingProfileId || !accessToken || !selectedClubId) return;
    setNotice(null);
    setIsDownloadingMapped(true);
    try {
      const fileName = await downloadMappedFinanceExport({
        accessToken,
        selectedClubId,
        batchId: selectedBatch.id,
        profileId: selectedAccountingProfileId,
      });
      setNotice({ tone: "success", message: `${fileName} downloaded successfully.` });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "Failed to download mapped export.") });
    } finally {
      setIsDownloadingMapped(false);
    }
  }

  async function handleVoidBatch(): Promise<void> {
    if (!selectedBatch) return;
    setNotice(null);
    try {
      const result = await voidExportBatchMutation.mutateAsync(selectedBatch.id);
      setNotice({
        tone: "info",
        message: result.void_applied
          ? "Batch voided. Generate the range again when you need a fresh export."
          : "Batch was already voided.",
      });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "Failed to void export batch.") });
    }
  }

  return (
    <>
      <AdminWorkspace
        title="Cashbook Flow"
        description="Journal visibility, account exposure, canonical export batching, and mapped accounting handoff."
        kpis={
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-error">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Outstanding</span>
                <MaterialSymbol className="text-error" icon="pending_actions" />
              </div>
              <div className="flex items-baseline gap-2">
                {outstandingSummaryQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">
                      {formatCurrency(outstandingSummary?.total_outstanding_amount ?? "0.00", false)}
                    </span>
                    <span className="text-xs font-medium text-error">{outstandingSummary?.accounts_in_arrears ?? 0} accounts</span>
                  </>
                )}
              </div>
            </div>
            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-primary">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Month Transaction Volume</span>
                <MaterialSymbol className="text-primary" icon="receipt_long" />
              </div>
              <div className="flex items-baseline gap-2">
                {transactionVolumeSummaryQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">
                      {transactionVolumeSummary?.month.total_transaction_count ?? 0}
                    </span>
                    <span className="text-xs font-medium text-primary">month to date</span>
                  </>
                )}
              </div>
            </div>
            <div className="rounded-xl bg-surface-container-lowest p-6 shadow-sm border-l-4 border-secondary">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Month Revenue</span>
                <MaterialSymbol className="text-secondary" icon="price_check" />
              </div>
              <div className="flex items-baseline gap-2">
                {revenueSummaryQuery.isLoading ? (
                  <span className="font-headline text-3xl font-extrabold text-slate-300">—</span>
                ) : (
                  <>
                    <span className="font-headline text-3xl font-extrabold text-on-surface">
                      {formatCurrency(revenueSummary?.month.total_revenue ?? "0.00", false)}
                    </span>
                    <span className="text-xs font-medium text-secondary">
                      operational {formatCurrency(revenueSummary?.month.operational_revenue ?? "0.00", false)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        }
      >
        {notice ? (
          <section className={`rounded-xl border px-5 py-4 text-sm ${noticeClassName(notice.tone)}`}>
            <div className="flex items-start gap-3">
              <MaterialSymbol
                className="mt-0.5 text-lg"
                icon={notice.tone === "error" ? "error" : notice.tone === "success" ? "task_alt" : "info"}
              />
              <p>{notice.message}</p>
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_360px]">
          <section className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Canonical Export Workflow</p>
                  <h2 className="font-headline text-xl font-extrabold text-slate-900">Generate Canonical Journal Batches</h2>
                  <p className="text-sm text-slate-500">
                    Persist an auditable GreenLink source batch, then map it through a club-specific accounting profile.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <label className="flex min-w-[150px] flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Date From
                    <input
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary"
                      max={dateTo}
                      onChange={(event) => setDateFrom(event.target.value)}
                      type="date"
                      value={dateFrom}
                    />
                  </label>
                  <label className="flex min-w-[150px] flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Date To
                    <input
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary"
                      min={dateFrom}
                      onChange={(event) => setDateTo(event.target.value)}
                      type="date"
                      value={dateTo}
                    />
                  </label>
                  <label className="flex min-w-[170px] flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Export Profile
                    <select
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none"
                      disabled
                      value={exportProfile}
                    >
                      <option value="journal_basic">Journal Basic</option>
                    </select>
                  </label>
                  <button
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={createExportBatchMutation.isPending}
                    onClick={() => void handleGenerateBatch()}
                    type="button"
                  >
                    <MaterialSymbol className="text-base" icon={createExportBatchMutation.isPending ? "hourglass_top" : "publish"} />
                    {createExportBatchMutation.isPending ? "Generating..." : "Generate Batch"}
                  </button>
                </div>
              </div>
            </div>
            <div className="grid gap-4 px-6 py-5 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Canonical Profile</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{exportProfileLabel(exportProfile)}</p>
                <p className="mt-1 text-xs text-slate-500">Deterministic and profile-neutral source rows.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Selected Window</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{batchRangeLabel(dateFrom, dateTo)}</p>
                <p className="mt-1 text-xs text-slate-500">The same club, profile, and range will reopen the same source batch.</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Mapped Profiles</p>
                <p className="mt-2 text-sm font-bold text-slate-900">{accountingProfiles.length} configured</p>
                <p className="mt-1 text-xs text-slate-500">Profiles sit above the canonical layer and transform it for external accounting shapes.</p>
              </div>
            </div>
          </section>

          <aside className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Batch History</p>
                  <h2 className="mt-1 font-headline text-lg font-extrabold text-slate-900">Recent Exports</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{exportBatches.length}</span>
              </div>
            </div>
            <div className="max-h-[420px] space-y-3 overflow-y-auto px-5 py-4">
              {exportBatchesQuery.isLoading ? <p className="text-sm text-slate-500">Loading export history...</p> : null}
              {exportBatchesQuery.isError ? <p className="text-sm text-error">Failed to load export history.</p> : null}
              {!exportBatchesQuery.isLoading && !exportBatchesQuery.isError && exportBatches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No finance export batches have been generated yet.
                </div>
              ) : null}
              {exportBatches.map((batch) => (
                <button
                  className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                    selectedBatchId === batch.id ? "border-primary/40 bg-primary-container/20" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                  key={batch.id}
                  onClick={() => setSelectedBatchId(batch.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900">{batchRangeLabel(batch.date_from, batch.date_to)}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(batch.generated_at)}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${batchStatusClass(batch.status)}`}>
                      {batch.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{batch.transaction_count} rows</span>
                    <span>Debits {formatCurrency(batch.total_debits, false)}</span>
                    <span>Credits {formatCurrency(batch.total_credits, false)}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>
        </div>

        <section className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Accounting Profile Mapping</p>
                <h2 className="font-headline text-xl font-extrabold text-slate-900">Club Mapping Profiles</h2>
                <p className="text-sm text-slate-500">
                  Define how canonical batch rows map into an external accounting-ready journal shape.
                </p>
              </div>
              <button
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                onClick={startNewProfile}
                type="button"
              >
                New Profile
              </button>
            </div>
          </div>
          <div className="grid gap-6 px-6 py-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-3">
              {accountingProfilesQuery.isLoading ? <p className="text-sm text-slate-500">Loading accounting profiles...</p> : null}
              {accountingProfilesQuery.isError ? <p className="text-sm text-error">Failed to load accounting profiles.</p> : null}
              {!accountingProfilesQuery.isLoading && accountingProfiles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No accounting profiles yet. Create one to unlock mapped exports above the canonical batch.
                </div>
              ) : null}
              {accountingProfiles.map((profile) => (
                <button
                  className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                    editingProfileId === profile.id ? "border-primary/40 bg-primary-container/20" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                  key={profile.id}
                  onClick={() => startEditingProfile(profile)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-900">{profile.name}</p>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{profile.code}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${profile.is_active ? "bg-secondary-container text-on-secondary-container" : "bg-slate-100 text-slate-600"}`}>
                      {profile.is_active ? "active" : "inactive"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{targetSystemLabel(profile.target_system)}</span>
                    <span>Ref {profile.mapping_config.reference_prefix}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Code
                  <input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary" onChange={(event) => updateProfileField("code", event.target.value)} value={profileForm.code} />
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Name
                  <input className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary" onChange={(event) => updateProfileField("name", event.target.value)} value={profileForm.name} />
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Target System
                  <select className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary" onChange={(event) => updateProfileField("target_system", event.target.value)} value={profileForm.target_system}>
                    {targetSystemOptions.map((option) => (
                      <option key={option} value={option}>{targetSystemLabel(option)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reference Prefix
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary"
                    onChange={(event) => setProfileForm((current) => ({ ...current, mapping_config: { ...current.mapping_config, reference_prefix: event.target.value } }))}
                    value={profileForm.mapping_config.reference_prefix}
                  />
                </label>
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Fallback Customer Code
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary"
                    onChange={(event) => setProfileForm((current) => ({ ...current, mapping_config: { ...current.mapping_config, fallback_customer_code: event.target.value } }))}
                    value={profileForm.mapping_config.fallback_customer_code}
                  />
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                  <input checked={profileForm.is_active} className="h-4 w-4 accent-primary" onChange={(event) => updateProfileField("is_active", event.target.checked)} type="checkbox" />
                  Profile is active
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {supportedMappingTypes.map((type) => (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={type}>
                    <div className="mb-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{mapTypeLabel(type)}</p>
                    </div>
                    <div className="space-y-3">
                      <label className="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Debit Account Code
                        <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-primary" onChange={(event) => updateMappingField(type, "debit_account_code", event.target.value)} value={profileForm.mapping_config.transaction_mappings[type]?.debit_account_code ?? ""} />
                      </label>
                      <label className="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Credit Account Code
                        <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-primary" onChange={(event) => updateMappingField(type, "credit_account_code", event.target.value)} value={profileForm.mapping_config.transaction_mappings[type]?.credit_account_code ?? ""} />
                      </label>
                      <label className="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Description Prefix
                        <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-primary" onChange={(event) => updateMappingField(type, "description_prefix", event.target.value)} value={profileForm.mapping_config.transaction_mappings[type]?.description_prefix ?? ""} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={createAccountingProfileMutation.isPending || updateAccountingProfileMutation.isPending}
                  onClick={() => void handleSaveProfile()}
                  type="button"
                >
                  <MaterialSymbol className="text-base" icon="save" />
                  {editingProfileId ? "Update Profile" : "Create Profile"}
                </button>
                {editingProfileId ? (
                  <button className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50" onClick={startNewProfile} type="button">
                    Create Another
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-2">
              <h2 className="font-headline font-bold text-slate-800">Cashbook Journal</h2>
              {journal ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{journal.total_count} records</span> : null}
            </div>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Live finance transaction feed</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead><tr className="bg-slate-50/70"><th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Date</th><th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Description</th><th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Account</th><th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Source</th><th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Amount</th><th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">Type</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {journalQuery.isLoading ? <tr><td className="px-6 py-8 text-center text-sm text-slate-400" colSpan={6}>Loading transactions...</td></tr> : null}
                {journalQuery.isError ? <tr><td className="px-6 py-8 text-center text-sm text-error" colSpan={6}>Failed to load journal.</td></tr> : null}
                {journal && journal.entries.length === 0 ? <tr><td className="px-6 py-8 text-center text-sm text-slate-400" colSpan={6}>No transactions yet.</td></tr> : null}
                {journal?.entries.map((entry) => (
                  <tr className="transition-colors hover:bg-surface-container-low" key={entry.id}>
                    <td className="px-6 py-4 text-sm text-slate-600">{formatDate(entry.created_at)}</td>
                    <td className="px-6 py-4"><div className="flex flex-col"><span className="text-sm font-bold text-on-surface">{entry.description}</span>{entry.reference_id ? <span className="text-[11px] text-slate-400">{entry.reference_id}</span> : null}</div></td>
                    <td className="px-6 py-4"><span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{entry.account_customer_code ?? "-"}</span></td>
                    <td className="px-6 py-4 text-xs text-slate-500 capitalize">{entry.source}</td>
                    <td className="px-6 py-4 text-sm font-bold text-on-surface">{formatCurrency(entry.amount)}</td>
                    <td className="px-6 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${txStatusClass(entry.type)}`}><span className="h-1.5 w-1.5 rounded-full bg-current"></span>{txTypeLabel(entry.type)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/40 px-6 py-4 text-xs font-medium text-slate-500">{journal ? `Showing ${journal.entries.length} of ${journal.total_count} records.` : "Loading..."}</div>
        </section>
      </AdminWorkspace>

      {selectedBatchId ? (
        <>
          <button aria-label="Close export preview overlay" className="fixed inset-0 z-40 bg-slate-900/25" onClick={() => setSelectedBatchId(null)} type="button" />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Finance Export Batch</p>
                <h2 className="font-headline text-xl font-extrabold text-slate-900">Batch Preview</h2>
                <p className="text-sm text-slate-500">{selectedBatch ? batchRangeLabel(selectedBatch.date_from, selectedBatch.date_to) : "Loading batch detail..."}</p>
              </div>
              <button aria-label="Close export preview" className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700" onClick={() => setSelectedBatchId(null)} type="button">
                <MaterialSymbol icon="close" />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              {exportBatchDetailQuery.isLoading ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading batch detail...</div> : null}
              {exportBatchDetailQuery.isError ? <div className="rounded-xl border border-error/20 bg-error-container/40 p-4 text-sm text-on-error-container">Failed to load batch detail.</div> : null}
              {selectedBatch ? (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{exportProfileLabel(selectedBatch.export_profile)}</p>
                        <p className="text-sm font-semibold text-slate-900">{selectedBatch.file_name}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${batchStatusClass(selectedBatch.status)}`}>{selectedBatch.status}</span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Generated</dt><dd className="text-slate-700">{formatDateTime(selectedBatch.generated_at)}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Generated By</dt><dd className="font-mono text-[12px] text-slate-700">{selectedBatch.created_by_person_id}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Transactions</dt><dd className="text-slate-700">{selectedBatch.transaction_count}</dd></div>
                      <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hash</dt><dd className="truncate font-mono text-[12px] text-slate-700">{selectedBatch.content_hash}</dd></div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Accounting Mapping Layer</p>
                        <h3 className="font-headline text-base font-bold text-slate-900">Mapped Export Preview</h3>
                        <p className="text-sm text-slate-500">Apply an active club profile to the canonical batch without mutating the source batch.</p>
                      </div>
                      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Accounting Profile
                        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary" onChange={(event) => setSelectedAccountingProfileId(event.target.value || null)} value={selectedAccountingProfileId ?? ""}>
                          <option value="">Select profile</option>
                          {accountingProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                        </select>
                      </label>
                      {accountingProfiles.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Create an accounting profile on the finance page to enable mapped exports.</div> : null}
                      {selectedAccountingProfileId && mappedExportPreviewQuery.isLoading ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Building mapped preview...</div> : null}
                      {selectedAccountingProfileId && mappedExportPreviewQuery.isError ? <div className="rounded-xl border border-error/20 bg-error-container/40 p-4 text-sm text-on-error-container">Failed to build mapped export preview.</div> : null}
                      {mappedPreview ? (
                        <>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{mappedPreview.accounting_profile_name}</p>
                                <p className="text-sm font-semibold text-slate-900">{mappedPreview.file_name}</p>
                              </div>
                              <span className="rounded-full bg-primary-container px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-on-primary-container">{targetSystemLabel(mappedPreview.target_system)}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500"><span>{mappedPreview.row_count} rows</span><span>{mappedPreview.metadata_json.output_mode ?? "mapped export"}</span></div>
                          </div>
                          {mappedPreview.validation_errors.length > 0 ? (
                            <div className="rounded-xl border border-error/20 bg-error-container/40 p-4">
                              <div className="flex items-start gap-3">
                                <MaterialSymbol className="mt-0.5 text-base text-on-error-container" icon="error" />
                                <div className="space-y-2">
                                  <p className="text-sm font-bold text-on-error-container">Mapped export validation failed</p>
                                  <ul className="space-y-1 text-sm text-on-error-container">
                                    {mappedPreview.validation_errors.slice(0, 5).map((item) => (
                                      <li key={`${item.code}-${item.row_index ?? "profile"}-${item.field ?? "general"}`}>{item.message}</li>
                                    ))}
                                  </ul>
                                  {mappedPreview.validation_errors.length > 5 ? (
                                    <p className="text-xs text-on-error-container/80">
                                      {mappedPreview.validation_errors.length - 5} more validation issue(s) remain.
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ) : null}
                          <div className="rounded-xl border border-slate-200 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                              <h4 className="font-headline text-base font-bold text-slate-900">Mapped Rows</h4>
                              <span className="text-xs text-slate-500">{mappedPreview.rows.length} rows</span>
                            </div>
                            <div className="max-h-[260px] overflow-auto">
                              <table className="w-full border-collapse text-left">
                                <thead className="bg-slate-50">
                                  <tr><th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Reference</th><th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Debit</th><th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Credit</th><th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Amount</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {mappedPreview.rows.slice(0, 10).map((row) => (
                                    <tr key={row.reference}>
                                      <td className="px-4 py-3"><div className="flex flex-col"><span className="text-sm font-semibold text-slate-900">{row.reference}</span><span className="text-[11px] text-slate-400">{row.description}</span></div></td>
                                      <td className="px-4 py-3 text-sm text-slate-700">{row.debit_account_code}</td>
                                      <td className="px-4 py-3 text-sm text-slate-700">{row.credit_account_code}</td>
                                      <td className="px-4 py-3 text-sm font-semibold text-slate-800">{formatCurrency(row.amount, false)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                          <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary-container/20 px-4 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary-container/30 disabled:cursor-not-allowed disabled:opacity-60" disabled={isDownloadingMapped || !mappedPreview.download_ready} onClick={() => void handleDownloadMappedExport()} type="button">
                            <MaterialSymbol className="text-base" icon={isDownloadingMapped ? "hourglass_top" : "download"} />
                            {isDownloadingMapped
                              ? "Downloading Mapped CSV..."
                              : mappedPreview.download_ready
                                ? "Download Mapped CSV"
                                : "Resolve Validation Errors"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <h3 className="font-headline text-base font-bold text-slate-900">Canonical Rows</h3>
                      <span className="text-xs text-slate-500">{selectedBatch.rows.length} rows persisted</span>
                    </div>
                    <div className="max-h-[260px] overflow-auto">
                      <table className="w-full border-collapse text-left">
                        <thead className="bg-slate-50"><tr><th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Date</th><th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Account</th><th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Description</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedBatch.rows.slice(0, 10).map((row) => (
                            <tr key={row.transaction_id}>
                              <td className="px-4 py-3 text-sm text-slate-600">{formatDate(row.entry_date)}</td>
                              <td className="px-4 py-3 text-xs font-semibold text-slate-700">{row.account_customer_code ?? "-"}</td>
                              <td className="px-4 py-3"><div className="flex flex-col"><span className="text-sm font-semibold text-slate-900">{row.description}</span><span className="text-[11px] text-slate-400">{row.source}{row.reference_id ? ` / ${row.reference_id}` : ""}</span></div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {selectedBatch.status === "void" ? <div className="rounded-xl border border-error/20 bg-error-container/40 p-4 text-sm text-on-error-container">This batch has been voided. Generate the same range again to create a fresh export record.</div> : null}
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:grid-cols-2">
              <button className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50" onClick={() => setSelectedBatchId(null)} type="button">Close</button>
              {selectedBatch ? (
                <button className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60" disabled={isDownloadingCanonical || exportBatchDetailQuery.isLoading} onClick={() => void handleDownloadBatch()} type="button">
                  <MaterialSymbol className="text-base" icon={isDownloadingCanonical ? "hourglass_top" : "download"} />
                  {isDownloadingCanonical ? "Downloading..." : "Download Canonical CSV"}
                </button>
              ) : <div />}
              {selectedBatch && selectedBatch.status !== "void" ? <button className="sm:col-span-2 rounded-xl border border-error/25 bg-white px-4 py-3 text-sm font-bold text-error transition-colors hover:bg-error-container/40 disabled:cursor-not-allowed disabled:opacity-60" disabled={voidExportBatchMutation.isPending} onClick={() => void handleVoidBatch()} type="button">{voidExportBatchMutation.isPending ? "Voiding Batch..." : "Void Batch"}</button> : null}
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
