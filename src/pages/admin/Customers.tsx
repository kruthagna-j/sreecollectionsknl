import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, PageLoader, Pagination } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, money } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";
import type { CustomerRow } from "../../lib/types";

type CustomerPage = {
  items: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

export function AdminCustomers() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const debounced = useDebounced(q, 300);

  const customers = useQuery({
    queryKey: ["admin", "customers", debounced, page],
    queryFn: () =>
      api<CustomerPage>(`/admin/customers?page=${page}&pageSize=25&q=${encodeURIComponent(debounced)}`)
  });

  const updateParams = (changes: Record<string, string | null>) => {
    const updated = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) updated.delete(key);
      else updated.set(key, value);
    }
    setParams(updated, { replace: true });
  };

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <p className="eyebrow">Sales</p>
        <h1>Customers</h1>
        <p>
          Registered customer accounts. Guest orders are still on the Orders page and are not listed here because they
          have no account.
        </p>
      </header>

      <div className="admin-toolbar">
        <div className="admin-search">
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              updateParams({ q: event.target.value || null, page: null });
            }}
            placeholder="Search name, email or phone"
            aria-label="Search customers"
          />
        </div>
        <p className="muted">{customers.data ? `${customers.data.total} accounts` : ""}</p>
      </div>

      {customers.isLoading ? <PageLoader label="Loading customers…" /> : null}
      {customers.isError ? (
        <EmptyState
          title="Customers could not load"
          description={errorMessage(customers.error)}
          action={{ label: "Try again", onClick: () => void customers.refetch() }}
        />
      ) : null}
      {customers.data && !customers.data.items.length ? (
        <EmptyState
          title="No accounts match"
          description="Customers appear here once they register. Guest checkout does not create an account."
        />
      ) : null}

      {customers.data?.items.length ? (
        <>
          <div className="admin-card">
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Customer</th>
                    <th scope="col">Phone</th>
                    <th scope="col">Orders</th>
                    <th scope="col">Paid total</th>
                    <th scope="col">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.data.items.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <strong>{customer.name}</strong>
                        <small className="muted admin-cell-note">{customer.email}</small>
                      </td>
                      <td>{customer.phone || "—"}</td>
                      <td>{customer.orders}</td>
                      <td>{money(customer.paid_total)}</td>
                      <td>{formatDate(customer.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={customers.data.page} pages={customers.data.pages} onChange={(next) => updateParams({ page: String(next) })} />
        </>
      ) : null}
    </div>
  );
}
