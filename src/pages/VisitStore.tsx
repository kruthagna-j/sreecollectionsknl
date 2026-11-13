import { Link } from "react-router-dom";
import { useSite } from "../context/SiteContext";
import { Breadcrumbs } from "../components/ui";
import { ClockIcon, MailIcon, PhoneIcon, PinIcon, WhatsAppIcon } from "../components/Icons";
import { useSeo } from "../lib/hooks";
import { clockLabel } from "../lib/format";
import { whatsAppChatLink, whatsAppNumber } from "../lib/whatsapp";

export function VisitStore() {
  const { site } = useSite();
  const store = site?.store;
  const address = store?.address?.trim();
  const hasRealAddress = Boolean(address && !/development configuration/i.test(address));
  const closing = clockLabel(site?.publicProfile?.closesAt);
  const whatsapp = whatsAppNumber(store?.supportWhatsApp);
  const whatsappHref = whatsapp
    ? whatsAppChatLink(whatsapp, "Hello Sree Collections, I am planning a visit to the shop.")
    : null;

  useSeo({
    title: "Visit the store · Sree Collections",
    description: "Store address and contact details for Sree Collections.",
    noIndex: true
  });

  return (
    <div className="container page-shell">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Visit us" }]} />
      <header className="page-heading">
        <div>
          <p className="eyebrow">At the counter</p>
          <h1>Visit the store</h1>
          <p>Some gifts are easier to choose in person. Come and see the pieces, the paper and the ribbon.</p>
        </div>
      </header>

      <div className="visit-layout">
        <section className="visit-card">
          <h2>
            <PinIcon size={18} /> Address
          </h2>
          <p className="visit-address">
            {hasRealAddress ? address : "The store address has not been published on this site yet."}
          </p>
          {!hasRealAddress ? (
            <p className="form-note">
              The store team can set the real address in Admin → Settings. Nothing is invented here.
            </p>
          ) : null}

          <h2>
            <ClockIcon size={18} /> Opening hours
          </h2>
          <p>
            {closing
              ? `Listed closing time: ${closing}. Call or message before travelling to confirm the day's hours.`
              : "Opening hours are not published online yet. Please contact the store before travelling."}
          </p>

          <h2>
            <PhoneIcon size={18} /> Phone
          </h2>
          <p>
            {store?.supportPhone ? (
              <a href={`tel:${store.supportPhone}`}>{store.supportPhone}</a>
            ) : (
              "No phone number is published yet."
            )}
          </p>

          {whatsappHref ? (
            <>
              <h2>
                <WhatsAppIcon size={18} /> WhatsApp
              </h2>
              <p>
                <a href={whatsappHref} target="_blank" rel="noreferrer">
                  Message the store on WhatsApp
                </a>
              </p>
            </>
          ) : null}

          <h2>
            <MailIcon size={18} /> Email
          </h2>
          <p>
            {store?.supportEmail ? (
              <a href={`mailto:${store.supportEmail}`}>{store.supportEmail}</a>
            ) : (
              <Link to="/contact">Use the contact form</Link>
            )}
          </p>
        </section>

        <aside className="visit-aside">
          <div className="visit-aside__art" aria-hidden="true">
            <img src="/images/products/gold-ribbon-gift-set.svg" alt="" width="360" height="450" loading="lazy" />
          </div>
          <h2>Planning a visit?</h2>
          <p>
            Send a message with the occasion and budget and the team can set a few pieces aside before you arrive.
            Personalisation can be discussed at the counter.
          </p>
          <div className="visit-aside__links">
            <Link to="/contact" className="button button--primary">
              Message the store
            </Link>
            {whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noreferrer" className="text-link">
                Or ask on WhatsApp
              </a>
            ) : null}
            <Link to="/gift-finder" className="text-link">
              Start with the gift finder
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
