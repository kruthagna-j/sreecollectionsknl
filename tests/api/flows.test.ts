import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../server/app.js";
import { newId, nowIso, setSetting, type DB } from "../../server/db.js";
import { hashPassword } from "../../server/lib/auth.js";
import { createTestDb, TestClient as Client, type Json } from "../helpers.js";

let db: DB;
let server: Server;
let base: string;
let owner: Client;
let product: { id: string; variants: Array<{ id: string; price: number; stock: number }>; price: number };

const OWNER = { email: "owner-test@example.com", password: "TestOwner#2026" };

const address = (pincode = "518001") => ({
  recipient: "Test Buyer",
  phone: "9876543210",
  line1: "12 Test Street",
  city: "Kurnool",
  state: "Andhra Pradesh",
  pincode
});

function checkoutBody(overrides: Json = {}) {
  return {
    contact: { name: "Test Buyer", email: "buyer@example.com", phone: "9876543210" },
    shippingAddress: address(),
    billingSameAsShipping: true,
    paymentMethod: "cod",
    giftMessage: "",
    customerNote: "",
    acceptTerms: true,
    ...overrides
  };
}

beforeAll(async () => {
  db = createTestDb();
  const passwordHash = await hashPassword(OWNER.password);
  db.prepare("INSERT INTO users (id, email, password_hash, name, phone, role, created_at) VALUES (?, ?, ?, ?, NULL, 'owner', ?)").run(
    newId(),
    OWNER.email,
    passwordHash,
    "Test Owner",
    nowIso()
  );

  const app = createApp(db);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  owner = new Client(base);
  const login = await owner.post("/api/v1/auth/login", { email: OWNER.email, password: OWNER.password });
  expect(login.status).toBe(200);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
});

describe("public API", () => {
  it("reports health without exposing integrations as verified", async () => {
    const client = new Client(base);
    const response = await client.get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({ status: "ok", database: "ok" });
    expect((response.data as Json).environment).toBeUndefined();
    expect((response.data as Json).integrations.onlinePayments).toBe("not_configured");
  });

  it("gives crawlers a robots file and a sitemap instead of the app shell", async () => {
    const robots = await fetch(`${base}/robots.txt`);
    expect(robots.status).toBe(200);
    expect(robots.headers.get("content-type")).toContain("text/plain");
    const robotsBody = await robots.text();
    expect(robotsBody).toContain("Disallow: /admin");
    expect(robotsBody).toContain("Disallow: /api/");
    expect(robotsBody).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/);

    const sitemap = await fetch(`${base}/sitemap.xml`);
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get("content-type")).toContain("application/xml");
    const xml = await sitemap.text();
    const published = db.prepare("SELECT slug FROM products WHERE status = 'published'").all() as Array<{ slug: string }>;
    for (const product of published) expect(xml).toContain(`/product/${product.slug}`);
    expect(xml).toContain("<loc>");
    expect((xml.match(/<url>/g) ?? []).length).toBeGreaterThan(published.length);
  });

  it("keeps unpublished products out of the sitemap", async () => {
    db.prepare("UPDATE products SET status = 'draft' WHERE slug = 'rose-keepsake-box'").run();
    try {
      const xml = await (await fetch(`${base}/sitemap.xml`)).text();
      expect(xml).not.toContain("/product/rose-keepsake-box");
    } finally {
      db.prepare("UPDATE products SET status = 'published' WHERE slug = 'rose-keepsake-box'").run();
    }
  });

  it("answers unknown non-HTML paths with a 404 rather than the storefront", async () => {
    const missing = await fetch(`${base}/anything.txt`);
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("NOT_FOUND");
  });

  it("serves only the published catalogue", async () => {
    const client = new Client(base);
    db.prepare("UPDATE products SET status = 'draft' WHERE slug = 'bunny-plush'").run();
    try {
      const response = await client.get("/api/v1/catalog/products?pageSize=50");
      expect(response.status).toBe(200);
      const body = response.data as Json;
      expect(body.total).toBeGreaterThanOrEqual(11);
      expect(body.items.some((item: Json) => item.slug === "bunny-plush")).toBe(false);
    } finally {
      db.prepare("UPDATE products SET status = 'published' WHERE slug = 'bunny-plush'").run();
    }

    const hidden = await client.get("/api/v1/catalog/products?q=Linen%20Bunny");
    expect(hidden.status).toBe(200);
    expect((hidden.data as Json).items.some((item: Json) => item.slug === "bunny-plush")).toBe(true);
  });

  it("rejects state-changing requests without a CSRF token", async () => {
    const response = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: OWNER.email, password: OWNER.password })
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("CSRF_FAILED");
  });

  it("rejects untrusted origins", async () => {
    const client = new Client(base);
    const response = await client.request("/api/v1/cart/items", {
      method: "POST",
      body: { productId: "prod-bunny-plush", quantity: 1 },
      headers: { Origin: "https://attacker.example" }
    });
    expect(response.status).toBe(403);
    expect((response.data as Json).error.code).toBe("ORIGIN_NOT_ALLOWED");
  });
});

