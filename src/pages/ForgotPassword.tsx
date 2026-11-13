import { Link } from "react-router-dom";
import { useSite } from "../context/SiteContext";
import { Alert, Breadcrumbs } from "../components/ui";
import { MailIcon } from "../components/Icons";
import { useSeo } from "../lib/hooks";

export function ForgotPassword() {
  const { site } = useSite();
  useSeo({ title: "Password help · Sree Collections", noIndex: true, description: "Password recovery information." });

  const supportEmail = site?.store.supportEmail;
  const supportPhone = site?.store.supportPhone;

  return (
    <div className="container page-shell narrow-shell">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Sign in", to: "/login" }, { label: "Password help" }]} />
      <header className="page-heading">
        <div>
          <p className="eyebrow">Account help</p>
          <h1>Password recovery</h1>
          <p>Here is the honest status of password resets on this store.</p>
        </div>
      </header>

      <Alert tone="warning" title="Email password resets are not available yet">
        <p>
          This store does not have an email provider configured, so it cannot send reset links. No reset email will be
          sent, and we will not pretend one was.
        </p>
      </Alert>

      <section className="prose-block">
        <h2>What to do instead</h2>
        <p>
          Contact the store team with the email address on your account. Once they have verified it is you, they can help
          you regain access using the store's account tools.
        </p>
        {supportEmail || supportPhone ? (
          <p className="forgot-contact">
            <MailIcon size={16} />
            {supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : null}
            {supportEmail && supportPhone ? " · " : null}
            {supportPhone ? <a href={`tel:${supportPhone}`}>{supportPhone}</a> : null}
          </p>
        ) : (
          <p className="form-note">
            No support contact is published yet in the store settings. The store team can add one from the admin area.
          </p>
        )}
        <p className="form-note">
          Still have your password? <Link to="/login">Return to sign in</Link>.
        </p>
      </section>
    </div>
  );
}
