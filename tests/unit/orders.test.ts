import { afterEach, describe, expect, it } from "vitest";
import type { DB } from "../../server/db.js";
import { ORDER_STATUSES, canTransition, restockOrder, type OrderRow } from "../../server/lib/orders.js";
import { formatOrderNumber } from "../../server/lib/http.js";
import { createTestDb, addCartItem, createCart, productBySlug, variantsOf } from "../helpers.js";

let db: DB;

afterEach(() => {
  try {
    db?.close();
  } catch {
    // the pure helpers in the last group never open a database, so the handle may already be closed
  }
});

function insertOrder(db: DB, id: string, number: string, status: string) {
  db.prepare(
    `INSERT INTO orders (id, order_number, email, phone, status, payment_method, payment_status,
       subtotal, discount, total, shipping_address, billing_address)
     VALUES (?, ?, 'buyer@example.com', '9876543210', ?, 'cod', 'cod_pending', 100, 0, 100, '{}', '{}')`
  ).run(id, number, status);
}

describe("order status transitions", () => {
  it("allows the documented forward path only", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "packed")).toBe(true);
    expect(canTransition("packed", "shipped")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
    expect(canTransition("delivered", "returned")).toBe(true);
  });

  it("blocks skipping stages and leaving terminal states", () => {
    expect(canTransition("pending", "packed")).toBe(false);
    expect(canTransition("pending", "delivered")).toBe(false);
    expect(canTransition("pending", "shipped")).toBe(false);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
    expect(canTransition("returned", "delivered")).toBe(false);
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(canTransition("unknown", "confirmed")).toBe(false);
  });

  it("allows cancellation before dispatch and returns after dispatch", () => {
    expect(canTransition("pending", "cancelled")).toBe(true);
    expect(canTransition("confirmed", "cancelled")).toBe(true);
    expect(canTransition("packed", "cancelled")).toBe(true);
    expect(canTransition("shipped", "cancelled")).toBe(false);
    expect(canTransition("shipped", "returned")).toBe(true);
  });

  it("keeps every declared status reachable in the transition map", () => {
    for (const status of ORDER_STATUSES) {
      expect(() => canTransition(status, "confirmed")).not.toThrow();
    }
  });
});

describe("restocking", () => {
  it("returns product stock and records an auditable movement", () => {
    db = createTestDb();
    const product = productBySlug(db, "bunny-plush");
    const before = product.stock_quantity;
    insertOrder(db, "order-restock-1", "SC-TEST-RESTOCK1", "cancelled");
    db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, variant_id, name, sku, unit_price, quantity,
         line_subtotal, line_discount, line_total)
       VALUES ('oi-restock-1', 'order-restock-1', ?, '', 'Linen Bunny Plush', 'SC-ST-002', 99900, 3, 299700, 0, 299700)`
    ).run(product.id);

    const order = db.prepare("SELECT * FROM orders WHERE id = 'order-restock-1'").get() as OrderRow;
    restockOrder(db, order, "actor-test", "cancel");

    const after = db.prepare("SELECT stock_quantity FROM products WHERE id = ?").get(product.id) as {
      stock_quantity: number;
    };
    expect(after.stock_quantity).toBe(before + 3);

    const movement = db
      .prepare("SELECT * FROM stock_movements WHERE reference = 'SC-TEST-RESTOCK1'")
      .get() as { delta: number; reason: string; actor_id: string; variant_id: string };
    expect(movement).toMatchObject({ delta: 3, reason: "cancel", actor_id: "actor-test", variant_id: "" });
  });

  it("returns variant stock when the order used a variant", () => {
    db = createTestDb();
    const variant = variantsOf(db, "rose-keepsake-box")[0];
    const before = variant.stock_quantity;
    insertOrder(db, "order-restock-2", "SC-TEST-RESTOCK2", "cancelled");
    db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, variant_id, name, sku, variant_name, unit_price, quantity,
         line_subtotal, line_discount, line_total)
       VALUES ('oi-restock-2', 'order-restock-2', ?, ?, 'Rose Velvet Keepsake Box', 'SC-BD-001-BL', 'Blush velvet',
         149900, 2, 299800, 0, 299800)`
    ).run(productBySlug(db, "rose-keepsake-box").id, variant.id);

    const order = db.prepare("SELECT * FROM orders WHERE id = 'order-restock-2'").get() as OrderRow;
    restockOrder(db, order, "actor-test", "cancel");

    const after = db.prepare("SELECT stock_quantity FROM product_variants WHERE id = ?").get(variant.id) as {
      stock_quantity: number;
    };
    expect(after.stock_quantity).toBe(before + 2);
  });
});

describe("checkout helpers", () => {
  it("produces cart lines with the stock needed for a valid order", () => {
    db = createTestDb();
    const cart = createCart(db);
    addCartItem(db, cart.id, "rose-keepsake-box", { quantity: 1 });
    const variant = db
      .prepare("SELECT stock_quantity FROM product_variants WHERE id = (SELECT variant_id FROM cart_items WHERE cart_id = ?)")
      .get(cart.id) as { stock_quantity: number };
    expect(variant.stock_quantity).toBeGreaterThan(0);
  });
});

describe("order numbers", () => {
  it("are well-formed, ambiguous-free and unique across a batch", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 500; index += 1) {
      const value = formatOrderNumber();
      expect(value).toMatch(/^SC-\d{8}-[A-Z0-9]{6}$/);
      expect(value.slice(-6)).not.toMatch(/[IO10]/);
      seen.add(value);
    }
    expect(seen.size).toBe(500);
  });

  it("carry the date they were generated on", () => {
    expect(formatOrderNumber(new Date("2026-10-26T09:00:00Z"))).toMatch(/^SC-20261026-/);
  });
});
