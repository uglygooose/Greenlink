import type React from "react";

import { MaterialSymbol } from "../benchmark/material-symbol";
import { useSession } from "../../session/session-context";

interface AdminTopbarProps {
  title: string | React.ReactNode;
  searchPlaceholder?: string;
}

function initials(name: string | undefined): string {
  return (
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "GL"
  );
}

export default function AdminTopbar({ title, searchPlaceholder }: AdminTopbarProps): JSX.Element {
  const { bootstrap } = useSession();
  const userInitials = initials(bootstrap?.user.display_name);
  const currentDate = new Date().toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <header className="sticky top-0 z-40 h-16 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md border-b border-slate-100/50">
      <div className="flex items-center gap-4">
        {typeof title === "string" ? (
          <>
            <h2 className="font-headline text-xl font-bold text-emerald-900 tracking-tight">{title}</h2>
            <span className="text-slate-300">|</span>
            <p className="text-sm font-medium text-slate-500">{currentDate}</p>
          </>
        ) : (
          title
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden sm:block">
          <MaterialSymbol className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" icon="search" />
          <input
            className="w-64 rounded-full border-none bg-surface-container-low py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 transition-all"
            placeholder={searchPlaceholder ?? "Search..."}
            type="text"
            readOnly
          />
        </div>
        <button className="relative p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors" type="button">
          <MaterialSymbol icon="notifications" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-error border-2 border-white" />
        </button>
        <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-full transition-colors" type="button">
          <MaterialSymbol icon="help" />
        </button>
        <div className="w-8 h-8 rounded-full bg-primary text-white text-xs font-bold font-headline flex items-center justify-center">
          {userInitials}
        </div>
      </div>
    </header>
  );
}
