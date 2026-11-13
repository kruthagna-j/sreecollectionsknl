import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../server/app.js";
import { newId, nowIso, type DB } from "../../server/db.js";
import { hashPassword } from "../../server/lib/auth.js";
import { createTestDb, TestClient as Client, type Json } from "../helpers.js";

let db: DB;
let server: Server;
let base: string;
let owner: Client;

const OWNER = { email: "admin-test-owner@example.com", password: "TestOwner#2026" };

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function checkoutBody(email: string, idempotencyKey: string) {
  return {
    contact: { name: "Return Test Buyer", email, phone: "9876543210" },
    shippingAddress: {
      recipient: "Return Test Buyer",
      phone: "9876543210",
      line1: "12 Test Street",
      city: "Kurnool",
      state: "Andhra Pradesh",
      pincode: "518001"
    },
    billingSameAsShipping: true,
    paymentMethod: "cod",
    giftMessage: "",
    customerNote: "",
    acceptTerms: true,
    idempotencyKey
  };
}

async function staffClient(role: string) {
  const client = new Client(base);
  const email = `${role}-${unique()}@example.com`;
  const registered = await client.post("/api/v1/auth/register", {
    name: `Test ${role}`,
    email,
    password: "StaffTest#2026"
  });
  expect(registered.status).toBe(201);
  db.prepare("UPDATE users SET role = ? WHERE email = ?").run(role, email);
  return client;
}

function productPayload(categoryId: string, suffix: string) {
  return {
    name: `Test Keepsake ${suffix}`,
    slug: `test-keepsake-${suffix}`,
    sku: `TEST-${suffix}`,
    categoryId,
    shortDescription: "Created by the admin API test.",
    description: "A test product created through the admin API.",
    price: 149900,
    taxRateBps: 500,
    stockQuantity: 0,
    status: "draft",
    images: [{ url: "/images/products/rose-keepsake-box.svg", alt: "Test keepsake illustration" }],
    variants: [{ name: "Small", sku: `TEST-${suffix}-S`, price: null, stock: 4 }]
  };
}

beforeAll(async () => {
  db = createTestDb();
  const passwordHash = await hashPassword(OWNER.password);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, name, phone, role, created_at) VALUES (?, ?, ?, 'Admin Test Owner', NULL, 'owner', ?)"
  ).run(newId(), OWNER.email, passwordHash, nowIso());

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

describe("admin catalogue", () => {
  it("creates a draft product with a variant, then publishes it", async () => {
    const category = db.prepare("SELECT id FROM categories ORDER BY sort_order LIMIT 1").get() as { id: string };
    const suffix = unique();
    const created = await owner.post("/api/v1/admin/products", productPayload(category.id, suffix));
    expect(created.status).toBe(201);
    const product = (created.data as Json).product;
    expect(product).toMatchObject({ status: "draft", price: 149900, stock: 4, featured: false });
    expect(product.variants).toHaveLength(1);
    expect(product.images).toHaveLength(1);
    expect(product.publishedAt).toBeNull();

    const published = await owner.patch(`/api/v1/admin/products/${product.id}`, { status: "published", featured: true });
    expect(published.status).toBe(200);
    expect((published.data as Json).product).toMatchObject({ status: "published", featured: true });
    expect((published.data as Json).product.publishedAt).toBeTruthy();

    const publicDetail = await new Client(base).get(`/api/v1/catalog/products/${product.slug}`);
    expect(publicDetail.status).toBe(200);
    expect((publicDetail.data as Json).product.name).toContain("Test Keepsake");
  });

  it("adjusts stock and refuses to take a variant below zero", async () => {
    const product = db.prepare("SELECT id, slug FROM products WHERE slug LIKE 'test-keepsake-%' LIMIT 1").get() as {
      id: string;
      slug: string;
    };
    const detail = await owner.get(`/api/v1/admin/products/${product.id}`);
    const variant = (detail.data as Json).product.variants[0];

    const restocked = await owner.post(`/api/v1/admin/products/${product.id}/stock`, {
      variantId: variant.id,
      delta: 6,
      reason: "Test restock"
    });
    expect(restocked.status).toBe(200);
    expect((restocked.data as Json).stock).toBe(10);

    const overdraw = await owner.post(`/api/v1/admin/products/${product.id}/stock`, {
      variantId: variant.id,
      delta: -999,
      reason: "Test overdraw"
    });
    expect(overdraw.status).toBe(409);
    expect((overdraw.data as Json).error.code).toBe("STOCK_BELOW_ZERO");

    const after = await owner.get(`/api/v1/admin/products/${product.id}`);
    expect((after.data as Json).product.variants[0].stock).toBe(10);
    const movement = db
      .prepare("SELECT delta, reason FROM stock_movements WHERE variant_id = ? AND reason = 'Test restock'")
      .get(variant.id) as { delta: number; reason: string };
    expect(movement).toEqual({ delta: 6, reason: "Test restock" });
  });
});

