import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, EmptyState, FormField, Modal, PageLoader, StatusBadge } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, money, returnStatus } from "../../lib/format";
import type { AdminReturn } from "../../lib/types";

const STATUSES = ["requested", "approved", "rejected", "received", "refunded", "closed"];

const REASONS: Record<string, string> = {
  damaged: "Arrived damaged",
  wrong_item: "Wrong item received",
  not_as_described: "Not as described",
  changed_mind: "Changed my mind",
  other: "Other"
};

export function AdminReturns() {
  const [filter, setFilter] = useState("");
  const [active, setActive] = useState<AdminReturn | null>(null);
  const [nextStatus, setNextStatus] = useState("requested");
  const [adminNote, setAdminNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const { user } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const returns = useQuery({
    queryKey: ["admin", "returns", filter],
    queryFn: () => api<{ items: AdminReturn[] }>(`/admin/returns${filter ? `?status=${encodeURIComponent(filter)}` : ""}`)
  });

  const update = useMutation({
    mutationFn: (input: { id: string; status: string; adminNote: string }) =>
      api<{ ok: true }>(`/admin/returns/${input.id}/status`, {
        method: "POST",
        body: { status: input.status, adminNote: input.adminNote }
      }),
    onSuccess: () => {
      notify("Return request updated.");
      setActive(null);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "returns"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "order"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "summary"] });
    },
    onError: (error) => setFormError(errorMessage(error))
  });

  const canManage = user?.role === "owner" || user?.role === "admin" || user?.role === "orders";

  const openRequest = (request: AdminReturn) => {
    setActive(request);
    setNextStatus(request.status);
    setAdminNote(request.admin_note ?? "");
    setFormError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!active) return;
    setFormError(null);
    if (nextStatus === "refunded" && adminNote.trim().length < 5) {
      setFormError("Record how the refund was made, for example the cash receipt or bank reference.");
      return;
    }
    update.mutate({ id: active.id, status: nextStatus, adminNote: adminNote.trim() });
  };

  const items = returns.data?.items ?? [];

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <p className="eyebrow">Sales</p>
        <h1>Returns</h1>
        <p>
          Return requests from customers with delivered orders. Marking a request refunded also records the order as
          refunded, so write exactly how the money was returned.
        </p>
      </header>

      <div className="admin-tabs" role="group" aria-label="Filter return requests">
        <button type="button" className={!filter ? "is-active" : undefined} onClick={() => setFilter("")}>
          All
        </button>
        {STATUSES.map((status) => (
          <button key={status} type="button" className={filter === status ? "is-active" : undefined} onClick={() => setFilter(status)}>
            {returnStatus(status)}
          </button>
        ))}
      </div>

      {returns.isLoading ? <PageLoader label="Loading return requests…" /> : null}
      {returns.isError ? (
        <EmptyState
          title="Returns could not load"
          description={errorMessage(returns.error)}
          action={{ label: "Try again", onClick: () => void returns.refetch() }}
        />
      ) : null}
      {returns.data && !items.length ? (
        <EmptyState
          title="No return requests"
          description="Requests appear here after a customer asks to return a delivered item. No sample requests are created."
        />
      ) : null}

      {items.length ? (
        <div className="admin-card">
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Request</th>
                  <th scope="col">Order</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Requested</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <strong className="admin-code">{request.request_number}</strong>
                      {request.admin_note ? <small className="muted admin-cell-note">{request.admin_note}</small> : null}
                    </td>
                    <td>
                      <Link to={`/admin/orders/${request.order_number}`}>{request.order_number}</Link>
                    </td>
                    <td>
                      {REASONS[request.reason] ?? request.reason}
                      {request.detail ? <small className="muted admin-cell-note">{request.detail}</small> : null}
                    </td>
                    <td>{money(request.total)}</td>
                    <td>
                      <StatusBadge status={request.status} label={returnStatus(request.status)} />
                    </td>
                    <td>{formatDateTime(request.created_at)}</td>
                    <td>
                      {canManage ? (
                        <button type="button" className="text-link" onClick={() => openRequest(request)}>
                          Review
                        </button>
                      ) : (
                        <span className="muted">View only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(active)}
        onClose={() => {
          setActive(null);
          setFormError(null);
        }}
        title={active ? `Return ${active.request_number}` : "Return request"}
      >
        {active ? (
          <form className="admin-form" onSubmit={submit}>
            {formError ? <Alert tone="error">{formError}</Alert> : null}
            <dl className="admin-summary-list">
              <div>
                <dt>Order</dt>
                <dd>
                  <Link to={`/admin/orders/${active.order_number}`}>{active.order_number}</Link>
                </dd>
              </div>
              <div>
                <dt>Order total</dt>
                <dd>{money(active.total)}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{REASONS[active.reason] ?? active.reason}</dd>
              </div>
              <div>
                <dt>Customer detail</dt>
                <dd>{active.detail || "None provided"}</dd>
              </div>
              <div>
                <dt>Requested</dt>
                <dd>{formatDateTime(active.created_at)}</dd>
              </div>
            </dl>
            <FormField label="Status" htmlFor="return-status" required>
              <select id="return-status" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {returnStatus(status)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Note for the record"
              htmlFor="return-note"
              hint={
                nextStatus === "refunded"
                  ? "Required when refunding: record the cash receipt or bank reference. Never record full card numbers."
                  : "Optional. This is visible to the store team only."
              }
            >
              <textarea
                id="return-note"
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                maxLength={1000}
                rows={4}
              />
            </FormField>
            {nextStatus === "refunded" ? (
              <Alert tone="warning">
                This marks order {active.order_number} as refunded. Only do this after the money has actually been
                returned.
              </Alert>
            ) : null}
            <div className="admin-form__actions">
              <button type="button" className="button button--ghost" onClick={() => setActive(null)}>
                Cancel
              </button>
              <button type="submit" className="button button--primary" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Update request"}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
