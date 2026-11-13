import { Router } from "express";
import { getSetting, newId, nowIso, type DB } from "../db.js";
import {
  approvedRating,
  getProductRowBySlug,
  listCategories,
  listProducts,
  popularTags,
  serializeDetail,
  serializeSummary
} from "../lib/catalog.js";
import { AppError, pageParams, route, toBool } from "../lib/http.js";
import { isValidPincode, quoteShipping } from "../lib/shipping.js";

const OCCASIONS = [
  { id: "birthday", label: "Birthday" },
  { id: "anniversary", label: "Anniversary" },
  { id: "wedding", label: "Wedding" },
  { id: "housewarming", label: "Housewarming" },
  { id: "festive", label: "Festive" },
  { id: "just-because", label: "Just because" }
];

const RECIPIENTS = [
  { id: "her", label: "For her" },
  { id: "him", label: "For him" },
  { id: "kids", label: "For children" },
  { id: "couple", label: "For couples" },
  { id: "corporate", label: "For colleagues" }
];

const BUDGETS = [
  { id: "under-1000", label: "Under ₹1,000", max: 99900 },
  { id: "under-2000", label: "₹1,000 – ₹2,000", max: 200000 },
  { id: "under-3000", label: "₹2,000 – ₹3,000", max: 300000 },
  { id: "under-4000", label: "₹3,000 – ₹4,000", max: 400000 },
  { id: "above-4000", label: "₹4,000 and above", max: 10000000 }
];

