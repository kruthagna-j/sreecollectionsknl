import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { newId, nowIso, setSetting, transaction, type DB } from "../db.js";
import { audit } from "../lib/audit.js";
import { requireAuth, requireRole, type AuthedRequest } from "../lib/auth.js";
import { getImages } from "../lib/catalog.js";
import { AppError, pageParams, parseBody, route, slugify } from "../lib/http.js";
import { renderInvoice } from "../lib/invoice.js";
import { renderInvoicePdf } from "../lib/invoice-pdf.js";
import { listOrderNotifications, resendOrderEmail, type NotificationChannel } from "../lib/notifications.js";
import { canTransition, parseAddress, restockOrder, serializeOrder, type OrderRow } from "../lib/orders.js";

const PRODUCT_STATUSES = ["draft", "scheduled", "published", "unpublished", "archived", "discontinued"] as const;

// A resend is a real outbound email, so one staff member cannot hammer the shop's mail quota.
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many resend attempts. Please wait a few minutes." } }
});
const productStatus = z.enum(PRODUCT_STATUSES);

const imageSchema = z.object({
  url: z.string().trim().max(500).regex(/^(\/|https:\/\/)/, "Use a local /path or an https:// URL."),
  alt: z.string().trim().min(1, "Add image alt text.").max(200)
});

const variantInputSchema = z.object({
  id: z.string().max(80).optional(),
  name: z.string().trim().min(1).max(80),
  sku: z.string().trim().min(1).max(60),
  price: z.number().int().min(0).nullable().optional(),
  stock: z.number().int().min(0).max(1000000)
});

const productInputSchema = z.object({
  name: z.string().trim().min(2).max(140),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens.").max(80).optional(),
  sku: z.string().trim().min(2).max(60),
  categoryId: z.string().min(1),
  shortDescription: z.string().trim().max(300).default(""),
  description: z.string().trim().max(6000).default(""),
  price: z.number().int().min(1, "Enter a selling price."),
  salePrice: z.number().int().min(0).nullable().optional(),
  mrp: z.number().int().min(0).nullable().optional(),
  costPrice: z.number().int().min(0).nullable().optional(),
  taxRateBps: z.number().int().min(0).max(2800).default(500),
  hsnCode: z.string().trim().max(20).optional().default(""),
  stockQuantity: z.number().int().min(0).max(1000000).default(0),
  lowStockThreshold: z.number().int().min(0).max(10000).default(5),
  weightG: z.number().int().min(0).max(100000).default(400),
  status: productStatus.default("draft"),
  featured: z.boolean().default(false),
  giftWrappable: z.boolean().default(true),
  personalizable: z.boolean().default(false),
  returnEligible: z.boolean().default(true),
  fragile: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(30)).max(30).default([]),
  imageAlt: z.string().trim().max(200).default(""),
  seoTitle: z.string().trim().max(160).default(""),
  seoDescription: z.string().trim().max(300).default(""),
  searchKeywords: z.string().trim().max(500).default(""),
  lengthMm: z.number().int().min(0).max(100000).default(0),
  widthMm: z.number().int().min(0).max(100000).default(0),
  heightMm: z.number().int().min(0).max(100000).default(0),
  preparationDays: z.number().int().min(0).max(90).default(1),
  images: z.array(imageSchema).max(10).default([]),
  variants: z.array(variantInputSchema.omit({ id: true })).max(30).default([])
});

/**
 * PATCH bodies must stay truly partial. `schema.partial()` keeps every create-time `.default()`,
 * so an omitted field would be filled in and overwrite the stored row — a price edit would
 * unpublish the product, zero its stock and drop its images. Validating only the keys the
 * admin actually sent leaves every other column untouched.
 */
function partialUpdate<S extends z.ZodObject<z.ZodRawShape>>(schema: S, body: unknown): Partial<z.output<S>> {
  const sent = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const fields = { ...schema.shape };
  for (const key of Object.keys(fields)) {
    if (!(key in sent)) delete fields[key];
  }
  return parseBody(z.object(fields) as unknown as z.ZodType<Partial<z.output<S>>>, body);
}

const productUpdateSchema = productInputSchema;

const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{6,40}$/, "Use 6 to 40 letters, numbers, hyphens or underscores.")
    .transform((value) => value.toUpperCase()),
  kind: z.enum(["percent", "fixed", "free_shipping"]),
  value: z.number().int().min(0).default(0),
  minSubtotal: z.number().int().min(0).default(0),
  maxDiscount: z.number().int().min(0).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perEmailLimit: z.number().int().min(1).max(100).default(1),
  firstOrderOnly: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

const zoneSchema = z.object({
  name: z.string().trim().min(2).max(80),
  pincodes: z.string().trim().min(6).max(3000),
  fee: z.number().int().min(0),
  freeAbove: z.number().int().min(0).nullable().optional(),
  etaDaysMin: z.number().int().min(0).max(60).default(1),
  etaDaysMax: z.number().int().min(0).max(60).default(3),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0)
});

const RETURN_TRANSITIONS: Record<string, string[]> = {
  requested: ["approved", "rejected", "closed"],
  approved: ["received", "refunded", "closed"],
  received: ["refunded", "closed"],
  rejected: [],
  refunded: [],
  closed: []
};

const orderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"]),  note: z.string().trim().max(500).optional().default(""),
  trackingNumber: z.string().trim().max(80).optional(),
  trackingUrl: z.string().trim().max(500).regex(/^https:\/\//, "Use an https:// tracking link.").optional().or(z.literal(""))
});

const noteSchema = z.object({ note: z.string().trim().min(1).max(1000) });

const storeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(120),
  supportEmail: z.string().trim().max(160),
  supportPhone: z.string().trim().max(40),
  supportWhatsApp: z.string().trim().max(20).optional().default(""),
  address: z.string().trim().max(500),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional()
});

const publicProfileSchema = z.object({
  rating: z.number().min(0).max(5).nullable(),
  ratingCount: z.number().int().min(0).max(1_000_000).nullable(),
  yearsInBusiness: z.number().int().min(0).max(200).nullable(),
  locality: z.string().trim().max(120),
  closesAt: z
    .string()
    .trim()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 21:30.")
    .or(z.literal("")),
  categories: z.array(z.string().trim().max(60)).max(6)
});

const notificationsSchema = z.object({
  sendCustomerEmail: z.boolean(),
  sendOwnerEmail: z.boolean(),
  ownerEmail: z
    .string()
    .trim()
    .max(160)
    .refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid owner email address."),
  whatsappAutoOpen: z.boolean()
});

