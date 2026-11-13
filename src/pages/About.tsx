import { Link } from "react-router-dom";
import { useSite } from "../context/SiteContext";
import { Breadcrumbs } from "../components/ui";
import { GiftIcon, LeafIcon, SparkleIcon } from "../components/Icons";
import { useSeo } from "../lib/hooks";

const principles = [
  {
    icon: <GiftIcon size={22} />,
    title: "Chosen, not dumped",
    body: "The shelf is small on purpose. Every piece is picked for a reason: it holds a moment, suits a budget, or makes someone feel seen."
  },
  {
    icon: <LeafIcon size={22} />,
    title: "Wrapped by hand",
    body: "Ribbon, tissue and a handwritten tag. Wrapping is done at the counter, not by a machine, and it is optional per item."
  },
  {
    icon: <SparkleIcon size={22} />,
    title: "Honest about what is ready",
    body: "If a feature, a delivery area or a payment method is not live yet, this site says so instead of pretending."
  }
];

export function About() {
  const { site } = useSite();
  const since = site?.store.tagline?.match(/\d{4}/)?.[0] ?? "1998";
  const years = Math.max(1, new Date().getFullYear() - Number(since));

  useSeo({
    title: "Our story · Sree Collections",
    description: "A family gift shop since 1998 — how Sree Collections chooses, wraps and delivers gifts.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "About Sree Collections"
    }
  });

  return (
    <div className="container page-shell about-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Our story" }]} />
      <header className="about-hero">
        <div>
          <p className="eyebrow">{site?.store.tagline ?? "Since 1998"}</p>
          <h1>A small shop for the moments that matter</h1>
          <p>
            Sree Collections has been part of the neighbourhood for {years} years. What began as a gift counter is now a
            considered collection of keepsakes, soft toys, wedding gifts and personalised pieces — still chosen by hand,
            still wrapped at the counter.
          </p>
        </div>
        <img src="/images/hero.svg" alt="An illustrated gift box with ribbon" width="360" height="360" loading="eager" />
      </header>

      <section className="about-story prose-block">
        <h2>Why we still do it this way</h2>
        <p>
          Gifts are a small, specific kind of promise: that you noticed someone. A name engraved on a locket, a soft toy
          chosen for a new baby, a hamper for a housewarming — these are not transactions that should feel anonymous.
        </p>
        <p>
          So the shop keeps the collection tight, the wrapping personal and the advice human. When you message the store,
          you reach the people who pack the parcel. When something is not right, it is sorted out by the same team.
        </p>
        <p>
          The website extends the counter. It shows what is genuinely in stock, calculates delivery across India for your
          PIN code, and records every order with a real status history — no invented courier scans, no fake
          testimonials, no pretend urgency.
        </p>
      </section>

      <section className="about-principles">
        {principles.map((principle) => (
          <article key={principle.title}>
            <span className="about-principles__icon">{principle.icon}</span>
            <h3>{principle.title}</h3>
            <p>{principle.body}</p>
          </article>
        ))}
      </section>

      <section className="about-cta">
        <div>
          <h2>Let us help you choose</h2>
          <p>Answer four quick questions and the gift finder will search the live collection for you.</p>
        </div>
        <div className="about-cta__actions">
          <Link to="/gift-finder" className="button button--primary">
            Try the gift finder
          </Link>
          <Link to="/shop" className="button button--quiet">
            Browse everything
          </Link>
        </div>
      </section>
    </div>
  );
}
