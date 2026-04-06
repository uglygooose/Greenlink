import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { MaterialSymbol } from "../components/benchmark/material-symbol";
import { MobileTabBar } from "../components/benchmark/mobile-tab-bar";
import { UserAvatar } from "../components/benchmark/user-avatar";
import { useSelfProfileQuery, useUpdateSelfProfileMutation } from "../features/profile/hooks";
import { useSession } from "../session/session-context";

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

function asMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Profile update failed";
}

export function PlayerProfilePage(): JSX.Element {
  const { accessToken, bootstrap, reloadBootstrap } = useSession();
  const selectedClubId = bootstrap?.selected_club_id ?? null;
  const displayName = bootstrap?.user.display_name ?? "Member";
  const profileQuery = useSelfProfileQuery({ accessToken, selectedClubId });
  const updateProfileMutation = useUpdateSelfProfileMutation({ accessToken, selectedClubId });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }
    setFirstName(profileQuery.data.first_name);
    setLastName(profileQuery.data.last_name);
    setContactEmail(profileQuery.data.contact_email ?? "");
    setPhone(profileQuery.data.phone ?? "");
  }, [profileQuery.data]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!firstName.trim() || updateProfileMutation.isPending) {
      return;
    }
    setFeedbackMessage(null);
    try {
      await updateProfileMutation.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        contact_email: contactEmail.trim() || null,
        phone: phone.trim() || null,
      });
      await reloadBootstrap(selectedClubId);
      setFeedbackMessage("Profile updated from backend truth.");
    } catch (error) {
      setFeedbackMessage(asMessage(error));
    }
  }

  return (
    <div className="min-h-screen bg-background pb-28 text-on-surface">
      <header className="fixed top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-100/50 bg-white/80 px-6 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-900/80">
        <div className="flex items-center gap-3">
          <Link
            aria-label="Back to player home"
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-50"
            to="/player/home"
          >
            <MaterialSymbol icon="arrow_back" />
          </Link>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Player Profile</p>
            <h1 className="font-headline text-lg font-bold text-on-surface">Your details</h1>
          </div>
        </div>
        <UserAvatar
          alt={`${displayName} profile`}
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-container text-slate-700"
          initials={initials(displayName)}
        />
      </header>

      <main className="mx-auto max-w-md space-y-6 px-6 pt-20">
        <section className="rounded-2xl bg-surface-container-lowest px-5 py-4 shadow-sm">
          <p className="text-sm font-medium text-on-surface-variant">
            {profileQuery.data?.club_name ?? bootstrap?.selected_club?.name ?? "GreenLink"}
          </p>
          <h2 className="mt-1 font-headline text-2xl font-extrabold tracking-tight text-on-surface">
            Keep your contact details current
          </h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            This form renders the backend self-profile contract only. Sign-in email stays read-only.
          </p>
        </section>

        {feedbackMessage ? (
          <section
            className={
              updateProfileMutation.isError
                ? "rounded-2xl bg-error-container/60 px-5 py-4 text-sm font-medium text-on-error-container"
                : "rounded-2xl bg-primary-container/60 px-5 py-4 text-sm font-medium text-on-primary-container"
            }
          >
            {feedbackMessage}
          </section>
        ) : null}

        {profileQuery.isLoading ? (
          <section className="rounded-2xl bg-surface-container-lowest px-5 py-6 text-sm text-on-surface-variant shadow-sm">
            Loading profile...
          </section>
        ) : null}

        {profileQuery.error ? (
          <section className="rounded-2xl bg-error-container/60 px-5 py-6 text-sm font-medium text-on-error-container shadow-sm">
            {profileQuery.error.message}
          </section>
        ) : null}

        {profileQuery.data ? (
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <section className="rounded-2xl bg-surface-container-lowest px-5 py-5 shadow-sm">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">First Name</span>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary"
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                    value={firstName}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Last Name</span>
                  <input
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary"
                    onChange={(event) => setLastName(event.target.value)}
                    value={lastName}
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl bg-surface-container-lowest px-5 py-5 shadow-sm">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Contact Email</span>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary"
                  onChange={(event) => setContactEmail(event.target.value)}
                  type="email"
                  value={contactEmail}
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Phone</span>
                <input
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-on-surface outline-none transition-colors focus:border-primary"
                  onChange={(event) => setPhone(event.target.value)}
                  type="tel"
                  value={phone}
                />
              </label>
              <div className="rounded-xl bg-surface-container px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">Sign-In Email</p>
                <p className="mt-1 text-sm font-medium text-on-surface">{profileQuery.data.account_email}</p>
                <p className="mt-1 text-xs text-on-surface-variant">Managed separately from your contact profile.</p>
              </div>
            </section>

            <button
              className="w-full rounded-2xl bg-primary py-4 text-center font-headline text-lg font-bold text-on-primary transition-colors hover:bg-primary-dim disabled:cursor-not-allowed disabled:bg-surface-container-high disabled:text-on-surface-variant"
              disabled={!firstName.trim() || updateProfileMutation.isPending}
              type="submit"
            >
              {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
            </button>
          </form>
        ) : null}
      </main>

      <MobileTabBar
        activeClassName="rounded-xl bg-emerald-100 text-emerald-800 scale-95"
        className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-slate-200 bg-white/90 px-4 pb-6 pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 lg:hidden"
        inactiveClassName="text-slate-500 active:bg-slate-100 scale-95"
        items={[
          { label: "Home", icon: "home", to: "/player/home" },
          { label: "Book", icon: "golf_course", to: "/player/book" },
          { label: "Order", icon: "local_cafe", to: "/player/order" },
          { label: "Profile", icon: "person", to: "/player/profile", isActive: true },
        ]}
        labelClassName="font-label font-medium text-[10px]"
      />
    </div>
  );
}
