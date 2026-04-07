import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useCoursesQuery, usePricingMatricesQuery, useRuleSetsQuery, useTeesQuery } from "../features/golf-settings/hooks";
import { useClubTargetsQuery } from "../features/targets/hooks";
import { useFinanceExportBatchesQuery } from "../features/finance/hooks";
import { useSession } from "../session/session-context";

interface SettingsCard {
  title: string;
  description: string;
  href: string;
  icon: string;
  meta: string | null;
}

function SettingsSection({
  heading,
  cards,
}: {
  heading: string;
  cards: SettingsCard[];
}): JSX.Element {
  return (
    <div>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{heading}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <NavLink
            key={card.href}
            to={card.href}
            className="flex items-start gap-4 rounded-2xl bg-surface-container-lowest p-5 shadow-sm transition-colors hover:bg-slate-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container text-primary">
              <MaterialSymbol icon={card.icon} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-on-surface">{card.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{card.description}</p>
              {card.meta ? (
                <p className="mt-2 text-[11px] font-bold text-primary">{card.meta}</p>
              ) : null}
            </div>
            <MaterialSymbol className="ml-auto shrink-0 text-slate-300" icon="chevron_right" />
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function AdminClubSettingsPage(): JSX.Element {
  const { accessToken, bootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const selectedClub = bootstrap?.selected_club;

  const coursesQuery = useCoursesQuery({ accessToken, selectedClubId });
  const teesQuery = useTeesQuery({ accessToken, selectedClubId });
  const ruleSetsQuery = useRuleSetsQuery({ accessToken, selectedClubId });
  const pricingQuery = usePricingMatricesQuery({ accessToken, selectedClubId });
  const targetsQuery = useClubTargetsQuery({ accessToken, selectedClubId });
  const batchesQuery = useFinanceExportBatchesQuery({ accessToken, selectedClubId });

  const courses = coursesQuery.data?.length ?? 0;
  const tees = teesQuery.data?.length ?? 0;
  const ruleSets = ruleSetsQuery.data?.length ?? 0;
  const matrices = pricingQuery.data?.length ?? 0;
  const targets = targetsQuery.data?.total_count ?? 0;
  const batches = batchesQuery.data?.total_count ?? 0;

  const golfCards: SettingsCard[] = [
    {
      title: "Golf Settings",
      description: "Courses, tees, booking rule sets, and pricing matrices.",
      href: "/admin/golf/settings",
      icon: "tune",
      meta: courses > 0 ? `${courses} course${courses !== 1 ? "s" : ""} · ${tees} tee${tees !== 1 ? "s" : ""} · ${ruleSets} rule set${ruleSets !== 1 ? "s" : ""} · ${matrices} pricing matrix${matrices !== 1 ? "es" : ""}` : null,
    },
  ];

  const clubCards: SettingsCard[] = [
    {
      title: "Targets",
      description: "Operating targets for rounds, revenue, and membership — surfaced on dashboards.",
      href: "/admin/targets",
      icon: "track_changes",
      meta: targets > 0 ? `${targets} active target${targets !== 1 ? "s" : ""}` : "No active targets",
    },
  ];

  const financeCards: SettingsCard[] = [
    {
      title: "Accounting Export Profiles",
      description: "Map canonical finance batches to your accounting package format (Generic Journal, Pastel, Sage).",
      href: "/admin/finance",
      icon: "receipt_long",
      meta: batches > 0 ? `${batches} batch${batches !== 1 ? "es" : ""} in history` : null,
    },
  ];

  return (
    <AdminWorkspace
      title="Club Settings"
      description={selectedClub?.name ?? "Settings hub"}
    >
      <div className="space-y-8">
        <div className="rounded-2xl bg-surface-container-low px-6 py-5">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Club</p>
              <p className="mt-0.5 font-semibold text-on-surface">{selectedClub?.name ?? "—"}</p>
            </div>
            <div className="h-5 w-px bg-slate-200" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Timezone</p>
              <p className="mt-0.5 font-semibold text-on-surface">{selectedClub?.timezone ?? "—"}</p>
            </div>
            <div className="h-5 w-px bg-slate-200" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Location</p>
              <p className="mt-0.5 font-semibold text-on-surface">{selectedClub?.location ?? "—"}</p>
            </div>
            <p className="ml-auto text-xs text-slate-400">Club identity is managed by your platform administrator.</p>
          </div>
        </div>

        <SettingsSection heading="Golf" cards={golfCards} />
        <SettingsSection heading="Club Operations" cards={clubCards} />
        <SettingsSection heading="Finance & Export" cards={financeCards} />
      </div>
    </AdminWorkspace>
  );
}
