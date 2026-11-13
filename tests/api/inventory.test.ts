import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../server/app.js";
import { newId, nowIso } from "../../server/db.js";
import { createTestDb, TestClient as Client, type Json } from "../helpers.js";
import { checkoutBody, startSuite, unique, type Suite } from "../suite.js";

let suite: Suite;
let base: string;
let owner: Client;

const OWNER = { email: "inventory-owner@example.com", password: "InventoryOwner#2026" };

beforeAll(async () => {
  suite = await startSuite(OWNER.email, OWNER.password);
  base = suite.base;
  owner = suite.owner;
}, 30_000);

afterAll(async () => {
  await suite?.stop();
});

describe("inventory under pressure", () => {
  it("sells the last unit once, never oversells and never writes a negative stock", async () => {
    const created = await owner.post("/api/v1/admin/products", suite.simpleProduct("Last One Standing", 100000, 1));
    expect(created.status).toBe(201);
    const productId = (created.data as Json).product.id as string;

    const bags = await Promise.all(
      Array.from({ length: 4 }, async () => {
        const client = new Client(base);
        await suite.addToBag(client, productId, 1);
        await client.post("/api/v1/cart/shipping", { pincode: "518001" });
        return { client, email: `race-${unique()}@example.com` };
      })
    );

    const results = await Promise.all(
      bags.map(({ client, email }) => client.post("/api/v1/checkout", checkoutBody(email, `race-${unique()}`)))
    );
    const accepted = results.filter((result) => result.status === 201);
    const rejected = results.filter((result) => result.status === 409);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(3);
    expect(["INSUFFICIENT_STOCK", "CART_NEEDS_ATTENTION"]).toContain((rejected[0].data as Json).error.code);

    const stock = suite.db.prepare("SELECT stock_quantity FROM products WHERE id = ?").get(productId) as {
      stock_quantity: number;
    };
    expect(stock.stock_quantity).toBe(0);
    const movements = suite.db
      .prepare("SELECT COUNT(*) AS count FROM stock_movements WHERE product_id = ? AND reason = 'order'")
      .get(productId) as { count: number };
    expect(movements.count).toBe(1);
  });

  it("keeps an admin stock adjustment and a purchase from overwriting each other", async () => {
    const productId = suite.productIdOf("bunny-plush");
    suite.setStock(productId, 10);
    const buyer = await suite.signUp();
    await suite.addToBag(buyer.client, productId, 3);
    await buyer.client.post("/api/v1/cart/shipping", { pincode: "518001" });

    const [adjustment, purchase] = await Promise.all([
      owner.post(`/api/v1/admin/products/${productId}/stock`, { delta: 5, reason: "Supplier delivery" }),
      buyer.client.post("/api/v1/checkout", checkoutBody(buyer.email, `interleave-${unique()}`))
    ]);
    expect(adjustment.status, JSON.stringify(adjustment.data)).toBe(200);
    expect(purchase.status, JSON.stringify(purchase.data)).toBe(201);

    const stock = suite.db.prepare("SELECT stock_quantity FROM products WHERE id = ?").get(productId) as {
      stock_quantity: number;
    };
    expect(stock.stock_quantity).toBe(12);

    const orderNumber = (purchase.data as Json).order.orderNumber as string;
    const movements = suite.db
      .prepare("SELECT delta FROM stock_movements WHERE product_id = ? AND (reason = 'Supplier delivery' OR reference = ?)")
      .all(productId, orderNumber) as Array<{ delta: number }>;
    expect(movements).toHaveLength(2);
    expect(movements.reduce((sum, row) => sum + row.delta, 0)).toBe(2);
  });

  it("applies two variant adjustments against the stored number", async () => {
    const productId = suite.productIdOf("rose-keepsake-box");
    const variant = suite.db
      .prepare("SELECT id, stock_quantity FROM product_variants WHERE product_id = ? ORDER BY sort_order LIMIT 1")
      .get(productId) as { id: string; stock_quantity: number };

    const results = await Promise.all([
      owner.post(`/api/v1/admin/products/${productId}/stock`, { variantId: variant.id, delta: 3, reason: "Count one" }),
      owner.post(`/api/v1/admin/products/${productId}/stock`, { variantId: variant.id, delta: 4, reason: "Count two" })
    ]);
    expect(results.every((result) => result.status === 200)).toBe(true);

    const stock = suite.db.prepare("SELECT stock_quantity FROM product_variants WHERE id = ?").get(variant.id) as {
      stock_quantity: number;
    };
    expect(stock.stock_quantity).toBe(variant.stock_quantity + 7);
  });

  it("refuses an admin adjustment that would take stock below zero", async () => {
    const productId = suite.productIdOf("bunny-plush");
    suite.setStock(productId, 4);
    const attempt = await owner.post(`/api/v1/admin/products/${productId}/stock`, { delta: -9, reason: "Damaged stock" });
    expect(attempt.status).toBe(409);
    expect((attempt.data as Json).error.code).toBe("STOCK_BELOW_ZERO");
    const stock = suite.db.prepare("SELECT stock_quantity FROM products WHERE id = ?").get(productId) as {
      stock_quantity: number;
    };
    expect(stock.stock_quantity).toBe(4);
    const movement = suite.db
      .prepare("SELECT COUNT(*) AS count FROM stock_movements WHERE product_id = ? AND reason = 'Damaged stock'")
      .get(productId) as { count: number };
    expect(movement.count).toBe(0);
  });

  it("honours one idempotency key for one order", async () => {
    const shopper = await suite.signUp();
    const productId = suite.productIdOf("bunny-plush");
    suite.setStock(productId, 30);
    await suite.addToBag(shopper.client, productId, 1);
    await shopper.client.post("/api/v1/cart/shipping", { pincode: "518001" });
    const key = `idem-${unique()}`;
    const first = await shopper.client.post("/api/v1/checkout", checkoutBody(shopper.email, key));
    expect(first.status).toBe(201);
    const replay = await shopper.client.post("/api/v1/checkout", checkoutBody(shopper.email, key));
    expect(replay.status).not.toBe(201);
    expect([200, 409]).toContain(replay.status);
    if (replay.status === 200) {
      expect((replay.data as Json).order.orderNumber).toBe((first.data as Json).order.orderNumber);
    }
    const orders = suite.db.prepare("SELECT COUNT(*) AS count FROM orders WHERE idempotency_key = ?").get(key) as {
      count: number;
    };
    expect(orders.count).toBe(1);
  });
});

