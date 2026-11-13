import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkoutBody, startSuite, unique, type Suite } from "../suite.js";
import type { Json } from "../helpers.js";

const OWNER = { email: `lifecycle-owner-${Date.now().toString(36)}@example.com`, password: "Lifecycle#2026" };

let suite: Suite;
let productId: string;

beforeAll(async () => {
  suite = await startSuite(OWNER.email, OWNER.password);
  const created = await suite.owner.post("/api/v1/admin/products", suite.simpleProduct("Lifecycle Vase", 45000, 8));
  if (created.status !== 201) throw new Error(`Product creation failed: ${JSON.stringify(created.data)}`);
  productId = (created.data as Json).product.id as string;
}, 30_000);

afterAll(async () => {
  await suite?.stop();
});

async function placeOrder(): Promise<{ orderNumber: string }> {
  const shopper = await suite.signUp();
  await suite.addToBag(shopper.client, productId, 1);
  await shopper.client.post("/api/v1/cart/shipping", { pincode: "518001" });
  const placed = await shopper.client.post("/api/v1/checkout", checkoutBody(shopper.email, `lifecycle-${unique()}`));
  expect(placed.status, JSON.stringify(placed.data)).toBe(201);
  return { orderNumber: ((placed.data as Json).order as Json).orderNumber as string };
}

function stockOf(productId: string): number {
  return (suite.db.prepare("SELECT stock_quantity FROM products WHERE id = ?").get(productId) as { stock_quantity: number })
    .stock_quantity;
}

describe("order lifecycle guards", () => {
  it("refuses a status the fulfilment ladder has not reached yet", async () => {
    const { orderNumber } = await placeOrder();
    const skipped = await suite.owner.post(`/api/v1/admin/orders/${orderNumber}/status`, { status: "shipped" });
    expect(skipped.status).toBe(409);
    expect(((skipped.data as Json).error as Json).code).toBe("INVALID_TRANSITION");

    const cancelledStraight = await suite.owner.post(`/api/v1/admin/orders/${orderNumber}/status`, { status: "cancelled", note: "Buyer rang off." });
    expect(cancelledStraight.status).toBe(200);
    const afterCancel = await suite.owner.post(`/api/v1/admin/orders/${orderNumber}/status`, { status: "confirmed" });
    expect(afterCancel.status).toBe(409);
    expect(((afterCancel.data as Json).error as Json).code).toBe("INVALID_TRANSITION");
  });

  it("rejects a repeated status without restocking the bag again", async () => {
    const { orderNumber } = await placeOrder();
    const before = stockOf(productId);
    const first = await suite.owner.post(`/api/v1/admin/orders/${orderNumber}/status`, { status: "cancelled", note: "Changed their mind." });
    expect(first.status).toBe(200);
    expect(stockOf(productId)).toBe(before + 1);

    const repeat = await suite.owner.post(`/api/v1/admin/orders/${orderNumber}/status`, { status: "cancelled", note: "Again." });
    expect(repeat.status).toBe(409);
    expect(((repeat.data as Json).error as Json).code).toBe("NO_STATUS_CHANGE");
    expect(stockOf(productId)).toBe(before + 1);
    const restocks = suite.db
      .prepare("SELECT COUNT(*) AS count FROM stock_movements WHERE reference = ? AND reason = 'cancel'")
      .get(orderNumber) as { count: number };
    expect(restocks.count).toBe(1);
    const net = suite.db
      .prepare("SELECT COALESCE(SUM(delta), 0) AS delta FROM stock_movements WHERE reference = ?")
      .get(orderNumber) as { delta: number };
    expect(net.delta).toBe(0);
  });

  it("walks the ladder, marks cash on delivery paid and keeps an event trail", async () => {
    const { orderNumber } = await placeOrder();
    for (const status of ["confirmed", "packed", "shipped"]) {
      const moved = await suite.owner.post(`/api/v1/admin/orders/${orderNumber}/status`, {
        status,
        note: `Moved to ${status} by the audit.`,
        ...(status === "shipped" ? { trackingNumber: "AUDIT-1", trackingUrl: "https://example.com/track/AUDIT-1" } : {})
      });
      expect(moved.status, JSON.stringify(moved.data)).toBe(200);
    }

    const delivered = await suite.owner.post(`/api/v1/admin/orders/${orderNumber}/status`, { status: "delivered", note: "Handed over." });
    expect(delivered.status).toBe(200);
    const row = suite.db.prepare("SELECT status, payment_status FROM orders WHERE order_number = ?").get(orderNumber) as {
      status: string;
      payment_status: string;
    };
    expect(row).toEqual({ status: "delivered", payment_status: "paid" });

    const events = suite.db
      .prepare("SELECT status, note FROM order_events WHERE order_id = (SELECT id FROM orders WHERE order_number = ?) ORDER BY created_at, id")
      .all(orderNumber) as Array<{ status: string; note: string }>;
    expect(events.map((event) => event.status)).toEqual(["pending", "confirmed", "packed", "shipped", "delivered"]);
    expect(events.at(-1)?.note).toBe("Handed over.");
  });
});
