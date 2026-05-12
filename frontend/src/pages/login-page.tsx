// Phase 7 rebuild — Login (brand surface).
// Replaces the pre-rebuild auth-card layout. Photography side uses the
// SVG HeroPlaceholder; real photography defers to v1.5. The "Sign in with
// passkey" button renders disabled with a v2 tooltip per Phase 7 brief.
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/ui/Button";
import { HeroPlaceholder } from "../components/ui/HeroPlaceholder";
import { Icon } from "../components/ui/Icon";
import { Input } from "../components/ui/Input";
import { Wordmark } from "../components/ui/Wordmark";
import { useSession } from "../session/session-context";

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const { login, accessToken, bootstrap } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (accessToken && bootstrap) {
      navigate(bootstrap.landing_path, { replace: true });
    }
  }, [accessToken, bootstrap, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="gl"
      style={{ minHeight: "100vh", display: "flex", overflow: "hidden", background: "var(--gl-surface)" }}
    >
      {/* Photography side — SVG hero, brand atmospherics. */}
      <section
        aria-hidden="true"
        style={{ position: "relative", flex: "0 0 58%", background: "var(--gl-heritage-900)" }}
      >
        <HeroPlaceholder tone="dawn" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(20,33,31,0.0) 40%, rgba(20,33,31,0.55) 100%)",
          }}
        />
        <div style={{ position: "absolute", top: 40, left: 48, color: "var(--gl-parchment)" }}>
          <Wordmark size={24} color="var(--gl-parchment)" />
        </div>
        <div style={{ position: "absolute", bottom: 48, left: 48, right: 48, color: "var(--gl-parchment)" }}>
          <div
            className="gl-serif"
            style={{
              fontSize: 56,
              lineHeight: 1.05,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              maxWidth: 560,
            }}
          >
            The course<br />before anyone’s on it.
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 13,
              opacity: 0.78,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Hole 13 · Umhlali Country Club · 06:14
          </div>
        </div>
      </section>

      {/* Form side */}
      <main
        style={{
          flex: 1,
          background: "var(--gl-surface)",
          padding: "56px 64px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minWidth: 0,
        }}
      >
        <div className="gl-eyebrow">Welcome back</div>

        <form onSubmit={handleSubmit} style={{ maxWidth: 420 }} noValidate>
          <h1
            className="gl-serif"
            style={{ margin: 0, fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.02em", fontWeight: 500 }}
          >
            Sign in
          </h1>
          <p className="gl-muted" style={{ marginTop: 12, marginBottom: 28, fontSize: 14, lineHeight: 1.55 }}>
            Operations for clubs that hold the tradition of the institution and the energy of the modern game.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <Input
              label={
                <span style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                  <span>Password</span>
                  <span
                    style={{
                      color: "var(--gl-brand)",
                      textTransform: "none",
                      letterSpacing: 0,
                      fontSize: 11,
                      opacity: 0.55,
                    }}
                    aria-label="Password recovery — coming in v1.5"
                    title="Password recovery — coming in v1.5"
                  >
                    Forgot it?
                  </span>
                </span>
              }
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              trailingAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "var(--gl-text-secondary)",
                    cursor: "pointer",
                    padding: 0,
                    display: "inline-flex",
                  }}
                >
                  <Icon name={showPassword ? "visibility_off" : "visibility"} size={16} />
                </button>
              }
            />

            {error ? (
              <div role="alert" className="gl-err" style={{ marginTop: 0 }}>
                <Icon name="error" size={14} color="var(--gl-caddie)" />
                {error}
              </div>
            ) : null}

            <Button type="submit" size="lg" style={{ width: "100%", marginTop: 8 }} loading={submitting} loadingLabel="Signing in…">
              Sign in
            </Button>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
              <span className="gl-divider" style={{ flex: 1 }} />
              <span className="gl-t-xs gl-muted">or</span>
              <span className="gl-divider" style={{ flex: 1 }} />
            </div>

            <Button
              variant="secondary"
              size="lg"
              style={{ width: "100%" }}
              disabled
              title="Passkey sign-in — coming in v2"
              aria-label="Sign in with passkey — coming in v2"
              leadingIcon={<Icon name="key" size={16} />}
            >
              Sign in with passkey
            </Button>
          </div>
        </form>

        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "var(--gl-text-secondary)",
            fontSize: 12,
          }}
        >
          <span>© 2026 GreenLink · Built in South Africa</span>
          <div style={{ display: "flex", gap: 16 }}>
            <a href="#" style={{ color: "inherit" }}>POPIA</a>
            <a href="#" style={{ color: "inherit" }}>Support</a>
            <a href="#" style={{ color: "inherit" }}>Status</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
