import { useEffect, useState } from "react";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import {
  useArchiveClubTargetMutation,
  useClubTargetsQuery,
  useCreateClubTargetMutation,
  useTargetMetricCatalogQuery,
  useUpdateClubTargetMutation,
} from "../features/targets/hooks";
import { useSession } from "../session/session-context";
import type { ClubTarget, ClubTargetUpsertInput, TargetDomainCatalogItem } from "../types/targets";

function defaultForm(): ClubTargetUpsertInput {
  return {
    domain_key: "golf",
    metric_key: "",
    period_key: "monthly",
    period_start: "2026-05-01",
    period_end: "2026-05-31",
    target_value: 1,
  };
}

function formatTargetValue(target: ClubTarget): string {
  if (target.unit === "currency") {
    return `R${target.target_value.toFixed(2)}`;
  }
  return `${target.target_value}`;
}

export function AdminTargetsPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const catalogQuery = useTargetMetricCatalogQuery({ accessToken, selectedClubId });
  const targetsQuery = useClubTargetsQuery({ accessToken, selectedClubId });
  const createTargetMutation = useCreateClubTargetMutation();
  const updateTargetMutation = useUpdateClubTargetMutation();
  const archiveTargetMutation = useArchiveClubTargetMutation();
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [form, setForm] = useState<ClubTargetUpsertInput>(defaultForm);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedDomain =
    catalogQuery.data?.items.find((item) => item.domain_key === form.domain_key) ?? null;
  const availableMetrics = selectedDomain?.metrics ?? [];

  useEffect(() => {
    if (!selectedDomain || availableMetrics.some((item) => item.metric_key === form.metric_key)) {
      return;
    }
    setForm((current) => ({
      ...current,
      metric_key: availableMetrics[0]?.metric_key ?? "",
    }));
  }, [availableMetrics, form.metric_key, selectedDomain]);

  useEffect(() => {
    if (catalogQuery.data?.items.length && !form.metric_key) {
      const firstDomain = catalogQuery.data.items[0];
      setForm((current) => ({
        ...current,
        domain_key: firstDomain.domain_key,
        metric_key: firstDomain.metrics[0]?.metric_key ?? "",
      }));
    }
  }, [catalogQuery.data, form.metric_key]);

  function beginEdit(target: ClubTarget): void {
    setEditingTargetId(target.id);
    setForm({
      domain_key: target.domain_key,
      metric_key: target.metric_key,
      period_key: target.period_key,
      period_start: target.period_start,
      period_end: target.period_end,
      target_value: target.target_value,
    });
    setNotice(null);
  }

  async function handleSubmit(): Promise<void> {
    setNotice(null);
    if (editingTargetId) {
      await updateTargetMutation.mutateAsync({ targetId: editingTargetId, payload: form });
      setNotice("Target updated.");
    } else {
      await createTargetMutation.mutateAsync(form);
      setNotice("Target created.");
    }
    setEditingTargetId(null);
    setForm(defaultForm());
  }

  async function handleArchive(targetId: string): Promise<void> {
    setNotice(null);
    await archiveTargetMutation.mutateAsync(targetId);
    setNotice("Target archived.");
  }

  return (
    <AdminWorkspace
      title="Targets"
      description="Club-scoped performance targets defined directly from backend-approved metrics."
      actions={
        notice ? (
          <div className="rounded-xl bg-primary-container/40 px-4 py-2 text-sm font-semibold text-on-primary-container">
            {notice}
          </div>
        ) : null
      }
    >
      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Target Form</p>
            <h2 className="mt-1 font-headline text-xl font-bold text-on-surface">
              {editingTargetId ? "Edit Target" : "Create Target"}
            </h2>
          </div>
          <div className="space-y-4">
            <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
              Domain
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    domain_key: event.target.value,
                    metric_key:
                      catalogQuery.data?.items.find((item) => item.domain_key === event.target.value)?.metrics[0]
                        ?.metric_key ?? "",
                  }))
                }
                value={form.domain_key}
              >
                {(catalogQuery.data?.items ?? []).map((domain: TargetDomainCatalogItem) => (
                  <option key={domain.domain_key} value={domain.domain_key}>
                    {domain.domain_label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
              Metric
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                onChange={(event) => setForm((current) => ({ ...current, metric_key: event.target.value }))}
                value={form.metric_key}
              >
                {availableMetrics.map((metric) => (
                  <option key={metric.metric_key} value={metric.metric_key}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
              Period
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                onChange={(event) => setForm((current) => ({ ...current, period_key: event.target.value }))}
                value={form.period_key}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
                Start
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  onChange={(event) => setForm((current) => ({ ...current, period_start: event.target.value }))}
                  type="date"
                  value={form.period_start}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
                End
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  onChange={(event) => setForm((current) => ({ ...current, period_end: event.target.value }))}
                  type="date"
                  value={form.period_end}
                />
              </label>
            </div>
            <label className="flex flex-col gap-2 text-sm font-semibold text-on-surface">
              Target Value
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                onChange={(event) =>
                  setForm((current) => ({ ...current, target_value: Number(event.target.value || "0") }))
                }
                type="number"
                value={form.target_value}
              />
            </label>
            <div className="flex gap-3">
              <button
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white"
                onClick={() => {
                  void handleSubmit();
                }}
                type="button"
              >
                {editingTargetId ? "Save Target" : "Create Target"}
              </button>
              {editingTargetId ? (
                <button
                  className="rounded-xl bg-surface-container px-4 py-2.5 text-sm font-semibold text-on-surface"
                  onClick={() => {
                    setEditingTargetId(null);
                    setForm(defaultForm());
                  }}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Defined Targets</p>
              <h2 className="mt-1 font-headline text-xl font-bold text-on-surface">Club Target Register</h2>
            </div>
            <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-slate-500">
              {targetsQuery.data?.total_count ?? 0}
            </span>
          </div>
          <div className="space-y-3">
            {(targetsQuery.data?.items ?? []).map((target) => (
              <div key={target.id} className="rounded-2xl border border-slate-100 bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-on-surface">{target.metric_label}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {target.domain_label} · {target.period_key} · {target.period_start} to {target.period_end}
                    </p>
                    <p className="mt-2 text-lg font-extrabold text-on-surface">{formatTargetValue(target)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-xl bg-surface-container px-3 py-2 text-xs font-semibold text-on-surface"
                      onClick={() => beginEdit(target)}
                      type="button"
                    >
                      Edit
                    </button>
                    {!target.archived ? (
                      <button
                        className="rounded-xl bg-error/10 px-3 py-2 text-xs font-semibold text-error"
                        onClick={() => {
                          void handleArchive(target.id);
                        }}
                        type="button"
                      >
                        Archive
                      </button>
                    ) : (
                      <span className="rounded-xl bg-surface-container px-3 py-2 text-xs font-semibold text-slate-500">
                        Archived
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {targetsQuery.isLoading ? (
              <div className="rounded-2xl bg-white px-4 py-6 text-sm text-slate-500">Loading targets...</div>
            ) : null}
            {!targetsQuery.isLoading && (targetsQuery.data?.items.length ?? 0) === 0 ? (
              <div className="rounded-2xl bg-white px-4 py-6 text-sm text-slate-500">
                No club targets have been defined yet.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </AdminWorkspace>
  );
}
