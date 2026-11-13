import { Link } from "react-router-dom";
import { useSite } from "../context/SiteContext";
import { useSeo } from "../lib/hooks";
import {
  ArrowRightIcon,
  ClockIcon,
  GiftIcon,
  PinIcon,
  SparkleIcon,
  StarIcon,
  TruckIcon,
  WhatsAppIcon
} from "../components/Icons";
import { ProductCard } from "../components/ProductCard";
import { SectionHeading, SkeletonCard } from "../components/ui";
import { clockLabel } from "../lib/format";
import { whatsAppChatLink, whatsAppNumber } from "../lib/whatsapp";

export function Home() {
  const { home, site, isLoading } = useSite();
  const storeName = site?.store.name ?? "Sree Collections";
  const profile = site?.publicProfile;
  const rating = typeof profile?.rating === "number" ? profile.rating : null;
  const ratingCount = typeof profile?.ratingCount === "number" ? profile.ratingCount : null;
  const years = typeof profile?.yearsInBusiness === "number" ? profile.yearsInBusiness : null;
  const locality = site?.store.address?.trim() || profile?.locality?.trim() || null;
  const closing = clockLabel(profile?.closesAt);
  const whatsappNumber = whatsAppNumber(site?.store.supportWhatsApp);
  const whatsappHref = whatsappNumber
    ? whatsAppChatLink(whatsappNumber, "Hello Sree Collections, I would like to ask about a gift.")
    : null;

  useSeo({
    title: `${storeName} · Gift shop in Kurnool since 1998`,
    description:
      "Personalised gifts, keepsakes, soft toys and wedding gifts from Sree Collections in Gandhi Nagar, Kurnool. Delivery across India with cash on delivery.",
    image: home?.hero?.image ?? "/images/hero.svg",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Store",
      name: storeName,
      description: "A family gift shop in Kurnool, offering personalised keepsakes, soft toys and wedding gifts.",
      foundingDate: "1998",
      slogan: "Gifts chosen with care.",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Kurnool",
        addressCountry: "IN"
      }
    }
  });

  const hero = home?.hero;
  const featured = home?.collections.featured ?? [];
  const categories = (home?.categories ?? []).filter((category) => category.slug !== "all-gifts");

  return (
    <>
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">{hero?.eyebrow ?? "Gandhi Nagar, Kurnool · Since 1998"}</p>
          <h1 className="hero__title">{hero?.title ?? "Gifts that keep the moment."}</h1>
          <p className="hero__subtitle">
            {hero?.subtitle ??
              "Personalised keepsakes, soft toys and wedding gifts — wrapped by hand at our shop in Kurnool."}
          </p>
          <div className="hero__actions">
            <Link className="button button--primary" to={hero?.ctaHref ?? "/shop"}>
              {hero?.ctaLabel ?? "Shop gifts"}
              <ArrowRightIcon size={17} />
            </Link>
            <Link className="button button--ghost" to="/gift-finder">
              <SparkleIcon size={16} /> Find a gift
            </Link>
          </div>
          <div className="hero__marks">
            {site?.policies.cod.enabled ? (
              <span>
                <TruckIcon size={17} /> Cash on delivery
              </span>
            ) : null}
            <span>
              <GiftIcon size={17} /> Hand-wrapped
            </span>
            <span>
              <PinIcon size={17} /> Personalised gifts
            </span>
          </div>
        </div>

        <div className="hero__visual">
          <div className="hero__arch">
            <img
              src={hero?.image ?? "/images/hero.svg"}
              alt="An illustrated still life of a burgundy keepsake box, candle and roses from the Sree Collections gift range."
              width="1600"
              height="1200"
              fetchPriority="high"
            />
          </div>
          <div className="hero__seal" aria-hidden="true">
            <span>Sree</span>
            <span>Collections</span>
          </div>
        </div>
      </section>

      {rating !== null || years !== null || locality ? (
        <section className="home-trust" aria-label="Shop details">
          <div className="container home-trust__inner">
            {rating !== null && ratingCount !== null ? (
              <div className="home-trust__item home-trust__item--rating">
                <StarIcon size={19} filled />
                <span>
                  <strong>{rating.toFixed(1)} rating</strong>
                  <small>{ratingCount.toLocaleString("en-IN")} customer ratings</small>
                </span>
              </div>
            ) : null}

            {years !== null ? (
              <div className="home-trust__item">
                <GiftIcon size={19} />
                <span>
                  <strong>{years} years</strong>
                  <small>in business</small>
                </span>
              </div>
            ) : null}

            {locality ? (
              <Link className="home-trust__item" to="/stores">
                <PinIcon size={19} />
                <span>
                  <strong>{locality}</strong>
                  <small>Visit the shop</small>
                </span>
              </Link>
            ) : null}

            {site?.policies.cod.enabled ? (
              <div className="home-trust__item">
                <TruckIcon size={19} />
                <span>
                  <strong>Cash on delivery</strong>
                  <small>Across India</small>
                </span>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {categories.length > 0 ? (
        <section className="home-cats">
          <div className="container home-cats__inner">
            <p className="eyebrow">Shop by</p>
            <div className="home-cats__row">
              {categories.map((category) => (
                <Link to={`/shop?category=${category.slug}`} className="home-chip" key={category.id}>
                  {category.name}
                </Link>
              ))}
            </div>
            <Link className="text-link" to="/shop">
              All gifts <ArrowRightIcon size={15} />
            </Link>
          </div>
        </section>
      ) : null}

      <section className="section home-featured">
        <div className="container">
          <SectionHeading
            eyebrow="A few favourites"
            title="A small collection, chosen well."
            action={{ label: "View all gifts", to: "/shop" }}
          />
          <div className="product-grid">
            {isLoading
              ? Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)
              : featured.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 2} />
                ))}
          </div>
        </div>
      </section>

      {locality ? (
        <section className="section home-visit">
          <div className="container">
            <div className="home-visit__card">
              <div className="home-visit__copy">
                <p className="eyebrow">Visit the shop</p>
                <h2>Come and see the shelves.</h2>
                <p className="home-visit__line">
                  <PinIcon size={17} />
                  {locality}
                </p>
                {closing ? (
                  <p className="home-visit__line">
                    <ClockIcon size={17} />
                    Listed closing time: {closing}
                  </p>
                ) : null}
                <p className="home-visit__note">
                  Please call or message the store before travelling so the day's timings can be confirmed.
                </p>
              </div>
              <div className="home-visit__actions">
                <Link className="button button--primary" to="/stores">
                  Plan a visit
                  <ArrowRightIcon size={16} />
                </Link>
                {whatsappHref ? (
                  <a className="button button--ghost" href={whatsappHref} target="_blank" rel="noopener noreferrer">
                    <WhatsAppIcon size={16} /> WhatsApp us
                  </a>
                ) : null}
                <Link className="text-link" to="/contact">
                  Contact the store
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
