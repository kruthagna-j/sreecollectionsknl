import { afterEach, describe, expect, it } from "vitest";
import type { DB } from "../../server/db.js";
import { setSetting } from "../../server/db.js";
import { buildQuote, evaluateCoupon } from "../../server/lib/pricing.js";
import { quoteShipping } from "../../server/lib/shipping.js";
import { addCartItem, createCart, createTestDb, productBySlug } from "../helpers.js";

let db: DB;

function freshDb() {
  db = createTestDb();
  return db;
}

afterEach(() => {
  db?.close();
});

describe("shipping zones", () => {
  it("quotes the configured local zone and its estimate", () => {
    const quote = quoteShipping(freshDb(), " 518001 ", 100000);
    expect(quote.serviceable).toBe(true);
    expect(quote.zoneName).toContain("Local delivery");
    expect(quote.fee).toBe(4900);
    expect(quote.etaDaysMin).toBe(1);
    expect(quote.etaDaysMax).toBe(2);
    expect(quote.freeApplied).toBe(false);
  });

  it("applies the free-delivery threshold to the goods total", () => {
    const quote = quoteShipping(freshDb(), "518002", 250000);
    expect(quote.serviceable).toBe(true);
    expect(quote.freeApplied).toBe(true);
    expect(quote.fee).toBe(0);
  });

  it("rejects malformed PIN codes", () => {
    const quote = quoteShipping(freshDb(), "01234", 100000);
    expect(quote.serviceable).toBe(false);
    expect(quote.fee).toBe(0);
    expect(quote.message).toMatch(/valid 6-digit/i);
  });

  it("delivers to any valid PIN code through the all-India zone", () => {
    const quote = quoteShipping(freshDb(), "110001", 100000);
    expect(quote).toMatchObject({
      serviceable: true,
      zoneName: "All India delivery",
      fee: 9900,
      etaDaysMin: 4,
      etaDaysMax: 7,
      freeAbove: 199900,
      freeApplied: false
    });
  });

  it("includes delivery pan-India above the all-India threshold", () => {
    const quote = quoteShipping(freshDb(), "781001", 199900);
    expect(quote).toMatchObject({ serviceable: true, freeApplied: true, fee: 0 });
  });

  it("prefers the more specific zone before the all-India fallback", () => {
    db = freshDb();
    db.prepare(
      `INSERT INTO shipping_zones (id, name, pincodes, fee, free_above, eta_days_min, eta_days_max, is_active, sort_order)
       VALUES ('zone-range-test', 'Bengaluru test', '560001-560010', 7900, NULL, 2, 4, 1, 2)`
    ).run();
    expect(quoteShipping(db, "560005", 10000)).toMatchObject({ serviceable: true, fee: 7900, etaDaysMax: 4 });
    expect(quoteShipping(db, "560011", 10000)).toMatchObject({
      serviceable: true,
      zoneName: "All India delivery",
      fee: 9900
    });
  });

  it("ignores inactive zones", () => {
    db = freshDb();
    db.prepare("UPDATE shipping_zones SET is_active = 0").run();
    expect(quoteShipping(db, "518001", 10000).serviceable).toBe(false);
  });

  it("reports unserviceable when no active zone covers the PIN", () => {
    db = freshDb();
    db.prepare("UPDATE shipping_zones SET is_active = 0 WHERE id = 'zone-all-india'").run();
    const quote = quoteShipping(db, "110001", 10000);
    expect(quote.serviceable).toBe(false);
    expect(quote.message).toMatch(/do not currently deliver/i);
  });
});

