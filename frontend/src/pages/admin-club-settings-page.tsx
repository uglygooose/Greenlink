import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useCoursesQuery, usePricingMatricesQuery, useRuleSetsQuery, useTeesQuery } from "../features/golf-settings/hooks";
import { useClubTargetsQuery } from "../features/targets/hooks";
import { useSession } from "../session/session-context";

export function AdminClubSettingsPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const selectedClub = bootstrap?.selected_club;

  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const teesQuery = useTeesQuery({ accessToken, selectedClubId });
  const ruleSetsQuery = useRuleSetsQuery({ accessToken, selectedClubId });
  const pricingQuery = usePricingMatricesQuery({ accessToken, selectedClubId });
  const targetsQuery = useClubTargetsQuery({ accessToken, selectedClubId });

  const activeModules = Object.entries(bootstrap?.module_flags ?? {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);

  return (
    <AdminWorkspace
      title="Club Settings"
      description="Admin-owned club configuration hub linking to live operational settings without duplicating superadmin ownership."
      actions={
        <>
          <NavLink
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-primary-dim"
            to="/admin/golf/settings"
          >
            <MaterialSymbol filled icon="tune" />
            Golf Settings
          </NavLink>
          <NavLink
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-slate-50"
            to="/admin/targets"
          >
            <MaterialSymbol icon="track_changes" />
            Targets
          </NavLink>
        </>
      }
      kpis={
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border-l-4 border-primary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Courses</span>
              <MaterialSymbol className="text-primary" icon="map" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-headline text-3xl font-extrabold text-on-surface">{coursesQuery.data?.length ?? 0}</span>
              <span className="text-xs font-medium text-primary">{teesQuery.data?.length ?? 0} tees</span>
            </div>
          </div>
          <div className="rounded-xl border-l-4 border-secondary bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rulesets</span>
              <MaterialSymbol className="text-secondary" icon="rule_settings" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-headline text-3xl font-extrabold text-on-surface">{ruleSetsQuery.data?.length ?? 0}</span>
              <span className="text-xs font-medium text-secondary">{pricingQuery.data?.length ?? 0} matrices</span>
            </div>
          </div>
          <div className="rounded-xl border-l-4 border-emerald-500 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Targets</span>
              <MaterialSymbol className="text-emerald-500" icon="track_changes" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-headline text-3xl font-extrabold text-on-surface">{targetsQuery.data?.total_count ?? 0}</span>
              <span className="text-xs font-medium text-emerald-600">live club targets</span>
            </div>
          </div>
          <div className="rounded-xl border-l-4 border-amber-500 bg-surface-container-lowest p-6 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Modules</span>
              <MaterialSymbol className="text-amber-500" icon="extension" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-headline text-3xl font-extrabold text-on-surface">{activeModules.length}</span>
              <span className="text-xs font-medium text-amber-700">enabled</span>
            </div>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="space-y-6">
          <div className="rounded-2xl bg-surface-container-low p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Club Context</p>
            <h2 className="mt-2 font-headline text-xl font-bold text-on-surface">{selectedClub?.name ?? "Selected club"}</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Timezone</p>
                <p className="mt-2 text-sm font-semibold text-on-surface">{selectedClub?.timezone ?? "Unavailable"}</p>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Active modules</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeModules.length > 0 ? (
                    activeModules.map((moduleKey) => (
                      <span className="rounded-full bg-primary-container px-3 py-1 text-xs font-bold text-on-primary-container" key={moduleKey}>
                        {moduleKey}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">No enabled modules</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-surface-container-lowest shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Live Surfaces</p>
              <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">Admin-owned configuration areas</h3>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <NavLink className="rounded-2xl bg-surface-container-low p-5 transition-colors hover:bg-slate-50" to="/admin/golf/settings">
                <p className="text-sm font-semibold text-on-surface">Golf Settings</p>
                <p className="mt-1 text-xs text-slate-500">Courses, tees, booking rules, and pricing definitions.</p>
              </NavLink>
              <NavLink className="rounded-2xl bg-surface-container-low p-5 transition-colors hover:bg-slate-50" to="/admin/targets">
                <p className="text-sm font-semibold text-on-surface">Targets</p>
                <p className="mt-1 text-xs text-slate-500">Club-level operating targets that feed dashboard context.</p>
              </NavLink>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl bg-surface-container-low p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Boundary Guardrails</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold text-on-surface">Admin owns</p>
                <p className="mt-1 text-xs text-slate-500">Daily operational configuration and club-scoped settings.</p>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <p className="text-sm font-semibold text-on-surface">Superadmin owns</p>
                <p className="mt-1 text-xs text-slate-500">Club lifecycle, onboarding, platform registry, and module enablement.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AdminWorkspace>
  );
}
