import type { DB } from "../db.js";

type SqlValue = string | number | null;

export type ProductRow = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  short_description: string;
  description: string;
  category_id: string;
  category_slug: string;
  category_name: string;
  price: number;
  sale_price: number | null;
  mrp: number | null;
  tax_rate_bps: number;
  hsn_code: string | null;
  stock_quantity: number;
  low_stock_threshold: number;
  weight_g: number;
  status: string;
  featured: number;
  gift_wrappable: number;
  personalizable: number;
  tags: string;
  image_alt: string;
  seo_title: string;
  seo_description: string;
  search_keywords: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  preparation_days: number;
  return_eligible: number;
  fragile: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  image_url: string | null;
  image_url_alt: string | null;
  rating_avg: number | null;
  rating_count: number;
  variant_count: number;
  variant_min_price: number | null;
  variant_stock: number | null;
  sold: number;
};

const EFFECTIVE_PRICE = `COALESCE(
  (SELECT MIN(COALESCE(v.price, p.price)) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1),
  p.sale_price, p.price
)`;

const PRODUCT_SELECT = `
  SELECT p.id, p.slug, p.sku, p.name, p.short_description, p.description, p.category_id,
         c.slug AS category_slug, c.name AS category_name,
         p.price, p.sale_price, p.mrp, p.tax_rate_bps, p.hsn_code, p.stock_quantity,
         p.low_stock_threshold, p.weight_g, p.status, p.featured, p.gift_wrappable, p.personalizable,
         p.tags, p.image_alt, p.seo_title, p.seo_description, p.search_keywords,
         p.length_mm, p.width_mm, p.height_mm, p.preparation_days, p.return_eligible, p.fragile,
         p.published_at, p.created_at, p.updated_at,
         (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image_url,
         (SELECT i.alt FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image_url_alt,
         (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id AND r.status = 'approved') AS rating_avg,
         (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.status = 'approved') AS rating_count,
         (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_count,
         (SELECT MIN(COALESCE(v.price, p.price)) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_min_price,
         (SELECT SUM(v.stock_quantity) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_stock,
         (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE oi.product_id = p.id AND o.status NOT IN ('cancelled')) AS sold,
         ${EFFECTIVE_PRICE} AS effective_price
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

export type ProductSummary = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  shortDescription: string;
  category: { slug: string; name: string };
  price: number;
  compareAt: number | null;
  discountPercent: number;
  image: string | null;
  imageAlt: string;
  inStock: boolean;
  stock: number;
  stockLabel: string;
  variantCount: number;
  featured: boolean;
  personalizable: boolean;
  giftWrappable: boolean;
  tags: string[];
  rating: { average: number; count: number };
  createdAt: string;
};

export function effectivePrice(row: Pick<ProductRow, "variant_min_price" | "sale_price" | "price">): number {
  return row.variant_min_price ?? row.sale_price ?? row.price;
}

export function stockFor(row: Pick<ProductRow, "variant_count" | "variant_stock" | "stock_quantity">): number {
  if (row.variant_count > 0) return row.variant_stock ?? 0;
  return row.stock_quantity;
}

export function stockLabel(stock: number, threshold = 5): string {
  if (stock <= 0) return "Out of stock";
  if (stock <= threshold) return `Only ${stock} left`;
  return "In stock";
}

export function serializeSummary(row: ProductRow): ProductSummary {
  const price = effectivePrice(row);
  const compareAt = row.mrp && row.mrp > price ? row.mrp : null;
  const stock = stockFor(row);
  return {
    id: row.id,
    slug: row.slug,
    sku: row.sku,
    name: row.name,
    shortDescription: row.short_description,
    category: { slug: row.category_slug, name: row.category_name },
    price,
    compareAt,
    discountPercent: compareAt ? Math.round(((compareAt - price) / compareAt) * 100) : 0,
    image: row.image_url,
    imageAlt: row.image_url_alt || row.image_alt || row.name,
    inStock: stock > 0,
    stock,
    stockLabel: stockLabel(stock, row.low_stock_threshold),
    variantCount: row.variant_count,
    featured: Boolean(row.featured),
    personalizable: Boolean(row.personalizable),
    giftWrappable: Boolean(row.gift_wrappable),
    tags: row.tags ? row.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
    rating: {
      average: row.rating_avg ? Math.round(row.rating_avg * 10) / 10 : 0,
      count: row.rating_count
    },
    createdAt: row.created_at
  };
}

export type ProductDetail = ProductSummary & {
  description: string;
  seoTitle: string;
  seoDescription: string;
  images: Array<{ url: string; alt: string }>;
  variants: Array<{ id: string; name: string; sku: string; price: number; stock: number; inStock: boolean }>;
  specifications: {
    weightGrams: number;
    dimensions: { lengthMm: number; widthMm: number; heightMm: number };
    hsnCode: string | null;
    taxRateBps: number;
    preparationDays: number;
    returnEligible: boolean;
    fragile: boolean;
    giftWrappable: boolean;
    personalizable: boolean;
  };
  ratingBreakdown: Array<{ stars: number; count: number }>;
};

export function getImages(db: DB, productId: string): Array<{ url: string; alt: string }> {
  return db
    .prepare("SELECT url, alt FROM product_images WHERE product_id = ? ORDER BY sort_order, id")
    .all(productId) as Array<{ url: string; alt: string }>;
}

export function getVariants(db: DB, productId: string) {
  return (
    db
      .prepare(
        "SELECT id, name, sku, price, stock_quantity, is_active FROM product_variants WHERE product_id = ? ORDER BY sort_order, id"
      )
      .all(productId) as Array<{
      id: string;
      name: string;
      sku: string;
      price: number | null;
      stock_quantity: number;
      is_active: number;
    }>
  ).map((variant) => ({
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    price: variant.price ?? 0,
    stock: variant.stock_quantity,
    inStock: variant.stock_quantity > 0 && Boolean(variant.is_active)
  }));
}

export function getProductRowBySlug(db: DB, slug: string): ProductRow | undefined {
  return db.prepare(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.status = 'published'`).get(slug) as ProductRow | undefined;
}

