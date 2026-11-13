import { Router } from "express";
import { z } from "zod";
import { getSetting, newId, nowIso, transaction, type DB } from "../db.js";
import { audit } from "../lib/audit.js";
import { requireAuth, type AuthedRequest } from "../lib/auth.js";
import { getProductRowById, serializeSummary } from "../lib/catalog.js";
import { AppError, pageParams, parseBody, route } from "../lib/http.js";
import { canTransition, restockOrder, serializeOrder, type OrderRow } from "../lib/orders.js";

const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, "").replace(/^\+?91/, ""))
  .refine((value) => /^[6-9]\d{9}$/.test(value), "Enter a valid 10-digit Indian mobile number.");

const addressSchema = z.object({
  label: z.string().trim().max(30).optional().default("Home"),
  recipient: z.string().trim().min(2, "Enter the recipient's name.").max(80),
  phone,
  line1: z.string().trim().min(5, "Enter the street address.").max(160),
  line2: z.string().trim().max(160).optional().default(""),
  city: z.string().trim().min(2, "Enter the city.").max(80),
  state: z.string().trim().min(2, "Enter the state.").max(80),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code."),
  isDefault: z.boolean().optional().default(false)
});

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  phone: phone.optional()
});

const returnSchema = z.object({
  orderNumber: z.string().trim().min(5).max(30),
  orderItemId: z.string().trim().min(1),
  reason: z.enum(["damaged", "wrong_item", "not_as_described", "changed_mind", "other"]),
  detail: z.string().trim().max(1000).optional().default("")
});

const reviewSchema = z.object({
  orderNumber: z.string().trim().min(5).max(30),
  productId: z.string().trim().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional().default(""),
  body: z.string().trim().min(10, "Write at least 10 characters.").max(1500)
});

type AddressRow = {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: number;
  created_at: string;
};

function serializeAddress(row: AddressRow) {
  return {
    id: row.id,
    label: row.label,
    recipient: row.recipient,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2 ?? "",
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at
  };
}

const RETURN_REASONS: Record<string, string> = {
  damaged: "Arrived damaged",
  wrong_item: "Wrong item received",
  not_as_described: "Not as described",
  changed_mind: "Changed my mind",
  other: "Other"
};

