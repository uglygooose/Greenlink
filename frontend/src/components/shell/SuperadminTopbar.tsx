import type React from "react";

import { MaterialSymbol } from "../benchmark/material-symbol";
import { useSession } from "../../session/session-context";

interface SuperadminTopbarProps {
  title: string | React.ReactNode;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

export default function SuperadminTopbar({
  title,
  searchPlaceholder,
  searchValue,
  onSearchChange,
}: SuperadminTopbarProps): JSX.Element {
  const { bootstrap } = useSession();

  return (
    <header className="sticky top-0 z-30 bg-background/85 px-8 py-4 backdrop-blur">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-container text-primary">
            <MaterialSymbol filled icon="admin_panel_settings" />
          </div>
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Precision Control
            </p>
            <h1 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <MaterialSymbol className="text-lg" icon="search" />
            </span>
            <input
              className="w-full min-w-[260px] rounded-2xl bg-surface-container-low px-10 py-3 text-sm text-on-surface outline-none transition-colors focus:bg-white"
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder={searchPlaceholder}
              type="search"
              value={searchValue ?? ""}
            />
          </label>
          <div className="flex items-center gap-3 rounded-2xl bg-surface-container-low px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
              <MaterialSymbol filled icon="forest" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-on-surface">
                {bootstrap?.user.display_name ?? "Superadmin"}
              </p>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                Implementation Mode
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