export function getProductRowById(db: DB, id: string, includeUnpublished = false): ProductRow | undefined {
  const clause = includeUnpublished ? "WHERE p.id = ?" : "WHERE p.id = ? AND p.status = 'published'";
  return db.prepare(`${PRODUCT_SELECT} ${clause}`).get(id) as ProductRow | undefined;
}

export function serializeDetail(db: DB, row: ProductRow): ProductDetail {
  const summary = serializeSummary(row);
  const variants = getVariants(db, row.id);
  const images = getImages(db, row.id);
  const breakdown = db
    .prepare(
      "SELECT rating AS stars, COUNT(*) AS count FROM reviews WHERE product_id = ? AND status = 'approved' GROUP BY rating"
    )
    .all(row.id) as Array<{ stars: number; count: number }>;
  const counts = new Map(breakdown.map((entry) => [entry.stars, entry.count]));
  return {
    ...summary,
    description: row.description,
    seoTitle: row.seo_title || `${row.name} | Sree Collections`,
    seoDescription: row.seo_description || row.short_description,
    images: images.length ? images : row.image_url ? [{ url: row.image_url, alt: row.image_alt }] : [],
    variants,
    specifications: {
      weightGrams: row.weight_g,
      dimensions: { lengthMm: row.length_mm, widthMm: row.width_mm, heightMm: row.height_mm },
      hsnCode: row.hsn_code,
      taxRateBps: row.tax_rate_bps,
      preparationDays: row.preparation_days,
      returnEligible: Boolean(row.return_eligible),
      fragile: Boolean(row.fragile),
      giftWrappable: Boolean(row.gift_wrappable),
      personalizable: Boolean(row.personalizable)
    },
    ratingBreakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: counts.get(stars) ?? 0 }))
  };
}

