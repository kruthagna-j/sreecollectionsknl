import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { OrderDetails } from "../components/OrderDetails";
import { Alert, Breadcrumbs, FormField, PageLoader } from "../components/ui";
import { TruckIcon } from "../components/Icons";
import { api, errorMessage, invoicePdfUrl, invoiceUrl } from "../lib/api";
import { useSeo } from "../lib/hooks";
import { lastOrderNumber, recallOrderEmail } from "../lib/orderCache";
import type { Order } from "../lib/types";

export function TrackOrder() {
  const { user } = useAuth();
  const [orderNumber, setOrderNumber] = useState(lastOrderNumber() ?? "");
  const [email, setEmail] = useState(recallOrderEmail(lastOrderNumber() ?? "") ?? user?.email ?? "");
  const [submitted, setSubmitted] = useState<{ orderNumber: string; email: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useSeo({
    title: "Track your order · Sree Collections",
    description: "Look up a Sree Collections order with your order number and email.",
    noIndex: true
  });

  const lookup = useQuery({
    queryKey: ["track", submitted?.orderNumber, submitted?.email],
    queryFn: () =>
      api<{ order: Order }>(
        `/orders/track?orderNumber=${encodeURIComponent(submitted!.orderNumber)}${submitted!.email ? `&email=${encodeURIComponent(submitted!.email)}` : ""}`
      ),
    enabled: Boolean(submitted),
    retry: false
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const number = orderNumber.trim().toUpperCase();
    if (number.length < 5) {
      setFormError("Enter the order number from your confirmation.");
      return;
    }
    if (!user && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setFormError("Enter the email address used for the order.");
      return;
    }
    setSubmitted({ orderNumber: number, email: email.trim().toLowerCase() });
  };

  const order = lookup.data?.order;

  return (
    <div className="container page-shell track-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Track order" }]} />
      <div className="track-layout">
        <div>
          <header className="page-heading">
            <div>
              <p className="eyebrow">Where is it?</p>
              <h1>Track your order</h1>
              <p>
                Use the order number from your confirmation and the email you checked out with.
                {user ? " Because you are signed in, the email is optional." : ""}
              </p>
            </div>
          </header>

          <form className="track-form" onSubmit={submit}>
            <FormField label="Order number" htmlFor="track-number" hint="Example: SC-20261024-ABC123">
              <input
                id="track-number"
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value.toUpperCase())}
                autoComplete="off"
                maxLength={30}
                required
              />
            </FormField>
            <FormField label={user ? "Email (optional when signed in)" : "Email used for the order"} htmlFor="track-email">
              <input
                id="track-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                maxLength={160}
              />
            </FormField>
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            <button type="submit" className="button button--primary" disabled={lookup.isFetching}>
              <TruckIcon size={16} /> {lookup.isFetching ? "Looking…" : "Find my order"}
            </button>
          </form>

          <Alert tone="info" title="Tracking updates come from the store">
            <p>
              This store does not invent courier scans. When the store team adds a tracking number or moves your order
              along, it appears here with the real timestamp.
            </p>
          </Alert>
        </div>

        <aside className="track-help">
          <h2>Need a hand?</h2>
          <p>Check the order number exactly as it appears, including the initials and hyphens.</p>
          <ul>
            <li>
              <Link to="/faq">Delivery questions</Link>
            </li>
            <li>
              <Link to="/contact">Contact the store</Link>
            </li>
            <li>
              <Link to="/account/orders">Orders in your account</Link>
            </li>
          </ul>
        </aside>
      </div>

      {lookup.isLoading ? <PageLoader label="Looking for your order…" /> : null}

      {lookup.isError ? (
        <Alert tone="error" title="No order found">
          <p>{errorMessage(lookup.error)}</p>
          <p>Double-check the order number and email. If the order was placed as a guest, use the same email from checkout.</p>
        </Alert>
      ) : null}

      {order ? (
        <section className="track-result">
          <div className="track-result__head">
            <h2>Order {order.orderNumber}</h2>
            <div className="track-result__links">
              <a className="text-link" href={invoicePdfUrl(order.orderNumber, submitted?.email)} target="_blank" rel="noreferrer">
                Download invoice PDF
              </a>
              <a className="text-link" href={invoiceUrl(order.orderNumber, submitted?.email)} target="_blank" rel="noreferrer">
                View invoice
              </a>
            </div>
          </div>
          <OrderDetails order={order} />
        </section>
      ) : null}
    </div>
  );
}
