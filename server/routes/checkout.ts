import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { newId, nowIso, transaction, type DB } from "../db.js";
import { audit } from "../lib/audit.js";
import { optionalUser, type AuthedRequest } from "../lib/auth.js";
import { resolveCart } from "../lib/cart.js";
import { AppError, formatOrderNumber, parseBody, route } from "../lib/http.js";
import { findOrderForViewer, serializeOrder, type OrderRow } from "../lib/orders.js";
import { renderInvoice } from "../lib/invoice.js";
import { renderInvoicePdf } from "../lib/invoice-pdf.js";
import { queueOrderNotifications } from "../lib/notifications.js";
import { buildQuote, type CartQuote } from "../lib/pricing.js";

const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, "").replace(/^\+?91/, ""))
  .refine((value) => /^[6-9]\d{9}$/.test(value), "Enter a valid 10-digit Indian mobile number.");

const email = z.string().trim().email("Enter a valid email address.").max(160).transform((value) => value.toLowerCase());

const addressSchema = z.object({
  recipient: z.string().trim().min(2, "Enter the recipient's name.").max(80),
  phone,
  line1: z.string().trim().min(5, "Enter the street address.").max(160),
  line2: z.string().trim().max(160).optional().default(""),
  city: z.string().trim().min(2, "Enter the city.").max(80),
  state: z.string().trim().min(2, "Enter the state.").max(80),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code.")
});

const checkoutSchema = z
  .object({
    contact: z.object({
      name: z.string().trim().min(2, "Enter your name.").max(80),
      email,
      phone
    }),
    shippingAddress: addressSchema,
    billingSameAsShipping: z.boolean().default(true),
    billingAddress: addressSchema.optional(),
    couponCode: z.string().trim().max(40).optional(),
    paymentMethod: z.enum(["cod", "online"]).default("cod"),
    giftMessage: z.string().trim().max(180, "Keep the gift message under 180 characters.").default(""),
    customerNote: z.string().trim().max(500).default(""),
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
    acceptTerms: z.boolean().refine((value) => value, "Please accept the terms and privacy policy.")
  })
  .superRefine((value, ctx) => {
    if (!value.billingSameAsShipping && !value.billingAddress) {
      ctx.addIssue({ code: "custom", path: ["billingAddress"], message: "Enter a billing address." });
    }
  });

const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many checkout attempts. Please wait and try again." } }
});

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many lookups. Please wait a few minutes." } }
});

function lineIssues(quote: CartQuote): string[] {
  return quote.lines.filter((line) => line.issue).map((line) => line.issue as string);
}

function lineTax(line: CartQuote["lines"][number], mode: "inclusive" | "exclusive"): number {
  const rate = Math.max(0, line.taxRateBps);
  if (mode === "inclusive") return Math.round((line.lineTotal * rate) / (10000 + rate));
  return Math.round((line.lineTotal * rate) / 10000);
}

function generateOrderNumber(db: DB): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = formatOrderNumber();
    const exists = db.prepare("SELECT 1 FROM orders WHERE order_number = ?").get(candidate);
    if (!exists) return candidate;
  }
  throw new AppError(500, "ORDER_NUMBER_FAILED", "Could not allocate an order number. Please try again.");
}

