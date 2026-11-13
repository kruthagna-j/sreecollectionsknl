import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "../components/ProductCard";
import { Breadcrumbs, EmptyState, SkeletonCard } from "../components/ui";
import { CheckIcon, GiftIcon, SparkleIcon } from "../components/Icons";
import { api } from "../lib/api";
import { useSeo } from "../lib/hooks";
import type { CatalogMeta, ProductPage } from "../lib/types";

type FinderFilters = {
  occasion: string;
  recipient: string;
  budget: string;
  personalizable: boolean;
  giftWrap: boolean;
};

const DEFAULT_FILTERS: FinderFilters = {
  occasion: "",
  recipient: "",
  budget: "",
  personalizable: false,
  giftWrap: false
};

function queryString(filters: FinderFilters, meta: CatalogMeta | undefined, page: number): string {
  const params = new URLSearchParams({ page: String(page), pageSize: "12" });
  if (filters.occasion) params.set("occasion", filters.occasion);
  if (filters.recipient) params.set("recipient", filters.recipient);
  const budget = meta?.budgets.find((entry) => entry.id === filters.budget);
  if (budget) params.set("maxBudget", String(budget.max));
  if (filters.personalizable) params.set("personalizable", "true");
  if (filters.giftWrap) params.set("giftWrap", "true");
  return params.toString();
}

export function GiftFinder() {
  const [filters, setFilters] = useState<FinderFilters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<FinderFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  useSeo({
    title: "Gift finder · Sree Collections",
    description: "Answer a few questions and see matching gifts from the live Sree Collections catalogue.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Sree Collections gift finder"
    }
  });

  const meta = useQuery({ queryKey: ["catalog", "meta"], queryFn: () => api<CatalogMeta>("/catalog/meta"), staleTime: 300_000 });

  const results = useQuery({
    queryKey: ["gift-finder", applied, page],
    queryFn: () => api<ProductPage & { explanation: string }>(`/catalog/gift-finder?${queryString(applied, meta.data, page)}`),
    enabled: Boolean(meta.data)
  });

  const toggle = (key: "personalizable" | "giftWrap") => setFilters((current) => ({ ...current, [key]: !current[key] }));

  const find = () => {
    setApplied(filters);
    setPage(1);
  };

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
    setPage(1);
  };

  const summary = [
    meta.data?.occasions.find((entry) => entry.id === applied.occasion)?.label,
    meta.data?.recipients.find((entry) => entry.id === applied.recipient)?.label,
    meta.data?.budgets.find((entry) => entry.id === applied.budget)?.label,
    applied.personalizable ? "Personalisable" : null,
    applied.giftWrap ? "Gift wrap" : null
  ].filter(Boolean);

  return (
    <div className="container page-shell gift-finder-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Gift finder" }]} />
      <header className="gf-hero">
        <div>
          <p className="eyebrow">A little guidance</p>
          <h1>Find a gift that feels like them</h1>
          <p>
            Tell us the occasion, the person and your budget. We search the real catalogue — every result is a product
            the store actually stocks.
          </p>
        </div>
        <GiftIcon size={42} />
      </header>

      <div className="gf-layout">
        <section className="gf-panel" aria-label="Gift finder questions">
          <fieldset className="gf-step">
            <legend>
              <span>1</span> What is the occasion?
            </legend>
            <div className="chip-row">
              {meta.data?.occasions.map((occasion) => (
                <button
                  key={occasion.id}
                  type="button"
                  className={filters.occasion === occasion.id ? "chip is-selected" : "chip"}
                  aria-pressed={filters.occasion === occasion.id}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      occasion: current.occasion === occasion.id ? "" : occasion.id
                    }))
                  }
                >
                  {occasion.label}
                </button>
              )) ?? <p className="form-note">Loading occasions…</p>}
            </div>
          </fieldset>

          <fieldset className="gf-step">
            <legend>
              <span>2</span> Who is it for?
            </legend>
            <div className="chip-row">
              {meta.data?.recipients.map((recipient) => (
                <button
                  key={recipient.id}
                  type="button"
                  className={filters.recipient === recipient.id ? "chip is-selected" : "chip"}
                  aria-pressed={filters.recipient === recipient.id}
                  onClick={() =>
                    setFilters((current) => ({
                      ...current,
                      recipient: current.recipient === recipient.id ? "" : recipient.id
                    }))
                  }
                >
                  {recipient.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="gf-step">
            <legend>
              <span>3</span> What is your budget?
            </legend>
            <div className="chip-row">
              {meta.data?.budgets.map((budget) => (
                <button
                  key={budget.id}
                  type="button"
                  className={filters.budget === budget.id ? "chip is-selected" : "chip"}
                  aria-pressed={filters.budget === budget.id}
                  onClick={() =>
                    setFilters((current) => ({ ...current, budget: current.budget === budget.id ? "" : budget.id }))
                  }
                >
                  {budget.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="gf-step">
            <legend>
              <span>4</span> Any finishing touches?
            </legend>
            <label className="gf-toggle">
              <input type="checkbox" checked={filters.personalizable} onChange={() => toggle("personalizable")} />
              <span className="gf-toggle__box" aria-hidden="true">
                <CheckIcon size={13} />
              </span>
              <span>
                <strong>Personalisable</strong>
                <small>Name, message or engraving added by the store.</small>
              </span>
            </label>
            <label className="gf-toggle">
              <input type="checkbox" checked={filters.giftWrap} onChange={() => toggle("giftWrap")} />
              <span className="gf-toggle__box" aria-hidden="true">
                <CheckIcon size={13} />
              </span>
              <span>
                <strong>Gift wrapping available</strong>
                <small>Chosen on the product page.</small>
              </span>
            </label>
          </fieldset>

          <div className="gf-actions">
            <button type="button" className="button button--primary" onClick={find}>
              <SparkleIcon size={16} /> Find gifts
            </button>
            <button type="button" className="text-button" onClick={reset}>
              Start over
            </button>
          </div>
        </section>

        <section className="gf-results" aria-live="polite">
          <div className="gf-results__head">
            <h2>
              {summary.length ? "Your matches" : "The whole shelf"}
              {results.data ? <span>{results.data.total} gifts</span> : null}
            </h2>
          </div>
          {summary.length ? (
            <div className="chip-row gf-summary">
              {summary.map((entry) => (
                <span className="chip chip--static" key={String(entry)}>
                  {entry}
                </span>
              ))}
            </div>
          ) : null}

          {results.isLoading ? (
            <div className="product-grid">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))}
            </div>
          ) : results.isError ? (
            <EmptyState
              title="The gift finder could not load"
              description="Please try again in a moment."
              action={{ label: "Try again", onClick: () => void results.refetch() }}
            />
          ) : results.data && results.data.items.length ? (
            <>
              <div className="product-grid">
                {results.data.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              {results.data.pages > 1 ? (
                <div className="pager">
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    Previous
                  </button>
                  <span>
                    Page {results.data.page} of {results.data.pages}
                  </span>
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    disabled={page >= results.data.pages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </button>
                </div>
              ) : null}
              <p className="gf-explanation">{results.data.explanation}</p>
            </>
          ) : (
            <EmptyState
              title="No gifts match those answers"
              description="Try a higher budget, or leave one of the questions blank. The full collection is only a few taps away."
              action={{ label: "Browse everything", to: "/shop" }}
            />
          )}
        </section>
      </div>
    </div>
  );
}
