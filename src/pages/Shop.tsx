import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useSeo } from "../lib/hooks";
import { classNames, money } from "../lib/format";
import { useSite } from "../context/SiteContext";
import type { CatalogMeta, Category, ProductPage } from "../lib/types";
import { CloseIcon, FilterIcon, SearchIcon } from "../components/Icons";
import { ProductCard } from "../components/ProductCard";
import { Breadcrumbs, EmptyState, Modal, Pagination, SkeletonCard } from "../components/ui";

type Filters = {
  category: string;
  q: string;
  tag: string;
  minPrice: string;
  maxPrice: string;
  sort: string;
  page: number;
  personalizable: string;
  giftWrap: string;
  inStock: string;
};

function readFilters(params: URLSearchParams): Filters {
  return {
    category: params.get("category") ?? "",
    q: params.get("q") ?? "",
    tag: params.get("tag") ?? "",
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    sort: params.get("sort") ?? "featured",
    page: Math.max(1, Number(params.get("page") ?? "1") || 1),
    personalizable: params.get("personalizable") ?? "",
    giftWrap: params.get("giftWrap") ?? "",
    inStock: params.get("inStock") ?? ""
  };
}

function productQuery(filters: Filters): string {
  const query = new URLSearchParams();
  if (filters.category) query.set("category", filters.category);
  if (filters.q) query.set("q", filters.q);
  if (filters.tag) query.set("tag", filters.tag);
  if (filters.minPrice) query.set("minPrice", filters.minPrice);
  if (filters.maxPrice) query.set("maxPrice", filters.maxPrice);
  if (filters.sort) query.set("sort", filters.sort);
  query.set("page", String(filters.page));
  query.set("pageSize", "12");
  if (filters.personalizable) query.set("personalizable", filters.personalizable);
  if (filters.giftWrap) query.set("giftWrap", filters.giftWrap);
  if (filters.inStock) query.set("inStock", filters.inStock);
  return query.toString();
}

