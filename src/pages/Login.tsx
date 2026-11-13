import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Alert, Breadcrumbs, FormField, Spinner } from "../components/ui";
import { errorMessage } from "../lib/api";
import { useSeo } from "../lib/hooks";

const STAFF_ROLES = ["owner", "admin", "catalogue", "orders", "support", "finance"];

export function Login() {
  const { login } = useAuth();
  const { refresh } = useCart();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useSeo({ title: "Sign in · Sree Collections", description: "Sign in to your Sree Collections account.", noIndex: true });

  const requested = params.get("next");
  const next = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : null;
  const staffIntent = Boolean(next?.startsWith("/admin"));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login({ email: email.trim(), password });
      refresh();
      navigate(next ?? (STAFF_ROLES.includes(user.role) ? "/admin" : "/account"), { replace: true });
    } catch (loginError) {
      setError(errorMessage(loginError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page-shell auth-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Sign in" }]} />
      <div className="auth-layout">
        <div className="auth-card">
          <header>
            <p className="eyebrow">{staffIntent ? "Store team" : "Welcome back"}</p>
            <h1>{staffIntent ? "Staff sign in" : "Sign in"}</h1>
            <p>
              {staffIntent
                ? "Use the staff account issued by the store owner."
                : "See your orders, saved addresses and wishlist."}
            </p>
          </header>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <form onSubmit={submit} className="auth-form">
            <FormField label="Email address" htmlFor="login-email">
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
            </FormField>
            <FormField label="Password" htmlFor="login-password">
              <div className="input-with-action">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button type="button" className="text-button" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </FormField>
            <div className="auth-form__links">
              <Link to="/forgot-password" className="text-link">
                Forgot your password?
              </Link>
            </div>
            <button type="submit" className="button button--primary button--full" disabled={busy}>
              {busy ? <Spinner label="Signing in" /> : null}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="auth-card__switch">
            New here? <Link to={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}>Create an account</Link>
          </p>
        </div>

        <aside className="auth-aside">
          <h2>Order without an account</h2>
          <p>
            Guest checkout is welcome. Keep the order number from your confirmation and use it with your email to track
            the parcel.
          </p>
          <Link to="/track" className="text-link">
            Track a guest order
          </Link>
          <p className="auth-aside__note">
            Store staff sign in with their own accounts. No public administrator account is created by default.
            {staffIntent ? null : (
              <>
                {" "}
                <Link to="/login?next=%2Fadmin" className="text-link">
                  Staff sign in
                </Link>
              </>
            )}
          </p>
        </aside>
      </div>
    </div>
  );
}
