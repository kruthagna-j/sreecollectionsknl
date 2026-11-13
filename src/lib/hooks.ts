import { useEffect, useRef, useState } from "react";
import type { ProductSummary } from "./types";

type SeoInput = {
  title?: string;
  description?: string;
  image?: string;
  type?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  noIndex?: boolean;
};

export function useSeo({ title, description, image, type = "website", jsonLd, noIndex }: SeoInput) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.appendChild(meta);
      }
      meta.content = description;

      const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
      if (ogDescription) ogDescription.content = description;
    }
    if (title) {
      const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
      if (ogTitle) ogTitle.content = title;
    }
    if (image) {
      const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
      if (ogImage) ogImage.content = image;
    }
    const ogType = document.querySelector<HTMLMetaElement>('meta[property="og:type"]');
    if (ogType) ogType.content = type;
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (robots) robots.content = noIndex ? "noindex,nofollow" : "index,follow";
  }, [title, description, image, type, noIndex]);

  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : "";
  useEffect(() => {
    if (!jsonLdKey) return;
    const parsed = JSON.parse(jsonLdKey) as Record<string, unknown> | Array<Record<string, unknown>>;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(Array.isArray(parsed) ? { "@context": "https://schema.org", "@graph": parsed } : parsed);
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [jsonLdKey]);
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useLockBody(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

export function useEscape(active: boolean, onEscape: () => void) {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") handler.current();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [active]);
}

const RECENT_KEY = "sc_recent_products";

export function useRecentlyViewed(current?: ProductSummary) {
  const [items, setItems] = useState<ProductSummary[]>(() => readRecent());

  useEffect(() => {
    if (!current) return;
    rememberProduct(current);
    setItems(readRecent());
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return items.filter((item) => item.id !== current?.id).slice(0, 4);
}

export function rememberProduct(product: ProductSummary) {
  const current = readRecent().filter((item) => item.id !== product.id);
  const next = [product, ...current].slice(0, 6);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Local storage can be unavailable in private modes; browsing still works.
  }
}

function readRecent(): ProductSummary[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProductSummary[]).slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      return false;
    }
  };
  return { copied, copy };
}