describe("cart and pricing", () => {
  it("prices from the database and ignores browser-supplied prices", async () => {
    const client = new Client(base);
    const detail = await client.get("/api/v1/catalog/products/rose-keepsake-box");
    product = (detail.data as Json).product;
    const variant = product.variants[0];

    const response = await client.post("/api/v1/cart/items", {
      productId: product.id,
      variantId: variant.id,
      quantity: 1,
      price: 1,
      unitPrice: 1,
      total: 1
    });
    expect(response.status).toBe(201);
    const cart = (response.data as Json).cart;
    expect(cart.subtotal).toBe(variant.price);
    expect(cart.total).toBe(variant.price);
    expect(cart.lines[0].unitPrice).toBe(variant.price);
  });

  it("requires a variant and respects stock", async () => {
    const client = new Client(base);
    const detail = await client.get("/api/v1/catalog/products/rose-keepsake-box");
    const item = (detail.data as Json).product;
    const missing = await client.post("/api/v1/cart/items", { productId: item.id });
    expect(missing.status).toBe(400);
    expect((missing.data as Json).error.code).toBe("VARIANT_REQUIRED");

    const tooMany = await client.post("/api/v1/cart/items", {
      productId: item.id,
      variantId: item.variants[0].id,
      quantity: 20
    });
    expect(tooMany.status).toBe(409);
    expect((tooMany.data as Json).error.code).toBe("INSUFFICIENT_STOCK");
  });

  it("blocks gift wrapping where it is not offered", async () => {
    const client = new Client(base);
    const response = await client.post("/api/v1/cart/items", {
      productId: "prod-rose-gift-box",
      quantity: 1,
      giftWrap: true
    });
    expect(response.status).toBe(400);
    expect((response.data as Json).error.code).toBe("GIFT_WRAP_UNAVAILABLE");
  });

  it("requires personalisation for personalised products and stores only allowed fields", async () => {
    const client = new Client(base);
    const detail = await client.get("/api/v1/catalog/products/personalised-journal");
    const variantId = (detail.data as Json).product.variants[0].id;

    const missing = await client.post("/api/v1/cart/items", {
      productId: "prod-personalised-journal",
      variantId,
      quantity: 1
    });
    expect(missing.status).toBe(400);
    expect((missing.data as Json).error.code).toBe("PERSONALIZATION_REQUIRED");

    const created = await client.post("/api/v1/cart/items", {
      productId: "prod-personalised-journal",
      variantId,
      quantity: 1,
      personalization: { recipientName: "Asha", message: "With love", madeUpField: "drop me", color: "gold" }
    });
    expect(created.status).toBe(201);
    expect((created.data as Json).cart.lines[0].personalization).toEqual({
      recipientName: "Asha",
      message: "With love",
      color: "gold"
    });
  });

  it("quotes local and pan-India delivery, then places a remote order", async () => {
    const client = new Client(base);
    const added = await client.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    expect(added.status).toBe(201);

    const local = await client.post("/api/v1/cart/shipping", { pincode: "518001" });
    expect(local.status).toBe(200);
    expect((local.data as Json).cart.shipping).toMatchObject({ serviceable: true, fee: 4900 });

    const remote = await client.post("/api/v1/cart/shipping", { pincode: "110001" });
    expect(remote.status).toBe(200);
    expect((remote.data as Json).cart.shipping).toMatchObject({
      serviceable: true,
      zoneName: "All India delivery",
      fee: 9900,
      etaDaysMin: 4,
      etaDaysMax: 7
    });

    const email = `remote-${Date.now()}@example.com`;
    const checkout = await client.post(
      "/api/v1/checkout",
      checkoutBody({
        contact: { name: "Test Buyer", email, phone: "9876543210" },
        shippingAddress: address("110001"),
        idempotencyKey: `remote-${Date.now()}`
      })
    );
    expect(checkout.status).toBe(201);
    const order = (checkout.data as Json).order;
    expect(order.delivery).toEqual({ pincode: "110001", zone: "All India delivery", etaDaysMin: 4, etaDaysMax: 7 });
    expect(order.totals.shipping).toBe(9900);

    const invoice = await client.get(
      `/api/v1/orders/${encodeURIComponent(order.orderNumber)}/invoice.pdf?email=${encodeURIComponent(email)}`
    );
    expect(invoice.status).toBe(200);
    expect(invoice.headers.get("content-type")).toBe("application/pdf");
    expect(invoice.headers.get("cache-control")).toBe("no-store");
  });

  it("reports an unserviceable PIN when no active zone covers it", async () => {
    db.prepare("UPDATE shipping_zones SET is_active = 0").run();
    try {
      const client = new Client(base);
      await client.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });

      const quote = await client.post("/api/v1/cart/shipping", { pincode: "110001" });
      expect(quote.status).toBe(200);
      expect((quote.data as Json).cart.shipping.serviceable).toBe(false);

      const checkout = await client.post("/api/v1/checkout", checkoutBody({ shippingAddress: address("110001") }));
      expect(checkout.status).toBe(400);
      expect((checkout.data as Json).error.code).toBe("OUT_OF_DELIVERY_AREA");
    } finally {
      db.prepare("UPDATE shipping_zones SET is_active = 1").run();
    }
  });

  it("applies and removes real coupons", async () => {
    const client = new Client(base);
    await client.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    await client.post("/api/v1/cart/shipping", { pincode: "518001" });

    const rejected = await client.post("/api/v1/cart/coupon", { code: "NOT-A-COUPON" });
    expect(rejected.status).toBe(400);
    expect((rejected.data as Json).error.code).toBe("COUPON_REJECTED");

    const applied = await client.post("/api/v1/cart/coupon", { code: "devwelcome" });
    expect(applied.status).toBe(200);
    expect((applied.data as Json).cart.coupon).toMatchObject({ code: "DEVWELCOME", valid: true });
    expect((applied.data as Json).cart.discount).toBe(9990);

    const removed = await client.request("/api/v1/cart/coupon", { method: "DELETE" });
    expect(removed.status).toBe(200);
    expect((removed.data as Json).cart.discount).toBe(0);
  });
});

