import { Link } from "react-router-dom";
import { useSite } from "../context/SiteContext";
import { Breadcrumbs } from "../components/ui";
import { money } from "../lib/format";
import { useSeo } from "../lib/hooks";

type Entry = { question: string; answer: string };

export function Faq() {
  const { site } = useSite();
  const returns = site?.policies.returns;
  const cod = site?.policies.cod;
  const wrap = site?.policies.giftWrap;

  const groups: Array<{ title: string; entries: Entry[] }> = [
    {
      title: "Ordering",
      entries: [
        {
          question: "Do I need an account to order?",
          answer:
            "No. Guest checkout is available. Keep the order number from your confirmation — you can track the order with that number and the email you used."
        },
        {
          question: "Can I change my order after placing it?",
          answer:
            "Contact the store as soon as possible. Orders can be changed or cancelled before they are packed. Personalised pieces may enter production quickly."
        },
        {
          question: "Why did my coupon not apply?",
          answer:
            "Coupons have a minimum order value, an expiry range and usage limits, and some are restricted to first orders. The bag tells you exactly why a code was rejected; the discount is always calculated by the server."
        }
      ]
    },
    {
      title: "Delivery",
      entries: [
        {
          question: "Where do you deliver?",
          answer:
            "We deliver across India. Enter your PIN code in the bag or at checkout to see the delivery fee and estimated window. If a PIN code falls outside the store's configured zones, checkout will say so before the order is placed."
        },
        {
          question: "How long does delivery take?",
          answer:
            "The delivery window comes from the zone that covers your PIN code and starts after dispatch. It is the store's stated window, not a live courier estimate. Personalised items may need extra preparation time."
        },
        {
          question: "How much does delivery cost?",
          answer:
            "The fee depends on your zone and order value, and some zones have a free-delivery threshold. The exact amount is shown in the bag once your PIN code is checked and again at checkout."
        }
      ]
    },
    {
      title: "Payment",
      entries: [
        {
          question: "What payment methods are accepted?",
          answer: cod?.enabled
            ? `Cash on delivery is available across India${cod.maxTotal ? `, up to an order value of ${money(cod.maxTotal)}` : ""}. Online card or UPI payment is not enabled on this store yet.`
            : "Cash on delivery is not currently enabled. Online payment is also not configured, so orders cannot be placed right now."
        },
        {
          question: "Are card details stored?",
          answer:
            "No card details are ever requested on this store. If online payments are enabled later, they will be handled by a payment provider and the store will never store your card number."
        },
        {
          question: "When is the cash collected?",
          answer: "When the parcel is handed over to you at the delivery address. Your order shows the amount due."
        }
      ]
    },
    {
      title: "Gifts & personalisation",
      entries: [
        {
          question: "Can I add a gift message?",
          answer:
            "Yes. A gift message can be added with wrapped items, and an order note can be sent to the store at checkout. Gift messages are printed by the store and visible in your order record."
        },
        {
          question: "What does gift wrapping include?",
          answer: wrap
            ? `${wrap.label || "Signature wrapping"} is available${wrap.fee ? ` for ${money(wrap.fee)} per item` : " at no extra charge"}. Choose wrapping item by item in the bag.`
            : "Gift wrapping details are configured by the store."
        },
        {
          question: "How does personalisation work?",
          answer:
            "Choose the options on the product page and enter the exact name or message. The store produces what you submit, so check spelling and dates before ordering. Personalised items cannot be returned for change of mind."
        }
      ]
    },
    {
      title: "Returns & support",
      entries: [
        {
          question: "What is the returns window?",
          answer: `Eligible items can be requested within ${returns?.windowDays ?? 7} days of delivery. Personalised items are excluded unless they arrived damaged or incorrect. Requests are reviewed by the store before anything is sent back.`
        },
        {
          question: "How do I track my order?",
          answer:
            "Use the order number and email on the track page, or open the order in your account. Tracking details appear only when the store team records real dispatch information."
        },
        {
          question: "Will I receive an email about my order?",
          answer:
            "Automated order emails are not enabled on this store yet, so no email confirmation is sent. Your order is still recorded and visible on the confirmation page and in your account."
        },
        {
          question: "How do I contact the store?",
          answer:
            "Use the contact form. Messages are saved for the store team. If the store publishes a phone number, urgent matters can be raised there."
        }
      ]
    }
  ];

  useSeo({
    title: "FAQ · Sree Collections",
    description: "Answers about ordering, delivery, payment, gift wrapping and returns at Sree Collections.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: groups
        .flatMap((group) => group.entries)
        .map((entry) => ({
          "@type": "Question",
          name: entry.question,
          acceptedAnswer: { "@type": "Answer", text: entry.answer }
        }))
    }
  });

  return (
    <div className="container page-shell faq-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "FAQ" }]} />
      <header className="page-heading">
        <div>
          <p className="eyebrow">Good to know</p>
          <h1>Frequently asked questions</h1>
          <p>
            Straight answers about this store, grounded in how it actually works. If something is not configured yet, we
            say so.
          </p>
        </div>
        <Link to="/contact" className="button button--quiet">
          Ask the store
        </Link>
      </header>

      <div className="faq-layout">
        <nav className="faq-nav" aria-label="FAQ sections">
          {groups.map((group) => (
            <a key={group.title} href={`#${group.title.toLowerCase().replace(/\s+/g, "-")}`}>
              {group.title}
            </a>
          ))}
        </nav>
        <div className="faq-groups">
          {groups.map((group) => (
            <section key={group.title} id={group.title.toLowerCase().replace(/\s+/g, "-")} className="faq-group">
              <h2>{group.title}</h2>
              {group.entries.map((entry) => (
                <details key={entry.question} className="faq-item">
                  <summary>{entry.question}</summary>
                  <p>{entry.answer}</p>
                </details>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
