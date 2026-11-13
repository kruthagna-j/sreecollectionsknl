import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { getProductRowById, stockFor } from "../lib/catalog.js";
import { resolveCart, touchCart } from "../lib/cart.js";
import { optionalUser, type AuthedRequest } from "../lib/auth.js";
import { AppError, parseBody, route } from "../lib/http.js";
import { buildQuote, type CartQuote, type CartRow } from "../lib/pricing.js";
import { isValidPincode } from "../lib/shipping.js";
import { newId, nowIso, type DB } from "../db.js";

const personalizationSchema = z.record(z.string().max(40), z.string().max(500)).optional();

const addSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().max(80).optional().default(""),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  giftWrap: z.boolean().optional().default(false),
  giftMessage: z.string().trim().max(180).optional().default(""),
  personalization: personalizationSchema
});

const updateSchema = z
  .object({
    quantity: z.coerce.number().int().min(1).max(20).optional(),
    giftWrap: z.boolean().optional(),
    giftMessage: z.string().trim().max(180).optional(),
    personalization: personalizationSchema
  })
  .refine((value) => Object.keys(value).length > 0, "No changes were provided.");

const couponSchema = z.object({ code: z.string().trim().min(2).max(40) });
const pincodeSchema = z.object({ pincode: z.string().trim().min(6).max(6) });

// Trying a code is the only way to discover one, so coupon attempts get their own bucket.
const couponLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many coupon attempts. Please wait a few minutes." } }
});

const ALLOWED_PERSONALIZATION = new Set(["recipientName", "senderName", "message", "engraving", "font", "color"]);

function sanitizePersonalization(input: Record<string, string> | undefined): Record<string, string> {
  if (!input) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_PERSONALIZATION.has(key)) continue;
    const trimmed = value.trim().slice(0, key === "message" ? 300 : key === "engraving" ? 120 : 60);
    if (trimmed) result[key] = trimmed;
  }
  return result;
}

function cartPayload(db: DB, cart: CartRow, email: string | null): { cart: CartQuote & { id: string; couponCode: string | null; shippingPincode: string | null } } {
  const quote = buildQuote(db, cart, { email });
  return {
    cart: {
      id: cart.id,
      couponCode: cart.coupon_code,
      shippingPincode: cart.shipping_pincode,
      ...quote
    }
  };
}

