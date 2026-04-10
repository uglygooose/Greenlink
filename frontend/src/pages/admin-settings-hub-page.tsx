import type React from "react";
import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useNewsPostsQuery, usePublishedNewsFeedQuery, useBlastsQuery } from "../features/comms/hooks";
import { useAccountingExportProfilesQuery } from "../features/finance/hooks";
import { useClubConfigQuery, useCoursesQuery, usePricingMatricesQuery, useRuleSetsQuery, useTeesQuery } from "../features/golf-settings/hooks";
import { useSession } from "../session/session-context";
import { useClubTargetsQuery } from "../features/targets/hooks";
import type { MembershipRole } from "../types/session";

type StatusTone = "good" | "muted" | "warn";

type SettingsCardProps = {
  title: string;
  description: string;
  href: string;
  icon: string;
  statusLabel: string;
  statusTone: StatusTone;
  children: React.ReactNode;
};

type ModuleSummary = {
  key: "communications" | "finance" | "golf" | "pos";
  label: string;
};

const MODULE_SUMMARIES: ModuleSummary[] = [
  { key: "golf", label: "Golf" },
  { key: "finance", label: "Finance" },
  { key: "communications", label: "Communications" },
  { key: "pos", label: "Commerce" },
];

function statusClassName(tone: StatusTone): string {
  switch (tone) {
    case "good":
      return "bg-emerald-100 text-emerald-700";
    case "warn":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-slate-100 text-slate-500";
  }
}

function StatRow({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-on-surface">{value}</span>
    </div>
  );
}

function SettingsCard({
  title,
  description,
  href,
  icon,
  statusLabel,
  statusTone,
  children,
}: SettingsCardProps): JSX.Element {
  return (
    <NavLink
      className="group flex h-full flex-col gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
      to={href}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <MaterialSymbol icon={icon} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-headline text-lg font-extrabold text-on-surface">{title}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${statusClassName(statusTone)}`}>
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
          </div>
        </div>
        <MaterialSymbol className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-500" icon="arrow_forward" />
      </div>
      <div className="space-y-2 border-t border-slate-100 pt-4">{children}</div>
    </NavLink>
  );
}

function selectedRole(
  selectedClubId: string | null,
  memberships: Array<{ club_id: string; membership_role: MembershipRole | null }> | undefined,
): MembershipRole | null {
  if (!selectedClubId || !memberships) {
    return null;
  }
  return memberships.find((club) => club.club_id === selectedClubId)?.membership_role ?? null;
}

