import { Link } from "react-router-dom";
import { Breadcrumbs } from "../components/ui";
import { useSeo } from "../lib/hooks";

const notes = [
  {
    title: "How to choose a gift for someone you do not know well",
    tag: "Gifting",
    intro:
      "Start with the occasion, then the budget, then the person. A useful object beats a decorative one, and something consumable is rarely wrong.",
    body: [
      "When the relationship is new — a colleague, a friend of a friend, a host — the safest gift is one that is used up or used often. Tea, a candle, a good notebook. It does not ask the recipient to find shelf space for a stranger's taste.",
      "If you want it to feel personal, put the thought into the wrapping and the note rather than into an unusual object. A plain gift with a specific message lands better than an elaborate gift with a generic one.",
      "The gift finder on this site lets you filter by occasion, recipient and budget. It searches the live catalogue, so everything it returns is genuinely available."
    ]
  },
  {
    title: "Why we ask you to check a PIN code before checkout",
    tag: "Delivery",
    intro:
      "Delivery across India still has a price and a timeline. Checking the PIN code early shows both before you pay.",
    body: [
      "We deliver anywhere in India. The delivery fee and the working-day estimate depend on where the parcel is going, so the store calculates them from the delivery zone that covers your PIN code.",
      "Enter the PIN code in the bag and the fee and window appear before checkout. In the rare case a PIN code falls outside the configured zones, the store says so before the order is placed instead of after.",
      "The window is the store's stated range after dispatch. It is not a live courier scan. When a real tracking number is recorded, it appears on your order."
    ]
  },
  {
    title: "A note on personalised gifts",
    tag: "Personalisation",
    intro:
      "A name, a date, a short line. Personalisation works when the detail is small, correct and meaningful.",
    body: [
      "The best engraved pieces carry very little text. A first name, a wedding date, a single word. The object stays useful; the inscription makes it theirs.",
      "Check spelling and capitalisation before ordering. The store produces exactly what you submit, so a typo is not a design choice — it is a remake. Contact the store immediately if you spot a mistake, before production begins.",
      "Personalised pieces cannot be returned for change of mind. If something arrives damaged or does not match what you submitted, the store will put it right."
    ]
  }
];

export function Journal() {
  useSeo({
    title: "Journal · Sree Collections",
    description: "Notes on choosing, wrapping and sending gifts from the Sree Collections team."
  });

  return (
    <div className="container page-shell journal-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Journal" }]} />
      <header className="page-heading">
        <div>
          <p className="eyebrow">Notes from the counter</p>
          <h1>Journal</h1>
          <p>Short, practical notes on gifting, wrapping and getting a parcel to the right door.</p>
        </div>
      </header>

      <div className="journal-list">
        {notes.map((note, index) => (
          <article key={note.title} className="journal-entry" id={`note-${index + 1}`}>
            <span className="journal-entry__tag">{note.tag}</span>
            <h2>{note.title}</h2>
            <p className="journal-entry__intro">{note.intro}</p>
            {note.body.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </article>
        ))}
      </div>

      <aside className="journal-cta">
        <h2>Looking for something specific?</h2>
        <p>Tell us the occasion and budget, and the shop team will suggest a few pieces.</p>
        <div>
          <Link to="/gift-finder" className="button button--primary">
            Use the gift finder
          </Link>
          <Link to="/contact" className="button button--quiet">
            Message the store
          </Link>
        </div>
      </aside>
    </div>
  );
}
