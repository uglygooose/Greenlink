import { NavLink } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminWorkspace from "../components/shell/AdminWorkspace";
import { useSession } from "../session/session-context";

type ModuleDefinition = {
  key: "communications" | "finance" | "golf" | "pos";
  label: string;
  description: string;
  href: string;
};

const MODULES: ModuleDefinition[] = [
  {
    key: "golf",
    label: "Golf",
    description: "Tee-sheet operations, rules, pricing, and booking configuration.",
    href: "/admin/golf/settings",
  },
  {
    key: "finance",
    label: "Finance",
    description: "Close-day workflow, accounting export profiles, and finance visibility.",
    href: "/admin/finance",
  },
  {
    key: "communications",
    label: "Communications",
    description: "Club news, member updates, and broadcast tools.",
    href: "/admin/communications",
  },
  {
    key: "pos",
    label: "Commerce",
    description: "Halfway house, pro shop, order queue, and point-of-sale operations.",
    href: "/admin/orders",
  },
];

function stateClassName(enabled: boolean): string {
  return enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500";
}

export function AdminSettingsModulesPage(): JSX.Element {
  const { bootstrap } = useSession();
  const moduleFlags = bootstrap?.module_flags ?? {};

  return (
    <AdminWorkspace
      title="Modules"
      description="Read-only visibility into what is enabled for this club. Module rollout stays owned by platform administration."
      actions={
        <NavLink
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          to="/admin/settings"
        >
          <MaterialSymbol className="text-sm" icon="arrow_back" />
          Back to Settings
        </NavLink>
      }
    >
      <section className="grid gap-4 xl:grid-cols-2">
        {MODULES.map((module) => {
          const enabled = moduleFlags[module.key] === true;
          return (
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm" key={module.key}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-headline text-lg font-extrabold text-slate-900">{module.label}</h2>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${stateClassName(enabled)}`}>
                      {enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{module.description}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 text-slate-500">
                  <MaterialSymbol icon={enabled ? "task_alt" : "do_not_disturb_on"} />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Read-only for club admin
                </span>
                <NavLink className="text-sm font-semibold text-emerald-700 hover:text-emerald-800" to={module.href}>
                  Open related workspace
                </NavLink>
              </div>
            </div>
          );
        })}
      </section>
    </AdminWorkspace>
  );
}