describe("admin commerce controls", () => {
  it("creates a coupon that discounts a real cart, and rejects duplicates", async () => {
    const code = `TEST${unique()}`.toUpperCase().slice(0, 20);
    const created = await owner.post("/api/v1/admin/coupons", {
      code,
      kind: "percent",
      value: 1000,
      minSubtotal: 0,
      perEmailLimit: 1
    });
    expect(created.status).toBe(201);
    expect((created.data as Json).coupon).toMatchObject({ code, kind: "percent", value: 1000 });

    const duplicate = await owner.post("/api/v1/admin/coupons", {
      code,
      kind: "fixed",
      value: 5000
    });
    expect(duplicate.status).toBe(409);
    expect((duplicate.data as Json).error.code).toBe("DUPLICATE_COUPON");

    const shopper = new Client(base);
    const added = await shopper.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    expect(added.status).toBe(201);
    const applied = await shopper.post("/api/v1/cart/coupon", { code });
    expect(applied.status).toBe(200);
    expect((applied.data as Json).cart.discount).toBe(9990);
  });

  it("creates a delivery zone that is quoted to shoppers", async () => {
    const created = await owner.post("/api/v1/admin/zones", {
      name: "Test City",
      pincodes: "560001, 560002",
      fee: 4900,
      etaDaysMin: 2,
      etaDaysMax: 4,
      isActive: true,
      sortOrder: 5
    });
    expect(created.status).toBe(201);
    expect((created.data as Json).zone).toMatchObject({ name: "Test City", fee: 4900, eta_days_min: 2 });

    const shopper = new Client(base);
    await shopper.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    const quote = await shopper.post("/api/v1/cart/shipping", { pincode: "560001" });
    expect(quote.status).toBe(200);
    expect((quote.data as Json).cart.shipping).toMatchObject({
      serviceable: true,
      zoneName: "Test City",
      fee: 4900,
      etaDaysMin: 2,
      etaDaysMax: 4
    });
  });

  it("keeps a pending review private until support approves it", async () => {
    const customer = new Client(base);
    const email = `reviewer-${unique()}@example.com`;
    const registered = await customer.post("/api/v1/auth/register", {
      name: "Review Writer",
      email,
      password: "Reviewer#2026"
    });
    expect(registered.status).toBe(201);
    const userId = (registered.data as Json).user.id;
    const reviewId = newId();
    db.prepare(
      `INSERT INTO reviews (id, product_id, user_id, order_id, rating, title, body, status, verified_purchase, created_at)
       VALUES (?, 'prod-bunny-plush', ?, NULL, 5, 'A considered gift', ?, 'pending', 1, ?)`
    ).run(reviewId, userId, `Moderated review ${reviewId}`, nowIso());

    const pending = await owner.get("/api/v1/admin/reviews?status=pending");
    expect(pending.status).toBe(200);
    expect((pending.data as Json).items.some((item: Json) => item.id === reviewId)).toBe(true);

    const before = await new Client(base).get("/api/v1/catalog/products/bunny-plush/reviews");
    expect(before.status).toBe(200);
    expect((before.data as Json).items.some((item: Json) => item.body === `Moderated review ${reviewId}`)).toBe(false);

    const approved = await owner.post(`/api/v1/admin/reviews/${reviewId}/status`, { status: "approved" });
    expect(approved.status).toBe(200);

    const after = await new Client(base).get("/api/v1/catalog/products/bunny-plush/reviews");
    expect((after.data as Json).items.some((item: Json) => item.body === `Moderated review ${reviewId}`)).toBe(true);
    const audit = db
      .prepare("SELECT action FROM audit_logs WHERE entity_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(reviewId) as { action: string };
    expect(audit.action).toBe("review.approved");
  });

  it("requires a refund note and records the refund against the order", async () => {
    const customer = new Client(base);
    const email = `return-${unique()}@example.com`;
    await customer.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    const placed = await customer.post("/api/v1/checkout", checkoutBody(email, `return-${unique()}`));
    expect(placed.status).toBe(201);
    const orderNumber = (placed.data as Json).order.orderNumber;

    for (const status of ["confirmed", "packed", "shipped", "delivered"]) {
      const moved = await owner.post(`/api/v1/admin/orders/${orderNumber}/status`, { status });
      expect(moved.status).toBe(200);
    }

    const order = db.prepare("SELECT id FROM orders WHERE order_number = ?").get(orderNumber) as { id: string };
    const item = db.prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1").get(order.id) as { id: string };
    const returnId = newId();
    const now = nowIso();
    db.prepare(
      `INSERT INTO return_requests
         (id, request_number, order_id, order_item_id, user_id, email, reason, detail, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, 'damaged', 'Arrived damaged in transit.', 'requested', ?, ?)`
    ).run(returnId, `SR-TEST-${returnId.slice(0, 8)}`, order.id, item.id, email, now, now);

    const approved = await owner.post(`/api/v1/admin/returns/${returnId}/status`, {
      status: "approved",
      adminNote: "Return approved by test"
    });
    expect(approved.status).toBe(200);

    const missingNote = await owner.post(`/api/v1/admin/returns/${returnId}/status`, { status: "refunded" });
    expect(missingNote.status).toBe(400);
    expect((missingNote.data as Json).error.code).toBe("REFUND_NOTE_REQUIRED");

    const refunded = await owner.post(`/api/v1/admin/returns/${returnId}/status`, {
      status: "refunded",
      adminNote: "Cash refund receipt TEST-001"
    });
    expect(refunded.status).toBe(200);
    const savedOrder = db.prepare("SELECT payment_status FROM orders WHERE id = ?").get(order.id) as {
      payment_status: string;
    };
    expect(savedOrder.payment_status).toBe("refunded");
    const event = db
      .prepare("SELECT status, note FROM order_events WHERE order_id = ? AND status = 'refunded'")
      .get(order.id) as { status: string; note: string };
    expect(event.note).toBe("Cash refund receipt TEST-001");
  });
});

describe("admin settings and roles", () => {
  it("validates and publishes the public listing profile", async () => {
    const value = {
      rating: 4.4,
      ratingCount: 84,
      yearsInBusiness: 28,
      locality: "Gandhi Nagar, Kurnool",
      closesAt: "21:30",
      categories: ["Gift shops"]
    };
    const saved = await owner.put("/api/v1/admin/settings/publicProfile", { value });
    expect(saved.status).toBe(200);

    const site = await new Client(base).get("/api/v1/content/site");
    expect(site.status).toBe(200);
    expect((site.data as Json).publicProfile).toMatchObject(value);
    expect((site.data as Json).publicProfile).not.toHaveProperty("sourceName");

    const badRating = await owner.put("/api/v1/admin/settings/publicProfile", {
      value: { ...value, rating: 7 }
    });
    expect(badRating.status).toBe(400);
    expect((badRating.data as Json).error.code).toBe("VALIDATION_ERROR");

    const badTime = await owner.put("/api/v1/admin/settings/publicProfile", {
      value: { ...value, closesAt: "9:30 pm" }
    });
    expect(badTime.status).toBe(400);
  });

  it("stores the WhatsApp number and validates order-message preferences", async () => {
    const savedStore = await owner.put("/api/v1/admin/settings/store", {
      value: {
        name: "Sree Collections",
        tagline: "Since 1998",
        supportEmail: "shop@example.com",
        supportPhone: "+91 98765 43210",
        supportWhatsApp: "9876543210",
        address: "Gandhi Nagar, Kurnool",
        latitude: null,
        longitude: null
      }
    });
    expect(savedStore.status).toBe(200);

    const site = await new Client(base).get("/api/v1/content/site");
    expect((site.data as Json).store.supportWhatsApp).toBe("9876543210");

    const badOwner = await owner.put("/api/v1/admin/settings/notifications", {
      value: { sendCustomerEmail: true, sendOwnerEmail: true, ownerEmail: "not-an-email", whatsappAutoOpen: true }
    });
    expect(badOwner.status).toBe(400);

    const savedMessages = await owner.put("/api/v1/admin/settings/notifications", {
      value: { sendCustomerEmail: true, sendOwnerEmail: true, ownerEmail: "owner@example.com", whatsappAutoOpen: true }
    });
    expect(savedMessages.status).toBe(200);
  });

  it("records order message attempts and serves invoice PDFs", async () => {
    const customer = new Client(base);
    const email = `messages-${unique()}@example.com`;
    await customer.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    const placed = await customer.post("/api/v1/checkout", checkoutBody(email, `messages-${unique()}`));
    expect(placed.status).toBe(201);
    const order = (placed.data as Json).order;

    expect(order.notifications).toMatchObject({
      whatsapp: "click_to_chat",
      whatsappNumber: "919876543210",
      whatsappAutoOpen: true
    });

    const detail = await owner.get(`/api/v1/admin/orders/${order.orderNumber}`);
    expect(detail.status).toBe(200);
    const log = (detail.data as Json).emailLog as Json[];
    expect(log.map((row) => row.channel).sort()).toEqual(["email_customer", "email_owner"]);
    expect(log.every((row) => row.status === "not_configured")).toBe(true);
    expect(log.every((row) => /SMTP_URL/.test(row.error))).toBe(true);

    const resend = await owner.post(`/api/v1/admin/orders/${order.orderNumber}/notifications/resend`, {
      channel: "email_customer"
    });
    expect(resend.status).toBe(503);
    expect((resend.data as Json).error.code).toBe("EMAIL_NOT_CONFIGURED");

    const adminPdf = await owner.get(`/api/v1/admin/orders/${order.orderNumber}/invoice.pdf`);
    expect(adminPdf.status).toBe(200);
    expect(adminPdf.headers.get("content-type")).toBe("application/pdf");

    const anonymousPdf = await new Client(base).get(`/api/v1/orders/${encodeURIComponent(order.orderNumber)}/invoice.pdf`);
    expect(anonymousPdf.status).toBe(404);
  });

  it("keeps scoped staff roles inside their own areas", async () => {
    const catalogue = await staffClient("catalogue");
    expect((await catalogue.get("/api/v1/admin/products")).status).toBe(200);
    expect((await catalogue.get("/api/v1/admin/orders")).status).toBe(403);
    expect(
      (await catalogue.post("/api/v1/admin/coupons", { code: `NOPE${unique()}`, kind: "fixed", value: 5000 })).status
    ).toBe(403);

    const support = await staffClient("support");
    expect((await support.get("/api/v1/admin/reviews?status=pending")).status).toBe(200);
    expect((await support.get("/api/v1/admin/products")).status).toBe(403);
    expect((await support.post("/api/v1/admin/returns/any-id/status", { status: "approved" })).status).toBe(403);

    const finance = await staffClient("finance");
    expect((await finance.get("/api/v1/admin/settings")).status).toBe(200);
    expect(
      (
        await finance.put("/api/v1/admin/settings/publicProfile", {
          value: {
            rating: null,
            ratingCount: null,
            yearsInBusiness: null,
            locality: "",
            closesAt: "",
            categories: []
          }
        })
      ).status
    ).toBe(403);
  });
});

describe("admin partial edits", () => {
  it("changes one product field without resetting the rest of the record", async () => {
    const before = ((await owner.get("/api/v1/admin/products/prod-bunny-plush")).data as Json).product as Json;
    expect(before.status).toBe("published");
    expect(before.tags.length).toBeGreaterThan(0);
    expect(before.images.length).toBeGreaterThan(0);

    const edited = await owner.patch("/api/v1/admin/products/prod-bunny-plush", { price: 89900 });
    expect(edited.status).toBe(200);
    const after = (edited.data as Json).product as Json;
    expect(after.price).toBe(89900);
    expect(after).toMatchObject({
      status: before.status,
      stock: before.stock,
      stockQuantity: before.stockQuantity,
      tags: before.tags,
      images: before.images,
      shortDescription: before.shortDescription,
      description: before.description,
      weightG: before.weightG,
      lowStockThreshold: before.lowStockThreshold,
      preparationDays: before.preparationDays,
      taxRateBps: before.taxRateBps,
      featured: before.featured,
      giftWrappable: before.giftWrappable,
      personalizable: before.personalizable,
      returnEligible: before.returnEligible,
      publishedAt: before.publishedAt
    });

    const shopper = await new Client(base).get("/api/v1/catalog/products/bunny-plush");
    expect(((shopper.data as Json).product as Json).price).toBe(89900);

    const restored = await owner.patch("/api/v1/admin/products/prod-bunny-plush", { price: 99900 });
    expect(((restored.data as Json).product as Json).price).toBe(99900);
  });

  it("unpublishes a product from the storefront and puts it back", async () => {
    const product = db.prepare("SELECT id, slug FROM products WHERE slug LIKE 'test-keepsake-%' LIMIT 1").get() as {
      id: string;
      slug: string;
    };

    const archived = await owner.patch(`/api/v1/admin/products/${product.id}`, { status: "archived" });
    expect(archived.status).toBe(200);
    expect(((archived.data as Json).product as Json).stock).toBe(10);

    const hidden = await new Client(base).get(`/api/v1/catalog/products/${product.slug}`);
    expect(hidden.status).toBe(404);
    const list = await new Client(base).get("/api/v1/catalog/products?pageSize=50");
    expect(((list.data as Json).items as Json[]).some((item) => item.slug === product.slug)).toBe(false);

    const republished = await owner.patch(`/api/v1/admin/products/${product.id}`, { status: "published" });
    expect(((republished.data as Json).product as Json).status).toBe("published");
    const visible = await new Client(base).get(`/api/v1/catalog/products/${product.slug}`);
    expect(visible.status).toBe(200);
  });

  it("replaces the variant list, logs the stock change and rejects a reused SKU", async () => {
    const product = db.prepare("SELECT id FROM products WHERE slug LIKE 'test-keepsake-%' LIMIT 1").get() as { id: string };
    const detail = await owner.get(`/api/v1/admin/products/${product.id}`);
    const small = (((detail.data as Json).product as Json).variants as Json[])[0];
    const largeSku = `TEST-LARGE-${unique()}`;

    const replaced = await owner.put(`/api/v1/admin/products/${product.id}/variants`, {
      variants: [
        { id: small.id, name: "Small", sku: small.sku, price: 9900, stock: 3 },
        { name: "Large", sku: largeSku, price: null, stock: 5 }
      ]
    });
    expect(replaced.status).toBe(200);
    const productAfter = (replaced.data as Json).product as Json;
    expect(productAfter.variants.filter((variant: Json) => variant.isActive).map((variant: Json) => variant.name)).toEqual([
      "Small",
      "Large"
    ]);
    expect(productAfter.stock).toBe(8);

    const adjustment = db
      .prepare("SELECT delta, reason FROM stock_movements WHERE variant_id = ? AND reason = 'variant_update'")
      .get(small.id) as { delta: number; reason: string };
    expect(adjustment).toEqual({ delta: -7, reason: "variant_update" });

    const createdMovement = db
      .prepare(
        "SELECT reason FROM stock_movements WHERE variant_id = (SELECT id FROM product_variants WHERE sku = ?) AND reason = 'variant_created'"
      )
      .get(largeSku) as { reason: string };
    expect(createdMovement.reason).toBe("variant_created");

    const reused = await owner.put(`/api/v1/admin/products/${product.id}/variants`, {
      variants: [{ name: "Copy", sku: largeSku, price: null, stock: 1 }]
    });
    expect(reused.status).toBe(409);
    expect((reused.data as Json).error.code).toBe("DUPLICATE_VARIANT_SKU");

    const active = db
      .prepare("SELECT COUNT(*) AS count FROM product_variants WHERE product_id = ? AND is_active = 1")
      .get(product.id) as { count: number };
    expect(active.count).toBe(2);
  });

  it("creates a category that shoppers see, then hides it again", async () => {
    const name = "Festive Edits";
    const created = await owner.post("/api/v1/admin/categories", {
      name,
      description: "Seasonal picks assembled for the festival table.",
      sortOrder: 7
    });
    expect(created.status).toBe(201);
    const category = (created.data as Json).category as Json;
    expect(category).toMatchObject({ name, slug: "festive-edits", sort_order: 7, is_active: 1 });

    const publicList = await new Client(base).get("/api/v1/catalog/categories");
    const shown = ((publicList.data as Json).items as Json[]).find((entry) => entry.id === category.id);
    expect(shown).toMatchObject({ name, product_count: 0 });

    const second = await owner.post("/api/v1/admin/categories", { name });
    expect(second.status).toBe(201);
    expect((second.data as Json).category.slug).toBe("festive-edits-2");

    const hidden = await owner.patch(`/api/v1/admin/categories/${category.id}`, { isActive: false });
    expect(hidden.status).toBe(200);
    const afterHide = await new Client(base).get("/api/v1/catalog/categories");
    expect(((afterHide.data as Json).items as Json[]).some((entry) => entry.id === category.id)).toBe(false);

    const noChanges = await owner.patch(`/api/v1/admin/categories/${category.id}`, {});
    expect(noChanges.status).toBe(400);
    expect((noChanges.data as Json).error.code).toBe("NO_CHANGES");
  });

  it("retires a coupon without changing its terms", async () => {
    const code = `BYE${unique()}`.toUpperCase().slice(0, 20);
    const created = await owner.post("/api/v1/admin/coupons", {
      code,
      kind: "fixed",
      value: 5000,
      minSubtotal: 10000,
      perEmailLimit: 3
    });
    expect(created.status).toBe(201);
    const coupon = (created.data as Json).coupon as Json;
    expect(coupon).toMatchObject({ code, kind: "fixed", value: 5000, min_subtotal: 10000, per_email_limit: 3, is_active: 1 });

    const shopper = new Client(base);
    await shopper.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    const applied = await shopper.post("/api/v1/cart/coupon", { code });
    expect(applied.status).toBe(200);
    expect((applied.data as Json).cart.discount).toBe(5000);

    const retired = await owner.patch(`/api/v1/admin/coupons/${coupon.id}`, { isActive: false });
    expect(retired.status).toBe(200);
    expect((retired.data as Json).coupon).toMatchObject({
      is_active: 0,
      value: 5000,
      min_subtotal: 10000,
      per_email_limit: 3,
      kind: "fixed"
    });

    const rejected = await shopper.post("/api/v1/cart/coupon", { code });
    expect(rejected.status).toBe(400);
    expect((rejected.data as Json).error.message).toBe("This coupon code is not valid.");
  });

  it("edits a zone fee without resetting its terms", async () => {
    const before = db.prepare("SELECT * FROM shipping_zones WHERE id = 'zone-all-india'").get() as Json;

    const edited = await owner.patch("/api/v1/admin/zones/zone-all-india", { fee: 14900 });
    expect(edited.status).toBe(200);
    expect((edited.data as Json).zone).toMatchObject({
      fee: 14900,
      name: before.name,
      pincodes: before.pincodes,
      free_above: before.free_above,
      eta_days_min: before.eta_days_min,
      eta_days_max: before.eta_days_max,
      sort_order: before.sort_order,
      is_active: 1
    });

    const shopper = new Client(base);
    await shopper.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    const quote = await shopper.post("/api/v1/cart/shipping", { pincode: "110001" });
    expect((quote.data as Json).cart.shipping).toMatchObject({
      serviceable: true,
      zoneName: before.name,
      fee: 14900,
      etaDaysMin: before.eta_days_min,
      etaDaysMax: before.eta_days_max
    });

    const noChanges = await owner.patch("/api/v1/admin/zones/zone-all-india", {});
    expect(noChanges.status).toBe(400);
    expect((noChanges.data as Json).error.code).toBe("NO_CHANGES");

    await owner.patch("/api/v1/admin/zones/zone-all-india", { fee: 9900 });
    const restored = await shopper.post("/api/v1/cart/shipping", { pincode: "110001" });
    expect((restored.data as Json).cart.shipping).toMatchObject({ fee: 9900, zoneName: before.name });
  });
});
