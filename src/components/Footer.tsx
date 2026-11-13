import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useSite } from "../context/SiteContext";
import { useToast } from "../context/ToastContext";
import { api, errorMessage } from "../lib/api";
import { ArrowRightIcon, GiftIcon, LockIcon, LogoMark, MailIcon, PinIcon, TruckIcon, WhatsAppIcon } from "./Icons";
import { CheckboxField } from "./ui";
import { whatsAppChatLink, whatsAppNumber } from "../lib/whatsapp";

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { notify } = useToast();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!consent) {
      notify("Please agree to us storing your email.", "error");
      return;
    }
    setBusy(true);
    try {
      const response = await api<{ message: string }>("/content/newsletter", {
        method: "POST",
        body: { email, consent, source: "footer" }
      });
      setResult(response.message);
      setEmail("");
      setConsent(false);
      notify("You're on the list.");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="newsletter" onSubmit={submit}>
      <label htmlFor="newsletter-email" className="newsletter__label">
        Letters from the store
      </label>
      <p>Occasional notes on new arrivals and considered gifting. No noise.</p>
      <div className="newsletter__row">
        <MailIcon size={17} />
        <input
          id="newsletter-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Your email address"
          autoComplete="email"
          required
          maxLength={160}
        />
        <button type="submit" className="button button--gold button--small" disabled={busy}>
          {busy ? "Saving" : "Join"}
          <ArrowRightIcon size={15} />
        </button>
      </div>
      <CheckboxField
        label="I agree to Sree Collections storing my email for occasional updates."
        checked={consent}
        onChange={setConsent}
      />
      {result ? <p className="newsletter__result">{result}</p> : null}
    </form>
  );
}

export function Footer() {
  const { site } = useSite();
  const store = site?.store;
  const supportEmail = store?.supportEmail?.trim();
  const whatsapp = whatsAppNumber(store?.supportWhatsApp);
  const emailConfigured = site?.integrations.email !== "not_configured";

  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div className="site-footer__brand">
          <Link to="/" className="brand brand--footer">
            <LogoMark size={42} />
            <span className="brand__text">
              <span className="brand__name">{store?.name ?? "Sree Collections"}</span>
              <span className="brand__tagline">{store?.tagline ?? "Since 1998"}</span>
            </span>
          </Link>
          <p className="site-footer__blurb">
            A family gift shop since 1998. Keepsakes, personalised pieces and small ceremonies of giving — chosen with
            care and packed by hand.
          </p>
          <div className="site-footer__assurances">
            <span>
              <TruckIcon size={16} /> Cash on delivery
            </span>
            <span>
              <GiftIcon size={16} /> Gift wrapping
            </span>
            <span>
              <LockIcon size={16} /> Secure checkout
            </span>
          </div>
        </div>

        <div className="site-footer__links">
          <div>
            <h3>Shop</h3>
            <Link to="/shop">All gifts</Link>
            <Link to="/shop?category=birthday">Birthday</Link>
            <Link to="/shop?category=anniversary">Anniversary</Link>
            <Link to="/shop?category=personalised">Personalised</Link>
            <Link to="/shop?category=soft-toys">Soft toys</Link>
            <Link to="/shop?category=wedding">Wedding</Link>
            <Link to="/gift-finder">Gift finder</Link>
          </div>
          <div>
            <h3>Help</h3>
            <Link to="/contact">Contact us</Link>
            <Link to="/track">Track an order</Link>
            <Link to="/faq">FAQs</Link>
            <Link to="/policies/shipping">Shipping &amp; delivery</Link>
            <Link to="/policies/returns">Returns &amp; exchanges</Link>
            <Link to="/policies/personalisation">Personalisation</Link>
            <Link to="/policies/gift-wrap">Gift wrapping</Link>
          </div>
          <div>
            <h3>The store</h3>
            <Link to="/about">Our story</Link>
            <Link to="/journal">Journal</Link>
            <Link to="/offers">Offers</Link>
            <Link to="/stores">Visit us</Link>
            <Link to="/policies/privacy">Privacy</Link>
            <Link to="/policies/terms">Terms</Link>
          </div>
        </div>

        <div className="site-footer__newsletter">
          <NewsletterForm />
        </div>
      </div>

      <div className="site-footer__note">
        <p>
          <strong>Good to know:</strong> Cash on delivery is available across India.{" "}
          {emailConfigured
            ? "Order invoices are emailed when an order is placed."
            : "Email is not enabled yet, so invoices download from the order page."}{" "}
          Online payment and live courier tracking are not enabled yet.
        </p>
      </div>

      <div className="site-footer__bottom">
        <p>© {new Date().getFullYear()} {store?.name ?? "Sree Collections"}. All rights reserved.</p>
        <div className="site-footer__meta">
          {supportEmail ? (
            <a href={`mailto:${supportEmail}`}>
              <MailIcon size={14} /> {supportEmail}
            </a>
          ) : (
            <Link to="/contact">
              <MailIcon size={14} /> Contact the store
            </Link>
          )}
          {whatsapp ? (
            <a
              href={whatsAppChatLink(whatsapp, "Hello Sree Collections, I have a question.")}
              target="_blank"
              rel="noreferrer"
            >
              <WhatsAppIcon size={14} /> WhatsApp
            </a>
          ) : null}
          {store?.address ? (
            <span>
              <PinIcon size={14} /> {store.address}
            </span>
          ) : null}
          <Link to="/admin" className="site-footer__staff">
            <LockIcon size={12} /> Staff sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