const taxSchema = z.object({
  inclusive: z.boolean(),
  defaultRateBps: z.number().int().min(0).max(2800),
  gstin: z.string().trim().max(20).optional().default(""),
  state: z.string().trim().max(80).optional().default(""),
  note: z.string().trim().max(500).optional().default("")
});

const giftWrapSchema = z.object({
  fee: z.number().int().min(0),
  label: z.string().trim().max(120)
});

const codSchema = z.object({
  enabled: z.boolean(),
  maxTotal: z.number().int().min(0),
  fee: z.number().int().min(0)
});

const returnsSchema = z.object({
  enabled: z.boolean(),
  windowDays: z.number().int().min(0).max(60),
  note: z.string().trim().max(500).optional().default("")
});

const operationalSchema = z.object({
  maintenance: z.boolean(),
  message: z.string().trim().max(500).optional().default("")
});

const homeSchema = z.object({
  announcement: z.string().trim().max(200).optional().default(""),
  hero: z
    .object({
      eyebrow: z.string().trim().max(120),
      title: z.string().trim().max(160),
      subtitle: z.string().trim().max(500),
      ctaLabel: z.string().trim().max(60),
      ctaHref: z.string().trim().max(200),
      image: z.string().trim().max(500)
    })
    .nullable()
    .optional(),
  sections: z
    .array(
      z.object({
        id: z.string().trim().max(40),
        type: z.string().trim().max(40),
        title: z.string().trim().max(120),
        subtitle: z.string().trim().max(300).optional().default(""),
        enabled: z.boolean(),
        order: z.number().int().min(0).max(100)
      })
    )
    .max(30)
});

const SETTINGS_SCHEMAS: Record<string, z.ZodTypeAny> = {
  store: storeSchema,
  publicProfile: publicProfileSchema,
  notifications: notificationsSchema,
  tax: taxSchema,
  giftWrap: giftWrapSchema,
  cod: codSchema,
  returns: returnsSchema,
  operational: operationalSchema,
  home: homeSchema
};

function uniqueSlug(db: DB, base: string, table: "products" | "categories", excludeId?: string): string {
  const fallback = table === "products" ? "product" : "category";
  const seed = slugify(base) || fallback;
  let candidate = seed;
  let counter = 2;
  while (true) {
    const row = excludeId
      ? db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id <> ?`).get(candidate, excludeId)
      : db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).get(candidate);
    if (!row) return candidate;
    candidate = `${seed}-${counter}`;
    counter += 1;
  }
}

function adminProduct(db: DB, id: string) {
  const row = db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?`
    )
    .get(id) as (Record<string, unknown> & { id: string }) | undefined;
  if (!row) return null;
  const variants = db
    .prepare("SELECT id, name, sku, price, stock_quantity, is_active, sort_order FROM product_variants WHERE product_id = ? ORDER BY sort_order")
    .all(id) as Array<{
    id: string;
    name: string;
    sku: string;
    price: number | null;
    stock_quantity: number;
    is_active: number;
    sort_order: number;
  }>;
  const images = getImages(db, id);
  const stock =
    variants.filter((variant) => variant.is_active).length > 0
      ? variants.filter((variant) => variant.is_active).reduce((sum, variant) => sum + variant.stock_quantity, 0)
      : Number(row.stock_quantity);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sku: row.sku,
    categoryId: row.category_id,
    category: { id: row.category_id, name: row.category_name, slug: row.category_slug },
    shortDescription: row.short_description,
    description: row.description,
    price: row.price,
    salePrice: row.sale_price,
    mrp: row.mrp,
    costPrice: row.cost_price,
    taxRateBps: row.tax_rate_bps,
    hsnCode: row.hsn_code ?? "",
    stock,
    stockQuantity: row.stock_quantity,
    lowStockThreshold: row.low_stock_threshold,
    weightG: row.weight_g,
    status: row.status,
    featured: Boolean(row.featured),
    giftWrappable: Boolean(row.gift_wrappable),
    personalizable: Boolean(row.personalizable),
    returnEligible: Boolean(row.return_eligible),
    fragile: Boolean(row.fragile),
    tags: String(row.tags ?? "").split(",").filter(Boolean),
    imageAlt: row.image_alt,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    searchKeywords: row.search_keywords,
    dimensions: { lengthMm: row.length_mm, widthMm: row.width_mm, heightMm: row.height_mm },
    preparationDays: row.preparation_days,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    images,
    variants: variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      stock: variant.stock_quantity,
      isActive: Boolean(variant.is_active)
    }))
  };
}

