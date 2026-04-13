import { useNavigate } from "react-router-dom";

import { useSession } from "../session/session-context";

export function SelectClubPage(): JSX.Element {
  const navigate = useNavigate();
  const { bootstrap, setSelectedClub } = useSession();

  if (!bootstrap) {
    return <div className="centered-panel">Loading clubs...</div>;
  }

  async function handleSelect(clubId: string): Promise<void> {
    await setSelectedClub(clubId);
    navigate("/", { replace: true });
  }

  return (
    <main className="shell-layout">
      <section className="shell-card">
        <p className="eyebrow">Club Context</p>
        <h1>Select an active club</h1>
        <p className="muted">Choose the club you want to work in.</p>
        <div className="club-list">
          {bootstrap.available_clubs.map((club) => (
            <button
              key={club.club_id}
              className="club-button"
              disabled={!club.selectable}
              onClick={() => handleSelect(club.club_id)}
              type="button"
            >
              <strong>{club.club_name}</strong>
              <span>
                {club.membership_role ?? "available"} | {club.membership_status ?? "active"}
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