describe("return and refund state machine", () => {
  async function deliveredReturn() {
    const shopper = await suite.signUp();
    const productId = suite.productIdOf("bunny-plush");
    suite.setStock(productId, 40);
    await suite.addToBag(shopper.client, productId, 1);
    await shopper.client.post("/api/v1/cart/shipping", { pincode: "518001" });
    const placed = await shopper.client.post("/api/v1/checkout", checkoutBody(shopper.email, `ret-${unique()}`));
    expect(placed.status, JSON.stringify(placed.data)).toBe(201);
    const orderNumber = (placed.data as Json).order.orderNumber as string;
    for (const status of ["confirmed", "packed", "shipped", "delivered"]) {
      expect((await owner.post(`/api/v1/admin/orders/${orderNumber}/status`, { status })).status).toBe(200);
    }
    const orderId = (suite.db.prepare("SELECT id FROM orders WHERE order_number = ?").get(orderNumber) as { id: string })
      .id;
    const itemId = (suite.db.prepare("SELECT id FROM order_items WHERE order_id = ?").get(orderId) as { id: string }).id;
    const returnId = newId();
    const now = nowIso();
    suite.db
      .prepare(
        `INSERT INTO return_requests
           (id, request_number, order_id, order_item_id, user_id, email, reason, detail, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, 'damaged', 'Damaged in transit.', 'requested', ?, ?)`
      )
      .run(returnId, `SR-STATE-${returnId.slice(0, 8)}`, orderId, itemId, shopper.email, now, now);
    return { returnId, orderId, shopper };
  }

  it("records a refund once and refuses to refund the same return twice", async () => {
    const { returnId, orderId } = await deliveredReturn();
    expect(
      (
        await owner.post(`/api/v1/admin/returns/${returnId}/status`, {
          status: "approved",
          adminNote: "Approved after photos"
        })
      ).status
    ).toBe(200);
    expect(
      (
        await owner.post(`/api/v1/admin/returns/${returnId}/status`, {
          status: "received",
          adminNote: "Picked up from the customer"
        })
      ).status
    ).toBe(200);
    expect(
      (
        await owner.post(`/api/v1/admin/returns/${returnId}/status`, {
          status: "refunded",
          adminNote: "Cash receipt RC-1001"
        })
      ).status
    ).toBe(200);

    const duplicate = await owner.post(`/api/v1/admin/returns/${returnId}/status`, {
      status: "refunded",
      adminNote: "Cash receipt RC-1001 duplicate click"
    });
    expect(duplicate.status).toBe(409);
    expect((duplicate.data as Json).error.code).toBe("RETURN_ALREADY_REFUNDED");

    const events = suite.db
      .prepare("SELECT COUNT(*) AS count FROM order_events WHERE order_id = ? AND status = 'refunded'")
      .get(orderId) as { count: number };
    expect(events.count).toBe(1);
  });

  it("blocks an impossible jump from a rejected return straight to a refund", async () => {
    const { returnId, orderId } = await deliveredReturn();
    expect(
      (
        await owner.post(`/api/v1/admin/returns/${returnId}/status`, {
          status: "rejected",
          adminNote: "Outside the return window."
        })
      ).status
    ).toBe(200);
    const jumped = await owner.post(`/api/v1/admin/returns/${returnId}/status`, {
      status: "refunded",
      adminNote: "Refunded anyway without approval"
    });
    expect(jumped.status).toBe(409);
    expect((jumped.data as Json).error.code).toBe("RETURN_TRANSITION_INVALID");
    const order = suite.db.prepare("SELECT payment_status FROM orders WHERE id = ?").get(orderId) as {
      payment_status: string;
    };
    expect(order.payment_status).toBe("paid");
  });

  it("treats a repeated status as a no-op instead of a second event", async () => {
    const { returnId, orderId } = await deliveredReturn();
    expect(
      (await owner.post(`/api/v1/admin/returns/${returnId}/status`, { status: "approved", adminNote: "Approved once" }))
        .status
    ).toBe(200);
    const second = await owner.post(`/api/v1/admin/returns/${returnId}/status`, {
      status: "approved",
      adminNote: "Approved twice"
    });
    expect(second.status).toBe(200);
    const row = suite.db.prepare("SELECT admin_note FROM return_requests WHERE id = ?").get(returnId) as {
      admin_note: string;
    };
    expect(row.admin_note).toBe("Approved once");
    const events = suite.db.prepare("SELECT COUNT(*) AS count FROM order_events WHERE order_id = ?").get(orderId) as {
      count: number;
    };
    expect(events.count).toBe(5);
  });
});

