import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, PageLoader, Pagination, StatusBadge } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, money, orderStatus, paymentStatus } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";
import type { AdminOrderListItem } from "../../lib/types";

type AdminOrderPage = {
  items: AdminOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

const STATUSES = ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"];

export function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const status = params.get("status") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const debounced = useDebounced(q, 300);

  const orders = useQuery({
    queryKey: ["admin", "orders", debounced, status, page],
    queryFn: () =>
      api<AdminOrderPage>(
        `/admin/orders?page=${page}&pageSize=25&q=${encodeURIComponent(debounced)}&status=${encodeURIComponent(status)}`
      )
  });

  const updateParams = (changes: Record<string, string | null>) => {
    const updated = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") updated.delete(key);
      else updated.set(key, value);
    }
    setParams(updated, { replace: true });
  };

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <p className="eyebrow">Sales</p>
        <h1>Orders</h1>
        <p>
          Only real orders placed through checkout appear here. Moving an order to delivered marks cash-on-delivery as
          collected; cancelling restocks items.
        </p>
      </header>

      <div className="admin-toolbar admin-toolbar--stack">
        <div className="admin-search">
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              updateParams({ q: event.target.value || null, page: null });
            }}
            placeholder="Search order number, email or phone"
            aria-label="Search orders"
          />
        </div>
        <div className="admin-tabs" role="group" aria-label="Filter by order status">
          <button type="button" className={!status ? "is-active" : undefined} onClick={() => updateParams({ status: null, page: null })}>
            All
          </button>
          {STATUSES.map((entry) => (
            <button
              key={entry}
              type="button"
              className={status === entry ? "is-active" : undefined}
              onClick={() => updateParams({ status: entry, page: null })}
            >
              {orderStatus(entry)}
            </button>
          ))}
        </div>
      </div>

      {orders.isLoading ? <PageLoader label="Loading orders…" /> : null}
      {orders.isError ? (
        <EmptyState
          title="Orders could not load"
          description={errorMessage(orders.error)}
          action={{ label: "Try again", onClick: () => void orders.refetch() }}
        />
      ) : null}
      {orders.data && !orders.data.items.length ? (
        <EmptyState
          title="No orders match"
          description="Real orders will appear here after customers complete checkout. Adjust the filters to look further back."
        />
      ) : null}

      {orders.data?.items.length ? (
        <>
          <div className="admin-card">
            <div className="table-wrap">
              <table className="admin-table admin-table--orders">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Items</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Status</th>
                    <th scope="col">Total</th>
                    <th scope="col">Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.data.items.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link to={`/admin/orders/${order.id}`} className="admin-order-link">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td>
                        <strong>{order.customer}</strong>
                        <small className="muted admin-cell-note">{order.email}</small>
                        <small className="muted admin-cell-note">{order.phone}</small>
                      </td>
                      <td>{order.itemCount}</td>
                      <td>
                        <StatusBadge
                          status={order.paymentStatus}
                          label={paymentStatus(order.paymentStatus)}
                        />
                        <small className="muted admin-cell-note">
                          {order.paymentMethod === "cod" ? "Cash on delivery" : "Online"}
                        </small>
                      </td>
                      <td>
                        <StatusBadge status={order.status} label={orderStatus(order.status)} />
                      </td>
                      <td>{money(order.total)}</td>
                      <td>{formatDateTime(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={orders.data.page} pages={orders.data.pages} onChange={(next) => updateParams({ page: String(next) })} />
        </>
      ) : null}
    </div>
  );
}
