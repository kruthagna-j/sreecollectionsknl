import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, PageLoader, Pagination, StatusBadge } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, money, orderStatus } from "../../lib/format";
import type { OrderPage } from "../../lib/types";

export function AccountOrders() {
  const [page, setPage] = useState(1);
  const orders = useQuery({
    queryKey: ["account", "orders", page],
    queryFn: () => api<OrderPage>(`/account/orders?page=${page}&pageSize=10`)
  });

  return (
    <div>
      <header className="account-heading">
        <p className="eyebrow">History</p>
        <h1>Your orders</h1>
        <p>Every order placed while signed in to this account.</p>
      </header>

      {orders.isLoading ? <PageLoader label="Loading your orders…" /> : null}
      {orders.isError ? (
        <EmptyState
          title="Orders could not be loaded"
          description={errorMessage(orders.error)}
          action={{ label: "Try again", onClick: () => void orders.refetch() }}
        />
      ) : null}

      {orders.data && !orders.data.items.length ? (
        <EmptyState
          title="No orders yet"
          description="Guest orders will not appear here. Use the track page with the order number instead."
          action={{ label: "Browse gifts", to: "/shop" }}
        />
      ) : null}

      {orders.data?.items.length ? (
        <>
          <ul className="order-cards">
            {orders.data.items.map((order) => (
              <li key={order.id} className="order-card">
                <div className="order-card__top">
                  <div>
                    <Link to={`/account/orders/${order.orderNumber}`} className="order-card__number">
                      {order.orderNumber}
                    </Link>
                    <p>{formatDate(order.createdAt)}</p>
                  </div>
                  <StatusBadge status={order.status} label={orderStatus(order.status)} />
                </div>
                <div className="order-card__body">
                  <div className="order-card__thumbs">
                    {order.items.slice(0, 4).map((item) => (
                      <span key={item.id}>
                        {item.image ? <img src={item.image} alt="" width="48" height="60" loading="lazy" /> : null}
                      </span>
                    ))}
                    {order.items.length > 4 ? <span className="order-card__more">+{order.items.length - 4}</span> : null}
                  </div>
                  <div className="order-card__summary">
                    <strong>{money(order.totals.total)}</strong>
                    <small>
                      {order.items.reduce((sum, item) => sum + item.quantity, 0)} items ·{" "}
                      {order.paymentMethod === "cod" ? "Cash on delivery" : "Online payment"}
                    </small>
                  </div>
                </div>
                <div className="order-card__actions">
                  <Link to={`/account/orders/${order.orderNumber}`} className="button button--quiet button--small">
                    View order
                  </Link>
                  {order.status === "delivered" ? (
                    <Link to={`/account/orders/${order.orderNumber}#reviews`} className="text-link">
                      Review items
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={orders.data.page} pages={orders.data.pages} onChange={setPage} />
        </>
      ) : null}
    </div>
  );
}
