import { MaterialSymbol } from "../components/benchmark/material-symbol";
import AdminShell from "../components/shell/AdminShell";

const FEATURES = [
  {
    icon: "newspaper",
    title: "Member News Feed",
    description:
      "Publish club announcements, tournament results, and general news directly to the player app. Pin posts, set visibility, and schedule ahead.",
    pills: ["Pin Posts", "Schedule", "Visibility Control"],
    accent: "bg-blue-50 text-blue-600",
  },
  {
    icon: "mail",
    title: "Mass Campaigns",
    description:
      "Send targeted email or push campaigns to member segments — all members, specific roles, or custom groups. Track open and click rates.",
    pills: ["Segmentation", "Email + Push", "Engagement Tracking"],
    accent: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: "notifications_active",
    title: "Operational Alerts",
    description:
      "Trigger instant push notifications for course closures, weather warnings, and emergency communications. Reach every member within seconds.",
    pills: ["Course Closures", "Weather Alerts", "Instant Push"],
    accent: "bg-amber-50 text-amber-700",
  },
  {
    icon: "emoji_events",
    title: "Competition Results",
    description:
      "Upload and publish tournament results, leaderboards, and prize notifications directly to the member feed from CSV or PDF sources.",
    pills: ["CSV Import", "Leaderboards", "Auto-Publish"],
    accent: "bg-purple-50 text-purple-600",
  },
];

export function AdminCommunicationsPage(): JSX.Element {
  return (
    <AdminShell title="Communications" searchPlaceholder="Search communications...">
      <div className="mx-auto max-w-4xl px-6 py-12">

        {/* Header */}
        <div className="mb-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-container">
            <MaterialSymbol className="text-3xl text-primary" filled icon="chat_bubble" />
          </div>
          <h2 className="font-headline text-3xl font-extrabold text-on-surface">Communications Module</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-500">
            Full member communications — news feed, campaigns, and operational alerts — are coming in the next release.
          </p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-secondary-container px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-on-secondary-container">
            <MaterialSymbol className="text-sm" icon="schedule" />
            In Development
          </span>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div
              className="rounded-2xl border border-slate-100 bg-surface-container-lowest p-6 shadow-sm"
              key={feature.title}
            >
              <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${feature.accent}`}>
                <MaterialSymbol icon={feature.icon} />
              </div>
              <h3 className="mb-2 font-headline text-base font-bold text-on-surface">{feature.title}</h3>
              <p className="mb-4 text-sm leading-relaxed text-slate-500">{feature.description}</p>
              <div className="flex flex-wrap gap-2">
                {feature.pills.map((pill) => (
                  <span
                    className="rounded-full bg-surface-container-low px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500"
                    key={pill}
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom note */}
        <div className="mt-10 rounded-2xl border border-primary/10 bg-primary-container/20 p-6 text-center">
          <MaterialSymbol className="mb-2 text-2xl text-primary" icon="info" />
          <p className="text-sm font-medium text-on-primary-container">
            Member news posts and push notifications will appear here once the API module is live.
            The player app is already set up to receive them.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}