describe("stored content", () => {
  it("survives SQL-shaped input without altering the schema or the data", async () => {
    const shopper = await suite.signUp();
    const payloads = [
      "admin' OR '1'='1",
      "'; DROP TABLE orders; --",
      '1"; DELETE FROM users WHERE 1=1; --',
      "' UNION SELECT password_hash FROM users --"
    ];
    for (const payload of payloads) {
      const search = await new Client(base).get(`/api/v1/catalog/products?q=${encodeURIComponent(payload)}`);
      expect(search.status).toBe(200);
      expect(((search.data as Json).items as Json[]).length).toBe(0);
      const login = await new Client(base).post("/api/v1/auth/login", { email: payload, password: payload });
      expect([400, 401]).toContain(login.status);
      const pincode = await new Client(base).post("/api/v1/cart/shipping", { pincode: "12345" });
      expect(pincode.status).toBe(400);
    }
    expect((suite.db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count).toBeGreaterThan(2);
    const ticket = await shopper.client.post("/api/v1/content/support/tickets", {
      name: "Injector",
      email: shopper.email,
      phone: "9876543210",
      subject: "'; DROP TABLE support_tickets; --",
      message: "Testing that awkward input is stored as text and never executed."
    });
    expect(ticket.status).toBe(201);
    const stored = suite.db
      .prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE subject = ?")
      .get("'; DROP TABLE support_tickets; --") as { count: number };
    expect(stored.count).toBe(1);
  });

  it("escapes hostile gift text in the server-rendered invoice", async () => {
    const shopper = await suite.signUp();
    const productId = suite.productIdOf("bunny-plush");
    suite.setStock(productId, 20);
    await suite.addToBag(shopper.client, productId, 1);
    await shopper.client.post("/api/v1/cart/shipping", { pincode: "518001" });
    const placed = await shopper.client.post(
      "/api/v1/checkout",
      checkoutBody(shopper.email, `xss-${unique()}`, {
        giftMessage: "<script>alert('gift')</script>",
        customerNote: "<img src=x onerror=alert(1)>"
      })
    );
    expect(placed.status, JSON.stringify(placed.data)).toBe(201);
    const orderNumber = (placed.data as Json).order.orderNumber as string;
    const invoice = await shopper.client.get(`/api/v1/orders/${encodeURIComponent(orderNumber)}/invoice`);
    expect(invoice.status).toBe(200);
    expect(invoice.headers.get("content-type")).toContain("text/html");
    expect(invoice.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(invoice.text).not.toContain("<script>alert('gift')</script>");
    expect(invoice.text).not.toContain("<img src=x onerror=alert(1)>");
    expect(invoice.text).toContain("&lt;script&gt;");
    expect(invoice.text).toContain("Gift message");
    expect(invoice.text).toContain("Note from the customer");

    const orderId = (
      suite.db.prepare("SELECT id FROM orders WHERE order_number = ?").get(orderNumber) as { id: string }
    ).id;
    suite.db
      .prepare("UPDATE order_items SET personalization_json = ? WHERE order_id = ?")
      .run(
        JSON.stringify({ engraving: "<script>alert('engraving')</script>", recipientName: "Ammi & Co" }),
        orderId
      );
    const personalised = await shopper.client.get(`/api/v1/orders/${encodeURIComponent(orderNumber)}/invoice`);
    expect(personalised.text).toContain("Engraving: &lt;script&gt;alert(&#39;engraving&#39;)&lt;/script&gt;");
    expect(personalised.text).toContain("Ammi &amp; Co");
    expect(personalised.text).not.toContain("<script>alert('engraving')");

    const pdf = await shopper.client.get(`/api/v1/orders/${encodeURIComponent(orderNumber)}/invoice.pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    expect(pdf.text.startsWith("%PDF")).toBe(true);
  });

  it("keeps personalization keys to the allow-list", async () => {
    const shopper = await suite.signUp();
    const productId = suite.productIdOf("personalised-journal");
    suite.setStock(productId, 10);
    const variant = suite.db
      .prepare("SELECT id FROM product_variants WHERE product_id = ? LIMIT 1")
      .get(productId) as { id: string } | undefined;
    const attempt = await shopper.client.post("/api/v1/cart/items", {
      productId,
      variantId: variant?.id ?? "",
      quantity: 1,
      personalization: {
        recipientName: "Ammi",
        evilKey: "<%= process.env.SMTP_URL %>",
        script: "alert(1)"
      }
    });
    expect(attempt.status, JSON.stringify(attempt.data)).toBe(201);
    const cartId = ((attempt.data as Json).cart as Json).id as string;
    const stored = suite.db
      .prepare("SELECT personalization_json FROM cart_items WHERE cart_id = ?")
      .get(cartId) as { personalization_json: string };
    expect(Object.keys(JSON.parse(stored.personalization_json) as Json)).toEqual(["recipientName"]);
    expect(stored.personalization_json).not.toContain("SMTP_URL");
  });
});

describe("fault injection", () => {
  it("returns a generic envelope instead of a stack trace when the database itself fails", async () => {
    const brokenDb = createTestDb();
    const brokenApp = createApp(brokenDb);
    const brokenServer = await new Promise<Server>((resolve) => {
      const listening = brokenApp.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const url = `http://127.0.0.1:${(brokenServer.address() as AddressInfo).port}`;
    try {
      const shopper = new Client(url);
      await shopper.post("/api/v1/cart/items", { productId: "prod-bunny-plush", quantity: 1 });
      brokenDb.exec("DROP TABLE shipping_zones");
      const failed = await shopper.post("/api/v1/cart/shipping", { pincode: "518001" });
      expect(failed.status).toBe(500);
      const body = failed.data as Json;
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe("Something went wrong. Please try again.");
      const text = JSON.stringify(body);
      for (const leak of ["shipping_zones", "SqliteError", "SELECT", "no such table", "D:/", "node_modules", "at "]) {
        expect(text, `expected no "${leak}" in the 500 body`).not.toContain(leak);
      }
    } finally {
      await new Promise<void>((resolve) => brokenServer.close(() => resolve()));
      brokenDb.close();
    }
  });
});
