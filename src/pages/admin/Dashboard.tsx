import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAuth } from "../../context/AuthContext";
import { EmptyState, PageLoader, StatusBadge } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, formatDateTime, money, orderStatus } from "../../lib/format";
import type { AdminSummary } from "../../lib/types";

function shortDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(date);
}

export function AdminDashboard() {
  const { user } = useAuth();
  const summary = useQuery({
    queryKey: ["admin", "summary"],
    queryFn: () => api<AdminSummary>("/admin/summary")
  });

  if (summary.isLoading) return <PageLoader label="Loading store summary…" />;
  if (summary.isError) {
    return (
      <EmptyState
        title="The summary could not load"
        description={errorMessage(summary.error)}
        action={{ label: "Try again", onClick: () => void summary.refetch() }}
      />
    );
  }

  const data = summary.data!;
  const chartData = data.salesLast14Days.map((entry) => ({
    day: shortDay(entry.day),
    sales: entry.total / 100,
    orders: entry.orders
  }));

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <div>
          <p className="eyebrow">Store pulse</p>
          <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {user?.name?.split(" ")[0]}</h1>
          <p>Live figures from the store database. Cash-on-delivery revenue is recognised only when an order is marked delivered.</p>
        </div>
      </header>

      <div className="admin-stats">
        <article className="admin-stat">
          <span>Orders</span>
          <strong>{data.orders.total}</strong>
          <small>{Object.entries(data.orders.byStatus).map(([status, count]) => `${orderStatus(status)} ${count}`).join(" · ") || "No orders yet"}</small>
        </article>
        <article className="admin-stat">
          <span>Order value</span>
          <strong>{money(data.revenue.orderValue)}</strong>
          <small>Excludes cancelled orders</small>
        </article>
        <article className="admin-stat">
          <span>Collected</span>
          <strong>{money(data.revenue.collected)}</strong>
          <small>Orders marked paid</small>
        </article>
        <article className="admin-stat">
          <span>Pending cash</span>
          <strong>{money(data.revenue.pendingCod)}</strong>
          <small>Cash on delivery not yet collected</small>
        </article>
      </div>

      <div className="admin-mini-stats">
        <Link to="/admin/orders">
          <span>Customers</span>
          <strong>{data.counts.customers}</strong>
        </Link>
        <Link to="/admin/products">
          <span>Products</span>
          <strong>{data.counts.products}</strong>
        </Link>
        <Link to="/admin/reviews">
          <span>Reviews awaiting</span>
          <strong>{data.counts.pending_reviews}</strong>
        </Link>
        <Link to="/admin/tickets">
          <span>Open tickets</span>
          <strong>{data.counts.open_tickets}</strong>
        </Link>
        <Link to="/admin/returns">
          <span>Open returns</span>
          <strong>{data.counts.open_returns}</strong>
        </Link>
      </div>

      <section className="admin-card">
        <div className="admin-card__head">
          <div>
            <h2>Sales, last 14 days</h2>
            <p>All non-cancelled orders, by order date.</p>
          </div>
        </div>
        <div className="admin-chart" aria-label="Sales chart">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8a2436" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#8a2436" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7ddca" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#6f6252" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: "#6f6252" }} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}`} />
              <Tooltip
                formatter={(value, name) => (name === "sales" ? money(Number(value) * 100) : String(value ?? ""))}
                labelStyle={{ color: "#3b2b1f" }}
                contentStyle={{ borderRadius: 6, border: "1px solid #e7ddca", fontSize: 12 }}
              />
              <Area type="monotone" dataKey="sales" stroke="#8a2436" strokeWidth={2} fill="url(#salesFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="admin-grid-2">
        <section className="admin-card">
          <div className="admin-card__head">
            <h2>Recent orders</h2>
            <Link to="/admin/orders" className="text-link">
              All orders
            </Link>
          </div>
          {data.recentOrders.length ? (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Status</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link to={`/admin/orders/${order.id}`}>{order.orderNumber}</Link>
                        <small>{formatDate(order.createdAt)}</small>
                      </td>
                      <td>
                        {order.customer}
                        <small>{order.email}</small>
                      </td>
                      <td>
                        <StatusBadge status={order.status} label={orderStatus(order.status)} />
                      </td>
                      <td>{money(order.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-empty">No orders have been placed yet.</p>
          )}
        </section>

        <section className="admin-card">
          <div className="admin-card__head">
            <h2>Low stock</h2>
            <Link to="/admin/products" className="text-link">
              Catalogue
            </Link>
          </div>
          {data.lowStock.length ? (
            <ul className="admin-list">
              {data.lowStock.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.sku}</small>
                  </div>
                  <span className={item.stock === 0 ? "stock-pill is-out" : "stock-pill is-low"}>
                    {item.stock === 0 ? "Out of stock" : `${item.stock} left`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-empty">Every published product is above its low-stock threshold.</p>
          )}
        </section>
      </div>

      <div className="admin-grid-2">
        <section className="admin-card">
          <div className="admin-card__head">
            <h2>Top products</h2>
            <p>By quantity across non-cancelled orders.</p>
          </div>
          {data.topProducts.length ? (
            <ul className="admin-list">
              {data.topProducts.map((product) => (
                <li key={product.id}>
                  <div>
                    <strong>{product.name}</strong>
                    <small>
                      {product.quantity} sold · {money(product.revenue)}
                    </small>
                  </div>
                  <Link to={`/product/${product.slug}`} className="text-link" target="_blank" rel="noreferrer">
                    View
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-empty">No sales recorded yet.</p>
          )}
        </section>

        <section className="admin-card">
          <div className="admin-card__head">
            <h2>How revenue is counted</h2>
          </div>
          <p className="admin-note">{data.note}</p>
          <p className="admin-note">
            The dashboard reflects the database exactly. There is no sample revenue, no invented traffic and no fabricated
            conversion rate. Integrations such as email or couriers show as unconfigured until they are actually set up and
            verified.
          </p>
        </section>
      </div>
    </div>
  );
}
