import { useState } from "react";
import { Link } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { MobileTabBar } from "../components/benchmark/mobile-tab-bar";
import { UserAvatar } from "../components/benchmark/user-avatar";
import { usePlayerBookingReadModelQuery } from "../features/bookings/hooks";
import { usePublishedNewsFeedQuery } from "../features/comms/hooks";
import { useSession } from "../session/session-context";
import type { BookingPaymentStatus, StartLane } from "../types/bookings";

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

function formatBookingDate(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function startLaneLabel(value: StartLane | null | undefined): string | null {
  if (value === "hole_10") return "10th Tee";
  if (value === "hole_1") return "1st Tee";
  return null;
}

function paymentStatusLabel(value: BookingPaymentStatus | null | undefined): string | null {
  if (!value) return null;
  switch (value) {
    case "paid":
      return "Paid";
    case "complimentary":
      return "Complimentary";
    case "waived":
      return "Waived";
    default:
      return "Payment pending";
  }
}

function bookingStatusLabel(value: string): string {
  return value.replace("_", " ");
}

export function PlayerShellPage(): JSX.Element {
  const { accessToken, bootstrap, logout } = useSession();
  const [profileOpen, setProfileOpen] = useState(false);
  const displayName = bootstrap?.user.display_name ?? "John";
  const selectedClub = bootstrap?.selected_club?.name ?? "GreenLink";
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const backendPlayerMenu = (bootstrap?.menu_items ?? []).filter((item) => item.shell === "player");
  const usesBackendPlayerMenu = backendPlayerMenu.length > 0;
  const playerMenuKeys = new Set(backendPlayerMenu.map((item) => item.key));
  const canBook = !usesBackendPlayerMenu || playerMenuKeys.has("book");
  const canOrder = !usesBackendPlayerMenu || playerMenuKeys.has("order");
  const mobileTabItems = usesBackendPlayerMenu
    ? backendPlayerMenu.flatMap((item) => {
        if (item.key === "home") {
          return [{ label: "Home", icon: "home", to: item.path, isActive: true }];
        }
        if (item.key === "book") {
          return [{ label: "Book", icon: "golf_course", to: item.path }];
        }
        if (item.key === "order") {
          return [{ label: "Order", icon: "local_cafe", to: item.path }];
        }
        if (item.key === "profile") {
          return [{ label: "Profile", icon: "person", to: item.path }];
        }
        return [];
      })
    : [
        { label: "Home", icon: "home", to: "/player/home", isActive: true },
        { label: "Book", icon: "golf_course", to: "/player/book" },
        { label: "Order", icon: "local_cafe", to: "/player/order" },
        { label: "Club/News", icon: "article" },
        { label: "Profile", icon: "person", to: "/player/profile" },
      ];
  const { data: publishedNews, isLoading: isNewsLoading } = usePublishedNewsFeedQuery({
    accessToken,
    selectedClubId,
  });
  const playerBookingsQuery = usePlayerBookingReadModelQuery({
    accessToken,
    selectedClubId,
  });

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
                    onClick={() => {
                      void logout();
                    }}
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
            <span className="font-headline text-sm font-bold">18C</span>
          </div>
        </section>

        {canBook ? (
          <Link
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-primary to-primary-dim py-5 text-on-primary shadow-lg transition-transform duration-100 active:scale-95"
            to="/player/book"
          >
            <MaterialSymbol filled icon="add_circle" />
            <span className="font-headline text-lg font-bold">Book Golf</span>
          </Link>
        ) : null}

        {canOrder ? (
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
        ) : null}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold font-headline">Upcoming Bookings</h2>
          </div>
          <div className="space-y-3">
            {playerBookingsQuery.isLoading && (
              <div className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
                <p className="text-sm font-semibold text-on-surface">Loading upcoming bookings...</p>
                <p className="mt-1 text-sm text-on-surface-variant">Fetching your backend booking summary.</p>
              </div>
            )}
            {playerBookingsQuery.error && (
              <div className="rounded-xl bg-error-container/60 p-5 shadow-sm">
                <p className="text-sm font-semibold text-on-error-container">{playerBookingsQuery.error.message}</p>
              </div>
            )}
            {!playerBookingsQuery.isLoading &&
              !playerBookingsQuery.error &&
              (playerBookingsQuery.data?.upcoming.length ?? 0) === 0 && (
                <div className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
                  <p className="text-sm font-semibold text-on-surface">No upcoming bookings available.</p>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Your next confirmed tee time will appear here automatically.
                  </p>
                </div>
              )}
            {(playerBookingsQuery.data?.upcoming ?? []).map((booking) => {
              const lane = startLaneLabel(booking.start_lane);
              const paymentStatus = paymentStatusLabel(booking.payment_status);
              return (
                <article className="rounded-xl bg-surface-container-lowest p-5 shadow-sm" key={booking.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
                        {formatBookingDate(booking.local_date)}
                      </p>
                      <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">{booking.local_time}</h3>
                    </div>
                    <span className="rounded-full bg-surface-container px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                      {booking.party_size} player{booking.party_size === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-on-surface">{booking.course_name}</p>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {[booking.tee_name, lane].filter(Boolean).join(" • ") || "Tee assignment pending"}
                  </p>
                  <p className="mt-3 text-sm text-on-surface-variant">
                    {booking.participant_names.join(", ")}
                  </p>
                  {(booking.fee_label || paymentStatus) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {booking.fee_label && (
                        <span className="rounded-full bg-primary-container/60 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-on-primary-container">
                          {booking.fee_label}
                        </span>
                      )}
                      {paymentStatus && (
                        <span className="rounded-full bg-surface-container px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                          {paymentStatus}
                        </span>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold font-headline">Recent Booking History</h2>
          </div>
          <div className="space-y-3">
            {playerBookingsQuery.isLoading && (
              <div className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
                <p className="text-sm font-semibold text-on-surface">Loading booking history...</p>
                <p className="mt-1 text-sm text-on-surface-variant">Fetching your backend booking history.</p>
              </div>
            )}
            {playerBookingsQuery.error && (
              <div className="rounded-xl bg-error-container/60 p-5 shadow-sm">
                <p className="text-sm font-semibold text-on-error-container">{playerBookingsQuery.error.message}</p>
              </div>
            )}
            {!playerBookingsQuery.isLoading &&
              !playerBookingsQuery.error &&
              (playerBookingsQuery.data?.history.length ?? 0) === 0 && (
                <div className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
                  <p className="text-sm font-semibold text-on-surface">No recent bookings found.</p>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    Completed or cancelled rounds will appear here automatically.
                  </p>
                </div>
              )}
            {(playerBookingsQuery.data?.history ?? []).map((booking) => (
              <article className="rounded-xl bg-surface-container-lowest p-5 shadow-sm" key={booking.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-tertiary">
                      {formatBookingDate(booking.local_date)}
                    </p>
                    <h3 className="mt-1 font-headline text-lg font-bold text-on-surface">{booking.local_time}</h3>
                  </div>
                  <span className="rounded-full bg-surface-container px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-on-surface-variant">
                    {bookingStatusLabel(booking.status)}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-on-surface">{booking.course_name}</p>
                <p className="mt-1 text-sm text-on-surface-variant">{booking.participant_names.join(", ")}</p>
              </article>
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
        items={mobileTabItems}
        labelClassName="font-label font-medium text-[10px]"
      />
    </div>
  );
}
