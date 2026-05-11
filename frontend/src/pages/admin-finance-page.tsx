import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import {
  downloadFinanceExportBatch,
  downloadMappedFinanceExport,
  useAccountingExportProfilesQuery,
  useAccountingMappedExportPreviewQuery,
  useCreateFinanceExportBatchMutation,
  useFinanceExceptionsQuery,
  useFinanceExportBatchDetailQuery,
  useFinanceExportBatchReconciliationQuery,
  useFinanceExportBatchesQuery,
  useRegenerateFinanceExportBatchMutation,
} from "../features/finance/hooks";
import { useSession } from "../session/session-context";
import type {
  FinanceExportBatchStatus,
  FinanceExportProfile,
} from "../types/finance";

type NoticeTone = "success" | "info" | "error";

const EXPORT_PROFILE: FinanceExportProfile = "journal_basic";

function todayInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function firstDayOfMonthInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
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

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function formatCurrency(amount: string): string {
  const value = Math.abs(parseFloat(amount));
  return `R${value.toFixed(2)}`;
}

function batchRangeLabel(dateFrom: string, dateTo: string): string {
  return dateFrom === dateTo ? formatDate(dateFrom) : `${formatDate(dateFrom)} to ${formatDate(dateTo)}`;
}

function batchStatusClass(status: FinanceExportBatchStatus): string {
  if (status === "generated") return "bg-secondary-container text-on-secondary-container";
  if (status === "void") return "bg-error-container text-on-error-container";
  if (status === "exported") return "bg-primary-container text-on-primary-container";
  return "bg-slate-100 text-slate-700";
}

