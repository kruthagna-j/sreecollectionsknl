import { getSetting, newId, type DB } from "../db.js";
import { latestEmailStatus, getNotificationSettings } from "./notifications.js";

export type OrderRow = {
  id: string;
  order_number: string;
  user_id: string | null;
  email: string;
  phone: string;
  status: string;
  payment_method: "cod" | "online";
  payment_status: "cod_pending" | "paid" | "failed" | "refunded";
  subtotal: number;
  discount: number;
  gift_wrap_total: number;
  shipping_fee: number;
  cod_fee: number;
  tax_included: number;
  tax_exclusive: number;
  tax_mode: "inclusive" | "exclusive";
  total: number;
  currency: string;
  coupon_code: string | null;
  shipping_address: string;
  billing_address: string;
  gift_message: string;
  customer_note: string;
  admin_note: string;
  payment_reference: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  idempotency_key: string | null;
  shipping_zone: string | null;
  eta_days_min: number | null;
  eta_days_max: number | null;
  created_at: string;
  updated_at: string;
};

export type AddressSnapshot = {
  recipient: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
};

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "returned"
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: [],
  returned: []
};

export function canTransition(from: string, to: OrderStatus): boolean {
  return (TRANSITIONS[from as OrderStatus] ?? []).includes(to);
}

export function parseAddress(value: string): AddressSnapshot {
  try {
    return JSON.parse(value) as AddressSnapshot;
  } catch {
    return { recipient: "", phone: "", line1: "", city: "", state: "", pincode: "" };
  }
}

const PERSONALIZATION_LABELS: Record<string, string> = {
  recipientName: "For",
  senderName: "From",
  message: "Message",
  engraving: "Engraving",
  font: "Font",
  color: "Colour"
};

export function parsePersonalizationObject(value: string | null | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(String(value || "{}")) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, text]) => typeof text === "string")
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Personalization arrives as free-form JSON, so a broken row must degrade to "nothing extra"
 * rather than throw inside the invoice render that a customer is waiting on.
 */
export function personalizationEntries(value: string | null | undefined): Array<{ label: string; text: string }> {
  return Object.entries(parsePersonalizationObject(value))
    .filter(([, text]) => Boolean(text.trim()))
    .map(([key, text]) => ({ label: PERSONALIZATION_LABELS[key] ?? key, text: text.trim() }));
}

function orderItems(db: DB, orderId: string) {
  return db
    .prepare(
      `SELECT oi.*, p.slug AS product_slug
       FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ? ORDER BY oi.rowid`
    )
    .all(orderId) as Array<{
    id: string;
    product_id: string;
    product_slug: string | null;
    variant_id: string;
    name: string;
    sku: string;
    variant_name: string | null;
    image_url: string;
    unit_price: number;
    quantity: number;
    line_subtotal: number;
    line_discount: number;
    tax_included: number;
    line_total: number;
    gift_wrap: number;
    gift_message: string;
    personalization_json: string;
  }>;
}

function orderEvents(db: DB, orderId: string) {
  return db
    .prepare("SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY created_at, rowid")
    .all(orderId) as Array<{ status: string; note: string; created_at: string }>;
}

export function sanitizeWhatsApp(value: string | undefined | null): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : "";
}

export function serializeOrder(db: DB, order: OrderRow, options: { admin?: boolean } = {}) {
  const items = orderItems(db, order.id);
  const store = getSetting<{ supportWhatsApp?: string }>(db, "store", {});
  const notificationSettings = getNotificationSettings(db);
  const whatsapp = sanitizeWhatsApp(store.supportWhatsApp);
  const emailStatus = latestEmailStatus(db, order.id);
  const shippingAddress = parseAddress(order.shipping_address);
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    email: order.email,
    phone: order.phone,
    currency: order.currency,
    totals: {
      subtotal: order.subtotal,
      discount: order.discount,
      giftWrap: order.gift_wrap_total,
      shipping: order.shipping_fee,
      codFee: order.cod_fee,
      taxIncluded: order.tax_included,
      taxExclusive: order.tax_exclusive,
      taxMode: order.tax_mode,
      total: order.total
    },
    couponCode: order.coupon_code,
    shippingAddress,
    billingAddress: parseAddress(order.billing_address),
    delivery: {
      pincode: shippingAddress.pincode,
      zone: order.shipping_zone,
      etaDaysMin: order.eta_days_min,
      etaDaysMax: order.eta_days_max
    },
    giftMessage: order.gift_message,
    customerNote: order.customer_note,
    tracking: order.tracking_number
      ? { number: order.tracking_number, url: order.tracking_url }
      : null,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      slug: item.product_slug,
      name: item.name,
      sku: item.sku,
      variantName: item.variant_name,
      image: item.image_url,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      lineSubtotal: item.line_subtotal,
      lineDiscount: item.line_discount,
      lineTotal: item.line_total,
      giftWrap: Boolean(item.gift_wrap),
      giftMessage: item.gift_message || "",
      personalization: parsePersonalizationObject(item.personalization_json)
    })),
    events: orderEvents(db, order.id),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    notifications: {
      email: emailStatus,
      sms: "not_configured",
      whatsapp: whatsapp ? "click_to_chat" : "not_configured",
      whatsappNumber: whatsapp,
      whatsappAutoOpen: notificationSettings.whatsappAutoOpen
    },
    ...(options.admin
      ? {
          userId: order.user_id,
          adminNote: order.admin_note,
          paymentReference: order.payment_reference,
          idempotencyKey: order.idempotency_key,
          nextStatuses: TRANSITIONS[order.status as OrderStatus] ?? []
        }
      : {})
  };
}

export function findOrderForViewer(
  db: DB,
  options: { orderNumber: string; email?: string | null; userId?: string | null }
): OrderRow | null {
  const order = db
    .prepare("SELECT * FROM orders WHERE order_number = ?")
    .get(options.orderNumber.trim().toUpperCase()) as OrderRow | undefined;
  if (!order) return null;
  if (options.userId && order.user_id === options.userId) return order;
  if (options.email && order.email.toLowerCase() === options.email.trim().toLowerCase()) return order;
  return null;
}

export function restockOrder(db: DB, order: OrderRow, actorId: string, reason: string): void {
  const items = orderItems(db, order.id);
  for (const item of items) {
    if (item.variant_id) {
      db.prepare("UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?").run(
        item.quantity,
        item.variant_id
      );
    } else {
      db.prepare("UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?").run(
        item.quantity,
        new Date().toISOString(),
        item.product_id
      );
    }
    db.prepare(
      `INSERT INTO stock_movements (id, product_id, variant_id, delta, reason, reference, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId(),
      item.product_id,
      item.variant_id,
      item.quantity,
      reason,
      order.order_number,
      actorId,
      new Date().toISOString()
    );
  }
}
