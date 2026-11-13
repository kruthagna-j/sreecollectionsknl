import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, PageLoader, Pagination, StatusBadge } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, money } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";
import type { AdminProductListItem } from "../../lib/types";

type ProductList = {
  items: AdminProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

const STATUSES = ["draft", "scheduled", "published", "unpublished", "archived", "discontinued"];

export function AdminProducts() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const status = params.get("status") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const debounced = useDebounced(q, 300);

  const products = useQuery({
    queryKey: ["admin", "products", debounced, status, page],
    queryFn: () =>
      api<ProductList>(
        `/admin/products?page=${page}&pageSize=20&q=${encodeURIComponent(debounced)}&status=${encodeURIComponent(status)}`
      )
  });

  const setStatus = (next: string) => {
    const updated = new URLSearchParams(params);
    if (next) updated.set("status", next);
    else updated.delete("status");
    updated.delete("page");
    setParams(updated, { replace: true });
  };

  return (
    <div className="admin-page">
      <header className="admin-page__head admin-page__head--row">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1>Products</h1>
          <p>Stock is reduced by real orders and can be adjusted with an audited reason.</p>
        </div>
        <Link to="/admin/products/new" className="button button--primary button--small">
          New product
        </Link>
      </header>

      <div className="admin-toolbar">
        <div className="admin-search">
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              const updated = new URLSearchParams(params);
              updated.delete("page");
              setParams(updated, { replace: true });
            }}
            placeholder="Search by name or SKU"
            aria-label="Search products"
          />
        </div>
        <div className="admin-tabs" role="group" aria-label="Filter by status">
          <button type="button" className={!status ? "is-active" : undefined} onClick={() => setStatus("")}>
            All
          </button>
          {STATUSES.map((entry) => (
            <button key={entry} type="button" className={status === entry ? "is-active" : undefined} onClick={() => setStatus(entry)}>
              {entry}
            </button>
          ))}
        </div>
      </div>

      {products.isLoading ? <PageLoader label="Loading products…" /> : null}
      {products.isError ? (
        <EmptyState
          title="Products could not load"
          description={errorMessage(products.error)}
          action={{ label: "Try again", onClick: () => void products.refetch() }}
        />
      ) : null}
      {products.data && !products.data.items.length ? (
        <EmptyState
          title="No products match"
          description="Adjust the filters or create a new product."
          action={{ label: "Create a product", to: "/admin/products/new" }}
        />
      ) : null}

      {products.data?.items.length ? (
        <>
          <div className="admin-card">
            <div className="table-wrap">
              <table className="admin-table admin-table--products">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Category</th>
                    <th scope="col">Price</th>
                    <th scope="col">Stock</th>
                    <th scope="col">Status</th>
                    <th scope="col">Updated</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.data.items.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="admin-product-cell">
                          {product.image ? <img src={product.image} alt="" width="40" height="50" loading="lazy" /> : null}
                          <div>
                            <Link to={`/admin/products/${product.id}`}>{product.name}</Link>
                            <small>{product.sku}</small>
                          </div>
                        </div>
                      </td>
                      <td>{product.category}</td>
                      <td>
                        {money(product.salePrice ?? product.price)}
                        {product.salePrice ? <small className="muted">MRP {money(product.price)}</small> : null}
                      </td>
                      <td>
                        <span className={product.stock === 0 ? "stock-pill is-out" : product.stock < 5 ? "stock-pill is-low" : "stock-pill"}>
                          {product.stock}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={product.status} />
                      </td>
                      <td>{formatDateTime(product.updatedAt)}</td>
                      <td>
                        <Link to={`/admin/products/${product.id}`} className="text-link">
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            page={products.data.page}
            pages={products.data.pages}
            onChange={(next) => {
              const updated = new URLSearchParams(params);
              updated.set("page", String(next));
              setParams(updated, { replace: true });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
