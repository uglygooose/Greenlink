import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useSession } from "../session/session-context";

export function InvitationAcceptPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { acceptInvitation, activateInvitation, accessToken, bootstrap } = useSession();
  const [token, setToken] = useState(() => searchParams.get("token") ?? "");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isAuthenticated = Boolean(accessToken && bootstrap);

  useEffect(() => {
    const nextToken = searchParams.get("token") ?? "";
    setToken((current) => (current === nextToken ? current : nextToken));
  }, [searchParams]);

  useEffect(() => {
    if (accessToken && bootstrap && !searchParams.get("token")) {
      navigate(bootstrap.landing_path, { replace: true });
    }
  }, [accessToken, bootstrap, navigate, searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (token.trim().length === 0) {
      setError("Invitation token is required.");
      return;
    }
    if (!isAuthenticated) {
      if (displayName.trim().length === 0) {
        setError("Display name is required.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isAuthenticated) {
        await activateInvitation(token.trim());
      } else {
        await acceptInvitation(token.trim(), password, displayName.trim());
      }
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invitation acceptance failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">GreenLink Invitation</p>
        <h1>{isAuthenticated ? "Activate Club Access" : "Accept Invitation"}</h1>
        <p className="muted">
          {isAuthenticated
            ? "Enter your invitation token to activate access for your existing account."
            : "Create your account to activate your club access."}
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Invitation Token
            <input
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              type="text"
              required
            />
          </label>
          {!isAuthenticated ? (
            <>
              <label>
                Display Name
                <input
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  type="text"
                  required
                />
              </label>
              <label>
                Password
                <input
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  required
                />
              </label>
            </>
          ) : null}
          {error ? <p className="error-text">{error}</p> : null}
          <button disabled={submitting} type="submit">
            {submitting ? "Activating..." : isAuthenticated ? "Activate Access" : "Accept Invitation"}
          </button>
        </form>
      </section>
    </main>
  );
}
