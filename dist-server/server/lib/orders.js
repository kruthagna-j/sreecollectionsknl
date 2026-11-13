import { getSetting, newId } from "../db.js";
import { latestEmailStatus, getNotificationSettings } from "./notifications.js";
export const ORDER_STATUSES = [
    "pending",
    "confirmed",
    "packed",
    "shipped",
    "delivered",
    "cancelled",
    "returned"
];
const TRANSITIONS = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["packed", "cancelled"],
    packed: ["shipped", "cancelled"],
    shipped: ["delivered", "returned"],
    delivered: ["returned"],
    cancelled: [],
    returned: []
};
export function canTransition(from, to) {
    return (TRANSITIONS[from] ?? []).includes(to);
}
export function parseAddress(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return { recipient: "", phone: "", line1: "", city: "", state: "", pincode: "" };
    }
}
const PERSONALIZATION_LABELS = {
    recipientName: "For",
    senderName: "From",
    message: "Message",
    engraving: "Engraving",
    font: "Font",
    color: "Colour"
};
export function parsePersonalizationObject(value) {
    try {
        const parsed = JSON.parse(String(value || "{}"));
        if (!parsed || typeof parsed !== "object")
            return {};
        return Object.fromEntries(Object.entries(parsed).filter(([, text]) => typeof text === "string"));
    }
    catch {
        return {};
    }
}
/**
 * Personalization arrives as free-form JSON, so a broken row must degrade to "nothing extra"
 * rather than throw inside the invoice render that a customer is waiting on.
 */
export function personalizationEntries(value) {
    return Object.entries(parsePersonalizationObject(value))
        .filter(([, text]) => Boolean(text.trim()))
        .map(([key, text]) => ({ label: PERSONALIZATION_LABELS[key] ?? key, text: text.trim() }));
}
function orderItems(db, orderId) {
    return db
        .prepare(`SELECT oi.*, p.slug AS product_slug
       FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ? ORDER BY oi.rowid`)
        .all(orderId);
}
function orderEvents(db, orderId) {
    return db
        .prepare("SELECT status, note, created_at FROM order_events WHERE order_id = ? ORDER BY created_at, rowid")
        .all(orderId);
}
export function sanitizeWhatsApp(value) {
    const digits = (value ?? "").replace(/\D/g, "");
    if (!digits)
        return "";
    if (digits.length === 10)
        return `91${digits}`;
    if (digits.length === 11 && digits.startsWith("0"))
        return `91${digits.slice(1)}`;
    return digits.length >= 11 && digits.length <= 15 ? digits : "";
}
export function serializeOrder(db, order, options = {}) {
    const items = orderItems(db, order.id);
    const store = getSetting(db, "store", {});
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
                nextStatuses: TRANSITIONS[order.status] ?? []
            }
            : {})
    };
}
export function findOrderForViewer(db, options) {
    const order = db
        .prepare("SELECT * FROM orders WHERE order_number = ?")
        .get(options.orderNumber.trim().toUpperCase());
    if (!order)
        return null;
    if (options.userId && order.user_id === options.userId)
        return order;
    if (options.email && order.email.toLowerCase() === options.email.trim().toLowerCase())
        return order;
    return null;
}
export function restockOrder(db, order, actorId, reason) {
    const items = orderItems(db, order.id);
    for (const item of items) {
        if (item.variant_id) {
            db.prepare("UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?").run(item.quantity, item.variant_id);
        }
        else {
            db.prepare("UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?").run(item.quantity, new Date().toISOString(), item.product_id);
        }
        db.prepare(`INSERT INTO stock_movements (id, product_id, variant_id, delta, reason, reference, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(newId(), item.product_id, item.variant_id, item.quantity, reason, order.order_number, actorId, new Date().toISOString());
    }
}
