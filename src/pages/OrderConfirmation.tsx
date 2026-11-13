import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { OrderDetails, statusSummary } from "../components/OrderDetails";
import { Alert, Breadcrumbs, EmptyState, FormField, PageLoader, Spinner } from "../components/ui";
import { CheckIcon, TruckIcon, WhatsAppIcon } from "../components/Icons";
import { api, errorMessage, invoicePdfUrl, invoiceUrl } from "../lib/api";
import { useSeo } from "../lib/hooks";
import { recallOrder, recallOrderEmail, rememberOrder } from "../lib/orderCache";
import { orderWhatsAppLink } from "../lib/whatsapp";
import type { Order } from "../lib/types";

export function OrderConfirmation() {
  const { orderNumber = "" } = useParams();
  const [searchParams] = useSearchParams();
  const placed = searchParams.get("placed") === "1";
  const { user } = useAuth();
  const number = orderNumber.toUpperCase();
  const cached = recallOrder(number);
  const [email, setEmail] = useState(recallOrderEmail(number) ?? "");
  const [lookup, setLookup] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<"idle" | "opened" | "blocked">("idle");

  useSeo({ title: `Order ${number} · Sree Collections`, noIndex: true, description: "Your Sree Collections order details." });

  const canFetch = Boolean(user) || Boolean(email);
  const orderQuery = useQuery({
    queryKey: ["order-lookup", number, email || "session"],
    queryFn: () => api<{ order: Order }>(`/orders/${encodeURIComponent(number)}${email ? `?email=${encodeURIComponent(email)}` : ""}`),
    enabled: canFetch && Boolean(number),
    retry: false,
    initialData: cached ? { order: cached } : undefined,
    staleTime: 30_000
  });

  const loadedOrder = orderQuery.data?.order;
  useEffect(() => {
    if (loadedOrder && user) rememberOrder(loadedOrder);
  }, [loadedOrder, user]);

  useEffect(() => {
    if (!placed || !loadedOrder) return;
    const whatsapp = loadedOrder.notifications;
    if (!whatsapp.whatsappAutoOpen || whatsapp.whatsapp !== "click_to_chat" || !whatsapp.whatsappNumber) return;
    const key = `sc_wa_handoff_${loadedOrder.orderNumber}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Without storage the browser may reopen the chat on refresh; that is harmless.
    }
    const opened = window.open(orderWhatsAppLink(loadedOrder, whatsapp.whatsappNumber), "_blank");
    if (opened) opened.opener = null;
    setHandoff(opened ? "opened" : "blocked");
  }, [placed, loadedOrder]);

  const submitLookup = (event: FormEvent) => {
    event.preventDefault();
    setLookupError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lookup.trim())) {
      setLookupError("Enter the email address used for the order.");
      return;
    }
    setEmail(lookup.trim().toLowerCase());
  };

  if (!number) {
    return (
      <div className="container page-shell">
        <EmptyState title="Order not found" description="That order reference is not valid." action={{ label: "Track an order", to: "/track" }} />
      </div>
    );
  }

  if (!canFetch) {
    return (
      <div className="container page-shell narrow-shell">
        <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Order" }]} />
        <header className="page-heading">
          <div>
            <p className="eyebrow">Your order</p>
            <h1>{number}</h1>
            <p>Enter the email address used at checkout to view this order.</p>
          </div>
        </header>
        <form className="panel-form" onSubmit={submitLookup}>
          <FormField label="Email address" htmlFor="order-email" error={lookupError ?? undefined}>
            <input
              id="order-email"
              type="email"
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
              autoComplete="email"
              required
            />
          </FormField>
          <button type="submit" className="button button--primary">
            View order
          </button>
          <p className="form-note">
            Prefer a simpler route? <Link to="/track">Track your order</Link> with the order number and email.
          </p>
        </form>
      </div>
    );
  }

  if (orderQuery.isLoading) return <PageLoader label="Loading your order…" />;

  if (orderQuery.isError || !orderQuery.data?.order) {
    return (
      <div className="container page-shell narrow-shell">
        <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Order" }]} />
        <EmptyState
          title="We could not load this order"
          description={errorMessage(orderQuery.error)}
          action={{ label: "Try tracking instead", to: "/track" }}
        />
        {!user ? (
          <form className="panel-form" onSubmit={submitLookup}>
            <FormField label="Try a different email address" htmlFor="order-email-retry" error={lookupError ?? undefined}>
              <input
                id="order-email-retry"
                type="email"
                value={lookup}
                onChange={(event) => setLookup(event.target.value)}
                autoComplete="email"
              />
            </FormField>
            <button type="submit" className="button button--quiet">
              Try again
            </button>
          </form>
        ) : null}
      </div>
    );
  }

  const order = orderQuery.data.order;
  const lookupEmail = email || (!user ? recallOrderEmail(number) : null);
  const invoiceHref = invoiceUrl(order.orderNumber, lookupEmail);
  const invoicePdfHref = invoicePdfUrl(order.orderNumber, lookupEmail);
  const whatsappLink =
    order.notifications.whatsapp === "click_to_chat" && order.notifications.whatsappNumber
      ? orderWhatsAppLink(order, order.notifications.whatsappNumber)
      : null;
  const emailNote = (() => {
    switch (order.notifications.email) {
      case "sent":
        return `The invoice has been emailed to ${order.email} and to the store.`;
      case "queued":
        return "The invoice email is being sent. It can take a minute to arrive, so check spam if you do not see it.";
      case "failed":
        return "The invoice email could not be delivered. Download the invoice below and send it to the store on WhatsApp.";
      case "configured":
        return "Email delivery is configured on this store, but this message has not been confirmed as delivered yet.";
      default:
        return "Email delivery is not configured on this store yet, so no email has been sent. Download the invoice below.";
    }
  })();

  return (
    <div className="container page-shell order-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Order" }, { label: order.orderNumber }]} />
      <header className="order-hero">
        <span className="order-hero__mark" aria-hidden="true">
          <CheckIcon size={22} />
        </span>
        <div>
          <p className="eyebrow">Order {order.orderNumber}</p>
          <h1>Thank you — your order is in.</h1>
          <p>{statusSummary(order.status)}</p>
        </div>
      </header>

      <Alert tone="info" title="Keep these details">
        <p>
          Save this page for your records. Cash is collected when your parcel is handed over. The store team will contact
          you on {order.phone} if anything about the order needs confirming.
        </p>
        <p>{emailNote}</p>
      </Alert>

      {whatsappLink ? (
        <section className="order-handoff" aria-labelledby="order-handoff-title">
          <div>
            <p className="eyebrow">
              <WhatsAppIcon size={15} /> WhatsApp
            </p>
            <h2 id="order-handoff-title">Send this order to the shop</h2>
            <p>
              WhatsApp opens with the order details already written for the shop. Press send in WhatsApp so the team
              receives it.
              {handoff === "opened" ? " A chat window was opened for you." : ""}
              {handoff === "blocked" ? " Your browser blocked the automatic chat, so use the button below." : ""}
            </p>
          </div>
          <a className="button button--primary" href={whatsappLink} target="_blank" rel="noreferrer">
            <WhatsAppIcon size={16} /> Open WhatsApp with this order
          </a>
        </section>
      ) : null}

      <div className="order-hero__actions">
        <a className="button button--primary" href={invoicePdfHref} target="_blank" rel="noreferrer">
          Download invoice (PDF)
        </a>
        <a className="button button--quiet" href={invoiceHref} target="_blank" rel="noreferrer">
          View invoice in browser
        </a>
        <Link to="/track" className="button button--ghost">
          <TruckIcon size={16} /> Track this order
        </Link>
        <Link to="/shop" className="button button--ghost">
          Continue shopping
        </Link>
        {user ? (
          <Link to="/account/orders" className="text-link">
            All your orders
          </Link>
        ) : (
          <Link to={`/login?next=${encodeURIComponent(`/account/orders`)}`} className="text-link">
            Sign in to keep this order in your account
          </Link>
        )}
      </div>

      <OrderDetails order={order} />
      {orderQuery.isFetching ? <Spinner label="Refreshing order" /> : null}
    </div>
  );
}