export function catalogRoutes(db: DB): Router {
  const router = Router();

  router.get(
    "/categories",
    route((_req, res) => {
      res.json({ items: listCategories(db) });
    })
  );

  router.get(
    "/meta",
    route((_req, res) => {
      res.json({
        occasions: OCCASIONS,
        recipients: RECIPIENTS,
        budgets: BUDGETS,
        tags: popularTags(db),
        sortOptions: [
          { id: "featured", label: "Featured" },
          { id: "newest", label: "Newest" },
          { id: "price_asc", label: "Price: low to high" },
          { id: "price_desc", label: "Price: high to low" },
          { id: "rating", label: "Top rated" },
          { id: "bestselling", label: "Bestselling" },
          { id: "discount", label: "Biggest saving" }
        ]
      });
    })
  );

  router.get(
    "/products",
    route((req, res) => {
      const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>);
      const q = String(req.query.q ?? "").trim().slice(0, 80);
      const category = String(req.query.category ?? "").trim() || undefined;
      const tag = String(req.query.tag ?? "").trim() || undefined;
      const minPrice = req.query.minPrice !== undefined ? Number(req.query.minPrice) : undefined;
      const maxPrice = req.query.maxPrice !== undefined ? Number(req.query.maxPrice) : undefined;
      if (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) {
        throw new AppError(400, "INVALID_PRICE", "The minimum price is not valid.");
      }
      if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
        throw new AppError(400, "INVALID_PRICE", "The maximum price is not valid.");
      }

      const result = listProducts(db, {
        category,
        q,
        tag,
        minPrice,
        maxPrice,
        sort: String(req.query.sort ?? "") || undefined,
        page,
        pageSize,
        offset,
        personalizable: toBool(req.query.personalizable),
        giftWrappable: toBool(req.query.giftWrap),
        inStock: toBool(req.query.inStock),
        featured: toBool(req.query.featured)
      });

      if (q.length >= 2) {
        db.prepare("INSERT INTO search_events (id, query, results, created_at) VALUES (?, ?, ?, ?)").run(
          newId(),
          q.toLowerCase(),
          result.total,
          nowIso()
        );
      }

      res.json(result);
    })
  );

  router.get(
    "/products/:slug",
    route((req, res) => {
      const row = getProductRowBySlug(db, String(req.params.slug));
      if (!row) throw new AppError(404, "PRODUCT_NOT_FOUND", "This product could not be found.");
      const detail = serializeDetail(db, row);
      const related = db
        .prepare(
          `SELECT id FROM products
           WHERE category_id = ? AND id <> ? AND status = 'published'
           ORDER BY featured DESC, created_at DESC LIMIT 4`
        )
        .all(row.category_id, row.id) as Array<{ id: string }>;
      const relatedItems = related
        .map((entry) => db.prepare(
          `SELECT p.*, c.slug AS category_slug, c.name AS category_name,
             (SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id AND r.status = 'approved') AS rating_avg,
             (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.status = 'approved') AS rating_count,
             (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image_url,
             (SELECT i.alt FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image_url_alt,
             (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_count,
             (SELECT MIN(COALESCE(v.price, p.price)) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_min_price,
             (SELECT SUM(v.stock_quantity) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_stock,
             (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status <> 'cancelled') AS sold,
             COALESCE((SELECT MIN(COALESCE(v.price, p.price)) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1), p.sale_price, p.price) AS effective_price
           FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?`
        ).get(entry.id))
        .filter(Boolean)
        .map((entry) => serializeSummary(entry as never));

      const returns = getSetting(db, "returns", { enabled: true, windowDays: 7, note: "" });
      res.json({ product: detail, related: relatedItems, returns });
    })
  );

  router.get(
    "/products/:slug/reviews",
    route((req, res) => {
      const row = getProductRowBySlug(db, String(req.params.slug));
      if (!row) throw new AppError(404, "PRODUCT_NOT_FOUND", "This product could not be found.");
      const reviews = db
        .prepare(
          `SELECT r.rating, r.title, r.body, r.verified_purchase, r.created_at, u.name
           FROM reviews r JOIN users u ON u.id = r.user_id
           WHERE r.product_id = ? AND r.status = 'approved'
           ORDER BY r.created_at DESC LIMIT 30`
        )
        .all(row.id) as Array<{
        rating: number;
        title: string;
        body: string;
        verified_purchase: number;
        created_at: string;
        name: string;
      }>;
      res.json({
        summary: approvedRating(db, row.id),
        items: reviews.map((review) => {
          const [first, ...rest] = review.name.trim().split(/\s+/);
          return {
            rating: review.rating,
            title: review.title,
            body: review.body,
            verifiedPurchase: Boolean(review.verified_purchase),
            createdAt: review.created_at,
            author: rest.length ? `${first} ${rest[0][0]}.` : first
          };
        })
      });
    })
  );

  router.get(
    "/gift-finder",
    route((req, res) => {
      const occasion = String(req.query.occasion ?? "").trim();
      const recipient = String(req.query.recipient ?? "").trim();
      const maxBudget = Number(req.query.maxBudget);
      const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>);
      const baseTag = occasion || recipient;
      const result = listProducts(db, {
        tag: baseTag || undefined,
        maxPrice: Number.isFinite(maxBudget) && maxBudget > 0 ? maxBudget : undefined,
        personalizable: toBool(req.query.personalizable),
        giftWrappable: toBool(req.query.giftWrap),
        inStock: true,
        sort: "featured",
        page,
        pageSize,
        offset
      });
      res.json({
        ...result,
        explanation:
          "Recommendations come from the live catalogue and match the filters you chose. Nothing here is a sponsored or invented result."
      });
    })
  );

  router.get(
    "/search/suggestions",
    route((req, res) => {
      const q = String(req.query.q ?? "").trim().slice(0, 60);
      if (q.length < 2) {
        const popular = db
          .prepare(
            `SELECT query FROM search_events WHERE query <> '' GROUP BY query
             ORDER BY COUNT(*) DESC, MAX(created_at) DESC LIMIT 5`
          )
          .all() as Array<{ query: string }>;
        res.json({ suggestions: [], popular: popular.map((row) => row.query) });
        return;
      }
      const like = `%${q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
      const products = db
        .prepare(
          `SELECT name FROM products WHERE status = 'published' AND name LIKE ? ESCAPE '\\'
           ORDER BY featured DESC LIMIT 5`
        )
        .all(like) as Array<{ name: string }>;
      const categories = db
        .prepare("SELECT name FROM categories WHERE is_active = 1 AND name LIKE ? ESCAPE '\\' LIMIT 3")
        .all(like) as Array<{ name: string }>;
      const suggestions = [...new Set([...categories.map((row) => row.name), ...products.map((row) => row.name)])].slice(
        0,
        7
      );
      res.json({ suggestions, popular: [] });
    })
  );

  router.get(
    "/delivery/check",
    route((req, res) => {
      const pincode = String(req.query.pincode ?? "").trim();
      if (!isValidPincode(pincode)) {
        throw new AppError(400, "INVALID_PINCODE", "Enter a valid 6-digit Indian PIN code.");
      }
      res.json(quoteShipping(db, pincode, 0));
    })
  );

  return router;
}
