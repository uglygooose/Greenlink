import { Link } from "react-router-dom";

import { useSession } from "../session/session-context";

export function AdminDashboardPage(): JSX.Element {
  const { bootstrap } = useSession();

  return (
    <div className="admin-content-stack">
      <section className="admin-card">
        <p className="eyebrow">Admin Dashboard</p>
        <h1>{bootstrap?.selected_club?.name ?? "Select a club"}</h1>
        <p className="muted">
          Phase 4 begins with a read-only tee-sheet surface built on the operational rule and availability
          foundations.
        </p>
      </section>
      <section className="admin-card admin-card-compact">
        <div className="section-heading">
          <div>
            <h2>Live Golf Operations</h2>
            <p className="muted">Inspect tee-sheet day views before booking, check-in, and payment workflows exist.</p>
          </div>
          <Link className="inline-link" to="/admin/golf/tee-sheet">
            Open tee sheet
          </Link>
        </div>
      </section>
      <section className="admin-card admin-card-compact">
        <div className="section-heading">
          <div>
            <h2>Operational Rules Foundation</h2>
            <p className="muted">Manage the structural settings future booking and pricing workflows depend on.</p>
          </div>
          <Link className="inline-link" to="/admin/golf/settings">
            Open settings
          </Link>
        </div>
      </section>
    </div>
  );
}
