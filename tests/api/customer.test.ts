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

const OWNER = { email: "account-suite-owner@example.com", password: "TestOwner#2026" };
let seq = 0;

const address = (overrides: Json = {}) => ({
  label: "Home",
  recipient: "Ritu Sharma",
  phone: "9876543210",
  line1: "5 Gandhi Street",
  city: "Kurnool",
  state: "Andhra Pradesh",
  pincode: "518001",
  ...overrides
});

function checkoutBody(overrides: Json = {}) {
  return {
    contact: { name: "Ritu Sharma", email: `ritu-${Date.now()}-${++seq}@example.com`, phone: "9876543210" },
    shippingAddress: address(),
    billingSameAsShipping: true,
    paymentMethod: "cod",
    giftMessage: "",
    customerNote: "",
    acceptTerms: true,
    idempotencyKey: `account-${Date.now()}-${seq}`,
    ...overrides
  };
}

async function signUp(name = "Ritu Sharma") {
  const email = `shopper-${Date.now()}-${++seq}@example.com`;
  const client = new Client(base);
  const created = await client.post("/api/v1/auth/register", {
    name,
    email,
    phone: "9876543210",
    password: "Shopper#2026"
  });
  expect(created.status).toBe(201);
  return { client, email, user: (created.data as Json).user as Json };
}

async function placeOrder(client: Client, slug = "bunny-plush", quantity = 1, overrides: Json = {}) {
  const detail = await client.get(`/api/v1/catalog/products/${slug}`);
  expect(detail.status, `catalog lookup failed for ${slug}: ${JSON.stringify(detail.data)}`).toBe(200);
  const product = (detail.data as Json).product;
  const added = await client.post("/api/v1/cart/items", {
    productId: product.id,
    variantId: product.variants[0]?.id,
    quantity
  });
  expect(added.status, `cart add failed: ${JSON.stringify(added.data)}`).toBe(201);
  const quoted = await client.post("/api/v1/cart/shipping", { pincode: "518001" });
  expect(quoted.status).toBe(200);
  const created = await client.post("/api/v1/checkout", checkoutBody(overrides));
  expect(created.status).toBe(201);
  return (created.data as Json).order as Json;
}

async function walkTo(orderNumber: string, status: string) {
  const ladder = ["confirmed", "packed", "shipped", "delivered"];
  for (const next of ladder.slice(0, ladder.indexOf(status) + 1)) {
    const response = await owner.post(`/api/v1/admin/orders/${orderNumber}/status`, { status: next, note: `Test ${next}` });
    expect(response.status).toBe(200);
  }
}