export function accountRoutes(db: DB): Router {
  const router = Router();
  router.use(requireAuth(db));

  router.get(
    "/",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const counts = db
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM orders WHERE user_id = ?) AS orders,
             (SELECT COUNT(*) FROM wishlist_items WHERE user_id = ?) AS wishlist,
             (SELECT COUNT(*) FROM addresses WHERE user_id = ?) AS addresses,
             (SELECT COUNT(*) FROM return_requests WHERE user_id = ? AND status IN ('requested','approved','received')) AS open_returns`
        )
        .get(user.id, user.id, user.id, user.id) as {
        orders: number;
        wishlist: number;
        addresses: number;
        open_returns: number;
      };
      res.json({ user, counts });
    })
  );

  router.patch(
    "/",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(profileSchema, req.body);
      db.prepare("UPDATE users SET name = ?, phone = ? WHERE id = ?").run(input.name, input.phone ?? null, user.id);
      audit(db, user.id, "account.profile_updated", "user", user.id);
      res.json({ user: { ...user, name: input.name, phone: input.phone ?? null } });
    })
  );

  router.get(
    "/addresses",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const rows = db
        .prepare("SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC")
        .all(user.id) as AddressRow[];
      res.json({ items: rows.map(serializeAddress) });
    })
  );

  router.post(
    "/addresses",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(addressSchema, req.body);
      const count = db.prepare("SELECT COUNT(*) AS count FROM addresses WHERE user_id = ?").get(user.id) as {
        count: number;
      };
      const makeDefault = input.isDefault || count.count === 0;
      const id = newId();
      transaction(db, () => {
        if (makeDefault) db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(user.id);
        db.prepare(
          `INSERT INTO addresses
             (id, user_id, label, recipient, phone, line1, line2, city, state, pincode, is_default, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          user.id,
          input.label || "Home",
          input.recipient,
          input.phone,
          input.line1,
          input.line2 ?? "",
          input.city,
          input.state,
          input.pincode,
          makeDefault ? 1 : 0,
          nowIso()
        );
      });
      const row = db.prepare("SELECT * FROM addresses WHERE id = ?").get(id) as AddressRow;
      audit(db, user.id, "account.address_added", "address", id);
      res.status(201).json({ address: serializeAddress(row) });
    })
  );

  router.patch(
    "/addresses/:id",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(addressSchema, req.body);
      const existing = db.prepare("SELECT * FROM addresses WHERE id = ? AND user_id = ?").get(String(req.params.id), user.id) as
        | AddressRow
        | undefined;
      if (!existing) throw new AppError(404, "ADDRESS_NOT_FOUND", "This address could not be found.");
      transaction(db, () => {
        if (input.isDefault) db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(user.id);
        db.prepare(
          `UPDATE addresses SET label = ?, recipient = ?, phone = ?, line1 = ?, line2 = ?, city = ?, state = ?,
             pincode = ?, is_default = ? WHERE id = ? AND user_id = ?`
        ).run(
          input.label || existing.label,
          input.recipient,
          input.phone,
          input.line1,
          input.line2 ?? "",
          input.city,
          input.state,
          input.pincode,
          input.isDefault ? 1 : existing.is_default,
          existing.id,
          user.id
        );
      });
      const row = db.prepare("SELECT * FROM addresses WHERE id = ?").get(existing.id) as AddressRow;
      audit(db, user.id, "account.address_updated", "address", existing.id);
      res.json({ address: serializeAddress(row) });
    })
  );

  router.delete(
    "/addresses/:id",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const result = db.prepare("DELETE FROM addresses WHERE id = ? AND user_id = ?").run(String(req.params.id), user.id);
      if (!result.changes) throw new AppError(404, "ADDRESS_NOT_FOUND", "This address could not be found.");
      audit(db, user.id, "account.address_deleted", "address", String(req.params.id));
      res.json({ ok: true });
    })
  );

  router.post(
    "/addresses/:id/default",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const existing = db.prepare("SELECT id FROM addresses WHERE id = ? AND user_id = ?").get(String(req.params.id), user.id);
      if (!existing) throw new AppError(404, "ADDRESS_NOT_FOUND", "This address could not be found.");
      transaction(db, () => {
        db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(user.id);
        db.prepare("UPDATE addresses SET is_default = 1 WHERE id = ?").run(String(req.params.id));
      });
      res.json({ ok: true });
    })
  );

  router.get(
    "/orders",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const { page, pageSize, offset } = pageParams(req.query as Record<string, unknown>, 20);
      const count = db.prepare("SELECT COUNT(*) AS total FROM orders WHERE user_id = ?").get(user.id) as { total: number };
      const rows = db
        .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
        .all(user.id, pageSize, offset) as OrderRow[];
      res.json({
        items: rows.map((row) => serializeOrder(db, row)),
        total: count.total,
        page,
        pageSize,
        pages: Math.max(1, Math.ceil(count.total / pageSize))
      });
    })
  );

  router.get(
    "/orders/:orderNumber",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const order = db
        .prepare("SELECT * FROM orders WHERE order_number = ? AND user_id = ?")
        .get(String(req.params.orderNumber).toUpperCase(), user.id) as OrderRow | undefined;
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "This order could not be found.");
      res.json({ order: serializeOrder(db, order) });
    })
  );

  router.post(
    "/orders/:orderNumber/cancel",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const order = db
        .prepare("SELECT * FROM orders WHERE order_number = ? AND user_id = ?")
        .get(String(req.params.orderNumber).toUpperCase(), user.id) as OrderRow | undefined;
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "This order could not be found.");
      if (!canTransition(order.status, "cancelled")) {
        throw new AppError(409, "CANCELLATION_NOT_ALLOWED", "This order can no longer be cancelled. Please contact us.");
      }
      const timestamp = nowIso();
      transaction(db, () => {
        db.prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?").run(timestamp, order.id);
        db.prepare(
          "INSERT INTO order_events (id, order_id, status, note, created_by, created_at) VALUES (?, ?, 'cancelled', ?, ?, ?)"
        ).run(newId(), order.id, "Cancelled by customer.", user.id, timestamp);
        restockOrder(db, order, user.id, "cancel");
      });
      audit(db, user.id, "order.cancelled_by_customer", "order", order.id, { orderNumber: order.order_number });
      res.json({ order: serializeOrder(db, { ...order, status: "cancelled", updated_at: timestamp }) });
    })
  );

  router.get(
    "/wishlist",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const rows = db
        .prepare("SELECT product_id FROM wishlist_items WHERE user_id = ? ORDER BY created_at DESC")
        .all(user.id) as Array<{ product_id: string }>;
      const items = rows
        .map((row) => getProductRowById(db, row.product_id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map(serializeSummary);
      res.json({ items });
    })
  );

  router.post(
    "/wishlist/:productId",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const product = getProductRowById(db, String(req.params.productId));
      if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "This product could not be found.");
      db.prepare("INSERT OR IGNORE INTO wishlist_items (user_id, product_id, created_at) VALUES (?, ?, ?)").run(
        user.id,
        product.id,
        nowIso()
      );
      res.status(201).json({ ok: true });
    })
  );

  router.delete(
    "/wishlist/:productId",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      db.prepare("DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?").run(user.id, String(req.params.productId));
      res.json({ ok: true });
    })
  );

  router.get(
    "/reviews",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const rows = db
        .prepare(
          `SELECT r.*, p.name AS product_name, p.slug AS product_slug
           FROM reviews r JOIN products p ON p.id = r.product_id
           WHERE r.user_id = ? ORDER BY r.created_at DESC`
        )
        .all(user.id) as Array<{
        id: string;
        product_id: string;
        product_name: string;
        product_slug: string;
        rating: number;
        title: string;
        body: string;
        status: string;
        verified_purchase: number;
        created_at: string;
      }>;
      res.json({
        items: rows.map((row) => ({
          id: row.id,
          productId: row.product_id,
          productName: row.product_name,
          productSlug: row.product_slug,
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
    "/reviews",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(reviewSchema, req.body);
      const order = db
        .prepare("SELECT * FROM orders WHERE order_number = ? AND user_id = ?")
        .get(input.orderNumber.toUpperCase(), user.id) as OrderRow | undefined;
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "We could not find that order in your account.");
      if (order.status !== "delivered") {
        throw new AppError(409, "REVIEW_NOT_ELIGIBLE", "Reviews can be written once your order has been delivered.");
      }
      const item = db
        .prepare("SELECT id FROM order_items WHERE order_id = ? AND product_id = ?")
        .get(order.id, input.productId);
      if (!item) throw new AppError(400, "REVIEW_NOT_ELIGIBLE", "This product was not part of that order.");

      const existing = db
        .prepare("SELECT id FROM reviews WHERE product_id = ? AND user_id = ?")
        .get(input.productId, user.id) as { id: string } | undefined;
      if (existing) {
        db.prepare(
          "UPDATE reviews SET rating = ?, title = ?, body = ?, status = 'pending', created_at = ? WHERE id = ?"
        ).run(input.rating, input.title ?? "", input.body, nowIso(), existing.id);
        audit(db, user.id, "review.resubmitted", "review", existing.id, { productId: input.productId });
        res.status(202).json({ ok: true, status: "pending", message: "Your updated review is awaiting moderation." });
        return;
      }
      const id = newId();
      db.prepare(
        `INSERT INTO reviews
           (id, product_id, user_id, order_id, rating, title, body, status, verified_purchase, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?)`
      ).run(id, input.productId, user.id, order.id, input.rating, input.title ?? "", input.body, nowIso());
      audit(db, user.id, "review.submitted", "review", id, { productId: input.productId });
      res.status(202).json({ ok: true, status: "pending", message: "Thank you — your review is awaiting moderation." });
    })
  );

  router.get(
    "/returns",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const rows = db
        .prepare(
          `SELECT rr.*, o.order_number FROM return_requests rr JOIN orders o ON o.id = rr.order_id
           WHERE rr.user_id = ? ORDER BY rr.created_at DESC`
        )
        .all(user.id) as Array<{
        request_number: string;
        order_number: string;
        reason: string;
        detail: string;
        status: string;
        admin_note: string;
        created_at: string;
      }>;
      res.json({
        items: rows.map((row) => ({
          requestNumber: row.request_number,
          orderNumber: row.order_number,
          reason: row.reason,
          reasonLabel: RETURN_REASONS[row.reason] ?? row.reason,
          detail: row.detail,
          status: row.status,
          adminNote: row.admin_note,
          createdAt: row.created_at
        }))
      });
    })
  );

  router.post(
    "/returns",
    route((req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(returnSchema, req.body);
      const policy = getSetting(db, "returns", { enabled: true, windowDays: 7 });
      if (!policy.enabled) throw new AppError(409, "RETURNS_DISABLED", "Returns are not currently available.");
      const order = db
        .prepare("SELECT * FROM orders WHERE order_number = ? AND user_id = ?")
        .get(input.orderNumber.toUpperCase(), user.id) as OrderRow | undefined;
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "This order could not be found.");
      if (order.status !== "delivered") {
        throw new AppError(409, "RETURN_NOT_ELIGIBLE", "Returns can be requested after delivery.");
      }
      const delivered = db
        .prepare("SELECT created_at FROM order_events WHERE order_id = ? AND status = 'delivered' ORDER BY created_at DESC LIMIT 1")
        .get(order.id) as { created_at: string } | undefined;
      const deliveredAt = delivered ? new Date(delivered.created_at) : new Date(order.updated_at);
      const ageDays = (Date.now() - deliveredAt.getTime()) / 86400000;
      if (ageDays > policy.windowDays) {
        throw new AppError(409, "RETURN_WINDOW_CLOSED", `The ${policy.windowDays}-day return window has closed.`);
      }
      const item = db
        .prepare(
          `SELECT oi.id, oi.product_id, p.return_eligible
           FROM order_items oi JOIN products p ON p.id = oi.product_id
           WHERE oi.id = ? AND oi.order_id = ?`
        )
        .get(input.orderItemId, order.id) as { id: string; product_id: string; return_eligible: number } | undefined;
      if (!item) throw new AppError(400, "RETURN_NOT_ELIGIBLE", "That item is not part of this order.");
      if (!item.return_eligible) {
        throw new AppError(409, "RETURN_NOT_ELIGIBLE", "This item is not eligible for return. Personalised items are excluded.");
      }
      const open = db
        .prepare(
          "SELECT id FROM return_requests WHERE order_id = ? AND order_item_id = ? AND status IN ('requested','approved','received')"
        )
        .get(order.id, item.id);
      if (open) throw new AppError(409, "RETURN_EXISTS", "A return request already exists for this item.");

      const id = newId();
      const requestNumber = `SR-${Date.now().toString(36).toUpperCase()}`;
      db.prepare(
        `INSERT INTO return_requests
           (id, request_number, order_id, order_item_id, user_id, email, reason, detail, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)`
      ).run(
        id,
        requestNumber,
        order.id,
        item.id,
        user.id,
        user.email,
        input.reason,
        input.detail ?? "",
        nowIso(),
        nowIso()
      );
      audit(db, user.id, "return.requested", "return_request", id, { orderNumber: order.order_number });
      res.status(201).json({
        request: { requestNumber, status: "requested" },
        message: "Your return request has been recorded. The store will review it and contact you."
      });
    })
  );

  return router;
}
