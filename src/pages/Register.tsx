import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Alert, Breadcrumbs, CheckboxField, FormField, Spinner } from "../components/ui";
import { errorMessage, fieldErrors } from "../lib/api";
import { useSeo } from "../lib/hooks";

const STAFF_ROLES = ["owner", "admin", "catalogue", "orders", "support", "finance"];

export function Register() {
  const { register } = useAuth();
  const { refresh } = useCart();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useSeo({ title: "Create an account · Sree Collections", description: "Create a Sree Collections account.", noIndex: true });

  const requested = params.get("next");
  const next = requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : null;

  const strength = [
    { label: "At least 10 characters", ok: form.password.length >= 10 },
    { label: "Contains a letter", ok: /[A-Za-z]/.test(form.password) },
    { label: "Contains a number", ok: /\d/.test(form.password) }
  ];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (form.name.trim().length < 2) nextErrors.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) nextErrors.email = "Enter a valid email address.";
    if (form.phone && !/^[6-9]\d{9}$/.test(form.phone)) nextErrors.phone = "Enter a valid 10-digit mobile number.";
    if (form.password.length < 10 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
      nextErrors.password = "Use at least 10 characters with a letter and a number.";
    }
    if (form.confirm !== form.password) nextErrors.confirm = "The passwords do not match.";
    if (!accepted) nextErrors.terms = "Please accept the terms and privacy policy.";
    setErrors(nextErrors);
    setError(null);
    if (Object.keys(nextErrors).length) {
      setError("Please check the highlighted fields.");
      return;
    }
    setBusy(true);
    try {
      const user = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone || undefined,
        password: form.password
      });
      refresh();
      navigate(next ?? (STAFF_ROLES.includes(user.role) ? "/admin" : "/account"), { replace: true });
    } catch (registerError) {
      setErrors(fieldErrors(registerError));
      setError(errorMessage(registerError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page-shell auth-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Create account" }]} />
      <div className="auth-layout">
        <div className="auth-card">
          <header>
            <p className="eyebrow">A place for your gifts</p>
            <h1>Create an account</h1>
            <p>Save addresses, revisit your wishlist and follow every order.</p>
          </header>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <form onSubmit={submit} className="auth-form" noValidate>
            <FormField label="Full name" htmlFor="register-name" error={errors.name}>
              <input
                id="register-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                autoComplete="name"
                maxLength={80}
                required
                autoFocus
              />
            </FormField>
            <FormField label="Email address" htmlFor="register-email" error={errors.email}>
              <input
                id="register-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                autoComplete="email"
                maxLength={160}
                required
              />
            </FormField>
            <FormField label="Mobile number" htmlFor="register-phone" error={errors.phone} hint="Optional — used for delivery questions.">
              <input
                id="register-phone"
                type="tel"
                inputMode="numeric"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))
                }
                autoComplete="tel"
              />
            </FormField>
            <FormField label="Password" htmlFor="register-password" error={errors.password}>
              <input
                id="register-password"
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                autoComplete="new-password"
                minLength={10}
                required
              />
            </FormField>
            <ul className="password-rules" aria-label="Password requirements">
              {strength.map((rule) => (
                <li key={rule.label} className={rule.ok ? "is-met" : undefined}>
                  {rule.label}
                </li>
              ))}
            </ul>
            <FormField label="Confirm password" htmlFor="register-confirm" error={errors.confirm}>
              <input
                id="register-confirm"
                type="password"
                value={form.confirm}
                onChange={(event) => setForm((current) => ({ ...current, confirm: event.target.value }))}
                autoComplete="new-password"
                required
              />
            </FormField>
            <CheckboxField
              label="I accept the terms of sale and privacy policy"
              checked={accepted}
              onChange={setAccepted}
              error={errors.terms}
            />
            <p className="auth-form__fineprint">
              By creating an account you agree to the <Link to="/policies/terms">terms</Link> and{" "}
              <Link to="/policies/privacy">privacy policy</Link>. We never store card details on this store.
            </p>
            <button type="submit" className="button button--primary button--full" disabled={busy}>
              {busy ? <Spinner label="Creating account" /> : null}
              {busy ? "Creating your account…" : "Create account"}
            </button>
          </form>
          <p className="auth-card__switch">
            Already have an account? <Link to={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Sign in</Link>
          </p>
        </div>

        <aside className="auth-aside">
          <h2>What you can do</h2>
          <ul>
            <li>Keep every order in one place</li>
            <li>Save delivery addresses</li>
            <li>Build a wishlist for later</li>
            <li>Review items once they arrive</li>
          </ul>
          <p className="auth-aside__note">
            Your password is stored as a one-way hash. We cannot read it — only reset it from the store's account tools.
          </p>
        </aside>
      </div>
    </div>
  );
}
