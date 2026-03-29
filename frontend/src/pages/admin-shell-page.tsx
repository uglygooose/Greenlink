import { useSession } from "../session/session-context";

export function AdminShellPage(): JSX.Element {
  const { bootstrap } = useSession();

  return (
    <main className="shell-layout">
      <section className="shell-card">
        <p className="eyebrow">Admin Shell</p>
        <h1>{bootstrap?.selected_club?.name ?? "Select a club"}</h1>
        <p className="muted">Phase 1 keeps the admin surface thin. Real workspaces land in later phases.</p>
      </section>
    </main>
  );
}
