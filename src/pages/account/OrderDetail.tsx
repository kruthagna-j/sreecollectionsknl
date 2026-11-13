import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import { OrderDetails } from "../../components/OrderDetails";
import { Alert, EmptyState, FormField, Modal, PageLoader, Spinner } from "../../components/ui";
import { api, ApiError, errorMessage, invoicePdfUrl, invoiceUrl } from "../../lib/api";
import type { Order, OrderItem } from "../../lib/types";

const RETURN_REASONS = [
  { value: "damaged", label: "Arrived damaged" },
  { value: "wrong_item", label: "Wrong item received" },
  { value: "not_as_described", label: "Not as described" },
  { value: "changed_mind", label: "Changed my mind" },
  { value: "other", label: "Other" }
];

function ReviewModal({
  order,
  item,
  onClose,
  onDone
}: {
  order: Order;
  item: OrderItem;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await api<{ message: string }>("/account/reviews", {
        method: "POST",
        body: {
          orderNumber: order.orderNumber,
          productId: item.productId,
          rating,
          title,
          body
        }
      });
      onDone(response.message);
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="modal-form">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <p className="modal-form__item">
        {item.image ? <img src={item.image} alt="" width="48" height="60" /> : null}
        <span>{item.name}</span>
      </p>
      <fieldset className="rating-input">
        <legend>Your rating</legend>
        <div>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className={value <= rating ? "rating-input__star is-on" : "rating-input__star"}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              aria-pressed={value === rating}
              onClick={() => setRating(value)}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <FormField label="Headline" htmlFor="review-title" hint="Optional.">
        <input id="review-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
      </FormField>
      <FormField label="Your review" htmlFor="review-body" hint="At least 10 characters. Reviews are moderated before publishing.">
        <textarea id="review-body" rows={4} value={body} onChange={(event) => setBody(event.target.value)} maxLength={1500} required />
      </FormField>
      <div className="modal-form__actions">
        <button type="button" className="button button--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={busy || body.trim().length < 10}>
          {busy ? <Spinner label="Submitting review" /> : null}
          {busy ? "Submitting…" : "Submit review"}
        </button>
      </div>
    </form>
  );
}