export type ProductFilters = {
  category?: string;
  q?: string;
  tag?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  page: number;
  pageSize: number;
  offset: number;
  personalizable?: boolean;
  giftWrappable?: boolean;
  inStock?: boolean;
  featured?: boolean;
};

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function listProducts(db: DB, filters: ProductFilters) {
  const where: string[] = ["p.status = 'published'"];
  const params: SqlValue[] = [];

  if (filters.category) {
    where.push("c.slug = ?");
    params.push(filters.category);
  }
  if (filters.tag) {
    where.push("(',' || p.tags || ',') LIKE ?");
    params.push(`%,${filters.tag},%`);
  }
  if (filters.q) {
    const term = `%${escapeLike(filters.q.trim())}%`;
    where.push(
      `(p.name LIKE ? ESCAPE '\\' OR p.sku LIKE ? ESCAPE '\\' OR p.short_description LIKE ? ESCAPE '\\'
        OR p.description LIKE ? ESCAPE '\\' OR p.tags LIKE ? ESCAPE '\\' OR p.search_keywords LIKE ? ESCAPE '\\')`
    );
    params.push(term, term, term, term, term, term);
  }
  const price = EFFECTIVE_PRICE;
  if (filters.minPrice !== undefined) {
    where.push(`${price} >= ?`);
    params.push(filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    where.push(`${price} <= ?`);
    params.push(filters.maxPrice);
  }
  if (filters.personalizable !== undefined) {
    where.push("p.personalizable = ?");
    params.push(filters.personalizable ? 1 : 0);
  }
  if (filters.giftWrappable !== undefined) {
    where.push("p.gift_wrappable = ?");
    params.push(filters.giftWrappable ? 1 : 0);
  }
  if (filters.featured !== undefined) {
    where.push("p.featured = ?");
    params.push(filters.featured ? 1 : 0);
  }
  if (filters.inStock) {
    where.push(`(
      (EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = p.id AND sv.is_active = 1)
        AND (SELECT SUM(sv.stock_quantity) FROM product_variants sv WHERE sv.product_id = p.id AND sv.is_active = 1) > 0)
      OR (NOT EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = p.id AND sv.is_active = 1)
        AND p.stock_quantity > 0)
    )`);
  }

  const sorts: Record<string, string> = {
    price_asc: `${price} ASC, p.name ASC`,
    price_desc: `${price} DESC, p.name ASC`,
    newest: "p.published_at DESC, p.created_at DESC",
    bestselling: "sold DESC, p.featured DESC",
    rating: "rating_avg DESC, rating_count DESC",
    discount: `((COALESCE(p.mrp, 0) - ${price}) * 1.0 / NULLIF(COALESCE(p.mrp, 0), 0)) DESC`,
    featured: "p.featured DESC, p.created_at DESC"
  };

  const whereSql = where.join(" AND ");
  const countRow = db
    .prepare(`SELECT COUNT(*) AS total FROM products p JOIN categories c ON c.id = p.category_id WHERE ${whereSql}`)
    .get(...params) as { total: number };

  const listParams: SqlValue[] = [...params];
  let orderSql = sorts[filters.sort ?? ""] ?? "";
  if (!orderSql) {
    orderSql = filters.q
      ? "CASE WHEN p.name LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END ASC, p.featured DESC, p.created_at DESC"
      : "p.featured DESC, p.created_at DESC";
    if (filters.q) listParams.push(`%${escapeLike(filters.q.trim())}%`);
  }
  const rows = db
    .prepare(`${PRODUCT_SELECT} WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`)
    .all(...listParams, filters.pageSize, filters.offset) as ProductRow[];

  return {
    items: rows.map(serializeSummary),
    total: countRow.total,
    page: filters.page,
    pageSize: filters.pageSize,
    pages: Math.max(1, Math.ceil(countRow.total / filters.pageSize))
  };
}

export function listCategories(db: DB) {
  return db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.description, c.sort_order,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.status = 'published') AS product_count
       FROM categories c WHERE c.is_active = 1 ORDER BY c.sort_order, c.name`
    )
    .all() as Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    sort_order: number;
    product_count: number;
  }>;
}

export function popularTags(db: DB, limit = 20): string[] {
  const rows = db
    .prepare("SELECT tags FROM products WHERE status = 'published' AND tags <> ''")
    .all() as Array<{ tags: string }>;
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags.split(",")) {
      const clean = tag.trim();
      if (!clean) continue;
      counts.set(clean, (counts.get(clean) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function approvedRating(db: DB, productId: string) {
  const row = db
    .prepare("SELECT AVG(rating) AS average, COUNT(*) AS count FROM reviews WHERE product_id = ? AND status = 'approved'")
    .get(productId) as { average: number | null; count: number };
  return { average: row.average ? Math.round(row.average * 10) / 10 : 0, count: row.count };
}
