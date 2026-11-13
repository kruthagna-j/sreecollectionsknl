import { Link } from "react-router-dom";
import { useSite } from "../context/SiteContext";
import { Breadcrumbs, EmptyState } from "../components/ui";
import { GiftIcon, TagIcon, TruckIcon } from "../components/Icons";
import { money } from "../lib/format";
import { useSeo } from "../lib/hooks";

export function Offers() {
  const { site } = useSite();
  const zones = site?.shipping.zones ?? [];
  const freeThresholds = zones.filter((zone) => zone.freeAbove);
  const wrap = site?.policies.giftWrap;
  const cod = site?.policies.cod;

  useSeo({
    title: "Offers · Sree Collections",
    description: "Current delivery thresholds, gift wrapping and coupon information for Sree Collections.",
    noIndex: true
  });

  return (
    <div className="container page-shell offers-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Offers" }]} />
      <header className="page-heading">
        <div>
          <p className="eyebrow">A little more value</p>
          <h1>Offers</h1>
          <p>
            Only what the store actually runs. Coupons are validated at the bag — any code shown here is confirmed by the
            server before it changes your total.
          </p>
        </div>
      </header>

      <div className="offer-grid">
        {freeThresholds.length ? (
          <article className="offer-card">
            <span className="offer-card__icon">
              <TruckIcon size={20} />
            </span>
            <h2>Free delivery thresholds</h2>
            <ul>
              {freeThresholds.map((zone) => (
                <li key={zone.name}>
                  <strong>{zone.name}</strong>
                  <span>Free delivery on orders above {money(zone.freeAbove ?? 0)}</span>
                </li>
              ))}
            </ul>
            <p>The threshold is checked after any coupon discount, and the exact fee is shown in the bag.</p>
            <Link to="/shop" className="text-link">
              Shop the collection
            </Link>
          </article>
        ) : null}

        {wrap ? (
          <article className="offer-card">
            <span className="offer-card__icon">
              <GiftIcon size={20} />
            </span>
            <h2>{wrap.label || "Signature gift wrapping"}</h2>
            <p>
              {wrap.fee === 0
                ? "Gift wrapping is complimentary on eligible items."
                : `${money(wrap.fee)} per item, chosen in the bag or on the product page.`}{" "}
              Add a printed gift message to wrapped pieces at no extra cost.
            </p>
            <Link to="/policies/gift-wrap" className="text-link">
              What wrapping includes
            </Link>
          </article>
        ) : null}

        {cod?.enabled ? (
          <article className="offer-card">
            <span className="offer-card__icon">
              <TagIcon size={20} />
            </span>
            <h2>Cash on delivery</h2>
            <p>
              Order now and pay when the parcel arrives, anywhere in India
              {cod.maxTotal ? `, up to ${money(cod.maxTotal)}` : ""}. No card details are needed.
            </p>
            <Link to="/policies/shipping" className="text-link">
              Check your delivery zone
            </Link>
          </article>
        ) : null}
      </div>

      <section className="offers-coupons prose-block">
        <h2>Coupons</h2>
        <p>
          The store shares coupon codes through its own channels. There is no public list of active codes on this page,
          because a code can expire or reach its usage limit at any time. Enter a code in the bag to see its real status:
          the server checks the minimum order value, dates and limits before applying anything.
        </p>
        <p className="form-note">
          Development builds may include a sample coupon for testing. It is not a public promotion and should be removed
          before the store goes live.
        </p>
      </section>

      {!freeThresholds.length && !wrap && !cod?.enabled ? (
        <EmptyState
          title="No offers are configured"
          description="The store team can add delivery thresholds, gift wrapping and coupons in the admin area."
          action={{ label: "Browse the shop", to: "/shop" }}
        />
      ) : null}
    </div>
  );
}
