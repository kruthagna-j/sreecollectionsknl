import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, PageLoader } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { StockMovement } from "../../lib/types";

const REASONS: Record<string, string> = {
  order: "Order placed",
  cancel: "Order cancelled",
  variant_update: "Variant stock edit",
  variant_created: "Variant created"
};

const PAGE_SIZE = 50;

export function AdminStockMovements() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const movements = useQuery({
    queryKey: ["admin", "stock-movements", page],
    queryFn: () => api<{ items: StockMovement[]; page: number; pageSize: number }>(
      `/admin/stock-movements?page=${page}&pageSize=${PAGE_SIZE}`
    )
  });

  const hasNext = (movements.data?.items.length ?? 0) === PAGE_SIZE;

  const goTo = (next: number) => {
    const updated = new URLSearchParams(params);
    if (next <= 1) updated.delete("page");
    else updated.set("page", String(next));
    setParams(updated, { replace: true });
  };

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <p className="eyebrow">Catalogue</p>
        <h1>Stock movements</h1>
        <p>
          Every change to stock is recorded with its reason: real orders, cancellations, variant edits and manual
          adjustments. Manual reasons are written by the staff member making the change.
        </p>
      </header>

      {movements.isLoading ? <PageLoader label="Loading stock movements…" /> : null}
      {movements.isError ? (
        <EmptyState
          title="Stock movements could not load"
          description={errorMessage(movements.error)}
          action={{ label: "Try again", onClick: () => void movements.refetch() }}
        />
      ) : null}
      {movements.data && !movements.data.items.length ? (
        <EmptyState
          title="No movements recorded"
          description="Stock changes will appear here as orders are placed or the team adjusts inventory."
        />
      ) : null}

      {movements.data?.items.length ? (
        <>
          <div className="admin-card">
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Product</th>
                    <th scope="col">Option</th>
                    <th scope="col">Change</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.data.items.map((movement) => (
                    <tr key={movement.id}>
                      <td>{formatDateTime(movement.created_at)}</td>
                      <td>
                        <Link to={`/admin/products/${movement.product_id}`}>{movement.product_name}</Link>
                      </td>
                      <td>{movement.variant_name || "—"}</td>
                      <td>
                        <span className={movement.delta > 0 ? "stock-delta stock-delta--up" : "stock-delta stock-delta--down"}>
                          {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                        </span>
                      </td>
                      <td>{REASONS[movement.reason] ?? movement.reason}</td>
                      <td>{movement.reference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <nav className="pagination" aria-label="Stock movement pages">
            <button type="button" className="pagination__arrow" onClick={() => goTo(page - 1)} disabled={page <= 1}>
              Previous
            </button>
            <span className="pagination__page is-current">Page {page}</span>
            <button type="button" className="pagination__arrow" onClick={() => goTo(page + 1)} disabled={!hasNext}>
              Next
            </button>
          </nav>
        </>
      ) : null}
    </div>
  );
}
