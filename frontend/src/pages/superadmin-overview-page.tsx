import { useMemo } from "react";
import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { useSuperadminClubsQuery } from "../features/superadmin/hooks";
import { useSession } from "../session/session-context";
import type { SuperadminClubSummary } from "../types/superadmin";

function statusBadge(status: SuperadminClubSummary["registry_status"]): string {
  if (status === "active") return "bg-primary-container text-on-primary-container";
  if (status === "paused") return "bg-error-container/40 text-on-error-container";
  return "bg-secondary-container/50 text-on-secondary-container";
}

function statusLabel(status: SuperadminClubSummary["registry_status"]): string {
  if (status === "active") return "Live";
  if (status === "paused") return "Paused";
  return "Onboarding";
}

function onboardingStateLabel(state: SuperadminClubSummary["onboarding_state"]): string {
  return state.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SuperadminOverviewPage(): JSX.Element {
  const { accessToken } = useSession();
  const clubsQuery = useSuperadminClubsQuery({ accessToken });
  const clubs = clubsQuery.data?.items ?? [];

  const stats = useMemo(() => {
    const total = clubs.length;
    const active = clubs.filter((c) => c.registry_status === "active").length;
    const onboarding = clubs.filter((c) => c.registry_status === "onboarding").length;
    const paused = clubs.filter((c) => c.registry_status === "paused").length;
    const financeReady = clubs.filter((c) => c.finance_ready).length;
    const unassigned = clubs.filter((c) => c.active_assignment_count === 0).length;
    const needsAttention = clubs.filter(
      (c) =>
        c.registry_status === "onboarding" &&
        (!c.finance_ready || c.active_assignment_count === 0),
    );
    const recentClubs = [...clubs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
    return { total, active, onboarding, paused, financeReady, unassigned, needsAttention, recentClubs };
  }, [clubs]);

  const isLoading = clubsQuery.isLoading;

  return (
    <div className="space-y-8 pt-2">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Clubs",    value: stats.total,        icon: "business",         accent: "border-primary" },
          { label: "Live",           value: stats.active,       icon: "check_circle",     accent: "border-emerald-500" },
          { label: "Onboarding",     value: stats.onboarding,   icon: "pending_actions",  accent: "border-secondary" },
          { label: "Paused",         value: stats.paused,       icon: "pause_circle",     accent: "border-error" },
        ].map(({ label, value, icon, accent }) => (
          <div
            className={`rounded-2xl border-l-4 bg-surface-container-lowest p-5 shadow-sm ${accent}`}
            key={label}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
              <MaterialSymbol className="text-slate-400" icon={icon} />
            </div>
            {isLoading ? (
              <div className="h-8 w-12 animate-pulse rounded bg-slate-100" />
            ) : (
              <span className="font-headline text-3xl font-extrabold text-on-surface">{value}</span>
            )}
          </div>
        ))}
      </div>

      {/* Readiness + action items */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Readiness */}
        <div className="rounded-2xl border border-slate-100 bg-surface-container-lowest p-6 shadow-sm">
          <h3 className="mb-5 font-headline text-base font-bold text-on-surface">Fleet Readiness</h3>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <div className="h-8 animate-pulse rounded bg-slate-100" key={i} />)}
            </div>
          ) : stats.total === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No clubs yet.</p>
          ) : (
            <div className="space-y-4">
              {[
                {
                  label: "Finance configured",
                  count: stats.financeReady,
                  total: stats.total,
                  color: "bg-primary",
                },
                {
                  label: "Assigned team members",
                  count: stats.total - stats.unassigned,
                  total: stats.total,
                  color: "bg-secondary",
                },
              ].map(({ label, count, total, color }) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-on-surface">{label}</span>
                    <span className="text-sm font-bold text-on-surface">
                      {count} / {total}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${color} transition-all`}
                      style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action items */}
        <div className="rounded-2xl border border-slate-100 bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline text-base font-bold text-on-surface">Needs Attention</h3>
            {stats.needsAttention.length > 0 && (
              <span className="rounded-full bg-error/10 px-2.5 py-0.5 text-xs font-bold text-error">
                {stats.needsAttention.length}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <div className="h-12 animate-pulse rounded bg-slate-100" key={i} />)}
            </div>
          ) : stats.needsAttention.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <MaterialSymbol className="text-3xl text-emerald-500" icon="check_circle" />
              <p className="text-sm font-semibold text-on-surface">All onboarding clubs are on track.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.needsAttention.map((club) => (
                <NavLink
                  className="flex items-center justify-between rounded-xl bg-surface-container-low px-4 py-3 transition-colors hover:bg-surface-container"
                  key={club.id}
                  to="/superadmin/clubs"
                >
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{club.name}</p>
                    <p className="text-xs text-slate-500">{onboardingStateLabel(club.onboarding_state)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!club.finance_ready && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        Finance
                      </span>
                    )}
                    {club.active_assignment_count === 0 && (
                      <span className="rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-bold text-error">
                        No team
                      </span>
                    )}
                    <MaterialSymbol className="text-sm text-slate-400" icon="chevron_right" />
                  </div>
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent clubs */}
      <div className="rounded-2xl border border-slate-100 bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-headline text-base font-bold text-on-surface">All Clubs</h3>
          <NavLink className="text-xs font-bold text-slate-400 hover:text-primary" to="/superadmin/clubs">
            Manage
          </NavLink>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div className="h-12 animate-pulse rounded bg-slate-100" key={i} />)}
          </div>
        ) : stats.recentClubs.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No clubs registered yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {stats.recentClubs.map((club) => (
              <div className="flex items-center justify-between py-3" key={club.id}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <MaterialSymbol className="text-sm text-primary" icon="sports_golf" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">{club.name}</p>
                    <p className="text-xs text-slate-500">{club.location} · {club.timezone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">
                    {club.active_assignment_count} assigned
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusBadge(club.registry_status)}`}
                  >
                    {statusLabel(club.registry_status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