beforeAll(async () => {
  db = createTestDb();
  db.prepare("INSERT INTO users (id, email, password_hash, name, phone, role, created_at) VALUES (?, ?, ?, ?, NULL, 'owner', ?)").run(
    newId(),
    OWNER.email,
    await hashPassword(OWNER.password),
    "Suite Owner",
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

describe("account profile", () => {
  it("updates the profile and rejects invalid details", async () => {
    const { client, email } = await signUp();
    const updated = await client.patch("/api/v1/account", { name: "Ritu S. Menon", phone: "+91 98765-43210" });
    expect(updated.status).toBe(200);
    expect((updated.data as Json).user).toMatchObject({ name: "Ritu S. Menon", phone: "9876543210" });

    const row = db.prepare("SELECT name, phone FROM users WHERE email = ?").get(email) as { name: string; phone: string };
    expect(row).toEqual({ name: "Ritu S. Menon", phone: "9876543210" });

    const summary = await client.get("/api/v1/account");
    expect(summary.status).toBe(200);
    expect((summary.data as Json).user.name).toBe("Ritu S. Menon");
    expect((summary.data as Json).counts).toMatchObject({ orders: 0, wishlist: 0, addresses: 0, open_returns: 0 });

    const shortName = await client.patch("/api/v1/account", { name: "R" });
    expect(shortName.status).toBe(400);
    expect((shortName.data as Json).error.code).toBe("VALIDATION_ERROR");

    const badPhone = await client.patch("/api/v1/account", { name: "Ritu Sharma", phone: "1234567890" });
    expect(badPhone.status).toBe(400);
    expect((badPhone.data as Json).error.code).toBe("VALIDATION_ERROR");
  });

  it("changes the password, signs other devices out and refuses the old password", async () => {
    const { client, email } = await signUp();
    const otherDevice = new Client(base);
    const secondLogin = await otherDevice.post("/api/v1/auth/login", { email, password: "Shopper#2026" });
    expect(secondLogin.status).toBe(200);

    const wrongCurrent = await client.post("/api/v1/auth/password", {
      currentPassword: "Wrong#2026",
      newPassword: "Rotated#2026"
    });
    expect(wrongCurrent.status).toBe(400);
    expect((wrongCurrent.data as Json).error.code).toBe("CURRENT_PASSWORD_INVALID");

    const weak = await client.post("/api/v1/auth/password", { currentPassword: "Shopper#2026", newPassword: "short" });
    expect(weak.status).toBe(400);
    expect((weak.data as Json).error.code).toBe("VALIDATION_ERROR");

    const changed = await client.post("/api/v1/auth/password", {
      currentPassword: "Shopper#2026",
      newPassword: "Rotated#2026"
    });
    expect(changed.status).toBe(200);
    expect((changed.data as Json).ok).toBe(true);

    const staleSession = await otherDevice.get("/api/v1/account");
    expect(staleSession.status).toBe(401);
    expect((staleSession.data as Json).error.code).toBe("AUTH_REQUIRED");

    const oldPassword = await new Client(base).post("/api/v1/auth/login", { email, password: "Shopper#2026" });
    expect(oldPassword.status).toBe(401);
    expect((oldPassword.data as Json).error.code).toBe("INVALID_CREDENTIALS");

    const newPassword = await new Client(base).post("/api/v1/auth/login", { email, password: "Rotated#2026" });
    expect(newPassword.status).toBe(200);

    const current = await client.get("/api/v1/auth/session");
    expect(current.status).toBe(200);
    expect((current.data as Json).user.email).toBe(email);
  }, 20000);

  it("does not promise a password reset email while no provider is configured", async () => {
    const response = await new Client(base).post("/api/v1/auth/password/forgot", { email: "nobody@example.com" });
    expect(response.status).toBe(503);
    expect((response.data as Json).error.code).toBe("EMAIL_NOT_CONFIGURED");
  });
});

describe("saved addresses", () => {
  it("stores, defaults, updates and deletes addresses", async () => {
    const { client, user } = await signUp();

    const first = await client.post("/api/v1/account/addresses", address());
    expect(first.status).toBe(201);
    expect((first.data as Json).address).toMatchObject({ label: "Home", isDefault: true, phone: "9876543210" });
    const homeId = (first.data as Json).address.id as string;

    const second = await client.post("/api/v1/account/addresses", address({ label: "Work", line1: "2 Ring Road" }));
    expect(second.status).toBe(201);
    expect((second.data as Json).address.isDefault).toBe(false);
    const workId = (second.data as Json).address.id as string;

    const invalid = await client.post("/api/v1/account/addresses", address({ pincode: "12345" }));
    expect(invalid.status).toBe(400);
    expect((invalid.data as Json).error.code).toBe("VALIDATION_ERROR");

    const listed = await client.get("/api/v1/account/addresses");
    expect(listed.status).toBe(200);
    expect((listed.data as Json).items).toHaveLength(2);
    expect((listed.data as Json).items[0].id).toBe(homeId);

    const promoted = await client.patch(
      `/api/v1/account/addresses/${workId}`,
      address({ label: "Work", line1: "8 Station Road", isDefault: true })
    );
    expect(promoted.status).toBe(200);
    expect((promoted.data as Json).address).toMatchObject({ isDefault: true, line1: "8 Station Road" });

    const defaults = db
      .prepare("SELECT COUNT(*) AS count FROM addresses WHERE user_id = ? AND is_default = 1")
      .get(user.id) as { count: number };
    expect(defaults.count).toBe(1);

    const switchBack = await client.post(`/api/v1/account/addresses/${homeId}/default`);
    expect(switchBack.status).toBe(200);
    const afterSwitch = await client.get("/api/v1/account/addresses");
    expect((afterSwitch.data as Json).items[0]).toMatchObject({ id: homeId, isDefault: true });

    const removed = await client.request(`/api/v1/account/addresses/${homeId}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    const remaining = await client.get("/api/v1/account/addresses");
    expect((remaining.data as Json).items).toHaveLength(1);

    const missing = await client.request(`/api/v1/account/addresses/${homeId}`, { method: "DELETE" });
    expect(missing.status).toBe(404);
    expect((missing.data as Json).error.code).toBe("ADDRESS_NOT_FOUND");

    const foreign = await signUp();
    const notTheirs = await foreign.client.request(`/api/v1/account/addresses/${workId}`, { method: "DELETE" });
    expect(notTheirs.status).toBe(404);
  });
});

describe("wishlist", () => {
  it("adds once, lists the real product and removes it again", async () => {
    const { client } = await signUp();

    const added = await client.post("/api/v1/account/wishlist/prod-bunny-plush");
    expect(added.status).toBe(201);
    const repeated = await client.post("/api/v1/account/wishlist/prod-bunny-plush");
    expect(repeated.status).toBe(201);

    const listed = await client.get("/api/v1/account/wishlist");
    expect(listed.status).toBe(200);
    const items = (listed.data as Json).items as Json[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ slug: "bunny-plush", name: "Linen Bunny Plush" });

    const unknown = await client.post("/api/v1/account/wishlist/prod-not-real");
    expect(unknown.status).toBe(404);

    const removed = await client.request("/api/v1/account/wishlist/prod-bunny-plush", { method: "DELETE" });
    expect(removed.status).toBe(200);
    const afterDelete = await client.get("/api/v1/account/wishlist");
    expect((afterDelete.data as Json).items).toHaveLength(0);

    const counts = await client.get("/api/v1/account");
    expect((counts.data as Json).counts.wishlist).toBe(0);
  });
});

describe("reviews", () => {
  it("holds a verified review until staff approve it and never shows a fake rating", async () => {
    const { client } = await signUp();
    const order = await placeOrder(client);
    const body = {
      orderNumber: order.orderNumber as string,
      productId: "prod-bunny-plush",
      rating: 5,
      title: "Soft and well made",
      body: "My daughter carries it everywhere and the stitching is still perfect."
    };

    const tooEarly = await client.post("/api/v1/account/reviews", body);
    expect(tooEarly.status).toBe(409);
    expect((tooEarly.data as Json).error.code).toBe("REVIEW_NOT_ELIGIBLE");

    await walkTo(order.orderNumber as string, "delivered");

    const otherProduct = await client.post("/api/v1/account/reviews", { ...body, productId: "prod-heritage-tea-set" });
    expect(otherProduct.status).toBe(400);
    expect((otherProduct.data as Json).error.code).toBe("REVIEW_NOT_ELIGIBLE");

    const thin = await client.post("/api/v1/account/reviews", { ...body, body: "nice" });
    expect(thin.status).toBe(400);
    expect((thin.data as Json).error.code).toBe("VALIDATION_ERROR");

    const submitted = await client.post("/api/v1/account/reviews", body);
    expect(submitted.status).toBe(202);
    expect((submitted.data as Json).status).toBe("pending");

    const hidden = await client.get("/api/v1/catalog/products/bunny-plush/reviews");
    expect(hidden.status).toBe(200);
    expect((hidden.data as Json).items).toHaveLength(0);
    expect((hidden.data as Json).summary).toEqual({ average: 0, count: 0 });

    const detailBefore = await client.get("/api/v1/catalog/products/bunny-plush");
    expect((detailBefore.data as Json).product.rating).toEqual({ average: 0, count: 0 });

    const mine = await client.get("/api/v1/account/reviews");
    expect((mine.data as Json).items[0]).toMatchObject({ status: "pending", verifiedPurchase: true, rating: 5 });

    const queue = await owner.get("/api/v1/admin/reviews?status=pending");
    expect(queue.status).toBe(200);
    const queued = ((queue.data as Json).items as Json[]).find((row) => row.productId === "prod-bunny-plush");
    expect(queued).toBeTruthy();
    expect(queued?.verifiedPurchase).toBe(true);

    const approved = await owner.post(`/api/v1/admin/reviews/${queued?.id}/status`, { status: "approved" });
    expect(approved.status).toBe(200);

    const shown = await new Client(base).get("/api/v1/catalog/products/bunny-plush/reviews");
    const items = (shown.data as Json).items as Json[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ rating: 5, verifiedPurchase: true, author: "Ritu S." });
    expect((shown.data as Json).summary).toEqual({ average: 5, count: 1 });

    const detailAfter = await new Client(base).get("/api/v1/catalog/products/bunny-plush");
    expect((detailAfter.data as Json).product.rating).toEqual({ average: 5, count: 1 });

    const edited = await client.post("/api/v1/account/reviews", { ...body, rating: 4, body: "Still good, though the ears crease easily." });
    expect(edited.status).toBe(202);
    expect((edited.data as Json).message).toBe("Your updated review is awaiting moderation.");

    const againHidden = await new Client(base).get("/api/v1/catalog/products/bunny-plush/reviews");
    expect((againHidden.data as Json).items).toHaveLength(0);
    const rows = db.prepare("SELECT COUNT(*) AS count FROM reviews WHERE product_id = 'prod-bunny-plush'").get() as {
      count: number;
    };
    expect(rows.count).toBe(1);
  });
});

describe("returns", () => {
  it("opens a return only after delivery, for an eligible item, once per item", async () => {
    const { client } = await signUp();
    const order = await placeOrder(client);
    const itemId = (order.items as Json[])[0].id as string;
    const request = {
      orderNumber: order.orderNumber as string,
      orderItemId: itemId,
      reason: "damaged",
      detail: "The box arrived crushed and the linen was marked."
    };

    const tooEarly = await client.post("/api/v1/account/returns", request);
    expect(tooEarly.status).toBe(409);
    expect((tooEarly.data as Json).error.code).toBe("RETURN_NOT_ELIGIBLE");

    await walkTo(order.orderNumber as string, "delivered");

    const wrongItem = await client.post("/api/v1/account/returns", { ...request, orderItemId: "not-in-this-order" });
    expect(wrongItem.status).toBe(400);
    expect((wrongItem.data as Json).error.code).toBe("RETURN_NOT_ELIGIBLE");

    db.prepare("UPDATE order_events SET created_at = ? WHERE order_id = ? AND status = 'delivered'").run(
      new Date(Date.now() - 30 * 86400000).toISOString(),
      order.id
    );
    const windowClosed = await client.post("/api/v1/account/returns", request);
    expect(windowClosed.status).toBe(409);
    expect((windowClosed.data as Json).error.code).toBe("RETURN_WINDOW_CLOSED");
    db.prepare("UPDATE order_events SET created_at = ? WHERE order_id = ? AND status = 'delivered'").run(
      nowIso(),
      order.id
    );

    const ineligible = await owner.patch("/api/v1/admin/products/prod-bunny-plush", { returnEligible: false });
    expect(ineligible.status).toBe(200);
    const excluded = await client.post("/api/v1/account/returns", request);
    expect(excluded.status).toBe(409);
    expect((excluded.data as Json).error.message).toContain("Personalised items are excluded.");
    await owner.patch("/api/v1/admin/products/prod-bunny-plush", { returnEligible: true });

    const created = await client.post("/api/v1/account/returns", request);
    expect(created.status).toBe(201);
    const requestNumber = (created.data as Json).request.requestNumber as string;
    expect(requestNumber).toMatch(/^SR-/);

    const listed = await client.get("/api/v1/account/returns");
    expect((listed.data as Json).items[0]).toMatchObject({
      requestNumber,
      orderNumber: order.orderNumber,
      reasonLabel: "Arrived damaged",
      status: "requested"
    });

    const duplicate = await client.post("/api/v1/account/returns", request);
    expect(duplicate.status).toBe(409);
    expect((duplicate.data as Json).error.code).toBe("RETURN_EXISTS");

    const adminQueue = await owner.get("/api/v1/admin/returns?status=requested");
    expect(adminQueue.status).toBe(200);
    const row = ((adminQueue.data as Json).items as Json[]).find((entry) => entry.request_number === requestNumber);
    expect(row).toBeTruthy();

    const handled = await owner.post(`/api/v1/admin/returns/${row?.id}/status`, {
      status: "approved",
      adminNote: "Pickup arranged for tomorrow."
    });
    expect(handled.status).toBe(200);

    const afterApproval = await client.get("/api/v1/account/returns");
    expect((afterApproval.data as Json).items[0]).toMatchObject({
      requestNumber,
      status: "approved",
      adminNote: "Pickup arranged for tomorrow."
    });

    const reopened = await client.post("/api/v1/account/returns", request);
    expect(reopened.status).toBe(409);
    expect((reopened.data as Json).error.code).toBe("RETURN_EXISTS");
  });

  it("refuses a return request while the policy is switched off", async () => {
    const { client } = await signUp();
    const order = await placeOrder(client);
    await walkTo(order.orderNumber as string, "delivered");

    db.prepare("UPDATE settings SET value = json_set(value, '$.enabled', false) WHERE key = 'returns'").run();
    try {
      const blocked = await client.post("/api/v1/account/returns", {
        orderNumber: order.orderNumber,
        orderItemId: (order.items as Json[])[0].id,
        reason: "changed_mind",
        detail: "The gift was not wanted after all."
      });
      expect(blocked.status).toBe(409);
      expect((blocked.data as Json).error.code).toBe("RETURNS_DISABLED");
    } finally {
      db.prepare("UPDATE settings SET value = json_set(value, '$.enabled', true) WHERE key = 'returns'").run();
    }
  });
});

describe("support tickets", () => {
  it("saves a ticket for the staff inbox and lets staff close it", async () => {
    const { client, email, user } = await signUp();

    const tooShort = await client.post("/api/v1/content/support/tickets", {
      name: "Ritu Sharma",
      email,
      subject: "Where is my order?",
      message: "hi"
    });
    expect(tooShort.status).toBe(400);
    expect((tooShort.data as Json).error.code).toBe("VALIDATION_ERROR");

    const created = await client.post("/api/v1/content/support/tickets", {
      name: "Ritu Sharma",
      email,
      subject: "Where is my order?",
      message: "It has been four days since the order was marked shipped.",
      orderNumber: "SC-20260101-ABC123"
    });
    expect(created.status).toBe(201);
    expect((created.data as Json).ticketNumber).toMatch(/^ST-\d{8}-\d{4}$/);
    expect((created.data as Json).message).toContain("Automated email replies are not enabled");

    const row = db
      .prepare("SELECT user_id, status, order_number FROM support_tickets WHERE ticket_number = ?")
      .get((created.data as Json).ticketNumber) as { user_id: string; status: string; order_number: string };
    expect(row).toEqual({ user_id: user.id, status: "open", order_number: "SC-20260101-ABC123" });

    const inbox = await owner.get("/api/v1/admin/tickets?status=open");
    expect(inbox.status).toBe(200);
    const ticket = ((inbox.data as Json).items as Json[]).find((entry) => entry.ticket_number === (created.data as Json).ticketNumber);
    expect(ticket).toBeTruthy();

    const invalidStatus = await owner.post(`/api/v1/admin/tickets/${ticket?.id}/status`, { status: "resolved" });
    expect(invalidStatus.status).toBe(400);

    const closed = await owner.post(`/api/v1/admin/tickets/${ticket?.id}/status`, { status: "closed" });
    expect(closed.status).toBe(200);

    const stillOpen = await owner.get("/api/v1/admin/tickets?status=open");
    expect(((stillOpen.data as Json).items as Json[]).some((entry) => entry.id === ticket?.id)).toBe(false);
    const closedList = await owner.get("/api/v1/admin/tickets?status=closed");
    expect(((closedList.data as Json).items as Json[]).some((entry) => entry.id === ticket?.id)).toBe(true);
  });

  it("keeps the support inbox out of customer accounts", async () => {
    const { client } = await signUp();
    const inbox = await client.get("/api/v1/admin/tickets?status=open");
    expect(inbox.status).toBe(403);
    expect((inbox.data as Json).error.code).toBe("FORBIDDEN");
  });
});

describe("customer order cancellation", () => {
  it("cancels a fresh order, restocks it and refuses once the parcel has shipped", async () => {
    const { client } = await signUp();
    const stockBefore = (
      db.prepare("SELECT stock_quantity FROM products WHERE id = 'prod-heritage-tea-set'").get() as { stock_quantity: number }
    ).stock_quantity;

    const order = await placeOrder(client, "heritage-tea-set", 2);
    expect(
      (db.prepare("SELECT stock_quantity FROM products WHERE id = 'prod-heritage-tea-set'").get() as { stock_quantity: number })
        .stock_quantity
    ).toBe(stockBefore - 2);

    const cancelled = await client.post(`/api/v1/account/orders/${order.orderNumber}/cancel`);
    expect(cancelled.status).toBe(200);
    const result = (cancelled.data as Json).order as Json;
    expect(result.status).toBe("cancelled");
    expect((result.events as Json[]).at(-1)).toMatchObject({ status: "cancelled", note: "Cancelled by customer." });

    expect(
      (db.prepare("SELECT stock_quantity FROM products WHERE id = 'prod-heritage-tea-set'").get() as { stock_quantity: number })
        .stock_quantity
    ).toBe(stockBefore);

    const movement = db
      .prepare("SELECT delta, reason FROM stock_movements WHERE reference = ? AND reason = 'cancel'")
      .get(order.orderNumber as string) as { delta: number; reason: string };
    expect(movement).toEqual({ delta: 2, reason: "cancel" });

    const shippedOrder = await placeOrder(client, "heritage-tea-set", 1);
    await walkTo(shippedOrder.orderNumber as string, "shipped");
    const tooLate = await client.post(`/api/v1/account/orders/${shippedOrder.orderNumber}/cancel`);
    expect(tooLate.status).toBe(409);
    expect((tooLate.data as Json).error.code).toBe("CANCELLATION_NOT_ALLOWED");

    const stranger = await signUp();
    const notTheirs = await stranger.client.post(`/api/v1/account/orders/${order.orderNumber}/cancel`);
    expect(notTheirs.status).toBe(404);
    expect((notTheirs.data as Json).error.code).toBe("ORDER_NOT_FOUND");

    const listed = await client.get("/api/v1/account/orders");
    expect(listed.status).toBe(200);
    const numbers = ((listed.data as Json).items as Json[]).map((entry) => entry.orderNumber);
    expect(numbers).toContain(order.orderNumber);
    expect(numbers).toContain(shippedOrder.orderNumber);

    const otherPersonOrder = await stranger.client.get(`/api/v1/account/orders/${order.orderNumber}`);
    expect(otherPersonOrder.status).toBe(404);
  });
});

describe("coupon limits", () => {
  it("blocks a second use by the same email and enforces the total usage cap", async () => {
    const reuseEmail = "coupon-reuse@example.com";
    const first = new Client(base);
    await first.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    await first.post("/api/v1/cart/shipping", { pincode: "518001" });
    const applied = await first.post("/api/v1/cart/coupon", { code: "DEVWELCOME" });
    expect(applied.status).toBe(200);
    expect((applied.data as Json).cart.discount).toBe(9990);

    const placed = await first.post(
      "/api/v1/checkout",
      checkoutBody({
        contact: { name: "Ritu Sharma", email: reuseEmail, phone: "9876543210" },
        idempotencyKey: `coupon-${Date.now()}`
      })
    );
    expect(placed.status).toBe(201);
    const placedOrder = (placed.data as Json).order as Json;
    expect(placedOrder.couponCode).toBe("DEVWELCOME");
    expect(placedOrder.totals).toMatchObject({ subtotal: 99900, discount: 9990, shipping: 4900, total: 94810 });
    const redemptions = db
      .prepare("SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = 'coupon-dev-welcome'")
      .get() as { count: number };
    expect(redemptions.count).toBe(1);

    const second = new Client(base);
    await second.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
    await second.post("/api/v1/cart/shipping", { pincode: "518001" });
    await second.post("/api/v1/cart/coupon", { code: "DEVWELCOME" });
    const reused = await second.post(
      "/api/v1/checkout",
      checkoutBody({
        contact: { name: "Ritu Sharma", email: reuseEmail, phone: "9876543210" },
        idempotencyKey: `coupon-reuse-${Date.now()}`
      })
    );
    expect(reused.status).toBe(400);
    expect((reused.data as Json).error.code).toBe("COUPON_REJECTED");
    expect((reused.data as Json).error.message).toBe("You have already used this coupon.");

    db.prepare("UPDATE coupons SET usage_limit = 1 WHERE id = 'coupon-dev-welcome'").run();
    try {
      const third = new Client(base);
      await third.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
      const capped = await third.post("/api/v1/cart/coupon", { code: "DEVWELCOME" });
      expect(capped.status).toBe(400);
      expect((capped.data as Json).error.message).toBe("This coupon has reached its usage limit.");
    } finally {
      db.prepare("UPDATE coupons SET usage_limit = NULL WHERE id = 'coupon-dev-welcome'").run();
    }
  });
});
