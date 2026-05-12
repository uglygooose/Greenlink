// Phase 7 — Onboarding completion (brand surface).
// Restrained recognition. "Open dashboard" advances to /admin/dashboard.
import { useNavigate } from "react-router-dom";

import { OnboardingProgress } from "../components/onboarding/OnboardingProgress";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Wordmark } from "../components/ui/Wordmark";
import { useSession } from "../session/session-context";

interface DoneRowProps {
  title: string;
  sub: string;
}

function DoneRow({ title, sub }: DoneRowProps): JSX.Element {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <Icon name="check_circle" size={20} color="var(--gl-state-checkedin)" fill={1} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
        <div className="gl-muted" style={{ fontSize: 12.5, marginTop: 2 }}>
          {sub}
        </div>
      </div>
    </div>
  );
}

export function OnboardingCompletionPage(): JSX.Element {
  const navigate = useNavigate();
  const { bootstrap } = useSession();
  const clubName = bootstrap?.selected_club?.name ?? "Your club";
  const officerEmail = bootstrap?.user?.email ?? "captain@example.com";

  // TODO(Phase 9A): the completion screen reads real summary state — member-import count,
  // households, accounting profile — from a future club_onboarding_state read endpoint.
  // For Phase 7 the prototype's placeholder copy keeps the structure visible.

  return (
    <div
      className="gl"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--gl-surface)",
      }}
    >
      <header
        style={{
          padding: "20px 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--gl-border-subtle)",
        }}
      >
        <Wordmark size={20} color="var(--gl-text-primary)" />
        <OnboardingProgress step={6} of={6} />
        <span style={{ width: 80 }} />
      </header>

      <main style={{ flex: 1, display: "flex", justifyContent: "center", overflow: "hidden" }}>
        <div
          style={{
            flex: 1,
            maxWidth: 1040,
            padding: "56px 64px",
            display: "grid",
            gridTemplateColumns: "1fr 0.85fr",
            gap: 56,
            alignItems: "center",
          }}
        >
          <div>
            <div className="gl-eyebrow" style={{ marginBottom: 14 }}>
              Set up
            </div>
            <h1
              className="gl-serif"
              style={{ margin: 0, fontSize: 60, lineHeight: 1.02, fontWeight: 500, letterSpacing: "-0.025em" }}
            >
              <em style={{ fontWeight: 500 }}>{clubName}</em>
              <br />
              is on GreenLink.
            </h1>
            <p
              style={{
                marginTop: 18,
                fontSize: 16,
                lineHeight: 1.55,
                color: "var(--gl-text-secondary)",
                maxWidth: 460,
              }}
            >
              The tee sheet is live for the next 14 days. The accounting profile is bound. Members are imported. The
              first daily close runs tonight at 23:30.
            </p>

            <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
              <Button
                size="lg"
                onClick={() => navigate("/admin/dashboard")}
                trailingIcon={<Icon name="arrow_forward" size={16} />}
              >
                Open dashboard
              </Button>
              <Button variant="secondary" size="lg" disabled title="Staff invitations ship in Phase 9A">
                Invite staff
              </Button>
            </div>

            <div className="gl-muted" style={{ marginTop: 28, fontSize: 12 }}>
              We’ll send a confirmation to <span className="gl-mono">{officerEmail}</span> and a courtesy note to your
              Information Officer.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <DoneRow title="Club configured" sub={`${clubName} · ${bootstrap?.selected_club?.location ?? "Region"}`} />
            <DoneRow title="Course & tee sheet" sub="Default slot interval · 14-day booking window" />
            <DoneRow title="Accounting bound" sub="Profile verified · daily close ready" />
            <DoneRow title="POPIA & Info Officer" sub="Operator terms accepted · officer designated" />
            <DoneRow title="Members imported" sub="Member CSV ingested · households resolved" />
            <DoneRow title="Communications" sub="Transactional mail verified · welcome message drafted" />
          </div>
        </div>
      </main>

      <footer
        style={{
          borderTop: "1px solid var(--gl-border-subtle)",
          padding: "18px 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "var(--gl-text-secondary)",
          fontSize: 12,
        }}
      >
        <span>Phase 6 onboarding · v1</span>
        <span>
          Need anything?{" "}
          <a href="#" style={{ color: "var(--gl-brand)" }}>
            Support stays on for 30 days at no charge.
          </a>
        </span>
      </footer>
    </div>
  );
}