export function adminRoutes(db: DB): Router {
  const router = Router();
  router.use(requireAuth(db));

  router.get(
    "/summary",
    requireRole("finance"),
    route((_req, res) => {
      const orderCounts = db
        .prepare("SELECT status, COUNT(*) AS count FROM orders GROUP BY status")
        .all() as Array<{ status: string; count: number }>;
      const revenue = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total ELSE 0 END), 0) AS order_value,
             COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) AS collected,
             COALESCE(SUM(CASE WHEN payment_status = 'cod_pending' AND status NOT IN ('cancelled') THEN total ELSE 0 END), 0) AS pending_cod
           FROM orders`
        )
        .get() as { order_value: number; collected: number; pending_cod: number };
      const counts = db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers,
             (SELECT COUNT(*) FROM products WHERE status <> 'archived') AS products,
             (SELECT COUNT(*) FROM reviews WHERE status = 'pending') AS pending_reviews,
             (SELECT COUNT(*) FROM support_tickets WHERE status = 'open') AS open_tickets,
             (SELECT COUNT(*) FROM return_requests WHERE status = 'requested') AS open_returns`
        )
        .get() as {
        customers: number;
        products: number;
        pending_reviews: number;
        open_tickets: number;
        open_returns: number;
      };

      const days: Array<{ day: string; orders: number; total: number }> = [];
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - 13);
      const sales = db
        .prepare(
          `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS orders, SUM(total) AS total
           FROM orders WHERE status <> 'cancelled' AND created_at >= ?
           GROUP BY day`
        )
        .all(start.toISOString()) as Array<{ day: string; orders: number; total: number }>;
      const salesMap = new Map(sales.map((entry) => [entry.day, entry]));
      for (let index = 0; index < 14; index += 1) {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + index);
        const key = date.toISOString().slice(0, 10);
        const entry = salesMap.get(key);
        days.push({ day: key, orders: entry?.orders ?? 0, total: entry?.total ?? 0 });
      }

      const recentOrders = db
        .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 8")
        .all() as OrderRow[];
      const topProducts = db
        .prepare(
          `SELECT p.id, p.name, p.slug, SUM(oi.quantity) AS quantity, SUM(oi.line_total) AS revenue
           FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
           WHERE o.status <> 'cancelled'
           GROUP BY p.id ORDER BY quantity DESC LIMIT 5`
        )
        .all() as Array<{ id: string; name: string; slug: string; quantity: number; revenue: number }>;

      const published = db
        .prepare(
          `SELECT p.id, p.name, p.sku, p.stock_quantity, p.low_stock_threshold,
             (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_count,
             (SELECT SUM(v.stock_quantity) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_stock
           FROM products p WHERE p.status = 'published'`
        )
        .all() as Array<{
        id: string;
        name: string;
        sku: string;
        stock_quantity: number;
        low_stock_threshold: number;
        variant_count: number;
        variant_stock: number | null;
      }>;
      const lowStock = published
        .map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.sku,
          stock: product.variant_count ? product.variant_stock ?? 0 : product.stock_quantity,
          threshold: product.low_stock_threshold
        }))
        .filter((product) => product.stock <= product.threshold)
        .sort((left, right) => left.stock - right.stock)
        .slice(0, 8);

      res.json({
        orders: {
          total: orderCounts.reduce((sum, entry) => sum + entry.count, 0),
          byStatus: Object.fromEntries(orderCounts.map((entry) => [entry.status, entry.count]))
        },
        revenue: {
          orderValue: revenue.order_value,
          collected: revenue.collected,
          pendingCod: revenue.pending_cod
        },
        counts,
        salesLast14Days: days,
        recentOrders: recentOrders.map((order) => ({
          id: order.id,
          orderNumber: order.order_number,
          customer: parseAddress(order.shipping_address).recipient || order.email,
          email: order.email,
          status: order.status,
          total: order.total,
          createdAt: order.created_at
        })),
        topProducts,
        lowStock,
        note:
          "Collected revenue reflects orders marked paid. Cash-on-delivery orders become paid only when the store marks them delivered."
      });
    })
  );

  router.get(
    "/products",
    requireRole("catalogue"),
    route((req, res) => {
      const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>, 50);
      const q = String(req.query.q ?? "").trim();
      const status = String(req.query.status ?? "").trim();
      const where: string[] = ["1 = 1"];
      const params: Array<string | number> = [];
      if (q) {
        where.push("(p.name LIKE ? OR p.sku LIKE ?)");
        params.push(`%${q}%`, `%${q}%`);
      }
      if (PRODUCT_STATUSES.includes(status as (typeof PRODUCT_STATUSES)[number])) {
        where.push("p.status = ?");
        params.push(status);
      }
      const whereSql = where.join(" AND ");
      const count = db
        .prepare(`SELECT COUNT(*) AS total FROM products p WHERE ${whereSql}`)
        .get(...params) as { total: number };
      const rows = db
        .prepare(
          `SELECT p.*, c.name AS category_name,
             (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort_order LIMIT 1) AS image_url,
             (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_count,
             (SELECT SUM(stock_quantity) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_stock
           FROM products p JOIN categories c ON c.id = p.category_id
           WHERE ${whereSql} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, offset) as Array<Record<string, unknown>>;
      res.json({
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          sku: row.sku,
          category: row.category_name,
          price: row.price,
          salePrice: row.sale_price,
          costPrice: row.cost_price,
          status: row.status,
          stock: Number(row.variant_count) > 0 ? Number(row.variant_stock ?? 0) : Number(row.stock_quantity),
          variantCount: Number(row.variant_count),
          featured: Boolean(row.featured),
          image: row.image_url,
          updatedAt: row.updated_at
        })),
        total: count.total,
        page,
        pageSize,
        pages: Math.max(1, Math.ceil(count.total / pageSize))
      });
    })
  );

  router.get(
    "/products/:id",
    requireRole("catalogue"),
    route((req, res) => {
      const product = adminProduct(db, String(req.params.id));
      if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "This product could not be found.");
      res.json({ product });
    })
  );

  router.post(
    "/products",
    requireRole("catalogue"),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(productInputSchema, req.body);
      const category = db.prepare("SELECT id FROM categories WHERE id = ?").get(input.categoryId);
      if (!category) throw new AppError(400, "CATEGORY_NOT_FOUND", "Choose a valid category.");
      if (input.mrp && input.salePrice && input.salePrice > input.mrp) {
        throw new AppError(400, "INVALID_PRICING", "The sale price cannot be above the MRP.");
      }
      const id = newId();
      const slug = uniqueSlug(db, input.slug ?? input.name, "products");
      const stockQuantity = input.variants.length ? 0 : input.stockQuantity;
      try {
        transaction(db, () => {
          db.prepare(
            `INSERT INTO products
               (id, slug, sku, name, short_description, description, category_id, price, sale_price, mrp, cost_price,
                tax_rate_bps, hsn_code, stock_quantity, low_stock_threshold, weight_g, status, featured,
                gift_wrappable, personalizable, tags, image_alt, seo_title, seo_description, search_keywords,
                length_mm, width_mm, height_mm, preparation_days, return_eligible, fragile, published_at,
                created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            id,
            slug,
            input.sku,
            input.name,
            input.shortDescription,
            input.description,
            input.categoryId,
            input.price,
            input.salePrice ?? null,
            input.mrp ?? null,
            input.costPrice ?? null,
            input.taxRateBps,
            input.hsnCode || null,
            stockQuantity,
            input.lowStockThreshold,
            input.weightG,
            input.status,
            input.featured ? 1 : 0,
            input.giftWrappable ? 1 : 0,
            input.personalizable ? 1 : 0,
            input.tags.join(","),
            input.imageAlt,
            input.seoTitle,
            input.seoDescription,
            input.searchKeywords,
            input.lengthMm,
            input.widthMm,
            input.heightMm,
            input.preparationDays,
            input.returnEligible ? 1 : 0,
            input.fragile ? 1 : 0,
            input.status === "published" ? nowIso() : null,
            nowIso(),
            nowIso()
          );
          const imageInsert = db.prepare(
            "INSERT INTO product_images (id, product_id, url, alt, sort_order) VALUES (?, ?, ?, ?, ?)"
          );
          input.images.forEach((image, index) => imageInsert.run(newId(), id, image.url, image.alt, index));
          const variantInsert = db.prepare(
            "INSERT INTO product_variants (id, product_id, name, sku, price, stock_quantity, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
          );
          input.variants.forEach((variant, index) =>
            variantInsert.run(newId(), id, variant.name, variant.sku, variant.price ?? null, variant.stock, index)
          );
        });
      } catch (error) {
        if (error instanceof Error && /UNIQUE/i.test(error.message)) {
          throw new AppError(409, "DUPLICATE_SKU_OR_SLUG", "The SKU, variant SKU or slug is already in use.");
        }
        throw error;
      }
      audit(db, user.id, "product.created", "product", id, { sku: input.sku });
      res.status(201).json({ product: adminProduct(db, id) });
    })
  );

  router.patch(
    "/products/:id",
    requireRole("catalogue"),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const id = String(req.params.id);
      const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as
        | (Record<string, unknown> & { slug: string; status: string; published_at: string | null })
        | undefined;
      if (!existing) throw new AppError(404, "PRODUCT_NOT_FOUND", "This product could not be found.");
      const input = partialUpdate(productUpdateSchema, req.body);
      if (input.categoryId) {
        const category = db.prepare("SELECT id FROM categories WHERE id = ?").get(input.categoryId);
        if (!category) throw new AppError(400, "CATEGORY_NOT_FOUND", "Choose a valid category.");
      }

      const columns: Record<string, string | number | null> = {};
      const mapping: Array<[keyof typeof input, string]> = [
        ["name", "name"],
        ["sku", "sku"],
        ["categoryId", "category_id"],
        ["shortDescription", "short_description"],
        ["description", "description"],
        ["price", "price"],
        ["salePrice", "sale_price"],
        ["mrp", "mrp"],
        ["costPrice", "cost_price"],
        ["taxRateBps", "tax_rate_bps"],
        ["hsnCode", "hsn_code"],
        ["stockQuantity", "stock_quantity"],
        ["lowStockThreshold", "low_stock_threshold"],
        ["weightG", "weight_g"],
        ["status", "status"],
        ["featured", "featured"],
        ["giftWrappable", "gift_wrappable"],
        ["personalizable", "personalizable"],
        ["returnEligible", "return_eligible"],
        ["fragile", "fragile"],
        ["imageAlt", "image_alt"],
        ["seoTitle", "seo_title"],
        ["seoDescription", "seo_description"],
        ["searchKeywords", "search_keywords"],
        ["lengthMm", "length_mm"],
        ["widthMm", "width_mm"],
        ["heightMm", "height_mm"],
        ["preparationDays", "preparation_days"]
      ];
      for (const [key, column] of mapping) {
        const value = input[key] as unknown;
        if (value === undefined) continue;
        if (typeof value === "boolean") {
          columns[column] = value ? 1 : 0;
        } else if (typeof value === "string" || typeof value === "number" || value === null) {
          columns[column] = value;
        }
      }
      if (input.slug !== undefined && input.slug !== existing.slug) {
        columns.slug = uniqueSlug(db, input.slug, "products", id);
      }
      if (input.tags !== undefined) columns.tags = input.tags.join(",");
      if (input.status === "published" && !existing.published_at) columns.published_at = nowIso();
      columns.updated_at = nowIso();

      const setSql = Object.keys(columns)
        .map((column) => `${column} = ?`)
        .join(", ");
      if (!setSql) throw new AppError(400, "NO_CHANGES", "No changes were provided.");

      try {
        transaction(db, () => {
          db.prepare(`UPDATE products SET ${setSql} WHERE id = ?`).run(...Object.values(columns), id);
          if (input.images !== undefined) {
            db.prepare("DELETE FROM product_images WHERE product_id = ?").run(id);
            const imageInsert = db.prepare(
              "INSERT INTO product_images (id, product_id, url, alt, sort_order) VALUES (?, ?, ?, ?, ?)"
            );
            input.images.forEach((image, index) => imageInsert.run(newId(), id, image.url, image.alt, index));
          }
        });
      } catch (error) {
        if (error instanceof Error && /UNIQUE/i.test(error.message)) {
          throw new AppError(409, "DUPLICATE_SKU_OR_SLUG", "The SKU, variant SKU or slug is already in use.");
        }
        throw error;
      }
      audit(db, user.id, "product.updated", "product", id, { fields: Object.keys(columns) });
      res.json({ product: adminProduct(db, id) });
    })
  );

  router.put(
    "/products/:id/variants",
    requireRole("catalogue"),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const id = String(req.params.id);
      const product = db.prepare("SELECT id FROM products WHERE id = ?").get(id);
      if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "This product could not be found.");
      const input = parseBody(z.object({ variants: z.array(variantInputSchema).max(30) }), req.body);
      const existing = db
        .prepare("SELECT id, stock_quantity FROM product_variants WHERE product_id = ?")
        .all(id) as Array<{ id: string; stock_quantity: number }>;
      const existingIds = new Set(existing.map((variant) => variant.id));
      try {
        transaction(db, () => {
          const kept: string[] = [];
          input.variants.forEach((variant, index) => {
            if (variant.id && existingIds.has(variant.id)) {
              const previous = existing.find((entry) => entry.id === variant.id)!;
              db.prepare(
                "UPDATE product_variants SET name = ?, sku = ?, price = ?, stock_quantity = ?, sort_order = ?, is_active = 1 WHERE id = ?"
              ).run(variant.name, variant.sku, variant.price ?? null, variant.stock, index, variant.id);
              if (previous.stock_quantity !== variant.stock) {
                db.prepare(
                  `INSERT INTO stock_movements (id, product_id, variant_id, delta, reason, reference, actor_id, created_at)
                   VALUES (?, ?, ?, ?, 'variant_update', '', ?, ?)`
                ).run(
                  newId(),
                  id,
                  variant.id,
                  variant.stock - previous.stock_quantity,
                  user.id,
                  nowIso()
                );
              }
              kept.push(variant.id);
            } else {
              const newVariantId = newId();
              db.prepare(
                "INSERT INTO product_variants (id, product_id, name, sku, price, stock_quantity, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
              ).run(newVariantId, id, variant.name, variant.sku, variant.price ?? null, variant.stock, index);
              db.prepare(
                `INSERT INTO stock_movements (id, product_id, variant_id, delta, reason, reference, actor_id, created_at)
                 VALUES (?, ?, ?, ?, 'variant_created', '', ?, ?)`
              ).run(newId(), id, newVariantId, variant.stock, user.id, nowIso());
              kept.push(newVariantId);
            }
          });
          for (const variant of existing) {
            if (!kept.includes(variant.id)) {
              db.prepare("UPDATE product_variants SET is_active = 0 WHERE id = ?").run(variant.id);
            }
          }
          db.prepare("UPDATE products SET updated_at = ? WHERE id = ?").run(nowIso(), id);
        });
      } catch (error) {
        if (error instanceof Error && /UNIQUE/i.test(error.message)) {
          throw new AppError(409, "DUPLICATE_VARIANT_SKU", "A variant SKU is already in use.");
        }
        throw error;
      }
      audit(db, user.id, "product.variants_updated", "product", id);
      res.json({ product: adminProduct(db, id) });
    })
  );

  router.post(
    "/products/:id/stock",
    requireRole("catalogue"),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const id = String(req.params.id);
      const input = parseBody(
        z.object({
          variantId: z.string().max(80).optional().default(""),
          delta: z.number().int().min(-100000).max(100000).refine((value) => value !== 0, "Enter a non-zero change."),
          reason: z.string().trim().min(3, "Add a reason.").max(120)
        }),
        req.body
      );
      const product = db.prepare("SELECT id FROM products WHERE id = ?").get(id);
      if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "This product could not be found.");

      // The delta is applied by SQLite, not by re-writing a value read a moment earlier, so an
      // adjustment that lands beside a purchase cannot roll back the other's stock change.
      const stock = transaction(db, () => {
        const applied = input.variantId
          ? (() => {
              const variant = db
                .prepare("SELECT id FROM product_variants WHERE id = ? AND product_id = ?")
                .get(input.variantId, id);
              if (!variant) throw new AppError(404, "VARIANT_NOT_FOUND", "This option could not be found.");
              return db
                .prepare(
                  `UPDATE product_variants SET stock_quantity = stock_quantity + ?
                   WHERE id = ? AND stock_quantity + ? >= 0`
                )
                .run(input.delta, input.variantId, input.delta);
            })()
          : db
              .prepare(
                `UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ?
                 WHERE id = ? AND stock_quantity + ? >= 0`
              )
              .run(input.delta, nowIso(), id, input.delta);

        if (applied.changes === 0) throw new AppError(409, "STOCK_BELOW_ZERO", "Stock cannot go below zero.");
        const table = input.variantId ? "product_variants" : "products";
        const row = db
          .prepare(`SELECT stock_quantity FROM ${table} WHERE id = ?`)
          .get(input.variantId || id) as { stock_quantity: number };
        db.prepare(
          `INSERT INTO stock_movements (id, product_id, variant_id, delta, reason, reference, actor_id, created_at)
           VALUES (?, ?, ?, ?, ?, '', ?, ?)`
        ).run(newId(), id, input.variantId, input.delta, input.reason, user.id, nowIso());
        return row.stock_quantity;
      });

      audit(db, user.id, "stock.adjusted", "product", id, {
        delta: input.delta,
        variantId: input.variantId || null,
        reason: input.reason
      });
      res.json({ stock });
    })
  );

  router.get(
    "/categories",
    requireRole("catalogue"),
    route((_req, res) => {
      res.json({
        items: db
          .prepare(
            `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
             FROM categories c ORDER BY c.sort_order, c.name`
          )
          .all()
      });
    })
  );

  router.post(
    "/categories",
    requireRole("catalogue"),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(
        z.object({
          name: z.string().trim().min(2).max(80),
          slug: z.string().trim().max(80).optional(),
          description: z.string().trim().max(300).default(""),
          sortOrder: z.number().int().min(0).max(1000).default(0),
          isActive: z.boolean().default(true)
        }),
        req.body
      );
      const id = newId();
      const slug = uniqueSlug(db, input.slug ?? input.name, "categories");
      try {
        db.prepare(
          "INSERT INTO categories (id, slug, name, description, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(id, slug, input.name, input.description, input.sortOrder, input.isActive ? 1 : 0);
      } catch (error) {
        if (error instanceof Error && /UNIQUE/i.test(error.message)) {
          throw new AppError(409, "DUPLICATE_SLUG", "That category URL is already in use.");
        }
        throw error;
      }
      audit(db, user.id, "category.created", "category", id);
      res.status(201).json({ category: db.prepare("SELECT * FROM categories WHERE id = ?").get(id) });
    })
  );

  router.patch(
    "/categories/:id",
    requireRole("catalogue"),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const id = String(req.params.id);
      const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as
        | { id: string; slug: string }
        | undefined;
      if (!existing) throw new AppError(404, "CATEGORY_NOT_FOUND", "This category could not be found.");
      const input = parseBody(
        z.object({
          name: z.string().trim().min(2).max(80).optional(),
          slug: z.string().trim().max(80).optional(),
          description: z.string().trim().max(300).optional(),
          sortOrder: z.number().int().min(0).max(1000).optional(),
          isActive: z.boolean().optional()
        }),
        req.body
      );
      const columns: Record<string, string | number | null> = {};
      if (input.name !== undefined) columns.name = input.name;
      if (input.description !== undefined) columns.description = input.description;
      if (input.sortOrder !== undefined) columns.sort_order = input.sortOrder;
      if (input.isActive !== undefined) columns.is_active = input.isActive ? 1 : 0;
      if (input.slug !== undefined && input.slug !== existing.slug) {
        columns.slug = uniqueSlug(db, input.slug, "categories", id);
      }
      if (!Object.keys(columns).length) throw new AppError(400, "NO_CHANGES", "No changes were provided.");
      db.prepare(
        `UPDATE categories SET ${Object.keys(columns)
          .map((column) => `${column} = ?`)
          .join(", ")} WHERE id = ?`
      ).run(...Object.values(columns), id);
      audit(db, user.id, "category.updated", "category", id);
      res.json({ category: db.prepare("SELECT * FROM categories WHERE id = ?").get(id) });
    })
  );

  router.get(
    "/orders",
    requireRole("orders", "finance"),
    route((req, res) => {
      const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>, 50);
      const status = String(req.query.status ?? "").trim();
      const q = String(req.query.q ?? "").trim();
      const where: string[] = ["1 = 1"];
      const params: Array<string | number> = [];
      if (status) {
        where.push("o.status = ?");
        params.push(status);
      }
      if (q) {
        where.push("(o.order_number LIKE ? OR o.email LIKE ? OR o.phone LIKE ?)");
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      const whereSql = where.join(" AND ");
      const count = db.prepare(`SELECT COUNT(*) AS total FROM orders o WHERE ${whereSql}`).get(...params) as {
        total: number;
      };
      const rows = db
        .prepare(
          `SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
           FROM orders o WHERE ${whereSql} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, offset) as Array<OrderRow & { item_count: number }>;
      res.json({
        items: rows.map((order) => ({
          id: order.id,
          orderNumber: order.order_number,
          customer: parseAddress(order.shipping_address).recipient || order.email,
          email: order.email,
          phone: order.phone,
          status: order.status,
          paymentMethod: order.payment_method,
          paymentStatus: order.payment_status,
          total: order.total,
          itemCount: order.item_count,
          createdAt: order.created_at
        })),
        total: count.total,
        page,
        pageSize,
        pages: Math.max(1, Math.ceil(count.total / pageSize))
      });
    })
  );

  router.get(
    "/orders/:id",
    requireRole("orders", "finance"),
    route((req, res) => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ? OR order_number = ?").get(
        String(req.params.id),
        String(req.params.id).toUpperCase()
      ) as OrderRow | undefined;
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "This order could not be found.");
      res.json({
        order: serializeOrder(db, order, { admin: true }),
        emailLog: listOrderNotifications(db, order.id)
      });
    })
  );

  router.post(
    "/orders/:id/status",
    requireRole("orders"),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(orderStatusSchema, req.body);
      const order = db
        .prepare("SELECT * FROM orders WHERE id = ? OR order_number = ?")
        .get(String(req.params.id), String(req.params.id).toUpperCase()) as OrderRow | undefined;
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "This order could not be found.");
      if (order.status === input.status) throw new AppError(409, "NO_STATUS_CHANGE", "The order is already in that status.");
      if (!canTransition(order.status, input.status)) {
        throw new AppError(409, "INVALID_TRANSITION", `An order in ${order.status} cannot move to ${input.status}.`);
      }
      const timestamp = nowIso();
      transaction(db, () => {
        db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(input.status, timestamp, order.id);
        if (input.trackingNumber !== undefined) {
          db.prepare("UPDATE orders SET tracking_number = ?, tracking_url = ? WHERE id = ?").run(
            input.trackingNumber || null,
            input.trackingUrl || null,
            order.id
          );
        }
        if (input.status === "delivered" && order.payment_method === "cod") {
          db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").run(order.id);
        }
        if (input.status === "cancelled") {
          restockOrder(db, order, user.id, "cancel");
        }
        db.prepare(
          "INSERT INTO order_events (id, order_id, status, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(newId(), order.id, input.status, input.note || "", user.id, timestamp);
      });
      audit(db, user.id, `order.status_${input.status}`, "order", order.id, {
        orderNumber: order.order_number,
        from: order.status,
        note: input.note
      });
      const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id) as OrderRow;
      res.json({ order: serializeOrder(db, updated, { admin: true }) });
    })
  );

  router.post(
    "/orders/:id/note",
    requireRole("orders"),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(noteSchema, req.body);
      const order = db.prepare("SELECT * FROM orders WHERE id = ? OR order_number = ?").get(
        String(req.params.id),
        String(req.params.id).toUpperCase()
      ) as OrderRow | undefined;
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "This order could not be found.");
      db.prepare("UPDATE orders SET admin_note = ?, updated_at = ? WHERE id = ?").run(input.note, nowIso(), order.id);
      audit(db, user.id, "order.note_added", "order", order.id, { orderNumber: order.order_number });
      res.json({ ok: true });
    })
  );

  router.get(
    "/orders/:id/invoice",
    requireRole("orders", "finance"),
    route((req, res) => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ? OR order_number = ?").get(
        String(req.params.id),
        String(req.params.id).toUpperCase()
      ) as OrderRow | undefined;
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "This order could not be found.");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
      res.setHeader("Cache-Control", "no-store");
      res.send(renderInvoice(db, order));
    })
  );

  router.get(
    "/orders/:id/invoice.pdf",
    requireRole("orders", "finance"),
    route(async (req, res) => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ? OR order_number = ?").get(
        String(req.params.id),
        String(req.params.id).toUpperCase()
      ) as OrderRow | undefined;
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "This order could not be found.");
      const pdf = await renderInvoicePdf(db, order);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="invoice-${order.order_number}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(pdf);
    })
  );

  router.get(
    "/orders/:id/notifications",
    requireRole("orders", "finance", "support"),
    route((req, res) => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ? OR order_number = ?").get(
        String(req.params.id),
        String(req.params.id).toUpperCase()
      ) as OrderRow | undefined;
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "This order could not be found.");
      res.json({ items: listOrderNotifications(db, order.id) });
    })
  );

  router.post(
    "/orders/:id/notifications/resend",
    requireRole("orders", "support"),
    resendLimiter,
    route(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(z.object({ channel: z.enum(["email_customer", "email_owner"]) }), req.body);
      const order = db.prepare("SELECT * FROM orders WHERE id = ? OR order_number = ?").get(
        String(req.params.id),
        String(req.params.id).toUpperCase()
      ) as OrderRow | undefined;
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "This order could not be found.");
      const result = await resendOrderEmail(db, order, input.channel as NotificationChannel);
      audit(db, user.id, "order.notification_resend", "order", order.id, {
        orderNumber: order.order_number,
        channel: input.channel,
        status: result.status
      });
      if (result.status === "not_configured") {
        throw new AppError(
          503,
          "EMAIL_NOT_CONFIGURED",
          "Email is not configured on this server. Add SMTP_URL and SMTP_FROM, then try again."
        );
      }
      res.json({ item: result.row, order: serializeOrder(db, order, { admin: true }) });
    })
  );

  router.get(
    "/coupons",
    requireRole(),
    route((_req, res) => {
      const rows = db
        .prepare(
          `SELECT c.*, (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id) AS redemptions
           FROM coupons c ORDER BY c.created_at DESC`
        )
        .all() as Array<Record<string, unknown>>;
      res.json({
        items: rows.map((row) => ({
          id: row.id,
          code: row.code,
          kind: row.kind,
          value: row.value,
          minSubtotal: row.min_subtotal,
          maxDiscount: row.max_discount,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          usageLimit: row.usage_limit,
          perEmailLimit: row.per_email_limit,
          firstOrderOnly: Boolean(row.first_order_only),
          isActive: Boolean(row.is_active),
          redemptions: row.redemptions,
          createdAt: row.created_at
        }))
      });
    })
  );

  router.post(
    "/coupons",
    requireRole(),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(couponSchema, req.body);
      if (input.kind === "percent" && (input.value < 1 || input.value > 10000)) {
        throw new AppError(400, "INVALID_COUPON", "A percentage coupon must be between 0.01% and 100%.");
      }
      if (input.kind === "fixed" && input.value < 1) {
        throw new AppError(400, "INVALID_COUPON", "Enter a discount amount.");
      }
      const id = newId();
      try {
        db.prepare(
          `INSERT INTO coupons
             (id, code, kind, value, min_subtotal, max_discount, starts_at, ends_at, usage_limit, per_email_limit,
              first_order_only, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          input.code,
          input.kind,
          input.value,
          input.minSubtotal,
          input.maxDiscount ?? null,
          input.startsAt ?? null,
          input.endsAt ?? null,
          input.usageLimit ?? null,
          input.perEmailLimit,
          input.firstOrderOnly ? 1 : 0,
          input.isActive ? 1 : 0,
          nowIso()
        );
      } catch (error) {
        if (error instanceof Error && /UNIQUE/i.test(error.message)) {
          throw new AppError(409, "DUPLICATE_COUPON", "A coupon with that code already exists.");
        }
        throw error;
      }
      audit(db, user.id, "coupon.created", "coupon", id, { code: input.code });
      res.status(201).json({ coupon: db.prepare("SELECT * FROM coupons WHERE id = ?").get(id) });
    })
  );

  router.patch(
    "/coupons/:id",
    requireRole(),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const id = String(req.params.id);
      const existing = db.prepare("SELECT id FROM coupons WHERE id = ?").get(id);
      if (!existing) throw new AppError(404, "COUPON_NOT_FOUND", "This coupon could not be found.");
      const input = partialUpdate(couponSchema, req.body);
      const columns: Record<string, string | number | null> = {};
      const mapping: Array<[keyof typeof input, string]> = [
        ["code", "code"],
        ["kind", "kind"],
        ["value", "value"],
        ["minSubtotal", "min_subtotal"],
        ["maxDiscount", "max_discount"],
        ["startsAt", "starts_at"],
        ["endsAt", "ends_at"],
        ["usageLimit", "usage_limit"],
        ["perEmailLimit", "per_email_limit"],
        ["firstOrderOnly", "first_order_only"],
        ["isActive", "is_active"]
      ];
      for (const [key, column] of mapping) {
        const value = input[key];
        if (value === undefined) continue;
        columns[column] = typeof value === "boolean" ? (value ? 1 : 0) : value;
      }
      if (!Object.keys(columns).length) throw new AppError(400, "NO_CHANGES", "No changes were provided.");
      try {
        db.prepare(
          `UPDATE coupons SET ${Object.keys(columns)
            .map((column) => `${column} = ?`)
            .join(", ")} WHERE id = ?`
        ).run(...Object.values(columns), id);
      } catch (error) {
        if (error instanceof Error && /UNIQUE/i.test(error.message)) {
          throw new AppError(409, "DUPLICATE_COUPON", "A coupon with that code already exists.");
        }
        throw error;
      }
      audit(db, user.id, "coupon.updated", "coupon", id, { fields: Object.keys(columns) });
      res.json({ coupon: db.prepare("SELECT * FROM coupons WHERE id = ?").get(id) });
    })
  );

  router.get(
    "/zones",
    requireRole(),
    route((_req, res) => {
      res.json({ items: db.prepare("SELECT * FROM shipping_zones ORDER BY sort_order, name").all() });
    })
  );

  router.post(
    "/zones",
    requireRole(),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(zoneSchema, req.body);
      if (input.etaDaysMax < input.etaDaysMin) {
        throw new AppError(400, "INVALID_ETA", "The maximum delivery time cannot be shorter than the minimum.");
      }
      const id = newId();
      db.prepare(
        `INSERT INTO shipping_zones
           (id, name, pincodes, fee, free_above, eta_days_min, eta_days_max, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.name,
        input.pincodes,
        input.fee,
        input.freeAbove ?? null,
        input.etaDaysMin,
        input.etaDaysMax,
        input.isActive ? 1 : 0,
        input.sortOrder
      );
      audit(db, user.id, "shipping_zone.created", "shipping_zone", id, { name: input.name });
      res.status(201).json({ zone: db.prepare("SELECT * FROM shipping_zones WHERE id = ?").get(id) });
    })
  );

  router.patch(
    "/zones/:id",
    requireRole(),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const id = String(req.params.id);
      const existing = db.prepare("SELECT * FROM shipping_zones WHERE id = ?").get(id);
      if (!existing) throw new AppError(404, "ZONE_NOT_FOUND", "This delivery zone could not be found.");
      const input = partialUpdate(zoneSchema, req.body);
      const columns: Record<string, string | number | null> = {};
      const mapping: Array<[keyof typeof input, string]> = [
        ["name", "name"],
        ["pincodes", "pincodes"],
        ["fee", "fee"],
        ["freeAbove", "free_above"],
        ["etaDaysMin", "eta_days_min"],
        ["etaDaysMax", "eta_days_max"],
        ["isActive", "is_active"],
        ["sortOrder", "sort_order"]
      ];
      for (const [key, column] of mapping) {
        const value = input[key];
        if (value === undefined) continue;
        columns[column] = typeof value === "boolean" ? (value ? 1 : 0) : value;
      }
      if (!Object.keys(columns).length) throw new AppError(400, "NO_CHANGES", "No changes were provided.");
      db.prepare(
        `UPDATE shipping_zones SET ${Object.keys(columns)
          .map((column) => `${column} = ?`)
          .join(", ")} WHERE id = ?`
      ).run(...Object.values(columns), id);
      audit(db, user.id, "shipping_zone.updated", "shipping_zone", id);
      res.json({ zone: db.prepare("SELECT * FROM shipping_zones WHERE id = ?").get(id) });
    })
  );

  router.get(
    "/settings",
    requireRole("finance"),
    route((_req, res) => {
      res.json({
        items: db.prepare("SELECT key, value, updated_at FROM settings ORDER BY key").all(),
        editable: Object.keys(SETTINGS_SCHEMAS)
      });
    })
  );

  router.put(
    "/settings/:key",
    requireRole(),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const key = String(req.params.key);
      const schema = SETTINGS_SCHEMAS[key];
      if (!schema) throw new AppError(400, "SETTING_NOT_EDITABLE", "This setting cannot be edited here.");
      const input = parseBody(z.object({ value: z.unknown() }), req.body);
      const parsed = parseBody(schema, input.value);
      setSetting(db, key, parsed);
      audit(db, user.id, "settings.updated", "setting", key);
      res.json({ key, value: parsed });
    })
  );

  router.get(
    "/reviews",
    requireRole("support"),
    route((req, res) => {
      const status = String(req.query.status ?? "pending").trim();
      const rows = db
        .prepare(
          `SELECT r.*, p.name AS product_name, u.name AS author, u.email
           FROM reviews r JOIN products p ON p.id = r.product_id JOIN users u ON u.id = r.user_id
           WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 100`
        )
        .all(status) as Array<Record<string, unknown>>;
      res.json({
        items: rows.map((row) => ({
          id: row.id,
          productId: row.product_id,
          productName: row.product_name,
          author: row.author,
          email: row.email,
          rating: row.rating,
          title: row.title,
          body: row.body,
          status: row.status,
          verifiedPurchase: Boolean(row.verified_purchase),
          createdAt: row.created_at
        }))
      });
    })
  );

  router.post(
    "/reviews/:id/status",
    requireRole("support"),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(z.object({ status: z.enum(["approved", "rejected"]) }), req.body);
      const result = db.prepare("UPDATE reviews SET status = ? WHERE id = ?").run(input.status, String(req.params.id));
      if (!result.changes) throw new AppError(404, "REVIEW_NOT_FOUND", "This review could not be found.");
      audit(db, user.id, `review.${input.status}`, "review", String(req.params.id));
      res.json({ ok: true });
    })
  );

  router.get(
    "/tickets",
    requireRole("support"),
    route((req, res) => {
      const status = String(req.query.status ?? "open").trim();
      const rows = db
        .prepare("SELECT * FROM support_tickets WHERE status = ? ORDER BY created_at DESC LIMIT 100")
        .all(status);
      res.json({ items: rows });
    })
  );

  router.post(
    "/tickets/:id/status",
    requireRole("support"),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(z.object({ status: z.enum(["open", "in_progress", "closed"]) }), req.body);
      const result = db.prepare("UPDATE support_tickets SET status = ? WHERE id = ?").run(input.status, String(req.params.id));
      if (!result.changes) throw new AppError(404, "TICKET_NOT_FOUND", "This ticket could not be found.");
      audit(db, user.id, `ticket.${input.status}`, "support_ticket", String(req.params.id));
      res.json({ ok: true });
    })
  );

  router.get(
    "/returns",
    requireRole("orders", "support"),
    route((req, res) => {
      const status = String(req.query.status ?? "").trim();
      const rows = db
        .prepare(
          `SELECT rr.*, o.order_number, o.total FROM return_requests rr JOIN orders o ON o.id = rr.order_id
           ${status ? "WHERE rr.status = ?" : ""} ORDER BY rr.created_at DESC LIMIT 100`
        )
        .all(...(status ? [status] : [])) as Array<Record<string, unknown>>;
      res.json({ items: rows });
    })
  );

  router.post(
    "/returns/:id/status",
    requireRole("orders"),
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(
        z.object({
          status: z.enum(["requested", "approved", "rejected", "received", "refunded", "closed"]),
          adminNote: z.string().trim().max(1000).optional().default("")
        }),
        req.body
      );
      const request = db.prepare("SELECT * FROM return_requests WHERE id = ?").get(String(req.params.id)) as
        | { id: string; order_id: string; status: string; request_number: string }
        | undefined;
      if (!request) throw new AppError(404, "RETURN_NOT_FOUND", "This return request could not be found.");
      if (input.status === "refunded" && input.adminNote.trim().length < 5) {
        throw new AppError(
          400,
          "REFUND_NOTE_REQUIRED",
          "Record how the refund was made (for example the cash receipt or bank reference)."
        );
      }

      const order = db.prepare("SELECT payment_status FROM orders WHERE id = ?").get(request.order_id) as {
        payment_status: string;
      };
      if (input.status === "refunded" && (request.status === "refunded" || order.payment_status === "refunded")) {
        throw new AppError(
          409,
          "RETURN_ALREADY_REFUNDED",
          "This order already shows a refund. Record a new refund only against a different, approved request."
        );
      }
      if (request.status !== input.status) {
        const allowed = RETURN_TRANSITIONS[request.status] ?? [];
        if (!allowed.includes(input.status)) {
          throw new AppError(
            409,
            "RETURN_TRANSITION_INVALID",
            `A return marked "${request.status}" cannot move straight to "${input.status}".`
          );
        }
        transaction(db, () => {
          db.prepare("UPDATE return_requests SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?").run(
            input.status,
            input.adminNote,
            nowIso(),
            request.id
          );
          if (input.status === "refunded") {
            db.prepare("UPDATE orders SET payment_status = 'refunded', updated_at = ? WHERE id = ?").run(
              nowIso(),
              request.order_id
            );
            db.prepare(
              "INSERT INTO order_events (id, order_id, status, note, created_by, created_at) VALUES (?, ?, 'refunded', ?, ?, ?)"
            ).run(newId(), request.order_id, input.adminNote, user.id, nowIso());
          }
        });
        audit(db, user.id, "return.status_updated", "return_request", request.id, {
          requestNumber: request.request_number,
          status: input.status
        });
      }
      res.json({ ok: true, status: request.status === input.status ? request.status : input.status });
    })
  );

  router.get(
    "/customers",
    requireRole("orders", "finance", "support"),
    route((req, res) => {
      const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>, 50);
      const q = String(req.query.q ?? "").trim();
      const where = q ? "WHERE u.role = 'customer' AND (u.email LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)" : "WHERE u.role = 'customer'";
      const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
      const count = db.prepare(`SELECT COUNT(*) AS total FROM users u ${where}`).get(...params) as { total: number };
      const rows = db
        .prepare(
          `SELECT u.id, u.name, u.email, u.phone, u.created_at,
             (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS orders,
             (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.user_id = u.id AND o.payment_status = 'paid') AS paid_total
           FROM users u ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, offset);
      res.json({
        items: rows,
        total: count.total,
        page,
        pageSize,
        pages: Math.max(1, Math.ceil(count.total / pageSize))
      });
    })
  );

  router.get(
    "/audit",
    requireRole("finance"),
    route((req, res) => {
      const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>, 100);
      const count = db.prepare("SELECT COUNT(*) AS total FROM audit_logs").get() as { total: number };
      const rows = db
        .prepare(
          `SELECT a.*, u.name AS actor_name, u.email AS actor_email
           FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
           ORDER BY a.created_at DESC LIMIT ? OFFSET ?`
        )
        .all(pageSize, offset) as Array<Record<string, unknown>>;
      res.json({
        items: rows.map((row) => ({
          id: row.id,
          action: row.action,
          actor: row.actor_name ?? "System",
          actorEmail: row.actor_email ?? null,
          entityType: row.entity_type,
          entityId: row.entity_id,
          details: JSON.parse(String(row.details || "{}")),
          createdAt: row.created_at
        })),
        total: count.total,
        page,
        pageSize,
        pages: Math.max(1, Math.ceil(count.total / pageSize))
      });
    })
  );

  router.get(
    "/stock-movements",
    requireRole("catalogue", "finance"),
    route((req, res) => {
      const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>, 100);
      const productId = String(req.query.productId ?? "").trim();
      const where = productId ? "WHERE m.product_id = ?" : "";
      const params = productId ? [productId] : [];
      const rows = db
        .prepare(
          `SELECT m.*, p.name AS product_name, v.name AS variant_name
           FROM stock_movements m JOIN products p ON p.id = m.product_id
           LEFT JOIN product_variants v ON v.id = m.variant_id
           ${where} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`
        )
        .all(...params, pageSize, offset);
      res.json({ items: rows, page, pageSize });
    })
  );

  return router;
}
