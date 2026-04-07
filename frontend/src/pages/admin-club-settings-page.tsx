import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useClubConfigQuery, useCoursesQuery, usePricingMatricesQuery, useRuleSetsQuery, useTeesQuery } from "../features/golf-settings/hooks";
import { useAccountingExportProfilesQuery } from "../features/finance/hooks";
import { useClubTargetsQuery } from "../features/targets/hooks";
import { useSession } from "../session/session-context";

function SettingCard({
  title,
  description,
  href,
  icon,
  children,
}: {
  title: string;
  description: string;
  href: string;
  icon: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <NavLink
      to={href}
      className="flex flex-col gap-4 rounded-2xl bg-surface-container-lowest p-5 shadow-sm transition-colors hover:bg-slate-50"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container text-primary">
          <MaterialSymbol icon={icon} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-on-surface">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
        </div>
        <MaterialSymbol className="shrink-0 text-slate-300" icon="chevron_right" />
      </div>
      {children ? (
        <div className="border-t border-slate-100 pt-3">
          {children}
        </div>
      ) : null}
    </NavLink>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-on-surface">{value}</span>
    </div>
  );
}

export function AdminClubSettingsPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const selectedClub = bootstrap?.selected_club;

  const clubConfigQuery = useClubConfigQuery({ accessToken, selectedClubId });
  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const teesQuery = useTeesQuery({ accessToken, selectedClubId });
  const ruleSetsQuery = useRuleSetsQuery({ accessToken, selectedClubId });
  const pricingQuery = usePricingMatricesQuery({ accessToken, selectedClubId });
  const targetsQuery = useClubTargetsQuery({ accessToken, selectedClubId });
  const profilesQuery = useAccountingExportProfilesQuery({ accessToken, selectedClubId });

  const config = clubConfigQuery.data;
  const activeTargets = (targetsQuery.data?.items ?? []).filter((t) => !t.archived).length;
  const profiles = profilesQuery.data?.profiles ?? [];
  const activeProfile = profiles.find((p) => p.is_active);

  return (
    <AdminWorkspace
      title="Club Settings"
      description={selectedClub?.name ? `Configuration hub for ${selectedClub.name}` : "Configuration hub"}
    >
      <div className="space-y-8">

        <section>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Club Configuration</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingCard
              title="Club Config"
              description="Timezone, operating hours, booking advance window, slot interval, and cancellation policy."
              href="/admin/golf/settings"
              icon="tune"
            >
              {config ? (
                <div className="space-y-1.5">
                  <StatRow label="Timezone" value={config.timezone} />
                  <StatRow label="Booking window" value={`${config.booking_window_days} days`} />
                  <StatRow label="Slot interval" value={`${config.default_slot_interval_minutes} min`} />
                  <StatRow label="Cancellation policy" value={`${config.cancellation_policy_hours}h notice`} />
                </div>
              ) : (
                <p className="text-xs text-slate-400">{clubConfigQuery.isLoading ? "Loading..." : "Not configured"}</p>
              )}
            </SettingCard>

            <SettingCard
              title="Golf Setup"
              description="Courses, tees, booking rule sets, and pricing matrices."
              href="/admin/golf/settings"
              icon="golf_course"
            >
              <div className="space-y-1.5">
                <StatRow label="Courses" value={coursesQuery.data?.length ?? "—"} />
                <StatRow label="Tees" value={teesQuery.data?.length ?? "—"} />
                <StatRow label="Rule sets" value={ruleSetsQuery.data?.length ?? "—"} />
                <StatRow label="Pricing matrices" value={pricingQuery.data?.length ?? "—"} />
              </div>
            </SettingCard>
          </div>
        </section>

        <section>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Performance & Reporting</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingCard
              title="Targets"
              description="Club-level operating targets for rounds, revenue, and membership. Live targets surface on all domain dashboards."
              href="/admin/targets"
              icon="track_changes"
            >
              <div className="space-y-1.5">
                <StatRow
                  label="Active targets"
                  value={targetsQuery.isLoading ? "—" : activeTargets}
                />
                <StatRow
                  label="Total defined"
                  value={targetsQuery.isLoading ? "—" : targetsQuery.data?.total_count ?? 0}
                />
              </div>
            </SettingCard>
          </div>
        </section>

        <section>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Finance & Accounting</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingCard
              title="Accounting Export Profiles"
              description="Map your canonical finance batches to your accounting package (Generic Journal, Pastel, Sage). Profiles control field-level transaction mapping."
              href="/admin/finance"
              icon="receipt_long"
            >
              <div className="space-y-1.5">
                <StatRow label="Profiles configured" value={profilesQuery.isLoading ? "—" : profiles.length} />
                <StatRow
                  label="Active profile"
                  value={profilesQuery.isLoading ? "—" : activeProfile?.name ?? "None set"}
                />
              </div>
            </SettingCard>

            <SettingCard
              title="Close Day & Export Batches"
              description="Generate canonical export batches, run reconciliation, and execute mapped exports to your accounting system."
              href="/admin/finance"
              icon="task_alt"
            >
              <p className="text-xs text-slate-400">
                Batch generation and reconciliation is a daily operational workflow, not a one-time configuration step.
              </p>
            </SettingCard>
          </div>
        </section>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          <p className="text-xs font-semibold text-slate-500">
            <span className="font-bold text-slate-700">Superadmin-owned: </span>
            Club identity (name, location, slug), module enablement, and onboarding are managed by your platform administrator and cannot be changed from this page.
          </p>
        </div>

      </div>
    </AdminWorkspace>
  );
}