function FilterPanel({
  filters,
  update,
  categories,
  meta,
  onClose
}: {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  categories: Category[];
  meta: CatalogMeta | null;
  onClose?: () => void;
}) {
  const [tagQuery, setTagQuery] = useState("");
  const activeCategory = categories.find((category) => category.slug === filters.category);
  const tags = (meta?.tags ?? []).filter((tag) => tag.toLowerCase().includes(tagQuery.toLowerCase()));
  const minPrice = filters.minPrice ? Number(filters.minPrice) / 100 : "";
  const maxPrice = filters.maxPrice ? Number(filters.maxPrice) / 100 : "";

  return (
    <div className="filters">
      <div className="filters__head">
        <h2>Filter gifts</h2>
        <button
          type="button"
          className="text-button"
          onClick={() =>
            update({
              category: "",
              tag: "",
              minPrice: "",
              maxPrice: "",
              personalizable: "",
              giftWrap: "",
              inStock: "",
              q: "",
              page: 1
            })
          }
        >
          Clear all
        </button>
      </div>

      <div className="filters__group">
        <h3>Category</h3>
        <label className="filter-option">
          <input
            type="radio"
            name="category"
            checked={!filters.category}
            onChange={() => update({ category: "", page: 1 })}
          />
          <span>All gifts</span>
        </label>
        {categories.map((category) => (
          <label className="filter-option" key={category.id}>
            <input
              type="radio"
              name="category"
              checked={filters.category === category.slug}
              onChange={() => update({ category: category.slug, page: 1 })}
            />
            <span>{category.name}</span>
            <small>{category.product_count}</small>
          </label>
        ))}
      </div>

      <div className="filters__group">
        <h3>Price</h3>
        <div className="price-inputs">
          <label>
            <span className="sr-only">Minimum price</span>
            <span className="price-inputs__prefix">₹</span>
            <input
              inputMode="numeric"
              placeholder="Min"
              value={minPrice}
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "");
                update({ minPrice: value ? String(Number(value) * 100) : "", page: 1 });
              }}
            />
          </label>
          <span aria-hidden="true">—</span>
          <label>
            <span className="sr-only">Maximum price</span>
            <span className="price-inputs__prefix">₹</span>
            <input
              inputMode="numeric"
              placeholder="Max"
              value={maxPrice}
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "");
                update({ maxPrice: value ? String(Number(value) * 100) : "", page: 1 });
              }}
            />
          </label>
        </div>
        <div className="filters__chips">
          {(meta?.budgets ?? []).map((budget, index) => {
            const previous = index > 0 ? meta!.budgets[index - 1].max : 0;
            const min = index === 0 ? "" : String(previous + 1);
            const max = budget.id === "above-4000" ? "" : String(budget.max);
            const active = filters.minPrice === min && filters.maxPrice === max;
            return (
              <button
                key={budget.id}
                type="button"
                className={active ? "chip is-active" : "chip"}
                onClick={() => update({ minPrice: min, maxPrice: max, page: 1 })}
              >
                {budget.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="filters__group">
        <h3>Refine</h3>
        <label className="filter-option">
          <input
            type="checkbox"
            checked={filters.inStock === "true"}
            onChange={(event) => update({ inStock: event.target.checked ? "true" : "", page: 1 })}
          />
          <span>Ready to send</span>
        </label>
        <label className="filter-option">
          <input
            type="checkbox"
            checked={filters.personalizable === "true"}
            onChange={(event) => update({ personalizable: event.target.checked ? "true" : "", page: 1 })}
          />
          <span>Can be personalised</span>
        </label>
        <label className="filter-option">
          <input
            type="checkbox"
            checked={filters.giftWrap === "true"}
            onChange={(event) => update({ giftWrap: event.target.checked ? "true" : "", page: 1 })}
          />
          <span>Gift wrap available</span>
        </label>
      </div>

      {(meta?.tags?.length ?? 0) > 0 ? (
        <div className="filters__group">
          <h3>Notes</h3>
          <label className="filters__tag-search">
            <SearchIcon size={14} />
            <span className="sr-only">Find a note</span>
            <input value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} placeholder="Find a note…" />
          </label>
          <div className="filters__chips">
            {tags.slice(0, 14).map((tag) => (
              <button
                key={tag}
                type="button"
                className={filters.tag === tag ? "chip is-active" : "chip"}
                onClick={() => update({ tag: filters.tag === tag ? "" : tag, page: 1 })}
              >
                {tag.replaceAll("-", " ")}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {activeCategory?.description ? <p className="filters__category-note">{activeCategory.description}</p> : null}

      {onClose ? (
        <button type="button" className="button button--primary filters__apply" onClick={onClose}>
          Show results
        </button>
      ) : null}
    </div>
  );
}

export function Shop() {
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { home } = useSite();
  const filters = useMemo(() => readFilters(params), [params]);

  const update = (patch: Partial<Filters>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === "" || value === null || value === undefined) next.delete(key);
      else next.set(key, String(value));
    });
    if (patch.page === undefined) next.delete("page");
    setParams(next, { replace: true });
  };

  const metaQuery = useQuery({
    queryKey: ["catalog-meta"],
    queryFn: () => api<CatalogMeta>("/catalog/meta"),
    staleTime: 10 * 60_000
  });

  const productsQuery = useQuery({
    queryKey: ["products", filters],
    queryFn: () => api<ProductPage>(`/catalog/products?${productQuery(filters)}`),
    placeholderData: (previous) => previous
  });

  const categories = home?.categories ?? [];
  const activeCategory = categories.find((category) => category.slug === filters.category);
  const title = filters.q
    ? `Results for “${filters.q}”`
    : activeCategory?.name ?? (filters.tag ? `Gifts for ${filters.tag.replaceAll("-", " ")}` : "The complete collection");
  const description =
    activeCategory?.description ??
    "Keepsakes, personalised gifts, soft toys and small ceremonies of giving — all from the live catalogue.";

  useSeo({
    title: `${title} · Sree Collections`,
    description,
    noIndex: Boolean(filters.q)
  });

  const page = filters.page;
  const products = productsQuery.data;
  const activeFilterCount = [
    filters.category,
    filters.tag,
    filters.minPrice,
    filters.maxPrice,
    filters.personalizable,
    filters.giftWrap,
    filters.inStock
  ].filter(Boolean).length;

  return (
    <div className="container page-shell shop-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Shop" }, ...(activeCategory ? [{ label: activeCategory.name }] : [])]} />

      <header className="shop-header">
        <div>
          <p className="eyebrow">{filters.q ? "Search" : "The collection"}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {filters.q ? (
          <Link to="/shop" className="button button--quiet button--small">
            <CloseIcon size={15} /> Clear search
          </Link>
        ) : null}
      </header>

      <div className="category-pills">
        <Link to="/shop" className={!filters.category ? "chip is-active" : "chip"}>
          All gifts
        </Link>
        {categories.map((category) => (
          <Link
            key={category.id}
            to={`/shop?category=${category.slug}`}
            className={filters.category === category.slug ? "chip is-active" : "chip"}
          >
            {category.name}
          </Link>
        ))}
      </div>

      <div className="shop-layout">
        <aside className="shop-sidebar" aria-label="Filters">
          <FilterPanel filters={filters} update={update} categories={categories} meta={metaQuery.data ?? null} />
        </aside>

        <div className="shop-results" ref={resultsRef}>
          <div className="shop-toolbar">
            <p className="shop-toolbar__count" aria-live="polite">
              {productsQuery.isLoading ? "Looking through the shelves…" : `${products?.total ?? 0} ${products?.total === 1 ? "piece" : "pieces"}`}
              {activeFilterCount > 0 ? " with filters applied" : ""}
            </p>
            <div className="shop-toolbar__actions">
              <button type="button" className="button button--quiet button--small shop-toolbar__filter" onClick={() => setFiltersOpen(true)}>
                <FilterIcon size={16} /> Filters
                {activeFilterCount > 0 ? <span className="filter-count">{activeFilterCount}</span> : null}
              </button>
              <label className="sort-select">
                <span>Sort</span>
                <select value={filters.sort} onChange={(event) => update({ sort: event.target.value, page: 1 })}>
                  {(metaQuery.data?.sortOptions ?? [{ id: "featured", label: "Featured" }]).map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {activeFilterCount > 0 || filters.q ? (
            <div className="active-filters">
              {filters.q ? (
                <button type="button" className="active-filter" onClick={() => update({ q: "", page: 1 })}>
                  “{filters.q}” <CloseIcon size={12} />
                </button>
              ) : null}
              {activeCategory ? (
                <button type="button" className="active-filter" onClick={() => update({ category: "", page: 1 })}>
                  {activeCategory.name} <CloseIcon size={12} />
                </button>
              ) : null}
              {filters.tag ? (
                <button type="button" className="active-filter" onClick={() => update({ tag: "", page: 1 })}>
                  {filters.tag.replaceAll("-", " ")} <CloseIcon size={12} />
                </button>
              ) : null}
              {filters.minPrice || filters.maxPrice ? (
                <button type="button" className="active-filter" onClick={() => update({ minPrice: "", maxPrice: "", page: 1 })}>
                  {filters.minPrice ? money(Number(filters.minPrice)) : "₹0"} –{" "}
                  {filters.maxPrice ? money(Number(filters.maxPrice)) : "any"}
                  <CloseIcon size={12} />
                </button>
              ) : null}
              {filters.inStock === "true" ? (
                <button type="button" className="active-filter" onClick={() => update({ inStock: "", page: 1 })}>
                  Ready to send <CloseIcon size={12} />
                </button>
              ) : null}
              {filters.personalizable === "true" ? (
                <button type="button" className="active-filter" onClick={() => update({ personalizable: "", page: 1 })}>
                  Personalisable <CloseIcon size={12} />
                </button>
              ) : null}
              {filters.giftWrap === "true" ? (
                <button type="button" className="active-filter" onClick={() => update({ giftWrap: "", page: 1 })}>
                  Gift wrap <CloseIcon size={12} />
                </button>
              ) : null}
            </div>
          ) : null}

          {productsQuery.isError ? (
            <EmptyState
              title="The shelves could not be loaded"
              description="Please check your connection and try again."
              action={{ label: "Try again", onClick: () => void productsQuery.refetch() }}
            />
          ) : productsQuery.isLoading ? (
            <div className="product-grid">
              {Array.from({ length: 8 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          ) : products && products.items.length > 0 ? (
            <>
              <div className={classNames("product-grid", productsQuery.isPlaceholderData && "is-refreshing")}>
                {products.items.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={index < 4} />
                ))}
              </div>
              <Pagination
                page={products.page}
                pages={products.pages}
                onChange={(next) => {
                  update({ page: next });
                  window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}
              />
            </>
          ) : (
            <EmptyState
              title="Nothing matches just yet"
              description="Try widening the price range, removing a filter, or searching for a different occasion."
              action={{
                label: "Clear filters",
                onClick: () =>
                  update({
                    category: "",
                    tag: "",
                    q: "",
                    minPrice: "",
                    maxPrice: "",
                    personalizable: "",
                    giftWrap: "",
                    inStock: "",
                    page: 1
                  })
              }}
            />
          )}
        </div>
      </div>

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter gifts" size="lg">
        <FilterPanel
          filters={filters}
          update={update}
          categories={categories}
          meta={metaQuery.data ?? null}
          onClose={() => setFiltersOpen(false)}
        />
      </Modal>
    </div>
  );
}
