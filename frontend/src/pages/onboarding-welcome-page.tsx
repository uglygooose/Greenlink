// Phase 7 — Onboarding welcome (brand surface, new route).
// Six-step flow's first beat. "Begin setup" advances to /onboarding/popia.
import { useNavigate } from "react-router-dom";

import { OnboardingProgress } from "../components/onboarding/OnboardingProgress";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { HeroPlaceholder } from "../components/ui/HeroPlaceholder";
import { Icon } from "../components/ui/Icon";
import { Wordmark } from "../components/ui/Wordmark";

export function OnboardingWelcomePage(): JSX.Element {
  const navigate = useNavigate();

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
        <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 12, color: "var(--gl-text-secondary)" }}>
          <OnboardingProgress step={1} of={6} />
          {/* TODO(Phase 9A): "Save & exit" should persist the current onboarding step
              to club_onboarding_state. Stubbed for Phase 7. */}
          <button
            type="button"
            onClick={() => navigate("/admin/dashboard")}
            style={{
              background: "transparent",
              border: 0,
              color: "inherit",
              cursor: "pointer",
              font: "inherit",
              padding: 0,
            }}
          >
            Save &amp; exit
          </button>
        </div>
      </header>

      <main style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", overflow: "hidden" }}>
        <div
          style={{
            padding: "72px 64px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 22,
          }}
        >
          <div className="gl-eyebrow">Welcome to GreenLink</div>
          <h1
            className="gl-serif"
            style={{ margin: 0, fontSize: 64, lineHeight: 1.02, fontWeight: 500, letterSpacing: "-0.025em" }}
          >
            Let’s set up <em style={{ fontWeight: 500 }}>your club</em>.
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 16,
              lineHeight: 1.55,
              color: "var(--gl-text-secondary)",
              maxWidth: 480,
            }}
          >
            Six short steps. The tee sheet, the till, the ledger, the handicap data, and the people — bound to the
            accounting platform you already use.
          </p>

          <Card style={{ marginTop: 16, padding: 20, maxWidth: 520 }}>
            <div className="gl-t-xs gl-muted">What you’ll need on hand</div>
            <ul
              style={{
                marginTop: 10,
                marginBottom: 0,
                paddingLeft: 18,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 13.5,
                lineHeight: 1.5,
              }}
            >
              <li>Your club’s registered details and Information Officer.</li>
              <li>Accounting profile credentials (Pastel Partner, Sage 200, or Xero ZA).</li>
              <li>An existing member CSV — we’ll handle households on import.</li>
            </ul>
          </Card>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Button
              size="lg"
              onClick={() => navigate("/onboarding/popia")}
              trailingIcon={<Icon name="arrow_forward" size={16} />}
            >
              Begin setup
            </Button>
            <Button variant="tertiary" disabled title="Partner-code onboarding ships in v1.5">
              I have a partner code
            </Button>
          </div>
        </div>

        <aside aria-hidden="true" style={{ position: "relative", background: "var(--gl-heritage-900)" }}>
          <HeroPlaceholder tone="mist" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, rgba(20,33,31,0.0) 60%, rgba(20,33,31,0.4) 100%)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 32,
              left: 32,
              color: "var(--gl-parchment)",
              fontSize: 12,
              opacity: 0.85,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Hole 4 · early mist · 06:38
          </div>
        </aside>
      </main>
    </div>
  );
}