describe("checkout", () => {
  it("rejects online payment without taking money", async () => {
    const client = new Client(base);
    await client.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    const before = db.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number };

    const response = await client.post("/api/v1/checkout", checkoutBody({ paymentMethod: "online" }));
    expect(response.status).toBe(503);
    expect((response.data as Json).error.code).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    const after = db.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number };
    expect(after.count).toBe(before.count);
  });

  it("validates terms and address details", async () => {
    const client = new Client(base);
    await client.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    const noTerms = await client.post("/api/v1/checkout", checkoutBody({ acceptTerms: false }));
    expect(noTerms.status).toBe(400);
    expect((noTerms.data as Json).error.code).toBe("VALIDATION_ERROR");

    const badPin = await client.post(
      "/api/v1/checkout",
      checkoutBody({ shippingAddress: { ...address(), pincode: "012345" } })
    );
    expect(badPin.status).toBe(400);
    expect((badPin.data as Json).error.code).toBe("VALIDATION_ERROR");
  });

  it("places a COD order with server totals, decrements stock and clears the bag", async () => {
    const client = new Client(base);
    await client.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 2 });
    await client.post("/api/v1/cart/shipping", { pincode: "518001" });
    const quote = (await client.get("/api/v1/cart")).data as Json;

    const stockBefore = (db.prepare("SELECT stock_quantity FROM products WHERE id = 'prod-bunny-plush'").get() as {
      stock_quantity: number;
    }).stock_quantity;

    const response = await client.post(
      "/api/v1/checkout",
      checkoutBody({
        contact: { name: "Test Buyer", email: "buyer@example.com", phone: "9876543210" },
        giftMessage: "<script>alert(1)</script>",
        customerNote: "Leave with the concierge",
        shippingAddress: { ...address(), line1: "12 <b>Bold</b> Street" }
      })
    );
    expect(response.status).toBe(201);
    const order = (response.data as Json).order;
    expect(order).toMatchObject({
      status: "pending",
      paymentMethod: "cod",
      paymentStatus: "cod_pending",
      email: "buyer@example.com"
    });
    expect(order.orderNumber).toMatch(/^SC-\d{8}-[A-Z0-9]{6}$/);
    expect(order.totals.total).toBe(quote.cart.total);
    expect(order.items[0]).toMatchObject({ quantity: 2, lineSubtotal: 199800 });
    expect(order.events[0]).toMatchObject({ status: "pending" });

    const stockAfter = (db.prepare("SELECT stock_quantity FROM products WHERE id = 'prod-bunny-plush'").get() as {
      stock_quantity: number;
    }).stock_quantity;
    expect(stockAfter).toBe(stockBefore - 2);

    const movement = db
      .prepare("SELECT delta, reason FROM stock_movements WHERE reference = ?")
      .get(order.orderNumber) as { delta: number; reason: string };
    expect(movement).toEqual({ delta: -2, reason: "order" });

    const bag = (await client.get("/api/v1/cart")).data as Json;
    expect(bag.cart.itemCount).toBe(0);

    const tracked = await client.get(
      `/api/v1/orders/track?orderNumber=${encodeURIComponent(order.orderNumber)}&email=buyer@example.com`
    );
    expect(tracked.status).toBe(200);
    expect((tracked.data as Json).order.orderNumber).toBe(order.orderNumber);

    const anonymous = await client.get(`/api/v1/orders/track?orderNumber=${encodeURIComponent(order.orderNumber)}`);
    expect(anonymous.status).toBe(400);
    const wrongEmail = await client.get(
      `/api/v1/orders/track?orderNumber=${encodeURIComponent(order.orderNumber)}&email=other@example.com`
    );
    expect(wrongEmail.status).toBe(404);

    const invoice = await client.get(
      `/api/v1/orders/${encodeURIComponent(order.orderNumber)}/invoice?email=buyer@example.com`
    );
    expect(invoice.status).toBe(200);
    expect(invoice.text).toContain(order.orderNumber);
    expect(invoice.text).toContain("&lt;b&gt;Bold&lt;/b&gt;");
    expect(invoice.text).not.toContain("<script>alert(1)</script>");
    expect(invoice.text).toContain("Payment pending");
  });

  it("treats a repeated checkout key as idempotent and does not double-charge stock", async () => {
    const client = new Client(base);
    await client.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    const key = `idem-${Date.now()}`;
    const first = await client.post("/api/v1/checkout", checkoutBody({ idempotencyKey: key }));
    expect(first.status).toBe(201);
    const stockAfterFirst = (db.prepare("SELECT stock_quantity FROM products WHERE id = 'prod-bunny-plush'").get() as {
      stock_quantity: number;
    }).stock_quantity;

    const second = await client.post("/api/v1/checkout", checkoutBody({ idempotencyKey: key }));
    expect(second.status).toBe(200);
    expect((second.data as Json).idempotent).toBe(true);
    expect((second.data as Json).order.orderNumber).toBe((first.data as Json).order.orderNumber);

    const stockAfterSecond = (db.prepare("SELECT stock_quantity FROM products WHERE id = 'prod-bunny-plush'").get() as {
      stock_quantity: number;
    }).stock_quantity;
    expect(stockAfterSecond).toBe(stockAfterFirst);
  });

  it("stores the cash-on-delivery handling fee so every printed total reconciles", async () => {
    const stored = db.prepare("SELECT value FROM settings WHERE key = 'cod'").get() as { value: string };
    const original = JSON.parse(stored.value) as { enabled: boolean; maxTotal: number; fee: number };
    setSetting(db, "cod", { ...original, fee: 3000 });
    try {
      const client = new Client(base);
      await client.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
      await client.post("/api/v1/cart/shipping", { pincode: "518001" });
      const quote = ((await client.get("/api/v1/cart")).data as Json).cart as Json;
      expect(quote.codFee).toBe(3000);

      const placed = await client.post("/api/v1/checkout", checkoutBody());
      expect(placed.status).toBe(201);
      const totals = ((placed.data as Json).order.totals as Json) ?? {};
      expect(totals.codFee).toBe(3000);
      expect(totals.subtotal - totals.discount + totals.giftWrap + totals.shipping + totals.codFee + totals.taxExclusive).toBe(
        totals.total
      );

      const row = db
        .prepare(
          `SELECT subtotal, discount, gift_wrap_total, shipping_fee, cod_fee, tax_exclusive, total
           FROM orders WHERE order_number = ?`
        )
        .get(((placed.data as Json).order.orderNumber as string)) as Json;
      expect(row.cod_fee).toBe(3000);
      expect(row.subtotal - row.discount + row.gift_wrap_total + row.shipping_fee + row.cod_fee + row.tax_exclusive).toBe(row.total);

      const orderNumber = (placed.data as Json).order.orderNumber as string;
      const invoice = await client.get(
        `/api/v1/orders/${encodeURIComponent(orderNumber)}/invoice?email=buyer@example.com`
      );
      expect(invoice.status).toBe(200);
      expect(invoice.text).toContain("Cash-on-delivery handling");
    } finally {
      setSetting(db, "cod", original);
    }
  });
});

