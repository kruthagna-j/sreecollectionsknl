import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../../server/config.js";
import { TestClient as Client, type Json } from "../helpers.js";
import { address, checkoutBody, startSuite, unique, type Suite } from "../suite.js";

let suite: Suite;
let base: string;
let owner: Client;

const OWNER = { email: "security-owner@example.com", password: "SecurityOwner#2026" };

async function rawPost(path: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: (await response.json().catch(() => ({}))) as Json };
}

beforeAll(async () => {
  suite = await startSuite(OWNER.email, OWNER.password);
  base = suite.base;
  owner = suite.owner;
}, 30_000);

afterAll(async () => {
  await suite?.stop();
});

describe("transport hardening", () => {
  it("refuses a mutating request with no CSRF token and one from a foreign origin", async () => {
    const noToken = await rawPost("/api/v1/content/support/tickets", {
      name: "Anonymous Attacker",
      email: "attacker@example.com",
      phone: "9876543210",
      subject: "Order help",
      message: "Please reply to this support question."
    });
    expect(noToken.status).toBe(403);
    expect((noToken.data as Json).error.code).toBe("CSRF_FAILED");

    const foreignOrigin = await rawPost(
      "/api/v1/auth/login",
      { email: OWNER.email, password: OWNER.password },
      { origin: "https://evil-mirror.example" }
    );
    expect(foreignOrigin.status).toBe(403);
    expect((foreignOrigin.data as Json).error.code).toBe("ORIGIN_NOT_ALLOWED");

    const client = new Client(base);
    const ownOrigin = await client.request("/api/v1/auth/login", {
      method: "POST",
      body: { email: OWNER.email, password: "definitely-wrong" },
      headers: { origin: config.appOrigin }
    });
    expect(ownOrigin.status).toBe(401);
    expect((ownOrigin.data as Json).error.code).toBe("INVALID_CREDENTIALS");
  });

  it("marks API responses uncacheable and unsniffable and sets the session cookie flags", async () => {
    const health = await new Client(base).get("/api/v1/health");
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    expect(health.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(health.headers.get("cache-control")).toBe("no-store");
    expect(health.headers.get("referrer-policy")).toBe("no-referrer");

    // The CSRF token is minted on the first cookie-less request, so that response carries it.
    const bootstrap = await new Client(base).get("/api/v1/content/site");
    const csrfCookie = bootstrap.headers.getSetCookie().find((value) => value.startsWith("sc_csrf=")) ?? "";
    expect(csrfCookie).toMatch(/sc_csrf=[^;]{20,}/);
    expect(csrfCookie).toMatch(/SameSite=Lax/i);
    expect(csrfCookie).toMatch(/Path=\//i);
    expect(csrfCookie).not.toMatch(/HttpOnly/i);

    const client = new Client(base);
    const registered = await client.post("/api/v1/auth/register", {
      name: "Cookie Check",
      email: `cookies-${unique()}@example.com`,
      password: "Cookies#2026"
    });
    const setCookie = registered.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/sc_session=[^;]+;.*HttpOnly/i);
    expect(setCookie).toMatch(/sc_session=[^;]+;.*SameSite=Lax/i);
    expect(setCookie).toMatch(/Path=\//i);
  });

  it("rejects an oversized request body with 413 rather than a server fault", async () => {
    const csrf = "a".repeat(32);
    const response = await fetch(`${base}/api/v1/content/support/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-csrf-token": csrf,
        Cookie: `sc_csrf=${csrf}`
      },
      body: JSON.stringify({ message: "x".repeat(120_000) })
    });
    expect(response.status).toBe(413);
    const body = (await response.json()) as Json;
    expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(JSON.stringify(body)).not.toContain("node_modules");
  });

  it("does not let registration body fields assign a staff role", async () => {
    const client = new Client(base);
    const email = `escalate-${unique()}@example.com`;
    const registered = await client.post("/api/v1/auth/register", {
      name: "Wanna Be Owner",
      email,
      password: "Escalate#2026",
      role: "owner",
      is_admin: true,
      id: "fixed-id"
    });
    expect(registered.status).toBe(201);
    expect((registered.data as Json).user.role).toBe("customer");
    const row = suite.db.prepare("SELECT role, id FROM users WHERE email = ?").get(email) as { role: string; id: string };
    expect(row.role).toBe("customer");
    expect(row.id).not.toBe("fixed-id");

    const adminArea = await client.get("/api/v1/admin/products");
    expect(adminArea.status).toBe(403);
    expect((adminArea.data as Json).error.code).toBe("FORBIDDEN");
  });
});

describe("authentication storage", () => {
  it("stores only a bcrypt hash and a hashed session token", async () => {
    const { email } = await suite.signUp();
    const user = suite.db.prepare("SELECT password_hash FROM users WHERE email = ?").get(email) as {
      password_hash: string;
    };
    expect(user.password_hash).toMatch(/^\$2[aby]\$/);
    expect(user.password_hash).not.toContain("AuditShopper#2026");

    const session = suite.db.prepare("SELECT token_hash FROM sessions ORDER BY created_at DESC LIMIT 1").get() as {
      token_hash: string;
    };
    expect(session.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("destroys the session on logout and rejects the stale cookie", async () => {
    const { client } = await suite.signUp();
    const before = suite.db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number };
    const loggedOut = await client.post("/api/v1/auth/logout", {});
    expect(loggedOut.status).toBe(200);
    const after = suite.db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number };
    expect(after.count).toBeLessThan(before.count);
    const stale = await client.get("/api/v1/account");
    expect(stale.status).toBe(401);
    expect((stale.data as Json).error.code).toBe("AUTH_REQUIRED");
  });
});

describe("cross-customer authorization", () => {
  it("hides another customer's order, invoice, tracking and cancellation", async () => {
    const victim = await suite.signUp();
    const attacker = await suite.signUp();
    await suite.addToBag(attacker.client, suite.productIdOf("bunny-plush"));
    const placed = await attacker.client.post("/api/v1/checkout", checkoutBody(attacker.email, `mine-${unique()}`));
    const orderNumber = (placed.data as Json).order.orderNumber as string;

    expect((await victim.client.get(`/api/v1/account/orders/${orderNumber}`)).status).toBe(404);
    const lookup = await victim.client.get(`/api/v1/orders/${encodeURIComponent(orderNumber)}`);
    expect(lookup.status).toBe(404);
    expect((lookup.data as Json).error.code).toBe("ORDER_NOT_FOUND");
    expect(
      (
        await victim.client.get(
          `/api/v1/orders/track?orderNumber=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(victim.email)}`
        )
      ).status
    ).toBe(404);
    expect((await victim.client.get(`/api/v1/orders/${encodeURIComponent(orderNumber)}/invoice`)).status).toBe(404);
    expect(
      (await victim.client.post(`/api/v1/account/orders/${orderNumber}/cancel`, { reason: "not mine" })).status
    ).toBe(404);

    const ownLookup = await attacker.client.get(`/api/v1/orders/${encodeURIComponent(orderNumber)}`);
    expect(ownLookup.status).toBe(200);
  });

  it("treats the order number plus the order email as the lookup capability", async () => {
    const shopper = await suite.signUp();
    await suite.addToBag(shopper.client, suite.productIdOf("bunny-plush"));
    const placed = await shopper.client.post("/api/v1/checkout", checkoutBody(shopper.email, `cap-${unique()}`));
    const orderNumber = (placed.data as Json).order.orderNumber as string;

    const numberAlone = await new Client(base).get(`/api/v1/orders/track?orderNumber=${encodeURIComponent(orderNumber)}`);
    expect(numberAlone.status).toBe(400);
    expect((numberAlone.data as Json).error.code).toBe("EMAIL_REQUIRED");

    const wrongEmail = await new Client(base).get(
      `/api/v1/orders/track?orderNumber=${encodeURIComponent(orderNumber)}&email=stranger@example.com`
    );
    expect(wrongEmail.status).toBe(404);

    const rightEmail = await new Client(base).get(
      `/api/v1/orders/track?orderNumber=${encodeURIComponent(orderNumber)}&email=${encodeURIComponent(shopper.email)}`
    );
    expect(rightEmail.status).toBe(200);
    expect((rightEmail.data as Json).order.orderNumber).toBe(orderNumber);
  });

  it("scopes addresses and return requests to their owner", async () => {
    const victim = await suite.signUp();
    const attacker = await suite.signUp();
    const saved = await victim.client.post("/api/v1/account/addresses", address({ label: "Home" }));
    expect(saved.status).toBe(201);
    const addressId = (saved.data as Json).address.id as string;

    expect((await attacker.client.patch(`/api/v1/account/addresses/${addressId}`, address({ city: "Chennai" }))).status).toBe(
      404
    );
    expect((await attacker.client.post(`/api/v1/account/addresses/${addressId}/default`, {})).status).toBe(404);
    expect((await attacker.client.request(`/api/v1/account/addresses/${addressId}`, { method: "DELETE" })).status).toBe(404);

    const list = await victim.client.get("/api/v1/account/addresses");
    expect(((list.data as Json).items as Json[]).find((item) => item.id === addressId)?.city).toBe("Kurnool");

    await suite.addToBag(victim.client, suite.productIdOf("bunny-plush"));
    const placed = await victim.client.post("/api/v1/checkout", checkoutBody(victim.email, `scope-${unique()}`));
    const orderNumber = (placed.data as Json).order.orderNumber as string;
    const orderId = (suite.db.prepare("SELECT id FROM orders WHERE order_number = ?").get(orderNumber) as { id: string })
      .id;
    const itemId = (suite.db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(orderId) as { id: string }).id;

    const forged = await attacker.client.post("/api/v1/account/returns", {
      orderNumber,
      orderItemId: itemId,
      reason: "changed_mind",
      detail: "Trying to attach a return to somebody else's order."
    });
    expect(forged.status).toBeGreaterThanOrEqual(400);
    expect(forged.status).not.toBe(201);
    expect(
      (
        suite.db.prepare("SELECT COUNT(*) AS count FROM return_requests WHERE order_id = ?").get(orderId) as {
          count: number;
        }
      ).count
    ).toBe(0);

    const ticket = await attacker.client.post("/api/v1/content/support/tickets", {
      name: "Attacker",
      email: attacker.email,
      phone: "9876543210",
      subject: "Someone else's order",
      message: `Please cancel order ${orderNumber} which is not mine.`,
      orderNumber
    });
    expect(ticket.status).toBe(201);
    const ticketRow = suite.db
      .prepare("SELECT user_id, order_number FROM support_tickets WHERE ticket_number = ?")
      .get((ticket.data as Json).ticketNumber) as { user_id: string | null; order_number: string | null };
    expect(ticketRow.user_id).toBe(attacker.user.id);
    expect(ticketRow.order_number).toBe(orderNumber);
  });

  it("keeps every admin area closed to signed-out visitors and customers", async () => {
    const paths = [
      "/api/v1/admin/summary",
      "/api/v1/admin/products",
      "/api/v1/admin/orders",
      "/api/v1/admin/customers",
      "/api/v1/admin/coupons",
      "/api/v1/admin/zones",
      "/api/v1/admin/reviews?status=pending",
      "/api/v1/admin/tickets",
      "/api/v1/admin/returns",
      "/api/v1/admin/settings",
      "/api/v1/admin/audit",
      "/api/v1/admin/stock-movements"
    ];
    for (const path of paths) {
      expect((await new Client(base).get(path)).status, path).toBe(401);
    }
    const customer = await suite.signUp();
    for (const path of paths) {
      expect((await customer.client.get(path)).status, path).toBe(403);
    }
    expect(
      (await customer.client.post(`/api/v1/admin/products/${suite.productIdOf("bunny-plush")}/stock`, { delta: 5, reason: "hack" }))
        .status
    ).toBe(403);
    expect((await customer.client.put("/api/v1/admin/settings/store", { value: { name: "Hacked" } })).status).toBe(403);
  });
});

describe("server-side pricing integrity", () => {
  it("ignores every price, discount and status field the browser tries to inject", async () => {
    const shopper = await suite.signUp();
    const productId = suite.productIdOf("bunny-plush");
    await suite.addToBag(shopper.client, productId, 2);
    const shipped = await shopper.client.post("/api/v1/cart/shipping", { pincode: "518001" });
    expect(shipped.status).toBe(200);
    const cart = (shipped.data as Json).cart as Json;
    expect(cart.subtotal).toBeGreaterThan(0);

    const placed = await shopper.client.post(
      "/api/v1/checkout",
      checkoutBody(shopper.email, `tamper-${unique()}`, {
        totals: { subtotal: 1, discount: 999999, shipping: 0, total: 1 },
        total: 1,
        subtotal: 1,
        discount: 999999,
        giftWrapTotal: 0,
        shippingFee: 0,
        taxIncluded: 0,
        status: "delivered",
        paymentStatus: "paid",
        items: [{ productId, quantity: 2, unitPrice: 1 }]
      })
    );
    expect(placed.status, JSON.stringify(placed.data)).toBe(201);
    const order = (placed.data as Json).order as Json;
    expect(order.totals.subtotal).toBe(cart.subtotal);
    expect(order.totals.total).toBe(cart.total);
    expect(order.status).toBe("pending");
    expect(order.paymentStatus).toBe("cod_pending");
    expect(order.couponCode).toBeNull();

    const row = suite.db
      .prepare("SELECT subtotal, discount, total, payment_status, status FROM orders WHERE order_number = ?")
      .get(order.orderNumber) as Json;
    expect(row.discount).toBe(0);
    expect(row.subtotal).toBe(cart.subtotal);
    expect(row.total).toBe(cart.total);
    expect(row.payment_status).toBe("cod_pending");
    expect(row.status).toBe("pending");
  });

  it("refuses a coupon the shopper names at checkout instead of honouring it", async () => {
    const shopper = await suite.signUp();
    await suite.addToBag(shopper.client, suite.productIdOf("bunny-plush"));
    await shopper.client.post("/api/v1/cart/shipping", { pincode: "518001" });
    const placed = await shopper.client.post(
      "/api/v1/checkout",
      checkoutBody(shopper.email, `bogus-coupon-${unique()}`, { couponCode: "GOLDEN50" })
    );
    expect(placed.status).toBe(400);
    expect((placed.data as Json).error.code).toBe("COUPON_REJECTED");
    const orders = suite.db.prepare("SELECT COUNT(*) AS count FROM orders WHERE email = ?").get(shopper.email) as {
      count: number;
    };
    expect(orders.count).toBe(0);
  });

  it("prices from the database after an admin change, not from the saved cart", async () => {
    const created = await owner.post("/api/v1/admin/products", suite.simpleProduct("Priced Later", 50000, 10));
    expect(created.status).toBe(201);
    const productId = (created.data as Json).product.id as string;

    const shopper = new Client(base);
    await suite.addToBag(shopper, productId);
    const before = await shopper.get("/api/v1/cart");
    expect((before.data as Json).cart.subtotal).toBe(50000);

    expect((await owner.patch(`/api/v1/admin/products/${productId}`, { price: 75000 })).status).toBe(200);
    const after = await shopper.get("/api/v1/cart");
    expect((after.data as Json).cart.subtotal).toBe(75000);

    await shopper.post("/api/v1/cart/shipping", { pincode: "518001" });
    const placed = await shopper.post("/api/v1/checkout", checkoutBody(`price-${unique()}@example.com`, `price-${unique()}`));
    expect(placed.status).toBe(201);
    expect((placed.data as Json).order.totals.subtotal).toBe(75000);
    const snapshot = suite.db.prepare("SELECT unit_price FROM order_items WHERE product_id = ?").get(productId) as {
      unit_price: number;
    };
    expect(snapshot.unit_price).toBe(75000);
  });

  it("refuses a cash-on-delivery order above the configured ceiling", async () => {
    const created = await owner.post("/api/v1/admin/products", suite.simpleProduct("Big Corporate Order", 400000, 5));
    const productId = (created.data as Json).product.id as string;
    const shopper = await suite.signUp();
    await suite.addToBag(shopper.client, productId, 3);
    await shopper.client.post("/api/v1/cart/shipping", { pincode: "518001" });
    const placed = await shopper.client.post(
      "/api/v1/checkout",
      checkoutBody(shopper.email, `codlimit-${unique()}`, { paymentMethod: "cod" })
    );
    expect(placed.status, JSON.stringify(placed.data)).toBe(400);
    expect((placed.data as Json).error.code).toBe("COD_UNAVAILABLE");
    const savedOrders = suite.db.prepare("SELECT COUNT(*) AS count FROM orders WHERE email = ?").get(shopper.email) as {
      count: number;
    };
    expect(savedOrders.count).toBe(0);
  });

  it("rejects malformed, negative and excessive quantities", async () => {
    const shopper = await suite.signUp();
    const productId = suite.productIdOf("bunny-plush");
    for (const quantity of [0, -3, 1.5, 999, "many", "1e9", false, null]) {
      const attempt = await shopper.client.post("/api/v1/cart/items", { productId, quantity });
      expect(attempt.status, `quantity ${JSON.stringify(quantity)}`).toBe(400);
      expect((attempt.data as Json).error.code, JSON.stringify(attempt.data)).toBe("VALIDATION_ERROR");
    }
    const cart = await shopper.client.get("/api/v1/cart");
    expect(((cart.data as Json).cart.lines as Json[]).length).toBe(0);
    expect((await shopper.client.post("/api/v1/cart/items", { productId: "prod-does-not-exist", quantity: 1 })).status).toBe(
      404
    );
  });

  it("will not let a shopper attach a variant belonging to a different product", async () => {
    const shopper = await suite.signUp();
    const foreignVariant = suite.db
      .prepare("SELECT id FROM product_variants WHERE product_id = 'prod-engraved-memory-locket' LIMIT 1")
      .get() as { id: string };

    const mismatched = await shopper.client.post("/api/v1/cart/items", {
      productId: "prod-rose-keepsake-box",
      variantId: foreignVariant.id,
      quantity: 1
    });
    expect(mismatched.status).toBe(400);
    expect((mismatched.data as Json).error.code).toBe("VARIANT_UNAVAILABLE");

    const noVariants = await shopper.client.post("/api/v1/cart/items", {
      productId: "prod-bunny-plush",
      variantId: foreignVariant.id,
      quantity: 1
    });
    expect(noVariants.status).toBe(400);
    expect((noVariants.data as Json).error.code).toBe("INVALID_VARIANT");
  });
});

describe("coupon abuse", () => {
  it("will not accept a coupon code short enough to guess", async () => {
    for (const code of ["ABC", "GIFT1", "ab_cd", "HOLI 2026", "SELECT*FROM"]) {
      const attempt = await owner.post("/api/v1/admin/coupons", { code, kind: "fixed", value: 5000 });
      expect(attempt.status, code).toBe(400);
      expect((attempt.data as Json).error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("applies the discount cap and keeps the totals arithmetic exact", async () => {
    const code = `CAPTEST${unique()}`.toUpperCase().slice(0, 20);
    const created = await owner.post("/api/v1/admin/coupons", {
      code,
      kind: "percent",
      value: 5000,
      minSubtotal: 0,
      maxDiscount: 5000,
      perEmailLimit: 5
    });
    expect(created.status, JSON.stringify(created.data)).toBe(201);

    const shopper = await suite.signUp();
    await suite.addToBag(shopper.client, suite.productIdOf("bunny-plush"));
    const applied = await shopper.client.post("/api/v1/cart/coupon", { code });
    expect(applied.status, JSON.stringify(applied.data)).toBe(200);
    const cart = (applied.data as Json).cart as Json;
    expect(cart.discount).toBe(5000);
    expect(cart.total).toBe(cart.subtotal - cart.discount + cart.shippingFee);

    const quoted = await shopper.client.post("/api/v1/cart/shipping", { pincode: "518001" });
    const withShipping = (quoted.data as Json).cart as Json;
    expect(withShipping.total).toBe(withShipping.subtotal - withShipping.discount + withShipping.shippingFee);
    expect(withShipping.shipping.fee).toBeGreaterThan(0);
  });

  it("stops a scripted run from probing coupon codes at speed", async () => {
    const shopper = await suite.signUp();
    await suite.addToBag(shopper.client, suite.productIdOf("bunny-plush"));
    let rejected = 0;
    let limited = 0;
    for (let index = 0; index < 40; index += 1) {
      const attempt = await shopper.client.post("/api/v1/cart/coupon", { code: `GUESSCODE${index}` });
      if (attempt.status === 400 && (attempt.data as Json).error.code === "COUPON_REJECTED") rejected += 1;
      if (attempt.status === 429) limited += 1;
    }
    expect(rejected, "wrong codes must be refused").toBeGreaterThanOrEqual(1);
    expect(limited, "coupon guessing must be rate limited").toBeGreaterThan(0);
    expect((await shopper.client.post("/api/v1/cart/coupon", { code: "DEVWELCOME" })).status).toBe(429);
  });
});
