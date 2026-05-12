// Phase 7 — Onboarding POPIA (brand-flavoured working surface).
// First-class consent moment. Persistence stubs; PUT/POST wiring lands in Phase 9A.
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { OnboardingProgress } from "../components/onboarding/OnboardingProgress";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Icon } from "../components/ui/Icon";
import { Wordmark } from "../components/ui/Wordmark";
import { useSession } from "../session/session-context";

interface PopiaPanelProps {
  icon: string;
  title: string;
  body: ReactNode;
  last?: boolean;
}

function PopiaPanel({ icon, title, body, last }: PopiaPanelProps): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "18px 22px",
        borderBottom: last ? "none" : "1px solid var(--gl-border-subtle)",
      }}
    >
      <Icon name={icon} size={20} color="var(--gl-heritage-500)" />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
        <div className="gl-muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.55 }}>
          {body}
        </div>
      </div>
    </div>
  );
}

export function OnboardingPopiaPage(): JSX.Element {
  const navigate = useNavigate();
  const { bootstrap } = useSession();
  // TODO(Phase 9A): persist accepted state to club_onboarding_state.popia_consent
  //                  with timestamp, IP, and the operator-agreement version.
  const [accepted, setAccepted] = useState(true);
  // TODO(Phase 9A): Information Officer designation persists to a new column
  //                  on Club; for Phase 7, default to the signed-in user.
  const officerName = bootstrap?.user?.display_name ?? "Information Officer";
  const officerEmail = bootstrap?.user?.email ?? "captain@example.com";
  const officerInitials = officerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "IO";

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
        <OnboardingProgress step={3} of={6} />
        <button
          type="button"
          onClick={() => navigate("/admin/dashboard")}
          style={{
            fontSize: 12,
            color: "var(--gl-text-secondary)",
            background: "transparent",
            border: 0,
            cursor: "pointer",
            font: "inherit",
            padding: 0,
          }}
        >
          Save &amp; exit
        </button>
      </header>

      <main style={{ flex: 1, display: "flex", justifyContent: "center", padding: "48px 24px 32px", overflow: "auto" }}>
        <div style={{ maxWidth: 760, width: "100%" }}>
          <div className="gl-eyebrow" style={{ marginBottom: 16 }}>
            03 · POPIA · The lawful basis
          </div>
          <h1
            className="gl-serif"
            style={{ margin: 0, fontSize: 44, lineHeight: 1.08, fontWeight: 500, letterSpacing: "-0.018em" }}
          >
            How your members’ data is held.
          </h1>
          <p
            style={{
              marginTop: 14,
              fontSize: 15,
              color: "var(--gl-text-secondary)",
              lineHeight: 1.6,
              maxWidth: 620,
            }}
          >
            South Africa’s Protection of Personal Information Act sets the rules. We treat this as a first-class
            moment, not a checkbox at the end of a form.
          </p>

          <Card style={{ marginTop: 28, padding: 0, overflow: "hidden" }}>
            <PopiaPanel
              icon="security"
              title="GreenLink is the operator"
              body="The club is the responsible party. GreenLink processes personal information on your written instruction only, under Section 21 of POPIA."
            />
            <PopiaPanel
              icon="lock"
              title="Where data lives"
              body="Stored in az-jhb-1 (Johannesburg). Encrypted at rest and in transit. Backups in az-cpt-1. Never replicated outside the Republic."
            />
            <PopiaPanel
              icon="visibility_lock"
              title="Who can read what"
              body="Staff roles see exactly what their role requires — pro shop sees tee bookings, finance sees the ledger, marshals see today’s sheet only."
            />
            <PopiaPanel
              icon="schedule"
              title="Retention"
              body="Member personal data held for the duration of membership plus seven years (SARS). You can shorten this in Settings → Club → Retention."
            />
            <PopiaPanel
              icon="how_to_reg"
              title="Subject access requests"
              body="Members can export or delete their own data from the member portal. Requests under Section 23 are logged and audited."
              last
            />
          </Card>

          <div
            style={{
              marginTop: 28,
              padding: 20,
              background: "var(--gl-brand-soft)",
              borderRadius: 6,
              border: "1px solid color-mix(in oklab, var(--gl-brand) 25%, var(--gl-border-subtle))",
            }}
          >
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <Icon name="gavel" size={22} color="var(--gl-brand)" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Designate your Information Officer</div>
                <div className="gl-muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
                  POPIA requires every club to register one. The General Manager is the default. You can change this
                  in the next step.
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <Avatar initials={officerInitials} size={32} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{officerName}</div>
                    <div className="gl-muted" style={{ fontSize: 11.5 }}>
                      Information Officer · {officerEmail}
                    </div>
                  </div>
                  <Button variant="tertiary" size="sm" disabled title="Information Officer change ships in Phase 9A">
                    Change
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              marginTop: 24,
              fontSize: 13.5,
              lineHeight: 1.55,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              style={{
                width: 18,
                height: 18,
                marginTop: 2,
                accentColor: "var(--gl-brand)",
              }}
              aria-describedby="popia-consent-text"
            />
            <span id="popia-consent-text">
              I confirm I’m authorised to bind the club, and that GreenLink will process personal information on the
              club’s written instruction, under the terms set out above and in our{" "}
              <a href="#" style={{ color: "var(--gl-brand)" }}>
                Operator Agreement
              </a>
              .
            </span>
          </label>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 28,
            }}
          >
            <Button
              variant="tertiary"
              leadingIcon={<Icon name="arrow_back" size={14} />}
              onClick={() => navigate("/onboarding/welcome")}
            >
              Back
            </Button>
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" disabled title="Download ships in Phase 9A">
                Download a copy
              </Button>
              <Button
                disabled={!accepted}
                trailingIcon={<Icon name="arrow_forward" size={14} />}
                onClick={() => navigate("/onboarding/complete")}
              >
                Accept &amp; continue
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