export function cartRoutes(db: DB): Router {
  const router = Router();
  router.use(optionalUser(db));

  router.get(
    "/",
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const cart = resolveCart(db, req, res, user);
      res.json(cartPayload(db, cart, user?.email ?? null));
    })
  );

  router.post(
    "/items",
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const input = parseBody(addSchema, req.body);
      const cart = resolveCart(db, req, res, user);
      const product = getProductRowById(db, input.productId);
      if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "This product could not be found.");

      const hasVariants = product.variant_count > 0;
      if (hasVariants) {
        if (!input.variantId) throw new AppError(400, "VARIANT_REQUIRED", "Choose an option for this item.");
        const variant = db
          .prepare("SELECT id, is_active, stock_quantity FROM product_variants WHERE id = ? AND product_id = ?")
          .get(input.variantId, product.id) as { id: string; is_active: number; stock_quantity: number } | undefined;
        if (!variant || !variant.is_active) {
          throw new AppError(400, "VARIANT_UNAVAILABLE", "The selected option is no longer available.");
        }
        if (variant.stock_quantity < input.quantity) {
          throw new AppError(409, "INSUFFICIENT_STOCK", `Only ${variant.stock_quantity} left in stock.`, {
            available: variant.stock_quantity
          });
        }
      } else if (input.variantId) {
        throw new AppError(400, "INVALID_VARIANT", "This product does not have options.");
      } else {
        const available = stockFor(product);
        if (available < input.quantity) {
          throw new AppError(409, "INSUFFICIENT_STOCK", `Only ${available} left in stock.`, { available });
        }
      }

      if (input.giftWrap && !product.gift_wrappable) {
        throw new AppError(400, "GIFT_WRAP_UNAVAILABLE", "Gift wrapping is not offered for this item.");
      }

      const existing = db
        .prepare(
          "SELECT id, quantity, personalization_json FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id = ?"
        )
        .get(cart.id, product.id, input.variantId) as
        | { id: string; quantity: number; personalization_json: string }
        | undefined;

      const requiresPersonalization = product.tags.split(",").map((tag) => tag.trim()).includes("personalised");
      let personalization: Record<string, string> | null = null;
      if (input.personalization !== undefined) {
        if (!product.personalizable) {
          throw new AppError(400, "PERSONALIZATION_UNAVAILABLE", "This item cannot be personalised.");
        }
        personalization = sanitizePersonalization(input.personalization);
      }
      const effectivePersonalization =
        personalization ??
        (existing
          ? (() => {
              try {
                return JSON.parse(existing.personalization_json || "{}") as Record<string, string>;
              } catch {
                return {};
              }
            })()
          : {});
      if (requiresPersonalization && Object.keys(effectivePersonalization).length === 0) {
        throw new AppError(400, "PERSONALIZATION_REQUIRED", "Add the personalisation details for this item.");
      }

      const nextQuantity = Math.min(20, (existing?.quantity ?? 0) + input.quantity);
      const stockLimit = stockFor(product);
      const variantStock = input.variantId
        ? (db.prepare("SELECT stock_quantity FROM product_variants WHERE id = ?").get(input.variantId) as {
            stock_quantity: number;
          }).stock_quantity
        : stockLimit;
      if (nextQuantity > variantStock) {
        throw new AppError(409, "INSUFFICIENT_STOCK", `Only ${variantStock} left in stock.`, { available: variantStock });
      }

      if (existing) {
        db.prepare(
          `UPDATE cart_items SET quantity = ?, gift_wrap = ?, gift_message = ?, personalization_json = ? WHERE id = ?`
        ).run(
          nextQuantity,
          input.giftWrap ? 1 : 0,
          input.giftMessage ?? "",
          JSON.stringify(effectivePersonalization),
          existing.id
        );
      } else {
        db.prepare(
          `INSERT INTO cart_items
             (id, cart_id, product_id, variant_id, quantity, gift_wrap, gift_message, personalization_json, added_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          newId(),
          cart.id,
          product.id,
          input.variantId,
          nextQuantity,
          input.giftWrap ? 1 : 0,
          input.giftMessage ?? "",
          JSON.stringify(effectivePersonalization),
          nowIso()
        );
      }
      touchCart(db, cart.id);
      const refreshed = db.prepare("SELECT * FROM carts WHERE id = ?").get(cart.id) as CartRow;
      res.status(201).json(cartPayload(db, refreshed, user?.email ?? null));
    })
  );

  router.patch(
    "/items/:id",
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const input = parseBody(updateSchema, req.body);
      const cart = resolveCart(db, req, res, user);
      const item = db
        .prepare(
          `SELECT ci.*, p.name, p.stock_quantity, p.gift_wrappable, p.personalizable, p.tags,
                  (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_count
           FROM cart_items ci JOIN products p ON p.id = ci.product_id
           WHERE ci.id = ? AND ci.cart_id = ?`
        )
        .get(String(req.params.id), cart.id) as
        | {
            id: string;
            product_id: string;
            variant_id: string;
            quantity: number;
            gift_wrap: number;
            gift_message: string;
            personalization_json: string;
            name: string;
            stock_quantity: number;
            gift_wrappable: number;
            personalizable: number;
            tags: string;
            variant_count: number;
          }
        | undefined;
      if (!item) throw new AppError(404, "CART_ITEM_NOT_FOUND", "This cart item could not be found.");

      const quantity = input.quantity ?? item.quantity;
      const stock = item.variant_id
        ? ((db.prepare("SELECT stock_quantity FROM product_variants WHERE id = ?").get(item.variant_id) as
            | { stock_quantity: number }
            | undefined)?.stock_quantity ?? 0)
        : item.stock_quantity;
      if (quantity > stock) {
        throw new AppError(409, "INSUFFICIENT_STOCK", `Only ${stock} left in stock.`, { available: stock });
      }
      if (input.giftWrap && !item.gift_wrappable) {
        throw new AppError(400, "GIFT_WRAP_UNAVAILABLE", "Gift wrapping is not offered for this item.");
      }
      let personalizationJson = item.personalization_json;
      if (input.personalization !== undefined) {
        if (!item.personalizable) {
          throw new AppError(400, "PERSONALIZATION_UNAVAILABLE", "This item cannot be personalised.");
        }
        const personalization = sanitizePersonalization(input.personalization);
        const requiresPersonalization = item.tags.split(",").map((tag) => tag.trim()).includes("personalised");
        if (requiresPersonalization && Object.keys(personalization).length === 0) {
          throw new AppError(400, "PERSONALIZATION_REQUIRED", "Add the personalisation details for this item.");
        }
        personalizationJson = JSON.stringify(personalization);
      }

      db.prepare(
        `UPDATE cart_items SET quantity = ?, gift_wrap = ?, gift_message = ?, personalization_json = ? WHERE id = ?`
      ).run(
        quantity,
        input.giftWrap === undefined ? item.gift_wrap : input.giftWrap ? 1 : 0,
        input.giftMessage ?? item.gift_message,
        personalizationJson,
        item.id
      );
      touchCart(db, cart.id);
      const refreshed = db.prepare("SELECT * FROM carts WHERE id = ?").get(cart.id) as CartRow;
      res.json(cartPayload(db, refreshed, user?.email ?? null));
    })
  );

  router.delete(
    "/items/:id",
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const cart = resolveCart(db, req, res, user);
      const result = db.prepare("DELETE FROM cart_items WHERE id = ? AND cart_id = ?").run(String(req.params.id), cart.id);
      if (result.changes === 0) throw new AppError(404, "CART_ITEM_NOT_FOUND", "This cart item could not be found.");
      touchCart(db, cart.id);
      const refreshed = db.prepare("SELECT * FROM carts WHERE id = ?").get(cart.id) as CartRow;
      res.json(cartPayload(db, refreshed, user?.email ?? null));
    })
  );

  router.post(
    "/coupon",
    couponLimiter,
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const input = parseBody(couponSchema, req.body);
      const cart = resolveCart(db, req, res, user);
      const quote = buildQuote(db, cart, { couponCode: input.code, email: user?.email ?? null });
      if (!quote.coupon?.valid) {
        throw new AppError(400, "COUPON_REJECTED", quote.couponError ?? "This coupon could not be applied.", {
          code: input.code.trim().toUpperCase()
        });
      }
      db.prepare("UPDATE carts SET coupon_code = ?, updated_at = ? WHERE id = ?").run(
        quote.coupon.code,
        nowIso(),
        cart.id
      );
      const refreshed = db.prepare("SELECT * FROM carts WHERE id = ?").get(cart.id) as CartRow;
      res.json(cartPayload(db, refreshed, user?.email ?? null));
    })
  );

  router.delete(
    "/coupon",
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const cart = resolveCart(db, req, res, user);
      db.prepare("UPDATE carts SET coupon_code = NULL, updated_at = ? WHERE id = ?").run(nowIso(), cart.id);
      const refreshed = db.prepare("SELECT * FROM carts WHERE id = ?").get(cart.id) as CartRow;
      res.json(cartPayload(db, refreshed, user?.email ?? null));
    })
  );

  router.post(
    "/shipping",
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const input = parseBody(pincodeSchema, req.body);
      if (!isValidPincode(input.pincode)) {
        throw new AppError(400, "INVALID_PINCODE", "Enter a valid 6-digit Indian PIN code.");
      }
      const cart = resolveCart(db, req, res, user);
      db.prepare("UPDATE carts SET shipping_pincode = ?, updated_at = ? WHERE id = ?").run(
        input.pincode,
        nowIso(),
        cart.id
      );
      const refreshed = db.prepare("SELECT * FROM carts WHERE id = ?").get(cart.id) as CartRow;
      res.json(cartPayload(db, refreshed, user?.email ?? null));
    })
  );

  router.delete(
    "/",
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const cart = resolveCart(db, req, res, user);
      db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(cart.id);
      db.prepare("UPDATE carts SET coupon_code = NULL, updated_at = ? WHERE id = ?").run(nowIso(), cart.id);
      const refreshed = db.prepare("SELECT * FROM carts WHERE id = ?").get(cart.id) as CartRow;
      res.json(cartPayload(db, refreshed, user?.email ?? null));
    })
  );

  return router;
}