export function checkoutRoutes(db: DB): Router {
  const router = Router();
  router.use(optionalUser(db));

  router.post(
    "/",
    checkoutLimiter,
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const input = parseBody(checkoutSchema, req.body);
      const idempotencyKey = input.idempotencyKey || newId();

      const existing = db.prepare("SELECT * FROM orders WHERE idempotency_key = ?").get(idempotencyKey) as
        | OrderRow
        | undefined;
      if (existing) {
        if (existing.email !== input.contact.email && (!user || existing.user_id !== user.id)) {
          throw new AppError(409, "IDEMPOTENCY_CONFLICT", "This checkout attempt was already used for another order.");
        }
        res.json({ order: serializeOrder(db, existing), idempotent: true });
        return;
      }

      const cart = resolveCart(db, req, res, user);
      const couponCode = input.couponCode ?? cart.coupon_code;
      const quote = buildQuote(db, cart, {
        couponCode,
        email: input.contact.email,
        userId: user?.id ?? null,
        pincode: input.shippingAddress.pincode,
        paymentMethod: input.paymentMethod
      });

      if (!quote.lines.length || quote.itemCount === 0) {
        throw new AppError(400, "CART_EMPTY", "Your cart is empty.");
      }
      const issues = lineIssues(quote);
      if (issues.length) {
        throw new AppError(409, "CART_NEEDS_ATTENTION", "Some items in your cart need attention.", { issues });
      }
      if (!quote.shipping?.serviceable) {
        throw new AppError(400, "OUT_OF_DELIVERY_AREA", quote.shipping?.message ?? "We cannot deliver to this PIN code.", {
          pincode: input.shippingAddress.pincode
        });
      }
      if (input.paymentMethod === "online") {
        throw new AppError(
          503,
          "PAYMENT_PROVIDER_UNAVAILABLE",
          "Online payment is not configured, so no payment was taken. Please choose cash on delivery."
        );
      }
      const cod = quote.paymentMethods.find((method) => method.id === "cod");
      if (!cod?.available) {
        throw new AppError(400, "COD_UNAVAILABLE", cod?.reason ?? "Cash on delivery is not available for this order.");
      }
      if (couponCode && (!quote.coupon || !quote.coupon.valid)) {
        throw new AppError(400, "COUPON_REJECTED", quote.couponError ?? "This coupon could not be applied.");
      }

      const shippingAddress = {
        recipient: input.shippingAddress.recipient,
        phone: input.shippingAddress.phone,
        line1: input.shippingAddress.line1,
        line2: input.shippingAddress.line2 ?? "",
        city: input.shippingAddress.city,
        state: input.shippingAddress.state,
        pincode: input.shippingAddress.pincode
      };
      const billingAddress = input.billingSameAsShipping
        ? shippingAddress
        : {
            recipient: input.billingAddress!.recipient,
            phone: input.billingAddress!.phone,
            line1: input.billingAddress!.line1,
            line2: input.billingAddress!.line2 ?? "",
            city: input.billingAddress!.city,
            state: input.billingAddress!.state,
            pincode: input.billingAddress!.pincode
          };

      const orderId = newId();
      let orderRow: OrderRow;

      try {
        orderRow = transaction(db, () => {
          const orderNumber = generateOrderNumber(db);
          const timestamp = nowIso();

          for (const line of quote.lines) {
            if (!line.available) throw new AppError(409, "CART_NEEDS_ATTENTION", `${line.name} is no longer available.`);
            const result = line.variantId
              ? db
                  .prepare(
                    `UPDATE product_variants SET stock_quantity = stock_quantity - ?
                     WHERE id = ? AND is_active = 1 AND stock_quantity >= ?`
                  )
                  .run(line.quantity, line.variantId, line.quantity)
              : db
                  .prepare(
                    `UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ?
                     WHERE id = ? AND status = 'published' AND stock_quantity >= ?`
                  )
                  .run(line.quantity, timestamp, line.productId, line.quantity);
            if (result.changes === 0) {
              throw new AppError(409, "INSUFFICIENT_STOCK", `${line.name} just went out of stock. Please review your cart.`);
            }
            db.prepare(
              `INSERT INTO stock_movements (id, product_id, variant_id, delta, reason, reference, actor_id, created_at)
               VALUES (?, ?, ?, ?, 'order', ?, ?, ?)`
            ).run(newId(), line.productId, line.variantId, -line.quantity, orderNumber, user?.id ?? null, timestamp);
          }

          db.prepare(
            `INSERT INTO orders
               (id, order_number, user_id, email, phone, status, payment_method, payment_status,
                subtotal, discount, gift_wrap_total, shipping_fee, cod_fee, tax_included, tax_exclusive, tax_mode,
                total, currency, coupon_code, shipping_address, billing_address, gift_message, customer_note,
                admin_note, idempotency_key, shipping_zone, eta_days_min, eta_days_max, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'pending', 'cod', 'cod_pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`
          ).run(
            orderId,
            orderNumber,
            user?.id ?? null,
            input.contact.email,
            input.contact.phone,
            quote.subtotal,
            quote.discount,
            quote.giftWrapTotal,
            quote.shippingFee,
            quote.codFee,
            quote.taxIncluded,
            quote.taxExclusive,
            quote.taxMode,
            quote.total,
            quote.coupon?.valid ? quote.coupon.code : null,
            JSON.stringify(shippingAddress),
            JSON.stringify(billingAddress),
            input.giftMessage,
            input.customerNote,
            idempotencyKey,
            quote.shipping?.zoneName ?? null,
            quote.shipping?.etaDaysMin ?? null,
            quote.shipping?.etaDaysMax ?? null,
            timestamp,
            timestamp
          );

          const insertItem = db.prepare(
            `INSERT INTO order_items
               (id, order_id, product_id, variant_id, name, sku, variant_name, image_url, unit_price, quantity,
                line_subtotal, line_discount, tax_included, line_total, gift_wrap, gift_message, personalization_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const line of quote.lines) {
            insertItem.run(
              newId(),
              orderId,
              line.productId,
              line.variantId,
              line.name,
              line.sku,
              line.variantName,
              line.image ?? "",
              line.unitPrice,
              line.quantity,
              line.lineSubtotal,
              line.lineDiscount,
              lineTax(line, quote.taxMode),
              line.lineTotal,
              line.giftWrap ? 1 : 0,
              line.giftMessage,
              JSON.stringify(line.personalization)
            );
          }

          db.prepare(
            "INSERT INTO order_events (id, order_id, status, note, created_by, created_at) VALUES (?, ?, 'pending', ?, ?, ?)"
          ).run(newId(), orderId, "Order placed with cash on delivery.", user?.id ?? null, timestamp);

          if (quote.coupon?.valid) {
            const couponRow = db.prepare("SELECT id FROM coupons WHERE code = ?").get(quote.coupon.code) as
              | { id: string }
              | undefined;
            if (couponRow) {
              db.prepare(
                "INSERT INTO coupon_redemptions (id, coupon_id, order_id, email, created_at) VALUES (?, ?, ?, ?, ?)"
              ).run(newId(), couponRow.id, orderId, input.contact.email, timestamp);
            }
          }

          db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(cart.id);
          db.prepare("UPDATE carts SET coupon_code = NULL, updated_at = ? WHERE id = ?").run(timestamp, cart.id);

          return db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow;
        });
      } catch (error) {
        if (error instanceof Error && /UNIQUE constraint failed: orders.idempotency_key/i.test(error.message)) {
          const duplicate = db.prepare("SELECT * FROM orders WHERE idempotency_key = ?").get(idempotencyKey) as
            | OrderRow
            | undefined;
          if (duplicate) {
            res.json({ order: serializeOrder(db, duplicate), idempotent: true });
            return;
          }
        }
        throw error;
      }

      audit(db, user?.id ?? null, "order.created", "order", orderId, {
        orderNumber: orderRow.order_number,
        total: orderRow.total,
        paymentMethod: "cod"
      });
      const notifications = queueOrderNotifications(db, orderRow);
      res.status(201).json({
        order: serializeOrder(db, orderRow),
        idempotent: false,
        notificationChannels: notifications.map((row) => ({ channel: row.channel, status: row.status }))
      });
    })
  );

  return router;
}

export function orderLookupRoutes(db: DB): Router {
  const router = Router();
  router.use(optionalUser(db));

  router.get(
    "/track",
    lookupLimiter,
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const orderNumber = String(req.query.orderNumber ?? "").trim();
      const lookupEmail = String(req.query.email ?? "").trim();
      if (!orderNumber) throw new AppError(400, "ORDER_NUMBER_REQUIRED", "Enter your order number.");
      if (!user && !lookupEmail) {
        throw new AppError(400, "EMAIL_REQUIRED", "Enter the email address used for the order.");
      }
      const order = findOrderForViewer(db, {
        orderNumber,
        email: lookupEmail || null,
        userId: user?.id ?? null
      });
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "No order matches those details.");
      res.json({ order: serializeOrder(db, order) });
    })
  );

  router.get(
    "/:orderNumber/invoice",
    lookupLimiter,
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const lookupEmail = String(req.query.email ?? "").trim();
      const order = findOrderForViewer(db, {
        orderNumber: String(req.params.orderNumber),
        email: lookupEmail || null,
        userId: user?.id ?? null
      });
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "No order matches those details.");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
      res.setHeader("Cache-Control", "no-store");
      res.send(renderInvoice(db, order));
    })
  );

  router.get(
    "/:orderNumber/invoice.pdf",
    lookupLimiter,
    route(async (req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const lookupEmail = String(req.query.email ?? "").trim();
      const order = findOrderForViewer(db, {
        orderNumber: String(req.params.orderNumber),
        email: lookupEmail || null,
        userId: user?.id ?? null
      });
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "No order matches those details.");
      const pdf = await renderInvoicePdf(db, order);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="invoice-${order.order_number}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(pdf);
    })
  );

  router.get(
    "/:orderNumber",
    lookupLimiter,
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      const lookupEmail = String(req.query.email ?? "").trim();
      const order = findOrderForViewer(db, {
        orderNumber: String(req.params.orderNumber),
        email: lookupEmail || null,
        userId: user?.id ?? null
      });
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "No order matches those details.");
      res.json({ order: serializeOrder(db, order) });
    })
  );

  return router;
}
