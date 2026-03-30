import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { MobileTabBar } from "../components/benchmark/mobile-tab-bar";
import { UserAvatar } from "../components/benchmark/user-avatar";
import { useSession } from "../session/session-context";

type BookingCard = {
  month: string;
  day: string;
  course: string;
  detail: string;
  muted?: boolean;
};

type ClubUpdate = {
  badgeClassName: string;
  badgeLabel: string;
  title: string;
  description: string;
};

const CLUB_UPDATES: ClubUpdate[] = [
  {
    badgeClassName: "text-primary",
    badgeLabel: "Facility",
    title: "Course maintenance on Monday morning",
    description: "Back nine closed until 12:00 PM.",
  },
  {
    badgeClassName: "text-tertiary",
    badgeLabel: "Dining",
    title: "New seasonal menu at the clubhouse",
    description: "Fresh organic selections from local farms.",
  },
];

function initials(name: string | undefined): string {
  return (
    name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "GL"
  );
}

function firstName(name: string | undefined): string {
  return name?.split(" ").filter(Boolean)[0] ?? "Member";
}

export function PlayerShellPage(): JSX.Element {
  const { bootstrap } = useSession();
  const displayName = bootstrap?.user.display_name ?? "John";
  const selectedClub = bootstrap?.selected_club?.name ?? "GreenLink";

  const upcomingBookings: BookingCard[] = [
    {
      month: "Oct",
      day: "14",
      course: selectedClub,
      detail: "08:30 AM • 4 Players",
    },
    {
      month: "Oct",
      day: "21",
      course: "The Valley Links",
      detail: "10:15 AM • 2 Players",
      muted: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-24 text-on-surface">
      <header className="fixed top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-100/50 bg-white/80 px-6 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-900/80">
        <div className="font-headline text-xl font-bold tracking-tight text-emerald-900">GreenLink</div>
        <div className="flex items-center gap-4">
          <button className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-50" type="button">
            <MaterialSymbol icon="notifications" />
          </button>
          <UserAvatar
            alt={`${displayName} profile`}
            className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-container text-slate-700"
            initials={initials(displayName)}
          />
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-8 px-6 pt-20">
        <section className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-on-surface">
              Good morning, {firstName(displayName)}.
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">Ready for your round at {selectedClub} today?</p>
          </div>
          <div className="flex flex-col items-center rounded-xl bg-surface-container-lowest p-3 shadow-sm">
            <MaterialSymbol className="mb-1 text-primary" icon="partly_cloudy_day" />
            <span className="font-headline text-sm font-bold">18°C</span>
          </div>
        </section>

        <button
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-primary to-primary-dim py-5 text-on-primary shadow-lg transition-transform duration-100 active:scale-95"
          type="button"
        >
          <MaterialSymbol filled icon="add_circle" />
          <span className="font-headline text-lg font-bold">Book Golf</span>
        </button>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold font-headline">Upcoming Bookings</h2>
            <button className="text-sm font-semibold text-primary" type="button">
              View all
            </button>
          </div>
          <div className="space-y-4">
            {upcomingBookings.map((booking) => (
              <div
                className={
                  booking.muted
                    ? "flex items-center gap-4 rounded-xl bg-surface-container-lowest p-5 shadow-sm opacity-80"
                    : "flex items-center gap-4 rounded-xl bg-surface-container-lowest p-5 shadow-sm"
                }
                key={`${booking.course}-${booking.day}`}
              >
                <div
                  className={
                    booking.muted
                      ? "flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-surface-container-high text-on-surface-variant"
                      : "flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-primary-container text-on-primary-container"
                  }
                >
                  <span className="text-[10px] font-bold uppercase leading-none">{booking.month}</span>
                  <span className="text-lg font-bold leading-none">{booking.day}</span>
                </div>
                <div className="flex-grow">
                  <h3 className="font-bold text-on-surface">{booking.course}</h3>
                  <p className="text-sm text-on-surface-variant">{booking.detail}</p>
                </div>
                <MaterialSymbol className="text-outline-variant" icon="chevron_right" />
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-bold font-headline">Club Updates</h2>
          <div className="space-y-3">
            {CLUB_UPDATES.map((update) => (
              <div className="flex gap-4 rounded-xl bg-surface-container-low p-4" key={update.title}>
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container">
                  <MaterialSymbol className="text-2xl text-on-surface-variant" icon="image" />
                </div>
                <div className="flex flex-col justify-center">
                  <span className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${update.badgeClassName}`}>
                    {update.badgeLabel}
                  </span>
                  <h4 className="text-sm font-bold leading-tight">{update.title}</h4>
                  <p className="mt-1 text-xs text-on-surface-variant">{update.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <MobileTabBar
        activeClassName="rounded-xl bg-emerald-100 text-emerald-800 scale-95"
        className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-slate-200 bg-white/90 px-4 pb-6 pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 lg:hidden"
        inactiveClassName="text-slate-500 active:bg-slate-100 scale-95"
        items={[
          { label: "Home", icon: "home", to: "/player/home", isActive: true },
          { label: "Bookings", icon: "calendar_today" },
          { label: "Club/News", icon: "article" },
          { label: "Profile", icon: "person" },
        ]}
        labelClassName="font-label font-medium text-[10px]"
      />
    </div>
  );
}
