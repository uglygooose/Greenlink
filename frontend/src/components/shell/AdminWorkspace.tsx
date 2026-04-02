import type React from "react";

interface AdminWorkspaceProps {
  title: string;
  description?: React.ReactNode;
  dateLabel?: string;
  actions?: React.ReactNode;
  kpis?: React.ReactNode;
  children: React.ReactNode;
}

function defaultDateLabel(): string {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export default function AdminWorkspace({
  title,
  description,
  dateLabel,
  actions,
  kpis,
  children,
}: AdminWorkspaceProps): JSX.Element {
  return (
    <div className="w-full px-8 py-8">
      <div className="space-y-8">
        <section className="space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                {dateLabel ?? defaultDateLabel()}
              </p>
              <div className="space-y-1">
                <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
                  {title}
                </h1>
                {description ? (
                  <p className="text-sm text-on-surface-variant">{description}</p>
                ) : null}
              </div>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
          </div>
          {kpis}
        </section>
        <div className="space-y-8">{children}</div>
      </div>
    </div>
  );
}