function ReturnModal({
  order,
  item,
  onClose,
  onDone
}: {
  order: Order;
  item: OrderItem;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [reason, setReason] = useState("damaged");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const response = await api<{ message: string }>("/account/returns", {
        method: "POST",
        body: { orderNumber: order.orderNumber, orderItemId: item.id, reason, detail }
      });
      onDone(response.message);
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="modal-form">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <p className="modal-form__item">
        {item.image ? <img src={item.image} alt="" width="48" height="60" /> : null}
        <span>{item.name}</span>
      </p>
      <FormField label="Why are you returning it?" htmlFor="return-reason">
        <select id="return-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
          {RETURN_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Details" htmlFor="return-detail" hint="Tell the store what happened. Optional but helpful.">
        <textarea id="return-detail" rows={4} value={detail} onChange={(event) => setDetail(event.target.value)} maxLength={1000} />
      </FormField>
      <p className="form-note">
        The request is reviewed by the store before anything is sent back. Personalised items are excluded unless they
        arrived damaged or incorrect.
      </p>
      <div className="modal-form__actions">
        <button type="button" className="button button--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={busy}>
          {busy ? <Spinner label="Requesting return" /> : null}
          {busy ? "Sending request…" : "Request return"}
        </button>
      </div>
    </form>
  );
}

export function AccountOrderDetail() {
  const { orderNumber = "" } = useParams();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [reviewItem, setReviewItem] = useState<OrderItem | null>(null);
  const [returnItem, setReturnItem] = useState<OrderItem | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ["account", "order", orderNumber.toUpperCase()],
    queryFn: () => api<{ order: Order }>(`/account/orders/${encodeURIComponent(orderNumber.toUpperCase())}`),
    enabled: Boolean(orderNumber)
  });

  const order = orderQuery.data?.order;
  const canCancel = order ? ["pending", "confirmed", "packed"].includes(order.status) : false;
  const delivered = order?.status === "delivered";

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["account"] });
  };

  const cancelOrder = async () => {
    setCancelBusy(true);
    setCancelError(null);
    try {
      await api(`/account/orders/${encodeURIComponent(order!.orderNumber)}/cancel`, { method: "POST" });
      notify("Order cancelled. Stock has been returned to the shelf.", "info");
      setCancelOpen(false);
      refresh();
    } catch (error) {
      setCancelError(error instanceof ApiError ? error.message : errorMessage(error));
    } finally {
      setCancelBusy(false);
    }
  };

  if (orderQuery.isLoading) return <PageLoader label="Opening the order…" />;

  if (orderQuery.isError || !order) {
    return (
      <EmptyState
        title="This order could not be loaded"
        description={errorMessage(orderQuery.error)}
        action={{ label: "Back to orders", to: "/account/orders" }}
      />
    );
  }

  return (
    <div>
      <div className="account-order-head">
        <div>
          <Link to="/account/orders" className="text-link">
            ← All orders
          </Link>
          <h1>Order {order.orderNumber}</h1>
        </div>
        <div className="account-order-head__actions">
          <a
            href={invoicePdfUrl(order.orderNumber)}
            target="_blank"
            rel="noreferrer"
            className="button button--quiet button--small"
          >
            Invoice PDF
          </a>
          <a href={invoiceUrl(order.orderNumber)} target="_blank" rel="noreferrer" className="text-link">
            View in browser
          </a>
          {canCancel ? (
            <button type="button" className="button button--ghost button--small" onClick={() => setCancelOpen(true)}>
              Cancel order
            </button>
          ) : null}
        </div>
      </div>

      <OrderDetails order={order} />

      {delivered ? (
        <section className="account-section" id="reviews">
          <div className="account-section__head">
            <h2>Review your gifts</h2>
          </div>
          <p className="form-note">
            Reviews can be written after delivery and appear once the store has moderated them. Personalised items can be
            returned only if they arrived damaged or incorrect.
          </p>
          <ul className="review-actions">
            {order.items.map((item) => (
              <li key={item.id}>
                <span>{item.name}</span>
                <div>
                  <button type="button" className="button button--quiet button--small" onClick={() => setReviewItem(item)}>
                    Write a review
                  </button>
                  <button type="button" className="text-button" onClick={() => setReturnItem(item)}>
                    Request return
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : order.status === "shipped" ? (
        <Alert tone="info" title="Reviews and returns open after delivery">
          <p>Once the order is marked delivered, review and return options appear here.</p>
        </Alert>
      ) : null}

      <Modal open={Boolean(reviewItem)} onClose={() => setReviewItem(null)} title="Write a review">
        {reviewItem ? (
          <ReviewModal
            order={order}
            item={reviewItem}
            onClose={() => setReviewItem(null)}
            onDone={(message) => {
              notify(message);
              refresh();
            }}
          />
        ) : null}
      </Modal>

      <Modal open={Boolean(returnItem)} onClose={() => setReturnItem(null)} title="Request a return">
        {returnItem ? (
          <ReturnModal
            order={order}
            item={returnItem}
            onClose={() => setReturnItem(null)}
            onDone={(message) => {
              notify(message);
              refresh();
            }}
          />
        ) : null}
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this order?" size="sm">
        <div className="modal-form">
          {cancelError ? <Alert tone="error">{cancelError}</Alert> : null}
          <p>
            The order will be marked cancelled and the items returned to stock. This cannot be undone. If the order has
            already been packed, contact the store instead.
          </p>
          <div className="modal-form__actions">
            <button type="button" className="button button--ghost" onClick={() => setCancelOpen(false)}>
              Keep the order
            </button>
            <button type="button" className="button button--danger" onClick={() => void cancelOrder()} disabled={cancelBusy}>
              {cancelBusy ? <Spinner label="Cancelling order" /> : null}
              {cancelBusy ? "Cancelling…" : "Cancel order"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