describe("accounts and roles", () => {
  it("merges a guest bag on registration and keeps admin areas closed", async () => {
    const client = new Client(base);
    await client.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });

    const email = `customer-${Date.now()}@example.com`;
    const registered = await client.post("/api/v1/auth/register", {
      name: "New Customer",
      email,
      phone: "9876500000",
      password: "Customer#2026"
    });
    expect(registered.status).toBe(201);
    expect((registered.data as Json).user.role).toBe("customer");

    const cart = (await client.get("/api/v1/cart")).data as Json;
    expect(cart.cart.itemCount).toBe(1);
    const row = db.prepare("SELECT user_id FROM carts WHERE id = ?").get(cart.cart.id) as { user_id: string | null };
    expect(row.user_id).toBe((registered.data as Json).user.id);

    const forbidden = await client.get("/api/v1/admin/summary");
    expect(forbidden.status).toBe(403);
    const anonymous = await new Client(base).get("/api/v1/admin/summary");
    expect(anonymous.status).toBe(401);

    const me = await client.get("/api/v1/auth/session");
    expect((me.data as Json).user.email).toBe(email);
  });

  it("moves an order through valid statuses and marks COD paid on delivery", async () => {
    const client = new Client(base);
    await client.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    const created = await client.post("/api/v1/checkout", checkoutBody({ idempotencyKey: `status-${Date.now()}` }));
    const number = (created.data as Json).order.orderNumber;

    const skip = await owner.post(`/api/v1/admin/orders/${number}/status`, { status: "delivered" });
    expect(skip.status).toBe(409);
    expect((skip.data as Json).error.code).toBe("INVALID_TRANSITION");

    const confirmed = await owner.post(`/api/v1/admin/orders/${number}/status`, {
      status: "confirmed",
      note: "Confirmed by test"
    });
    expect(confirmed.status).toBe(200);
    expect((confirmed.data as Json).order.status).toBe("confirmed");
    expect((confirmed.data as Json).order.events.at(-1).note).toBe("Confirmed by test");

    await owner.post(`/api/v1/admin/orders/${number}/status`, { status: "packed" });
    const shipped = await owner.post(`/api/v1/admin/orders/${number}/status`, {
      status: "shipped",
      trackingNumber: "TEST-TRACK-1",
      trackingUrl: "https://example.com/track/TEST-TRACK-1"
    });
    expect((shipped.data as Json).order.tracking).toEqual({
      number: "TEST-TRACK-1",
      url: "https://example.com/track/TEST-TRACK-1"
    });

    const delivered = await owner.post(`/api/v1/admin/orders/${number}/status`, { status: "delivered" });
    expect(delivered.status).toBe(200);
    expect((delivered.data as Json).order.paymentStatus).toBe("paid");

    const summary = await owner.get("/api/v1/admin/summary");
    expect(summary.status).toBe(200);
    expect((summary.data as Json).orders.total).toBeGreaterThan(0);
  });

  it("restocks stock when an order is cancelled and audits the change", async () => {
    const client = new Client(base);
    await client.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    const stockBefore = (db.prepare("SELECT stock_quantity FROM products WHERE id = 'prod-bunny-plush'").get() as {
      stock_quantity: number;
    }).stock_quantity;
    const created = await client.post("/api/v1/checkout", checkoutBody({ idempotencyKey: `cancel-${Date.now()}` }));
    const number = (created.data as Json).order.orderNumber;

    const cancelled = await owner.post(`/api/v1/admin/orders/${number}/status`, {
      status: "cancelled",
      note: "Customer asked to cancel"
    });
    expect(cancelled.status).toBe(200);
    expect((cancelled.data as Json).order.status).toBe("cancelled");

    const stockAfter = (db.prepare("SELECT stock_quantity FROM products WHERE id = 'prod-bunny-plush'").get() as {
      stock_quantity: number;
    }).stock_quantity;
    expect(stockAfter).toBe(stockBefore);

    const movement = db
      .prepare("SELECT delta, reason FROM stock_movements WHERE reference = ? AND reason = 'cancel'")
      .get(number) as { delta: number; reason: string };
    expect(movement).toEqual({ delta: 1, reason: "cancel" });
    const auditRow = db
      .prepare("SELECT action FROM audit_logs WHERE entity_id = (SELECT id FROM orders WHERE order_number = ?) ORDER BY rowid DESC LIMIT 1")
      .get(number) as { action: string };
    expect(auditRow.action).toBe("order.status_cancelled");
  });

  it("lets finance read the summary but not change order status", async () => {
    const finance = new Client(base);
    const email = `finance-${Date.now()}@example.com`;
    const registered = await finance.post("/api/v1/auth/register", {
      name: "Finance Agent",
      email,
      password: "Finance#2026"
    });
    expect(registered.status).toBe(201);
    db.prepare("UPDATE users SET role = 'finance' WHERE email = ?").run(email);

    const orderRow = db.prepare("SELECT order_number FROM orders LIMIT 1").get() as { order_number: string };
    const forbidden = await finance.post(`/api/v1/admin/orders/${orderRow.order_number}/status`, { status: "confirmed" });
    expect(forbidden.status).toBe(403);

    const summary = await finance.get("/api/v1/admin/summary");
    expect(summary.status).toBe(200);
  });
});

describe("content", () => {
  it("requires consent for newsletter signup and records it once", async () => {
    const client = new Client(base);
    const rejected = await client.post("/api/v1/content/newsletter", { email: "reader@example.com", consent: false });
    expect(rejected.status).toBe(400);

    const accepted = await client.post("/api/v1/content/newsletter", {
      email: "reader@example.com",
      consent: true,
      source: "test"
    });
    expect(accepted.status).toBe(201);
    const row = db
      .prepare("SELECT consent_at, unsubscribed_at FROM newsletter_subscribers WHERE email = 'reader@example.com'")
      .get() as { consent_at: string; unsubscribed_at: string | null };
    expect(row.consent_at).toBeTruthy();
    expect(row.unsubscribed_at).toBeNull();
  });

  it("publishes store policies from configured settings without inventing payment support", async () => {
    const client = new Client(base);
    const response = await client.get("/api/v1/content/site");
    expect(response.status).toBe(200);
    const body = response.data as Json;
    expect(body.store.name).toBeTruthy();
    expect(body.policies.cod.enabled).toBe(true);
    expect(body.integrations.onlinePayments).toBe("not_configured");
  });
});
