import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSite } from "../context/SiteContext";
import { Alert, Breadcrumbs, FormField, Spinner } from "../components/ui";
import { MailIcon, PhoneIcon, PinIcon, WhatsAppIcon } from "../components/Icons";
import { api, errorMessage, fieldErrors } from "../lib/api";
import { useSeo } from "../lib/hooks";
import { whatsAppChatLink, whatsAppNumber } from "../lib/whatsapp";

export function Contact() {
  const { user } = useAuth();
  const { site } = useSite();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    subject: params.get("subject") ?? "",
    orderNumber: params.get("order") ?? "",
    message: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<{ ticketNumber: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useSeo({
    title: "Contact the store · Sree Collections",
    description: "Send a message to the Sree Collections store team.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ContactPage",
      name: "Contact Sree Collections"
    }
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setErrors({});
    setBusy(true);
    try {
      const response = await api<{ ticketNumber: string; message: string }>("/content/support/tickets", {
        method: "POST",
        body: {
          name: form.name.trim(),
          email: form.email.trim(),
          subject: form.subject.trim(),
          message: form.message.trim(),
          orderNumber: form.orderNumber.trim()
        }
      });
      setTicket(response);
    } catch (submitError) {
      setErrors(fieldErrors(submitError));
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  };

  const store = site?.store;
  const whatsapp = whatsAppNumber(store?.supportWhatsApp);
  const whatsappHref = whatsapp
    ? whatsAppChatLink(whatsapp, "Hello Sree Collections, I have a question about an order.")
    : null;

  return (
    <div className="container page-shell">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Contact" }]} />
      <header className="page-heading">
        <div>
          <p className="eyebrow">Talk to us</p>
          <h1>Contact the store</h1>
          <p>Questions about a gift, an order or a personalisation? Send a note and the team will pick it up.</p>
        </div>
      </header>

      <div className="contact-layout">
        <section className="contact-form-panel">
          {ticket ? (
            <div className="contact-success">
              <Alert tone="success" title={`Message saved · ${ticket.ticketNumber}`}>
                <p>{ticket.message}</p>
              </Alert>
              <p className="form-note">
                Keep the reference <strong>{ticket.ticketNumber}</strong>. Automated replies are not enabled, so urgent
                matters are best raised by phone once the store publishes a number.
              </p>
              <div className="contact-success__actions">
                <Link to="/faq" className="button button--quiet">
                  Read the FAQ
                </Link>
                <Link to="/shop" className="button button--ghost">
                  Back to the shop
                </Link>
              </div>
            </div>
          ) : (
            <>
              {error ? <Alert tone="error">{error}</Alert> : null}
              <form onSubmit={submit} className="contact-form">
                <div className="form-grid">
                  <FormField label="Your name" htmlFor="contact-name" error={errors.name}>
                    <input
                      id="contact-name"
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      autoComplete="name"
                      maxLength={80}
                      required
                    />
                  </FormField>
                  <FormField label="Email address" htmlFor="contact-email" error={errors.email}>
                    <input
                      id="contact-email"
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                      autoComplete="email"
                      maxLength={160}
                      required
                    />
                  </FormField>
                  <FormField label="Subject" htmlFor="contact-subject" error={errors.subject} className="form-grid__full">
                    <input
                      id="contact-subject"
                      value={form.subject}
                      onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
                      maxLength={120}
                      required
                    />
                  </FormField>
                  <FormField
                    label="Order number"
                    htmlFor="contact-order"
                    error={errors.orderNumber}
                    hint="Optional — helps us find your order."
                    className="form-grid__full"
                  >
                    <input
                      id="contact-order"
                      value={form.orderNumber}
                      onChange={(event) => setForm((current) => ({ ...current, orderNumber: event.target.value.toUpperCase() }))}
                      maxLength={30}
                    />
                  </FormField>
                  <FormField label="Message" htmlFor="contact-message" error={errors.message} className="form-grid__full">
                    <textarea
                      id="contact-message"
                      rows={6}
                      value={form.message}
                      onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                      maxLength={3000}
                      required
                    />
                  </FormField>
                </div>
                <div className="contact-form__actions">
                  <button type="submit" className="button button--primary" disabled={busy}>
                    {busy ? <Spinner label="Sending message" /> : null}
                    {busy ? "Saving your message…" : "Send message"}
                  </button>
                  <p className="form-note">Messages are saved for the store team. No automated email is sent yet.</p>
                </div>
              </form>
            </>
          )}
        </section>

        <aside className="contact-aside">
          <h2>Store details</h2>
          <ul className="contact-list">
            <li>
              <PinIcon size={16} />
              <span>{store?.address || "The store address has not been published yet."}</span>
            </li>
            <li>
              <MailIcon size={16} />
              <span>
                {store?.supportEmail ? (
                  <a href={`mailto:${store.supportEmail}`}>{store.supportEmail}</a>
                ) : (
                  "No support email is published yet. Use the message form."
                )}
              </span>
            </li>
            <li>
              <PhoneIcon size={16} />
              <span>
                {store?.supportPhone ? (
                  <a href={`tel:${store.supportPhone}`}>{store.supportPhone}</a>
                ) : (
                  "No support phone number is published yet."
                )}
              </span>
            </li>
            {whatsappHref ? (
              <li>
                <WhatsAppIcon size={16} />
                <span>
                  <a href={whatsappHref} target="_blank" rel="noreferrer">
                    Message the store on WhatsApp
                  </a>
                </span>
              </li>
            ) : null}
          </ul>
          <p className="contact-aside__note">
            The store configures these details in the admin area. Nothing is invented for display.
          </p>
          <div className="contact-aside__links">
            <Link to="/faq">Frequently asked questions</Link>
            <Link to="/track">Track an order</Link>
            <Link to="/policies/returns">Returns policy</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
