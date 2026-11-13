import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { EmptyState, PageLoader, StatusBadge } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, money, orderStatus } from "../../lib/format";
import type { AccountSummary, OrderPage } from "../../lib/types";

export function AccountDashboard() {
  const { user } = useAuth();
  const summary = useQuery({
    queryKey: ["account", "summary"],
    queryFn: () => api<AccountSummary>("/account")
  });
  const orders = useQuery({
    queryKey: ["account", "orders", 1],
    queryFn: () => api<OrderPage>("/account/orders?page=1&pageSize=5")
  });

  if (summary.isLoading) return <PageLoader label="Opening your account…" />;
  if (summary.isError) {
    return (
      <EmptyState
        title="Your account could not be loaded"
        description={errorMessage(summary.error)}
        action={{ label: "Try again", onClick: () => void summary.refetch() }}
      />
    );
  }

  const counts = summary.data?.counts;

  return (
    <div className="account-dashboard">
      <header className="account-heading">
        <p className="eyebrow">Your account</p>
        <h1>Hello, {user?.name?.split(" ")[0] ?? "there"}.</h1>
        <p>Orders, saved pieces and addresses — all in one place.</p>
      </header>

      <div className="stat-cards">
        <Link to="/account/orders" className="stat-card">
          <span>Orders</span>
          <strong>{counts?.orders ?? 0}</strong>
          <small>Placed with this account</small>
        </Link>
        <Link to="/account/wishlist" className="stat-card">
          <span>Wishlist</span>
          <strong>{counts?.wishlist ?? 0}</strong>
          <small>Pieces saved for later</small>
        </Link>
        <Link to="/account/addresses" className="stat-card">
          <span>Addresses</span>
          <strong>{counts?.addresses ?? 0}</strong>
          <small>Saved delivery addresses</small>
        </Link>
        <Link to="/account/returns" className="stat-card">
          <span>Open returns</span>
          <strong>{counts?.open_returns ?? 0}</strong>
          <small>Being reviewed by the store</small>
        </Link>
      </div>

      <section className="account-section">
        <div className="account-section__head">
          <h2>Recent orders</h2>
          <Link to="/account/orders" className="text-link">
            All orders
          </Link>
        </div>
        {orders.isLoading ? (
          <PageLoader label="Loading orders…" />
        ) : orders.data?.items.length ? (
          <ul className="account-order-list">
            {orders.data.items.map((order) => (
              <li key={order.id}>
                <div className="account-order-list__main">
                  <Link to={`/account/orders/${order.orderNumber}`}>
                    <strong>{order.orderNumber}</strong>
                  </Link>
                  <small>
                    {formatDate(order.createdAt)} · {order.items.length} {order.items.length === 1 ? "item" : "items"}
                  </small>
                </div>
                <StatusBadge status={order.status} label={orderStatus(order.status)} />
                <span className="account-order-list__total">{money(order.totals.total)}</span>
                <Link to={`/account/orders/${order.orderNumber}`} className="text-link">
                  View
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No orders yet"
            description="When you place an order, it will appear here with its real status history."
            action={{ label: "Browse the collection", to: "/shop" }}
          />
        )}
      </section>

      <section className="account-section">
        <div className="account-section__head">
          <h2>Quick links</h2>
        </div>
        <div className="quick-links">
          <Link to="/track">Track a guest order</Link>
          <Link to="/gift-finder">Find a gift</Link>
          <Link to="/account/profile">Update your details</Link>
          <Link to="/faq">Read the FAQs</Link>
        </div>
      </section>
    </div>
  );
}
