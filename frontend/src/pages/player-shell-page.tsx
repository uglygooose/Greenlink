import { useState } from "react";
import { Link } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { MobileTabBar } from "../components/benchmark/mobile-tab-bar";
import { UserAvatar } from "../components/benchmark/user-avatar";
import { usePublishedNewsFeedQuery } from "../features/comms/hooks";
import { useSession } from "../session/session-context";

type BookingCard = {
  month: string;
  day: string;
  course: string;
  detail: string;
  muted?: boolean;
};

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

function formatNewsDate(value: string | null): string {
  if (!value) return "Recently posted";
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function summarizeBody(body: string): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= 96) {
    return normalized;
  }
  return `${normalized.slice(0, 93).trimEnd()}...`;
}

export function PlayerShellPage(): JSX.Element {
  const { accessToken, bootstrap, logout } = useSession();
  const [profileOpen, setProfileOpen] = useState(false);
  const displayName = bootstrap?.user.display_name ?? "John";
  const selectedClub = bootstrap?.selected_club?.name ?? "GreenLink";
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const { data: publishedNews, isLoading: isNewsLoading } = usePublishedNewsFeedQuery({
    accessToken,
    selectedClubId,
  });

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
          <div className="relative">
            <button
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-container text-slate-700 transition-opacity hover:opacity-80"
              type="button"
              onClick={() => setProfileOpen((o) => !o)}
            >
              <UserAvatar
                alt={`${displayName} profile`}
                className="flex h-full w-full items-center justify-center text-sm font-bold"
                initials={initials(displayName)}
              />
            </button>
            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <div className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-xs font-bold text-on-surface">{displayName}</p>
                  <p className="text-[10px] text-slate-400">{bootstrap?.user.email}</p>
                </div>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm text-error transition-colors hover:bg-slate-50"
                  type="button"
                  onClick={() => { void logout(); }}
                >
                  <MaterialSymbol className="text-base" icon="logout" />
                  Sign out
                </button>
              </div>
              </>
            )}
          </div>
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

        <Link
          className="flex items-center justify-between rounded-xl bg-surface-container-lowest px-5 py-4 shadow-sm transition-colors hover:bg-surface-container-low"
          to="/player/order"
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Halfway House</p>
            <h2 className="mt-1 font-headline text-lg font-bold text-on-surface">Order food & drink</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Quick order, minimal taps, ready for collection.</p>
          </div>
          <MaterialSymbol className="text-outline" icon="arrow_forward" />
        </Link>

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
            {isNewsLoading && (
              <div className="rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
                Loading club updates...
              </div>
            )}
            {!isNewsLoading && (publishedNews?.posts.length ?? 0) === 0 && (
              <div className="rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant">
                No club updates have been published yet.
              </div>
            )}
            {(publishedNews?.posts ?? []).map((post) => (
              <div className="flex gap-4 rounded-xl bg-surface-container-low p-4" key={post.id}>
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container text-primary">
                  <MaterialSymbol className="text-2xl" icon={post.pinned ? "push_pin" : "article"} />
                </div>
                <div className="flex flex-col justify-center">
                  <span
                    className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${
                      post.pinned ? "text-primary" : "text-tertiary"
                    }`}
                  >
                    {post.pinned ? "Pinned Update" : formatNewsDate(post.published_at)}
                  </span>
                  <h4 className="text-sm font-bold leading-tight">{post.title}</h4>
                  <p className="mt-1 text-xs text-on-surface-variant">{summarizeBody(post.body)}</p>
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
          { label: "Order", icon: "local_cafe", to: "/player/order" },
          { label: "Club/News", icon: "article" },
          { label: "Profile", icon: "person" },
        ]}
        labelClassName="font-label font-medium text-[10px]"
      />
    </div>
  );
}