export function AdminSettingsHubPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const selectedClub = bootstrap?.selected_club;
  const membershipRole = selectedRole(selectedClubId, bootstrap?.available_clubs);
  const moduleFlags = bootstrap?.module_flags ?? {};
  const enabledModules = MODULE_SUMMARIES.filter((item) => moduleFlags[item.key] === true);
  const communicationsEnabled = moduleFlags.communications === true;
  const commsSelectedClubId = communicationsEnabled ? selectedClubId : null;

  const clubConfigQuery = useClubConfigQuery({ accessToken, selectedClubId });
  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const teesQuery = useTeesQuery({ accessToken, selectedClubId });
  const ruleSetsQuery = useRuleSetsQuery({ accessToken, selectedClubId });
  const pricingQuery = usePricingMatricesQuery({ accessToken, selectedClubId });
  const profilesQuery = useAccountingExportProfilesQuery({ accessToken, selectedClubId });
  const targetsQuery = useClubTargetsQuery({ accessToken, selectedClubId });
  const postsQuery = useNewsPostsQuery({ accessToken, selectedClubId: commsSelectedClubId });
  const publishedFeedQuery = usePublishedNewsFeedQuery({ accessToken, selectedClubId: commsSelectedClubId });
  const blastsQuery = useBlastsQuery({ accessToken, selectedClubId: commsSelectedClubId });

  const config = clubConfigQuery.data;
  const courseCount = coursesQuery.data?.length ?? 0;
  const teeCount = teesQuery.data?.length ?? 0;
  const ruleSetCount = ruleSetsQuery.data?.length ?? 0;
  const pricingCount = pricingQuery.data?.length ?? 0;
  const profiles = profilesQuery.data?.profiles ?? [];
  const activeProfile = profiles.find((profile) => profile.is_active);
  const activeTargets = (targetsQuery.data?.items ?? []).filter((target) => !target.archived).length;
  const livePosts = publishedFeedQuery.data?.posts.length ?? 0;
  const blastCount = blastsQuery.data?.blasts.length ?? 0;
  const golfConfigured = Boolean(config) && courseCount > 0 && teeCount > 0;
  const golfStatus = golfConfigured ? "configured" : clubConfigQuery.isLoading ? "syncing" : "needs setup";
  const golfTone: StatusTone = golfConfigured ? "good" : clubConfigQuery.isLoading ? "muted" : "warn";
  const financeStatus = activeProfile ? "ready" : profilesQuery.isLoading ? "syncing" : "needs profile";
  const financeTone: StatusTone = activeProfile ? "good" : profilesQuery.isLoading ? "muted" : "warn";
  const modulesStatus = enabledModules.length > 0 ? `${enabledModules.length} enabled` : "no modules";
  const modulesTone: StatusTone = enabledModules.length > 0 ? "good" : "warn";
  const communicationsStatus = !communicationsEnabled
    ? "disabled"
    : publishedFeedQuery.isLoading
      ? "syncing"
      : livePosts > 0
        ? `${livePosts} live`
        : blastCount > 0
          ? `${blastCount} sent`
          : "quiet";
  const communicationsTone: StatusTone = !communicationsEnabled
    ? "muted"
    : livePosts > 0
      ? "good"
      : communicationsStatus === "quiet"
        ? "warn"
        : "muted";
  const targetsStatus = activeTargets > 0 ? `${activeTargets} active` : targetsQuery.isLoading ? "syncing" : "attention";
  const targetsTone: StatusTone = activeTargets > 0 ? "good" : targetsQuery.isLoading ? "muted" : "warn";

  return (
    <AdminWorkspace
      title="Settings"
      description={
        selectedClub?.name
          ? `Structured control center for ${selectedClub.name}. Use the hub to step into the right settings surface without hunting through operational pages.`
          : "Structured control center for club configuration and readiness."
      }
      kpis={
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700">Club Profile</p>
            <p className="mt-2 font-headline text-2xl font-extrabold text-slate-900">{selectedClub?.name ?? "No club selected"}</p>
            <p className="mt-2 text-sm text-slate-600">
              {selectedClub ? `${selectedClub.location} - ${selectedClub.timezone}` : "Select a club to load scoped settings."}
            </p>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Enabled Modules</p>
            <p className="mt-2 font-headline text-2xl font-extrabold text-slate-900">{enabledModules.length}</p>
            <p className="mt-2 text-sm text-slate-600">
              {enabledModules.length > 0 ? enabledModules.map((module) => module.label).join(" - ") : "No modules enabled yet."}
            </p>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Live Signals</p>
            <p className="mt-2 font-headline text-2xl font-extrabold text-slate-900">{activeTargets + livePosts}</p>
            <p className="mt-2 text-sm text-slate-600">{activeTargets} active targets and {livePosts} published club updates are live.</p>
          </div>
        </div>
      }
    >
      <section className="grid gap-5 xl:grid-cols-2">
        <SettingsCard
          title="Golf Configuration"
          description="Courses, tees, pricing matrices, rule sets, and booking controls live in the existing golf settings workspace."
          href="/admin/golf/settings"
          icon="golf_course"
          statusLabel={golfStatus}
          statusTone={golfTone}
        >
          <StatRow label="Courses" value={coursesQuery.isLoading ? "--" : courseCount} />
          <StatRow label="Tees" value={teesQuery.isLoading ? "--" : teeCount} />
          <StatRow label="Rule sets" value={ruleSetsQuery.isLoading ? "--" : ruleSetCount} />
          <StatRow label="Pricing matrices" value={pricingQuery.isLoading ? "--" : pricingCount} />
        </SettingsCard>

        <SettingsCard
          title="Finance & Accounting"
          description="Accounting export profiles and close-day readiness stay in the finance workspace. The hub surfaces whether that setup is actually in place."
          href="/admin/finance"
          icon="payments"
          statusLabel={financeStatus}
          statusTone={financeTone}
        >
          <StatRow label="Profiles" value={profilesQuery.isLoading ? "--" : profiles.length} />
          <StatRow label="Active profile" value={profilesQuery.isLoading ? "--" : activeProfile?.name ?? "None set"} />
          <StatRow label="Close day" value="Operational surface" />
        </SettingsCard>

        <SettingsCard
          title="Modules"
          description="Read-only visibility into which club modules are enabled. Club admins can review status here but cannot change enablement."
          href="/admin/settings/modules"
          icon="apps"
          statusLabel={modulesStatus}
          statusTone={modulesTone}
        >
          <StatRow label="Enabled" value={`${enabledModules.length}/${MODULE_SUMMARIES.length}`} />
          <StatRow label="Access" value={membershipRole === "club_admin" ? "Read-only" : "Review only"} />
          <StatRow label="Owner" value="Platform admin" />
        </SettingsCard>

        <SettingsCard
          title="Communications"
          description="Member-facing news and club broadcasts remain in the communications workspace, with live status surfaced here when that module is enabled."
          href="/admin/communications"
          icon="campaign"
          statusLabel={communicationsStatus}
          statusTone={communicationsTone}
        >
          <StatRow label="Published posts" value={communicationsEnabled ? (publishedFeedQuery.isLoading ? "--" : livePosts) : "Disabled"} />
          <StatRow label="Broadcasts" value={communicationsEnabled ? (blastsQuery.isLoading ? "--" : blastCount) : "Disabled"} />
          <StatRow label="Draft register" value={communicationsEnabled ? (postsQuery.isLoading ? "--" : postsQuery.data?.total_count ?? 0) : "Disabled"} />
        </SettingsCard>

        <SettingsCard
          title="Targets & Alerts"
          description="Targets are maintained in the dedicated targets workspace and then surface back into dashboard and operations alerts."
          href="/admin/targets"
          icon="track_changes"
          statusLabel={targetsStatus}
          statusTone={targetsTone}
        >
          <StatRow label="Active targets" value={targetsQuery.isLoading ? "--" : activeTargets} />
          <StatRow label="Total defined" value={targetsQuery.isLoading ? "--" : targetsQuery.data?.total_count ?? 0} />
          <StatRow label="Alerting" value="Operational dashboards" />
        </SettingsCard>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-slate-50 px-6 py-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Control Boundary</p>
            <h2 className="mt-1 font-headline text-xl font-extrabold text-slate-900">Read-only where ownership belongs elsewhere</h2>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Club admin safe
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Module enablement remains superadmin-owned. This hub organizes the club-admin surfaces, but it does not expose platform onboarding controls or guided setup flows from later rebuild phases.
        </p>
      </section>
    </AdminWorkspace>
  );
}