function noticeClass(tone: NoticeTone): string {
  if (tone === "success") return "border-secondary/20 bg-secondary-container/40 text-on-secondary-container";
  if (tone === "error") return "border-error/20 bg-error-container/50 text-on-error-container";
  return "border-primary/20 bg-primary-container/35 text-on-primary-container";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function teeSheetHref(filter: string, date: string, courseId?: string | null): string {
  const params = new URLSearchParams({ filter, date });
  if (courseId) {
    params.set("courseId", courseId);
  }
  return `/admin/golf/tee-sheet?${params.toString()}`;
}

function latestExportEvent(batch: { metadata_json: { export_events?: { exported_at: string }[] } }) {
  const events = batch.metadata_json.export_events ?? [];
  return events.length > 0 ? events[events.length - 1] : null;
}

type WizardStep = "exceptions" | "batch" | "reconcile" | "export" | "audit";

const STEPS: { id: WizardStep; label: string; icon: string }[] = [
  { id: "exceptions", label: "Exceptions", icon: "warning" },
  { id: "batch", label: "Generate Batch", icon: "publish" },
  { id: "reconcile", label: "Reconcile", icon: "balance" },
  { id: "export", label: "Export", icon: "upload_file" },
  { id: "audit", label: "Audit Trail", icon: "history" },
];

export function AdminFinancePage(): JSX.Element {
  const { bootstrap, accessToken } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;

  const [closeDateStr, setCloseDateStr] = useState(todayInputValue);
  const [dateFrom, setDateFrom] = useState(firstDayOfMonthInputValue);
  const [dateTo, setDateTo] = useState(todayInputValue);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedAccountingProfileId, setSelectedAccountingProfileId] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<WizardStep>("exceptions");
  const [notice, setNotice] = useState<{ tone: NoticeTone; message: string } | null>(null);
  const [isDownloadingCanonical, setIsDownloadingCanonical] = useState(false);
  const [isDownloadingMapped, setIsDownloadingMapped] = useState(false);

  const exceptionsQuery = useFinanceExceptionsQuery({ accessToken, selectedClubId, date: closeDateStr });
  const exportBatchesQuery = useFinanceExportBatchesQuery({ accessToken, selectedClubId });
  const exportBatchDetailQuery = useFinanceExportBatchDetailQuery({ accessToken, selectedClubId, batchId: selectedBatchId });
  const exportBatchReconciliationQuery = useFinanceExportBatchReconciliationQuery({ accessToken, selectedClubId, batchId: selectedBatchId });
  const accountingProfilesQuery = useAccountingExportProfilesQuery({ accessToken, selectedClubId });

  const createExportBatchMutation = useCreateFinanceExportBatchMutation();
  const regenerateExportBatchMutation = useRegenerateFinanceExportBatchMutation();

  const exceptions = exceptionsQuery.data;
  const exportBatches = exportBatchesQuery.data?.batches ?? [];
  const selectedBatch = exportBatchDetailQuery.data;
  const reconciliation = exportBatchReconciliationQuery.data;
  const accountingProfiles = accountingProfilesQuery.data?.profiles ?? [];

  const hasExceptions = (exceptions?.total_exception_count ?? 0) > 0;
  const hasDrift = reconciliation !== undefined && !reconciliation.matches_live_state;
  const defaultAccountingProfile = accountingProfiles.find((p) => p.is_active) ?? accountingProfiles[0] ?? null;
  const selectedAccountingProfile = accountingProfiles.find((p) => p.id === selectedAccountingProfileId) ?? null;
  const selectedAccountingProfileIdForWorkflow = selectedAccountingProfile?.id ?? null;
  const unpaidBookingCourseIds = Array.from(new Set((exceptions?.unpaid_bookings ?? []).map((booking) => booking.course_id)));
  const singleUnpaidCourseId = unpaidBookingCourseIds.length === 1 ? unpaidBookingCourseIds[0] : null;
  const mappedExportPreviewQuery = useAccountingMappedExportPreviewQuery({
    accessToken,
    selectedClubId,
    batchId: selectedBatchId,
    profileId: selectedAccountingProfileIdForWorkflow,
  });
  const mappedPreview = mappedExportPreviewQuery.data;

  useEffect(() => {
    if (!selectedAccountingProfileId && defaultAccountingProfile) {
      setSelectedAccountingProfileId(defaultAccountingProfile.id);
    }
  }, [defaultAccountingProfile, selectedAccountingProfileId]);

  async function handleGenerateBatch(): Promise<void> {
    setNotice(null);
    try {
      const result = await createExportBatchMutation.mutateAsync({
        export_profile: EXPORT_PROFILE,
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
      setActiveStep("reconcile");
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "Failed to generate export batch.") });
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
    if (!selectedBatch || !selectedAccountingProfileIdForWorkflow || !accessToken || !selectedClubId) return;
    setNotice(null);
    setIsDownloadingMapped(true);
    try {
      const fileName = await downloadMappedFinanceExport({
        accessToken,
        selectedClubId,
        batchId: selectedBatch.id,
        profileId: selectedAccountingProfileIdForWorkflow,
      });
      await Promise.all([exportBatchesQuery.refetch(), exportBatchDetailQuery.refetch()]);
      setNotice({ tone: "success", message: `${fileName} exported successfully.` });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "Failed to export mapped batch.") });
    } finally {
      setIsDownloadingMapped(false);
    }
  }

  async function handleRegenerateBatch(): Promise<void> {
    if (!selectedBatch) return;
    setNotice(null);
    try {
      const result = await regenerateExportBatchMutation.mutateAsync(selectedBatch.id);
      setSelectedBatchId(result.batch.id);
      await exportBatchesQuery.refetch();
      setNotice({
        tone: "success",
        message: `Batch regenerated for ${batchRangeLabel(result.batch.date_from, result.batch.date_to)}.`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "Failed to regenerate export batch.") });
    }
  }

  return (
    <AdminWorkspace
      title="Close Day"
      description="Operational close workflow. Resolve exceptions, generate a batch, reconcile, then export to accounting."
      actions={
        <>
          <NavLink
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-slate-50"
            to="/admin/finance/dashboard"
          >
            <MaterialSymbol icon="dashboard" />
            Finance Summary
          </NavLink>
          <NavLink
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-slate-50"
            to="/admin/reports"
          >
            <MaterialSymbol icon="analytics" />
            Reports
          </NavLink>
        </>
      }
    >
      {/* Step navigator */}
      <nav aria-label="Close day steps" className="rounded-xl border border-slate-200 bg-surface-container-lowest p-1 shadow-sm">
        <ol className="flex flex-wrap gap-1">
          {STEPS.map((step, idx) => {
            const isActive = activeStep === step.id;
            const isBlocked = step.id === "export" && hasDrift;
            return (
              <li className="flex-1" key={step.id}>
                <button
                  aria-current={isActive ? "step" : undefined}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-primary text-white shadow-sm"
                      : isBlocked
                        ? "cursor-not-allowed text-slate-400"
                        : "text-slate-600 hover:bg-slate-100"
                  }`}
                  disabled={isBlocked}
                  onClick={() => setActiveStep(step.id)}
                  type="button"
                >
                  <MaterialSymbol className="text-base" icon={step.icon} />
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="text-xs text-slate-400 sm:hidden">{idx + 1}</span>
                  {step.id === "exceptions" && hasExceptions ? (
                    <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-error text-[10px] font-bold text-white">
                      {exceptions?.total_exception_count}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Inline notice */}
      {notice ? (
        <section className={`rounded-xl border px-5 py-4 text-sm ${noticeClass(notice.tone)}`}>
          <div className="flex items-start gap-3">
            <MaterialSymbol
              className="mt-0.5 text-lg"
              icon={notice.tone === "error" ? "error" : notice.tone === "success" ? "task_alt" : "info"}
            />
            <p>{notice.message}</p>
          </div>
        </section>
      ) : null}

      {/* Step 1 — Exceptions */}
      {activeStep === "exceptions" ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-surface-container-lowest p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Step 1 of 5</p>
                <h2 className="font-headline text-xl font-extrabold text-slate-900">Resolve Exceptions</h2>
                <p className="text-sm text-slate-500">
                  All unpaid bookings and unresolved orders must be resolved before closing the day.
                </p>
              </div>
              <div className="flex items-end gap-3">
                <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Close Date
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary"
                    onChange={(e) => setCloseDateStr(e.target.value)}
                    type="date"
                    value={closeDateStr}
                  />
                </label>
                <button
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                  disabled={exceptionsQuery.isFetching}
                  onClick={() => void exceptionsQuery.refetch()}
                  type="button"
                >
                  <MaterialSymbol icon="refresh" />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {exceptionsQuery.isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-surface-container-lowest p-8 text-center text-sm text-slate-500">
              Loading exceptions...
            </div>
          ) : null}

          {exceptionsQuery.isError ? (
            <div className="rounded-xl border border-error/20 bg-error-container/30 p-5 text-sm text-on-error-container">
              Failed to load exceptions for {formatDate(closeDateStr)}.
            </div>
          ) : null}

          {exceptions && !exceptionsQuery.isLoading ? (
            <>
              {/* Unpaid bookings */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-surface-container-lowest shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Unpaid Bookings</p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      Bookings with pending payment status on {formatDate(closeDateStr)}.
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                      exceptions.unpaid_bookings.length > 0
                        ? "bg-error-container text-on-error-container"
                        : "bg-secondary-container text-on-secondary-container"
                    }`}
                  >
                    {exceptions.unpaid_bookings.length}
                  </span>
                </div>
                {exceptions.unpaid_bookings.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-slate-500">No unpaid bookings for this date.</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {exceptions.unpaid_bookings.map((booking) => (
                      <div className="flex items-center justify-between px-5 py-3.5" key={booking.id}>
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatTime(booking.slot_datetime)}
                            {booking.fee_label ? ` · ${booking.fee_label}` : ""}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-slate-500">Party of {booking.party_size}</p>
                            {booking.has_refund_transaction ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                Refund follow-up
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <NavLink
                          aria-label={`${booking.has_refund_transaction ? "Review" : "Resolve"} unpaid booking at ${formatTime(booking.slot_datetime)} on tee sheet`}
                          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                          to={teeSheetHref("unpaid", closeDateStr, booking.course_id)}
                        >
                          <MaterialSymbol icon="open_in_new" />
                          {booking.has_refund_transaction ? "Review on Tee Sheet" : "Resolve on Tee Sheet"}
                        </NavLink>
                      </div>
                    ))}
                    {singleUnpaidCourseId ? (
                      <div className="bg-slate-50 px-5 py-3">
                      <NavLink
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-error/20 bg-error-container/20 px-4 py-3 text-sm font-bold text-on-error-container transition-colors hover:bg-error-container/30"
                        to={teeSheetHref("unpaid", closeDateStr, singleUnpaidCourseId)}
                      >
                        <MaterialSymbol icon="receipt_long" />
                        View All Unpaid on Tee Sheet — {formatDate(closeDateStr)}
                      </NavLink>
                      </div>
                    ) : (
                      <div className="bg-slate-50 px-5 py-3 text-center text-xs font-semibold text-slate-600">
                        Open each unpaid booking from its row to land on the matching tee-sheet course.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Unresolved orders */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-surface-container-lowest shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Unresolved Orders</p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      Orders not yet collected or cancelled on {formatDate(closeDateStr)}.
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                      exceptions.unresolved_orders.length > 0
                        ? "bg-error-container text-on-error-container"
                        : "bg-secondary-container text-on-secondary-container"
                    }`}
                  >
                    {exceptions.unresolved_orders.length}
                  </span>
                </div>
                {exceptions.unresolved_orders.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-slate-500">No unresolved orders for this date.</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {exceptions.unresolved_orders.map((order) => (
                      <div className="flex items-center justify-between px-5 py-3.5" key={order.id}>
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold capitalize text-slate-900">{order.status}</p>
                          <p className="text-xs text-slate-500">Created {formatTime(order.created_at)}</p>
                        </div>
                        <NavLink
                          aria-label={`Resolve order in order queue`}
                          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                          to="/admin/orders"
                        >
                          <MaterialSymbol icon="open_in_new" />
                          Order Queue
                        </NavLink>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CTA */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-surface-container-lowest px-5 py-4 shadow-sm">
                {hasExceptions ? (
                  <p className="flex items-center gap-2 text-sm font-semibold text-error">
                    <MaterialSymbol icon="block" />
                    {exceptions.total_exception_count} exception{exceptions.total_exception_count !== 1 ? "s" : ""} must be resolved before generating a batch.
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-sm font-semibold text-secondary">
                    <MaterialSymbol icon="check_circle" />
                    No exceptions — ready to generate a batch.
                  </p>
                )}
                <button
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={hasExceptions}
                  onClick={() => setActiveStep("batch")}
                  type="button"
                >
                  Next: Generate Batch
                  <MaterialSymbol icon="arrow_forward" />
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {/* Step 2 — Generate Batch */}
      {activeStep === "batch" ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-surface-container-lowest p-5 shadow-sm">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Step 2 of 5</p>
              <h2 className="font-headline text-xl font-extrabold text-slate-900">Generate Export Batch</h2>
              <p className="text-sm text-slate-500">
                Generate a canonical export batch for the selected date range. The same club, profile, and range will reopen an existing batch.
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-[150px] flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Date From
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary"
                  max={dateTo}
                  onChange={(e) => setDateFrom(e.target.value)}
                  type="date"
                  value={dateFrom}
                />
              </label>
              <label className="flex min-w-[150px] flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Date To
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary"
                  min={dateFrom}
                  onChange={(e) => setDateTo(e.target.value)}
                  type="date"
                  value={dateTo}
                />
              </label>
              <button
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
                disabled={createExportBatchMutation.isPending}
                onClick={() => void handleGenerateBatch()}
                type="button"
              >
                <MaterialSymbol className="text-base" icon={createExportBatchMutation.isPending ? "hourglass_top" : "publish"} />
                {createExportBatchMutation.isPending ? "Generating..." : "Generate Batch"}
              </button>
            </div>
          </div>

          {selectedBatch ? (
            <div className="rounded-xl border border-slate-200 bg-surface-container-lowest p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Selected Batch</p>
                  <p className="text-sm font-bold text-slate-900">
                    {batchRangeLabel(selectedBatch.date_from, selectedBatch.date_to)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {selectedBatch.transaction_count} rows · Debits {formatCurrency(selectedBatch.total_debits)} · Credits {formatCurrency(selectedBatch.total_credits)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${batchStatusClass(selectedBatch.status)}`}>
                    {selectedBatch.status}
                  </span>
                  <button
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                    disabled={isDownloadingCanonical}
                    onClick={() => void handleDownloadBatch()}
                    type="button"
                  >
                    <MaterialSymbol icon="download" />
                    Download Canonical CSV
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex justify-between">
            <button
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
              onClick={() => setActiveStep("exceptions")}
              type="button"
            >
              <MaterialSymbol icon="arrow_back" />
              Back to Exceptions
            </button>
            <button
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!selectedBatch}
              onClick={() => setActiveStep("reconcile")}
              type="button"
            >
              Next: Reconcile
              <MaterialSymbol icon="arrow_forward" />
            </button>
          </div>
        </section>
      ) : null}

      {/* Step 3 — Reconcile */}
      {activeStep === "reconcile" ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-surface-container-lowest p-5 shadow-sm">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Step 3 of 5</p>
              <h2 className="font-headline text-xl font-extrabold text-slate-900">Reconcile</h2>
              <p className="text-sm text-slate-500">
                Verify the selected batch matches the current live finance state. Drift blocks export until resolved.
              </p>
            </div>
          </div>

          {!selectedBatch ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No batch selected. Go back to Generate Batch and create or select a batch first.
            </div>
          ) : null}

          {selectedBatch && exportBatchReconciliationQuery.isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-surface-container-lowest p-6 text-center text-sm text-slate-500">
              Loading reconciliation...
            </div>
          ) : null}

          {selectedBatch && reconciliation ? (
            <div className={`overflow-hidden rounded-xl border shadow-sm ${reconciliation.matches_live_state ? "border-secondary/20 bg-secondary-container/20" : "border-error/20 bg-error-container/20"}`}>
              <div className="flex items-center gap-3 px-5 py-4">
                <MaterialSymbol
                  className={`text-xl ${reconciliation.matches_live_state ? "text-secondary" : "text-error"}`}
                  icon={reconciliation.matches_live_state ? "check_circle" : "sync_problem"}
                />
                <div>
                  <p className={`text-sm font-bold ${reconciliation.matches_live_state ? "text-secondary" : "text-error"}`}>
                    {reconciliation.matches_live_state ? "Batch matches live finance state" : "Drift detected — batch does not match live state"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Reconciled at {formatDateTime(reconciliation.reconciled_at)} · {reconciliation.persisted_transaction_count} persisted rows · {reconciliation.current_transaction_count} live rows
                  </p>
                </div>
              </div>
              {!reconciliation.matches_live_state ? (
                <div className="border-t border-error/10 px-5 py-4">
                  <p className="mb-3 text-sm font-semibold text-on-error-container">
                    {reconciliation.missing_transaction_count} missing · {reconciliation.new_transaction_count} new
                  </p>
                  <button
                    className="flex items-center gap-2 rounded-xl bg-error px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:opacity-90 disabled:opacity-60"
                    disabled={regenerateExportBatchMutation.isPending}
                    onClick={() => void handleRegenerateBatch()}
                    type="button"
                  >
                    <MaterialSymbol icon="autorenew" />
                    {regenerateExportBatchMutation.isPending ? "Regenerating..." : "Regenerate Batch"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex justify-between">
            <button
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
              onClick={() => setActiveStep("batch")}
              type="button"
            >
              <MaterialSymbol icon="arrow_back" />
              Back to Generate Batch
            </button>
            <button
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!selectedBatch || hasDrift}
              onClick={() => setActiveStep("export")}
              type="button"
            >
              {hasDrift ? "Resolve drift to proceed" : "Next: Export"}
              <MaterialSymbol icon={hasDrift ? "lock" : "arrow_forward"} />
            </button>
          </div>
        </section>
      ) : null}

      {/* Step 4 — Export */}
      {activeStep === "export" ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-surface-container-lowest p-5 shadow-sm">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Step 4 of 5</p>
              <h2 className="font-headline text-xl font-extrabold text-slate-900">Mapped Export</h2>
              <p className="text-sm text-slate-500">
                Export the batch through an accounting mapping profile to produce the final handoff file.
              </p>
            </div>
          </div>

          {hasDrift ? (
            <div className="rounded-xl border border-error/20 bg-error-container/20 px-5 py-4 text-sm font-semibold text-on-error-container">
              Export is blocked — batch has drift. Return to Reconcile to regenerate the batch first.
            </div>
          ) : null}

          {!hasDrift && selectedBatch ? (
            <>
              {accountingProfiles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No accounting profiles configured. Configure profiles under Settings → Finance & Accounting.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-surface-container-lowest shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Accounting Profile</p>
                        {selectedAccountingProfile ? (
                          <>
                            <p className="mt-0.5 text-sm font-bold text-slate-900">{selectedAccountingProfile.name}</p>
                            <p className="text-xs text-slate-500">{selectedAccountingProfile.target_system}</p>
                          </>
                        ) : (
                          <p className="mt-0.5 text-sm font-bold text-slate-900">No accounting profile selected.</p>
                        )}
                      </div>
                      <select
                        aria-label="Select accounting profile"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-primary"
                        onChange={(e) => setSelectedAccountingProfileId(e.target.value)}
                        value={selectedAccountingProfileIdForWorkflow ?? ""}
                      >
                        {accountingProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {!selectedAccountingProfile ? (
                    <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-500">
                      Choose an accounting profile to preview and export this batch.
                    </div>
                  ) : null}

                  {selectedAccountingProfile && mappedExportPreviewQuery.isLoading ? (
                    <div className="px-5 py-6 text-center text-sm text-slate-500">Loading mapped export preview...</div>
                  ) : null}

                  {selectedAccountingProfile && mappedPreview ? (
                    <div className="px-5 py-4">
                      {mappedPreview.validation_errors.length > 0 ? (
                        <div className="mb-4 rounded-xl border border-error/20 bg-error-container/20 px-4 py-3">
                          <p className="mb-2 text-sm font-bold text-on-error-container">Mapped export validation failed</p>
                          <ul className="space-y-1 text-xs text-on-error-container">
                            {mappedPreview.validation_errors.map((err, idx) => (
                              <li key={idx}>{err.message}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{mappedPreview.file_name}</p>
                          <p className="text-xs text-slate-500">{mappedPreview.row_count} rows · {mappedPreview.target_system}</p>
                        </div>
                        <button
                          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            !selectedAccountingProfile ||
                            !mappedPreview.download_ready ||
                            isDownloadingMapped ||
                            mappedPreview.validation_errors.length > 0
                          }
                          onClick={() => void handleDownloadMappedExport()}
                          type="button"
                        >
                          <MaterialSymbol icon={isDownloadingMapped ? "hourglass_top" : "upload_file"} />
                          {isDownloadingMapped ? "Exporting..." : "Export Mapped CSV"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          ) : null}

          <div className="flex justify-between">
            <button
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
              onClick={() => setActiveStep("reconcile")}
              type="button"
            >
              <MaterialSymbol icon="arrow_back" />
              Back to Reconcile
            </button>
            <button
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-60"
              disabled={hasDrift}
              onClick={() => setActiveStep("audit")}
              type="button"
            >
              Next: Audit Trail
              <MaterialSymbol icon="arrow_forward" />
            </button>
          </div>
        </section>
      ) : null}

      {/* Step 5 — Audit Trail */}
      {activeStep === "audit" ? (
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-surface-container-lowest p-5 shadow-sm">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Step 5 of 5</p>
              <h2 className="font-headline text-xl font-extrabold text-slate-900">Audit Trail</h2>
              <p className="text-sm text-slate-500">Batch history for this club. Select any batch to inspect or re-export.</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-surface-container-lowest shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-900">Export Batches</p>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  {exportBatches.length}
                </span>
              </div>
            </div>
            <div className="max-h-[480px] space-y-3 overflow-y-auto px-5 py-4">
              {exportBatchesQuery.isLoading ? <p className="text-sm text-slate-500">Loading batch history...</p> : null}
              {!exportBatchesQuery.isLoading && exportBatches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No export batches have been generated yet.
                </div>
              ) : null}
              {exportBatches.map((batch) => (
                <button
                  className={`w-full rounded-xl border px-4 py-4 text-left transition-colors ${
                    selectedBatchId === batch.id ? "border-primary/40 bg-primary-container/20" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                  key={batch.id}
                  onClick={() => {
                    setSelectedBatchId(batch.id);
                    setActiveStep("reconcile");
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-bold text-slate-900">{batchRangeLabel(batch.date_from, batch.date_to)}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(batch.generated_at)}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${batchStatusClass(batch.status)}`}>
                      {batch.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{batch.transaction_count} rows</span>
                    <span>Debits {formatCurrency(batch.total_debits)}</span>
                    <span>Credits {formatCurrency(batch.total_credits)}</span>
                    {latestExportEvent(batch) ? (
                      <span>Last export {formatDateTime(latestExportEvent(batch)!.exported_at)}</span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <button
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
              onClick={() => setActiveStep("export")}
              type="button"
            >
              <MaterialSymbol icon="arrow_back" />
              Back to Export
            </button>
            <div className="flex items-center gap-2 rounded-xl border border-secondary/20 bg-secondary-container/20 px-4 py-2.5 text-sm font-bold text-on-secondary-container">
              <MaterialSymbol icon="check_circle" />
              Close Day Complete
            </div>
          </div>
        </section>
      ) : null}
    </AdminWorkspace>
  );
}
