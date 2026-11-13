import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useSite } from "../context/SiteContext";
import { Breadcrumbs, EmptyState, PageLoader } from "../components/ui";
import { money } from "../lib/format";
import { useSeo } from "../lib/hooks";

type PolicyMeta = { title: string; eyebrow: string; description: string };

const META: Record<string, PolicyMeta> = {
  shipping: {
    title: "Shipping & delivery",
    eyebrow: "Getting it there",
    description: "How delivery works across India, how fees are set and what delivery costs."
  },
  returns: {
    title: "Returns & exchanges",
    eyebrow: "If something is not right",
    description: "The returns window, what is eligible and how to start a return."
  },
  privacy: {
    title: "Privacy policy",
    eyebrow: "Your data",
    description: "What the store collects, why, and the choices you have."
  },
  terms: {
    title: "Terms of sale",
    eyebrow: "The agreement",
    description: "The practical terms that apply when you order from this store."
  },
  personalisation: {
    title: "Personalisation",
    eyebrow: "Made for one person",
    description: "How personalised pieces are made, checked and returned."
  },
  "gift-wrap": {
    title: "Gift wrapping",
    eyebrow: "The finishing touch",
    description: "What the wrapping includes and how gift messages are handled."
  }
};

export function Policy() {
  const { slug = "" } = useParams();
  const { site, isLoading } = useSite();
  const meta = META[slug];

  useSeo({
    title: meta ? `${meta.title} · Sree Collections` : "Policy · Sree Collections",
    description: meta?.description,
    noIndex: !meta
  });

  if (isLoading) return <PageLoader label="Loading store policies…" />;

  if (!meta) {
    return (
      <div className="container page-shell">
        <EmptyState
          title="This policy page does not exist"
          description="The link may be out of date."
          action={{ label: "Read the shipping policy", to: "/policies/shipping" }}
        />
      </div>
    );
  }

  const returns = site?.policies.returns;
  const giftWrap = site?.policies.giftWrap;
  const cod = site?.policies.cod;
  const support = site?.store.supportEmail;
  const zones = site?.shipping.zones ?? [];

  let body: ReactNode = null;

  if (slug === "shipping") {
    body = (
      <>
        <h2>Coverage</h2>
        <p>
          The store delivers across India. Delivery zones set the fee and estimated window for each PIN code. Enter your
          PIN code in the bag or at checkout to see both before you order. In the rare case a PIN code falls outside the
          configured zones, the store does not accept the order for that address and says so at checkout.
        </p>
        {zones.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Zone</th>
                  <th scope="col">Delivery fee</th>
                  <th scope="col">Free above</th>
                  <th scope="col">Stated window</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => (
                  <tr key={zone.name}>
                    <td>{zone.name}</td>
                    <td>{zone.fee === 0 ? "No fee" : money(zone.fee)}</td>
                    <td>{zone.freeAbove ? money(zone.freeAbove) : "—"}</td>
                    <td>
                      {zone.etaDaysMin}–{zone.etaDaysMax} days after dispatch
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="form-note">No delivery zones are configured yet. The store team can add them in the admin area.</p>
        )}
        <h2>What the delivery window means</h2>
        <p>
          The window is the store's stated preparation and delivery range for its zone. It is not a live courier estimate.
          The store does not create invented tracking scans; when the team records a dispatch or adds a tracking number,
          it appears on your order.
        </p>
        <h2>Charges</h2>
        <p>
          Delivery fees are calculated by the server from the zone, the order value and any free-delivery threshold. The
          final amount is always confirmed at checkout before the order is placed.
        </p>
        <h2>Receiving the parcel</h2>
        <p>
          Please make sure someone can receive the parcel and pay the cash-on-delivery amount where applicable. If a
          delivery cannot be completed, the store team will contact the phone number on the order.
        </p>
      </>
    );
  }

  if (slug === "returns") {
    body = (
      <>
        <h2>The short version</h2>
        <ul>
          <li>Returns are {returns?.enabled ? "currently available" : "currently paused"} for eligible items.</li>
          <li>The return window is {returns?.windowDays ?? 7} days from delivery.</li>
          <li>Personalised items are excluded unless they arrived damaged or incorrect.</li>
          <li>Requests are reviewed by the store team before anything is sent back.</li>
        </ul>
        <h2>Starting a return</h2>
        <p>
          Sign in, open the delivered order in your account and choose the item you would like to return. You will be
          asked for a reason and can add details. The request is recorded immediately; the store team then reviews it and
          contacts you with the next step.
        </p>
        <h2>Eligibility</h2>
        <p>
          Items must be unused, in their original packaging and returned with any included accessories. Items marked as
          not returnable on the product page, and personalised pieces, are not eligible for a change-of-mind return.
          If something arrived damaged or is not what you ordered, contact the store with photographs and it will be
          reviewed even if the item is normally excluded.
        </p>
        <h2>Refunds</h2>
        <p>
          Approved refunds for cash-on-delivery orders are arranged with the store team. No refund is marked as complete
          until the store has actually processed it. The status of your request is shown in your account.
        </p>
        <p className="form-note">
          This is a template policy with the store's current settings applied. It should be reviewed against applicable
          consumer law before the store goes live.
        </p>
      </>
    );
  }

  if (slug === "privacy") {
    body = (
      <>
        <h2>What the store stores</h2>
        <ul>
          <li>Account details: name, email address, optional phone number and a hashed password.</li>
          <li>Order details: contact details, delivery and billing addresses, items, amounts and status history.</li>
          <li>Optional content you provide: gift messages, personalisation text and support messages.</li>
          <li>Newsletter email if you explicitly opt in.</li>
        </ul>
        <h2>Cookies and local storage</h2>
        <p>
          The store uses a session cookie to keep you signed in, a CSRF cookie to protect form submissions, and a cart
          cookie so your bag survives a page refresh. Your browser may also store recent products and the last order
          reference locally so the site is easier to use. No advertising or cross-site tracking cookies are used.
        </p>
        <h2>Who can see your data</h2>
        <p>
          Store staff can see order and account information in the admin area according to their role. Payment card
          details are never collected or stored by this store. If an email, SMS or courier provider is configured by the
          store, order details needed for that service would be shared with that provider only.
        </p>
        <h2>Your choices</h2>
        <p>
          You can update your name, phone and addresses in your account. Newsletter emails can be removed from the list
          using the unsubscribe request in the footer. To ask for a copy or deletion of your account data, contact the
          store team{support ? <> at <a href={`mailto:${support}`}>{support}</a></> : " using the contact form"}.
        </p>
        <h2>Retention</h2>
        <p>
          Order records are kept as long as needed for accounting, tax and customer service. Support messages and return
          requests are retained so the store can resolve them. Passwords are stored only as one-way hashes.
        </p>
      </>
    );
  }

  if (slug === "terms") {
    body = (
      <>
        <h2>Ordering</h2>
        <p>
          An order is placed when the store accepts it and records it in its system. Prices, discounts, stock and delivery
          charges are recalculated by the server at that moment. If an item is no longer available or a coupon is no
          longer valid, the order will not be placed and you will be told why.
        </p>
        <h2>Payment</h2>
        <p>
          {cod?.enabled
            ? `Cash on delivery is available up to an order value of ${money(cod.maxTotal)}.`
            : "Cash on delivery is not currently enabled."}{" "}
          Online card or UPI payment is not enabled on this store. No card details are requested or stored.
        </p>
        <h2>Pricing and tax</h2>
        <p>
          Prices are shown in Indian rupees. Product prices are treated as GST-inclusive according to the store's tax
          setting; the order summary shows the tax included in the total. Gift-wrap charges are shown separately in the
          bag.
        </p>
        <h2>Cancellations</h2>
        <p>
          An order can be cancelled from your account while it has not yet been packed. After that, contact the store.
          Personalised items go into production quickly and may not be cancellable once work has begun.
        </p>
        <h2>Delivery and risk</h2>
        <p>
          Delivery is available across India. The fee and stated window come from the delivery zone that covers your PIN
          code. Stated windows are estimates, not guarantees, and can be affected by weather, festivals and courier
          delays. Risk passes when the parcel is handed over at the delivery address.
        </p>
        <h2>Contact</h2>
        <p>
          Questions about these terms can be sent through the <Link to="/contact">contact form</Link>.
        </p>
        <p className="form-note">
          Template terms for this store build. They are not legal advice and should be reviewed before launch.
        </p>
      </>
    );
  }

  if (slug === "personalisation") {
    body = (
      <>
        <h2>What can be personalised</h2>
        <p>
          Products marked “Personalisable” accept the details shown on the product page — typically a recipient name,
          engraving or short message. Fields are limited in length and checked against a safe character set so the result
          can be produced cleanly.
        </p>
        <h2>Proofreading</h2>
        <p>
          Please check spelling, capitalisation and dates before adding the item to your bag. The store produces exactly
          what is submitted. If something looks wrong, contact the store immediately; once production has started,
          changes may not be possible.
        </p>
        <h2>Production time</h2>
        <p>
          Personalised pieces may need additional preparation time before dispatch. The product page states the
          preparation window for that item. It is added to the delivery window of your zone.
        </p>
        <h2>Returns</h2>
        <p>
          Personalised items cannot be returned for change of mind. If the item arrives damaged or does not match the
          details you submitted, contact the store and it will be put right.
        </p>
      </>
    );
  }

  if (slug === "gift-wrap") {
    body = (
      <>
        <h2>What is included</h2>
        <p>
          {giftWrap ? (
            <>
              The store offers <strong>{giftWrap.label || "signature gift wrapping"}</strong> for{" "}
              {giftWrap.fee === 0 ? "no extra charge" : money(giftWrap.fee)} per item. Wrapping is added item by item in
              the bag or on the product page, so you can wrap only some of the gifts.
            </>
          ) : (
            "Gift wrapping details are not configured yet."
          )}
        </p>
        <h2>Gift messages</h2>
        <p>
          A gift message can be added with wrapped items. Messages are limited to 180 characters, are printed by the
          store, and are visible in your order record. Please avoid sensitive information in gift messages.
        </p>
        <h2>Price visibility</h2>
        <p>
          Wrapped gifts are packed so the recipient sees the gift, not your payment details. The invoice is kept in your
          order record rather than inside the parcel.
        </p>
        <h2>Fragile items</h2>
        <p>
          Fragile pieces are packed with extra protection. Wrapping may be arranged around the protective packaging to
          keep the item safe in transit.
        </p>
      </>
    );
  }

  return (
    <div className="container page-shell policy-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: meta.title }]} />
      <header className="page-heading">
        <div>
          <p className="eyebrow">{meta.eyebrow}</p>
          <h1>{meta.title}</h1>
          <p>{meta.description}</p>
        </div>
      </header>
      <article className="prose-block policy-body">
        {body}
        <div className="policy-links">
          <Link to="/policies/shipping">Shipping</Link>
          <Link to="/policies/returns">Returns</Link>
          <Link to="/policies/privacy">Privacy</Link>
          <Link to="/policies/terms">Terms</Link>
          <Link to="/policies/personalisation">Personalisation</Link>
          <Link to="/policies/gift-wrap">Gift wrapping</Link>
        </div>
      </article>
    </div>
  );
}
