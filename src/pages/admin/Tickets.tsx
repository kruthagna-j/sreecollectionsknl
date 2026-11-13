import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, PageLoader, StatusBadge } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { SupportTicket } from "../../lib/types";

const TABS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "closed", label: "Closed" }
];

const LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  closed: "Closed"
};

export function AdminTickets() {
  const [status, setStatus] = useState("open");
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const tickets = useQuery({
    queryKey: ["admin", "tickets", status],
    queryFn: () => api<{ items: SupportTicket[] }>(`/admin/tickets?status=${encodeURIComponent(status)}`)
  });

  const setTicketStatus = useMutation({
    mutationFn: (input: { id: string; status: string }) =>
      api<{ ok: true }>(`/admin/tickets/${input.id}/status`, { method: "POST", body: { status: input.status } }),
    onSuccess: (_data, input) => {
      notify(`Ticket marked ${LABELS[input.status]?.toLowerCase() ?? input.status}.`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "summary"] });
    },
    onError: (error) => notify(errorMessage(error), "error")
  });

  const items = tickets.data?.items ?? [];

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <p className="eyebrow">Service</p>
        <h1>Support tickets</h1>
        <p>
          Messages submitted through the contact form. Replies are not sent automatically; contact the customer using the
          address they provided.
        </p>
      </header>

      <div className="admin-tabs" role="group" aria-label="Filter tickets">
        {TABS.map((tab) => (
          <button key={tab.key} type="button" className={status === tab.key ? "is-active" : undefined} onClick={() => setStatus(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {tickets.isLoading ? <PageLoader label="Loading tickets…" /> : null}
      {tickets.isError ? (
        <EmptyState
          title="Tickets could not load"
          description={errorMessage(tickets.error)}
          action={{ label: "Try again", onClick: () => void tickets.refetch() }}
        />
      ) : null}
      {tickets.data && !items.length ? (
        <EmptyState
          title="No tickets here"
          description="Customer messages submitted from the contact page will appear in this queue."
        />
      ) : null}

      <div className="admin-ticket-list">
        {items.map((ticket) => (
          <article key={ticket.id} className="admin-card admin-card--padded admin-ticket">
            <header className="admin-ticket__head">
              <div>
                <p className="admin-code">{ticket.ticket_number}</p>
                <h2>{ticket.subject}</h2>
                <p className="muted">
                  {ticket.name} · <a href={`mailto:${ticket.email}`}>{ticket.email}</a> · {formatDateTime(ticket.created_at)}
                </p>
              </div>
              <StatusBadge status={ticket.status} label={LABELS[ticket.status] ?? ticket.status} />
            </header>
            {ticket.order_number ? (
              <p className="admin-ticket__order">
                Related order: <span className="admin-code">{ticket.order_number}</span>
              </p>
            ) : null}
            <p className="admin-ticket__message">{ticket.message}</p>
            <div className="admin-form__actions">
              {ticket.status !== "in_progress" ? (
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => setTicketStatus.mutate({ id: ticket.id, status: "in_progress" })}
                  disabled={setTicketStatus.isPending}
                >
                  Mark in progress
                </button>
              ) : null}
              {ticket.status !== "closed" ? (
                <button
                  type="button"
                  className="button button--primary button--small"
                  onClick={() => setTicketStatus.mutate({ id: ticket.id, status: "closed" })}
                  disabled={setTicketStatus.isPending}
                >
                  Close ticket
                </button>
              ) : (
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => setTicketStatus.mutate({ id: ticket.id, status: "open" })}
                  disabled={setTicketStatus.isPending}
                >
                  Reopen
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
