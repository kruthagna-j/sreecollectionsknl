import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useDebounced, useEscape, useLockBody } from "../lib/hooks";
import { CloseIcon, SearchIcon } from "./Icons";

type Suggestions = { suggestions: string[]; popular: string[] };

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 250);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useLockBody(open);
  useEscape(open, onClose);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  const suggestionQuery = useQuery({
    queryKey: ["search-suggestions", debounced],
    queryFn: () => api<Suggestions>(`/catalog/search/suggestions${debounced.length >= 2 ? `?q=${encodeURIComponent(debounced)}` : ""}`),
    enabled: open,
    staleTime: 30_000
  });

  if (!open) return null;

  const go = (value: string) => {
    const term = value.trim();
    if (!term) return;
    navigate(`/shop?q=${encodeURIComponent(term)}`);
    onClose();
    setQuery("");
  };

  const items = debounced.length >= 2 ? suggestionQuery.data?.suggestions ?? [] : suggestionQuery.data?.popular ?? [];

  return (
    <div className="search-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="search-overlay__panel" role="dialog" aria-modal="true" aria-label="Search the store">
        <div className="search-overlay__top">
          <form
            className="search-overlay__form"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              go(query);
            }}
          >
            <SearchIcon size={21} />
            <label className="sr-only" htmlFor="site-search">
              Search products
            </label>
            <input
              id="site-search"
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search gifts, keepsakes, personalisation…"
              autoComplete="off"
              maxLength={80}
            />
            {query ? (
              <button type="button" className="search-overlay__clear" onClick={() => setQuery("")} aria-label="Clear search">
                Clear
              </button>
            ) : null}
            <button type="submit" className="button button--primary button--small">
              Search
            </button>
          </form>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close search">
            <CloseIcon size={21} />
          </button>
        </div>

        <div className="search-overlay__body">
          {suggestionQuery.isFetching ? <p className="search-overlay__status">Looking through the shelves…</p> : null}
          {items.length > 0 ? (
            <>
              <p className="search-overlay__label">{debounced.length >= 2 ? "Matches" : "Popular searches"}</p>
              <ul className="search-suggestions" role="listbox" aria-label="Search suggestions">
                {items.map((item) => (
                  <li key={item}>
                    <button type="button" onClick={() => go(item)} role="option" aria-selected="false">
                      <SearchIcon size={15} />
                      <span>{item}</span>
                      <span className="search-suggestions__arrow" aria-hidden="true">
                        ↗
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : debounced.length >= 2 && !suggestionQuery.isFetching ? (
            <p className="search-overlay__status">No matches yet. Try a category such as “personalised” or “wedding”.</p>
          ) : null}

          <div className="search-overlay__links">
            <p className="search-overlay__label">Browse</p>
            <div className="search-overlay__chips">
              {["Birthday", "Anniversary", "Personalised", "Soft Toys", "Wedding", "All Gifts"].map((item) => (
                <button
                  key={item}
                  type="button"
                  className="chip"
                  onClick={() => {
                    navigate(`/shop?category=${item.toLowerCase().replaceAll(" ", "-")}`);
                    onClose();
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
