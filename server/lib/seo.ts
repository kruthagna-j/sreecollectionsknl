import { config } from "../config.js";
import type { DB } from "../db.js";

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const STATIC_PAGES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "weekly", priority: "0.9" },
  { path: "/shop", changefreq: "daily", priority: "0.9" },
  { path: "/gift-finder", changefreq: "monthly", priority: "0.7" },
  { path: "/offers", changefreq: "weekly", priority: "0.7" },
  { path: "/journal", changefreq: "monthly", priority: "0.6" },
  { path: "/about", changefreq: "yearly", priority: "0.5" },
  { path: "/contact", changefreq: "yearly", priority: "0.5" },
  { path: "/stores", changefreq: "yearly", priority: "0.5" },
  { path: "/track", changefreq: "yearly", priority: "0.4" },
  { path: "/faq", changefreq: "monthly", priority: "0.4" },
  { path: "/policies/shipping", changefreq: "yearly", priority: "0.3" },
  { path: "/policies/returns", changefreq: "yearly", priority: "0.3" },
  { path: "/policies/personalisation", changefreq: "yearly", priority: "0.3" },
  { path: "/policies/gift-wrap", changefreq: "yearly", priority: "0.3" },
  { path: "/policies/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/policies/terms", changefreq: "yearly", priority: "0.3" }
];

type UrlEntry = { path: string; lastmod?: string; changefreq: string; priority: string };

/** Only published products are listed, so a draft never reaches a crawler through the sitemap. */
export function sitemapEntries(db: DB): UrlEntry[] {
  const products = db
    .prepare("SELECT slug, updated_at FROM products WHERE status = 'published' ORDER BY slug")
    .all() as Array<{ slug: string; updated_at: string }>;
  const categories = db
    .prepare("SELECT slug FROM categories WHERE is_active = 1 ORDER BY slug")
    .all() as Array<{ slug: string }>;

  return [
    ...STATIC_PAGES.map((page) => ({ ...page })),
    ...categories.map((category) => ({
      path: `/shop?category=${encodeURIComponent(category.slug)}`,
      changefreq: "daily",
      priority: "0.7"
    })),
    ...products.map((product) => ({
      path: `/product/${encodeURIComponent(product.slug)}`,
      lastmod: product.updated_at?.slice(0, 10),
      changefreq: "weekly",
      priority: "0.8"
    }))
  ];
}

export function renderSitemap(db: DB, origin: string = config.appOrigin): string {
  const base = origin.replace(/\/$/, "");
  const urls = sitemapEntries(db)
    .map((entry) => {
      const lastmod = entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "";
      return `  <url><loc>${escapeXml(`${base}${entry.path}`)}</loc>${lastmod}<changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobotsTxt(origin: string = config.appOrigin): string {
  const base = origin.replace(/\/$/, "");
  return [
    "User-agent: *",
    "Disallow: /admin",
    "Disallow: /account",
    "Disallow: /cart",
    "Disallow: /checkout",
    "Disallow: /orders/",
    "Disallow: /api/",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    ""
  ].join("\n");
}
