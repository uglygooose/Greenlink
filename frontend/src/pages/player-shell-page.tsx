import { useSession } from "../session/session-context";

export function PlayerShellPage(): JSX.Element {
  const { bootstrap } = useSession();

  return (
    <main className="shell-layout">
      <section className="shell-card">
        <p className="eyebrow">Player Shell</p>
        <h1>{bootstrap?.selected_club?.name ?? "Club access required"}</h1>
        <p className="muted">Phase 1 exposes the member shell only as a bootstrap-driven placeholder.</p>
      </section>
    </main>
  );
}
