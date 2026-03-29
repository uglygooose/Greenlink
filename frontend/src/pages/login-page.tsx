import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useSession } from "../session/session-context";

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const { login, accessToken, bootstrap } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (accessToken && bootstrap) {
      navigate(bootstrap.landing_path, { replace: true });
    }
  }, [accessToken, bootstrap, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await login(email, password);
      navigate(result.user.user_type === "superadmin" ? "/admin/select-club" : "/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <p className="eyebrow">GreenLink Foundation</p>
        <h1>Sign in</h1>
        <p className="muted">Authenticate through the Phase 1 backend and bootstrap your shell from the API.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
            />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
