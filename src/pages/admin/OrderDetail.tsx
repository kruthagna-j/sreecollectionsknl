import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, EmptyState, FormField, PageLoader, StatusBadge } from "../../components/ui";
import { OrderDetails } from "../../components/OrderDetails";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, money, orderStatus, paymentStatus } from "../../lib/format";
import type { Order } from "../../lib/types";
import { ArrowRightIcon, DownloadIcon } from "../../components/Icons";

type EmailLogRow = {
  id: string;
  channel: "email_customer" | "email_owner";
  recipient: string;
  status: "queued" | "sent" | "failed" | "not_configured";
  attempts: number;
  error: string;
  created_at: string;
  sent_at: string | null;
};

export function AdminOrderDetail() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [nextStatus, setNextStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ["admin", "order", id],
    queryFn: () => api<{ order: Order; emailLog: EmailLogRow[] }>(`/admin/orders/${encodeURIComponent(id)}`),
    enabled: Boolean(id)
  });

  const order = orderQuery.data?.order;
  const emailLog = orderQuery.data?.emailLog ?? [];
  const loadedAdminNote = order?.adminNote;

  useEffect(() => {
    if (loadedAdminNote !== undefined) setNote(loadedAdminNote);
  }, [loadedAdminNote, id]);

  const refreshCaches = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "order", id] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "summary"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "stock-movements"] });
  };

  const statusMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ order: Order }>(`/admin/orders/${encodeURIComponent(id)}/status`, { method: "POST", body }),
    onSuccess: (data) => {
      queryClient.setQueryData<{ order: Order; emailLog: EmailLogRow[] }>(["admin", "order", id], (current) => ({
        order: data.order,
        emailLog: current?.emailLog ?? []
      }));
      notify(`Order moved to ${orderStatus(data.order.status)}.`);
      setNextStatus("");
      setStatusNote("");
      setTrackingNumber("");
      setTrackingUrl("");
      setStatusError(null);
      refreshCaches();
    },
    onError: (error) => setStatusError(errorMessage(error))
  });

  const noteMutation = useMutation({
    mutationFn: (body: { note: string }) =>
      api<{ ok: true }>(`/admin/orders/${encodeURIComponent(id)}/note`, { method: "POST", body }),
    onSuccess: () => {
      notify("Internal note saved.");
      setNoteError(null);
      refreshCaches();
    },
    onError: (error) => setNoteError(errorMessage(error))
  });

  const resendMutation = useMutation({
    mutationFn: (channel: EmailLogRow["channel"]) =>
      api(`/admin/orders/${encodeURIComponent(id)}/notifications/resend`, {
        method: "POST",
        body: { channel }
      }),
    onSuccess: (_data, channel) => {
      notify(channel === "email_customer" ? "Invoice email sent to the customer." : "Order email sent to the store.");
      refreshCaches();
    },
    onError: (error) => notify(errorMessage(error), "error")
  });

  const canManage = user?.role === "owner" || user?.role === "admin" || user?.role === "orders";

  if (orderQuery.isLoading) return <PageLoader label="Loading order…" />;
  if (orderQuery.isError || !order) {
    return (
      <div className="admin-page">
        <EmptyState
          title="Order could not load"
          description={orderQuery.isError ? errorMessage(orderQuery.error) : "This order may no longer exist."}
          action={{ label: "Back to orders", to: "/admin/orders" }}
        />
      </div>
    );
  }

  const targets = order.nextStatuses ?? [];

  const submitStatus = (event: FormEvent) => {
    event.preventDefault();
    setStatusError(null);
    if (!nextStatus) {
      setStatusError("Choose the status to move this order to.");
      return;
    }
    if (trackingUrl.trim() && !/^https:\/\/[^\s]+$/.test(trackingUrl.trim())) {
      setStatusError("Enter a full https:// tracking link.");
      return;
    }
    const body: Record<string, unknown> = { status: nextStatus, note: statusNote.trim() };
    if (nextStatus === "shipped") {
      body.trackingNumber = trackingNumber.trim();
      body.trackingUrl = trackingUrl.trim();
    }
    statusMutation.mutate(body);
  };

  const submitNote = (event: FormEvent) => {
    event.preventDefault();
    setNoteError(null);
    if (note.trim().length < 1) {
      setNoteError("Write the note before saving.");
      return;
    }
    noteMutation.mutate({ note: note.trim() });
  };

  return (
    <div className="admin-page admin-order-detail">
      <div className="admin-breadcrumb">
        <Link to="/admin/orders">Orders</Link>
        <span aria-hidden="true">/</span>
        <span>{order.orderNumber}</span>
      </div>

      <header className="admin-page__head admin-page__head--row">
        <div>
          <p className="eyebrow">Order detail</p>
          <h1>{order.orderNumber}</h1>
          <p>
            {order.email} · {order.phone} · placed {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="admin-order-detail__head-actions">
          <StatusBadge status={order.status} label={orderStatus(order.status)} />
          <StatusBadge status={order.paymentStatus} label={paymentStatus(order.paymentStatus)} />
          <a
            className="button button--ghost button--small"
            href={`/api/v1/admin/orders/${order.id}/invoice.pdf`}
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon size={15} /> Invoice PDF
          </a>
          <a
            className="text-link"
            href={`/api/v1/admin/orders/${order.id}/invoice`}
            target="_blank"
            rel="noreferrer"
          >
            View invoice
          </a>
        </div>
      </header>

      <div className="admin-order-actions">
        <section className="admin-card admin-card--padded">
          <h2 className="admin-card__title">Update status</h2>
          {!canManage ? (
            <p className="muted">
              Your role ({(user?.role ?? "staff").replaceAll("_", " ")}) can view this order but cannot change its
              status. Ask an orders manager or the owner.
            </p>
          ) : targets.length ? (
            <form className="admin-form" onSubmit={submitStatus}>
              {statusError ? <Alert tone="error">{statusError}</Alert> : null}
              <FormField label="Move order to" htmlFor="order-next-status" required>
                <select
                  id="order-next-status"
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value)}
                >
                  <option value="">Choose a status…</option>
                  {targets.map((target) => (
                    <option key={target} value={target}>
                      {orderStatus(target)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Note for the order timeline" htmlFor="order-status-note" hint="Optional, shown to the customer.">
                <input
                  id="order-status-note"
                  value={statusNote}
                  onChange={(event) => setStatusNote(event.target.value)}
                  maxLength={500}
                  placeholder={nextStatus === "cancelled" ? "Reason for cancellation" : "For example: handed to courier"}
                />
              </FormField>
              {nextStatus === "shipped" ? (
                <div className="form-grid">
                  <FormField label="Tracking number" htmlFor="order-tracking-number" hint="Only from the real courier.">
                    <input
                      id="order-tracking-number"
                      value={trackingNumber}
                      onChange={(event) => setTrackingNumber(event.target.value)}
                      maxLength={80}
                    />
                  </FormField>
                  <FormField label="Tracking link" htmlFor="order-tracking-url" hint="Must start with https://">
                    <input
                      id="order-tracking-url"
                      value={trackingUrl}
                      onChange={(event) => setTrackingUrl(event.target.value)}
                      maxLength={500}
                      placeholder="https://"
                    />
                  </FormField>
                </div>
              ) : null}
              {nextStatus === "delivered" && order.paymentMethod === "cod" ? (
                <Alert tone="info">
                  Marking this cash-on-delivery order delivered records payment as collected ({money(order.totals.total)}).
                </Alert>
              ) : null}
              {nextStatus === "cancelled" ? (
                <Alert tone="warning">Cancelling returns the ordered stock to the catalogue.</Alert>
              ) : null}
              <div className="admin-form__actions">
                <button type="submit" className="button button--primary button--small" disabled={statusMutation.isPending}>
                  {statusMutation.isPending ? "Updating…" : "Update order"}
                  <ArrowRightIcon size={15} />
                </button>
              </div>
            </form>
          ) : (
            <p className="muted">This order is {orderStatus(order.status).toLowerCase()} and cannot move further.</p>
          )}
        </section>

        <section className="admin-card admin-card--padded">
          <h2 className="admin-card__title">Internal note</h2>
          <p className="muted">Visible only to the store team. Do not write card numbers or passwords here.</p>
          {canManage ? (
            <form className="admin-form" onSubmit={submitNote}>
              {noteError ? <Alert tone="error">{noteError}</Alert> : null}
              <FormField label="Note" htmlFor="order-admin-note">
                <textarea
                  id="order-admin-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  maxLength={1000}
                  rows={4}
                />
              </FormField>
              <div className="admin-form__actions">
                <button type="submit" className="button button--primary button--small" disabled={noteMutation.isPending}>
                  {noteMutation.isPending ? "Saving…" : "Save note"}
                </button>
              </div>
            </form>
          ) : (
            <p>{order.adminNote || "No internal note recorded."}</p>
          )}
        </section>
      </div>

      <section className="admin-card admin-card--padded">
        <div className="admin-settings__group-head">
          <div>
            <h2 className="admin-card__title">Order messages</h2>
            <p className="muted">
              Email attempts are recorded here. The invoice PDF is attached when an email is sent. "Not configured"
              means the server has no SMTP credentials.
            </p>
          </div>
          {canManage ? (
            <div className="admin-row-actions">
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={() => resendMutation.mutate("email_customer")}
                disabled={resendMutation.isPending}
              >
                Resend to customer
              </button>
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={() => resendMutation.mutate("email_owner")}
                disabled={resendMutation.isPending}
              >
                Resend to store
              </button>
            </div>
          ) : null}
        </div>
        {emailLog.length ? (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Channel</th>
                  <th scope="col">Recipient</th>
                  <th scope="col">Status</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {emailLog.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.channel === "email_customer" ? "Customer" : "Store"}</td>
                    <td>{entry.recipient}</td>
                    <td>
                      <StatusBadge
                        status={entry.status === "sent" ? "delivered" : entry.status === "failed" ? "cancelled" : "pending"}
                        label={{
                          sent: "Sent",
                          queued: "Sending",
                          failed: "Failed",
                          not_configured: "Not configured"
                        }[entry.status]}
                      />
                    </td>
                    <td>{entry.attempts}</td>
                    <td>{formatDateTime(entry.sent_at ?? entry.created_at)}</td>
                    <td>{entry.error || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            No email has been queued for this order. This is expected when the order was placed before email was
            configured.
          </p>
        )}
      </section>

      <div className="admin-order-meta">
        <div>
          <span>Customer</span>
          <strong>{order.shippingAddress.recipient}</strong>
          <small>{order.email}</small>
        </div>
        <div>
          <span>Payment</span>
          <strong>{paymentStatus(order.paymentStatus)}</strong>
          <small>{order.paymentMethod === "cod" ? "Cash on delivery" : "Online payment"}</small>
        </div>
        <div>
          <span>Payment reference</span>
          <strong>{order.paymentReference || "—"}</strong>
          <small>Recorded by the payment provider when enabled</small>
        </div>
        <div>
          <span>Order total</span>
          <strong>{money(order.totals.total)}</strong>
          <small>{order.items.reduce((sum, item) => sum + item.quantity, 0)} items</small>
        </div>
        <div>
          <span>Messages</span>
          <strong>
            {{
              sent: "Invoice emailed",
              queued: "Email sending",
              failed: "Email failed",
              not_configured: "Email not configured",
              configured: "Email configured"
            }[order.notifications.email] ?? order.notifications.email}
          </strong>
          <small>
            {order.notifications.whatsapp === "click_to_chat"
              ? `WhatsApp handoff to ${order.notifications.whatsappNumber ? `+${order.notifications.whatsappNumber}` : "the store"}`
              : "WhatsApp number is not set"}
          </small>
        </div>
      </div>

      <OrderDetails order={order} />
    </div>
  );
}