describe("cart pricing", () => {
  it("uses the selected variant's server price, not the product headline price", () => {
    db = freshDb();
    const cart = createCart(db);
    addCartItem(db, cart.id, "engraved-memory-locket", { variantIndex: 1, quantity: 2 });
    const quote = buildQuote(db, cart);

    expect(quote.lines).toHaveLength(1);
    expect(quote.lines[0].unitPrice).toBe(159900);
    expect(quote.subtotal).toBe(319800);
    expect(quote.itemCount).toBe(2);
  });

  it("adds gift wrap per unit and free delivery above the threshold", () => {
    db = freshDb();
    const cart = createCart(db, { pincode: "518001" });
    addCartItem(db, cart.id, "engraved-memory-locket", { variantIndex: 1, quantity: 2, giftWrap: true });
    const quote = buildQuote(db, cart);

    expect(quote.giftWrapTotal).toBe(19800);
    expect(quote.shippingFee).toBe(0);
    expect(quote.total).toBe(319800 + 19800);
    expect(quote.taxIncluded).toBe(15229 + 943);
    expect(quote.taxMode).toBe("inclusive");
  });

  it("does not charge gift wrap when the product does not offer it", () => {
    db = freshDb();
    const cart = createCart(db);
    addCartItem(db, cart.id, "rose-gift-box", { quantity: 1, giftWrap: true });
    const quote = buildQuote(db, cart);

    expect(quote.lines[0].giftWrap).toBe(false);
    expect(quote.giftWrapTotal).toBe(0);
  });

  it("applies a percentage coupon before delivery and allocates it to the line", () => {
    db = freshDb();
    const cart = createCart(db, { pincode: "518001" });
    addCartItem(db, cart.id, "rose-keepsake-box", { quantity: 1 });
    const quote = buildQuote(db, cart, { couponCode: "devwelcome" });

    expect(quote.coupon?.valid).toBe(true);
    expect(quote.discount).toBe(14990);
    expect(quote.lines[0].lineDiscount).toBe(14990);
    expect(quote.lines[0].lineTotal).toBe(134910);
    expect(quote.shippingFee).toBe(4900);
    expect(quote.total).toBe(134910 + 4900);
    expect(quote.couponError).toBeNull();
  });

  it("rejects a coupon below its minimum subtotal", () => {
    db = freshDb();
    const cart = createCart(db);
    addCartItem(db, cart.id, "personalised-journal", { quantity: 1 });
    const quote = buildQuote(db, cart, { couponCode: "DEVWELCOME" });

    expect(quote.coupon).toBeNull();
    expect(quote.discount).toBe(0);
    expect(quote.couponError).toMatch(/at least/i);
  });

  it("supports free-delivery coupons", () => {
    db = freshDb();
    db.prepare(
      `INSERT INTO coupons (id, code, kind, value, min_subtotal, per_email_limit, is_active, created_at)
       VALUES ('coupon-test-ship', 'FREESHIP', 'free_shipping', 0, 0, 1, 1, ?)`
    ).run(new Date().toISOString());
    const cart = createCart(db, { pincode: "518001" });
    addCartItem(db, cart.id, "personalised-journal", { quantity: 1 });
    const quote = buildQuote(db, cart, { couponCode: "FREESHIP" });

    expect(quote.coupon?.freeShipping).toBe(true);
    expect(quote.shippingFee).toBe(0);
    expect(quote.total).toBe(89900);
  });

  it("caps fixed coupons and never discounts below zero", () => {
    db = freshDb();
    db.prepare(
      `INSERT INTO coupons (id, code, kind, value, min_subtotal, max_discount, per_email_limit, is_active, created_at)
       VALUES ('coupon-test-fixed', 'BIGSAVE', 'fixed', 50000, 0, 30000, 1, 1, ?)`
    ).run(new Date().toISOString());
    const cart = createCart(db);
    addCartItem(db, cart.id, "personalised-journal", { quantity: 1 });

    const capped = evaluateCoupon(db, "BIGSAVE", { subtotal: 89900 });
    expect(capped.discount).toBe(30000);

    db.prepare("UPDATE coupons SET max_discount = NULL, value = 999999 WHERE code = 'BIGSAVE'").run();
    const limited = evaluateCoupon(db, "BIGSAVE", { subtotal: 89900 });
    expect(limited.discount).toBe(89900);
  });

  it("enforces per-email redemption limits", () => {
    db = freshDb();
    const cart = createCart(db);
    addCartItem(db, cart.id, "rose-keepsake-box", { quantity: 1 });
    const coupon = db.prepare("SELECT id FROM coupons WHERE code = 'DEVWELCOME'").get() as { id: string };
    const order = db
      .prepare(
        `INSERT INTO orders (id, order_number, email, phone, status, payment_method, payment_status,
          subtotal, discount, total, shipping_address, billing_address)
         VALUES ('order-coupon-test', 'SC-TEST-COUPON', 'repeat@example.com', '9876543210', 'pending', 'cod', 'cod_pending',
          149900, 14990, 134910, '{}', '{}')`
      )
      .run();
    expect(order.changes).toBe(1);
    db.prepare(
      "INSERT INTO coupon_redemptions (id, coupon_id, order_id, email, created_at) VALUES ('redemption-test', ?, 'order-coupon-test', 'repeat@example.com', ?)"
    ).run(coupon.id, new Date().toISOString());

    const repeat = buildQuote(db, cart, { couponCode: "DEVWELCOME", email: "repeat@example.com" });
    expect(repeat.coupon).toBeNull();
    expect(repeat.couponError).toMatch(/already used/i);

    const other = buildQuote(db, cart, { couponCode: "DEVWELCOME", email: "new@example.com" });
    expect(other.coupon?.valid).toBe(true);
  });

  it("excludes unpublished items and reports why", () => {
    db = freshDb();
    const cart = createCart(db);
    addCartItem(db, cart.id, "rose-keepsake-box", { quantity: 1 });
    addCartItem(db, cart.id, "bunny-plush", { quantity: 1 });
    db.prepare("UPDATE products SET status = 'draft' WHERE slug = 'bunny-plush'").run();

    const quote = buildQuote(db, cart);
    expect(quote.subtotal).toBe(149900);
    expect(quote.itemCount).toBe(1);
    expect(quote.lines.find((line) => line.slug === "bunny-plush")?.available).toBe(false);
    expect(quote.issues.some((issue) => /no longer available/i.test(issue))).toBe(true);
  });

  it("flags a missing variant and quantites above stock", () => {
    db = freshDb();
    const cart = createCart(db);
    addCartItem(db, cart.id, "rose-keepsake-box", { quantity: 1 });
    db.prepare("UPDATE cart_items SET variant_id = '' WHERE cart_id = ?").run(cart.id);
    expect(buildQuote(db, cart).issues[0]).toMatch(/choose an option/i);

    db.prepare("UPDATE cart_items SET variant_id = (SELECT id FROM product_variants WHERE sku = 'SC-BD-001-BL'), quantity = 20 WHERE cart_id = ?").run(cart.id);
    db.prepare("UPDATE product_variants SET stock_quantity = 3 WHERE sku = 'SC-BD-001-BL'").run();
    expect(buildQuote(db, cart).issues[0]).toMatch(/only 3 left/i);
  });

  it("returns an empty quote with a clear issue for an empty cart", () => {
    const cart = createCart(freshDb());
    const quote = buildQuote(db, cart);
    expect(quote.lines).toHaveLength(0);
    expect(quote.total).toBe(0);
    expect(quote.issues).toContain("Your cart is empty.");
  });

  it("adds exclusive tax to the payable total when configured", () => {
    db = freshDb();
    setSetting(db, "tax", { inclusive: false, defaultRateBps: 500 });
    const cart = createCart(db);
    addCartItem(db, cart.id, "rose-keepsake-box", { quantity: 1 });
    const quote = buildQuote(db, cart);

    expect(quote.taxMode).toBe("exclusive");
    const expectedTax = Math.round((149900 * 500) / 10000);
    expect(quote.taxExclusive).toBe(expectedTax);
    expect(quote.total).toBe(149900 + expectedTax);
  });

  it("disables cash on delivery when the configured value is exceeded", () => {
    db = freshDb();
    setSetting(db, "cod", { enabled: true, maxTotal: 100000, fee: 0 });
    const cart = createCart(db);
    addCartItem(db, cart.id, "rose-keepsake-box", { quantity: 1 });
    const cod = buildQuote(db, cart).paymentMethods.find((method) => method.id === "cod");
    expect(cod?.available).toBe(false);
    expect(cod?.reason).toMatch(/above the cash-on-delivery limit/i);
  });
});
