import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customerEmail, ownerEmail } from "../../server/lib/notifications.js";
import { renderInvoice } from "../../server/lib/invoice.js";
import { checkoutBody, startSuite, unique, type Suite } from "../suite.js";
import type { Json } from "../helpers.js";

const OWNER = { email: `gift-owner-${Date.now().toString(36)}@example.com`, password: "GiftAudit#2026" };

let suite: Suite;
let base: string;
/** A variant-free product keeps the cart add on one code path, so the assertions below only depend on gift text. */
let productId: string;

beforeAll(async () => {
  suite = await startSuite(OWNER.email, OWNER.password);
  base = suite.base;
  const created = await suite.owner.post("/api/v1/admin/products", {
    ...suite.simpleProduct("Gift Keepsake", 50000, 500),
    personalizable: true
  });
  if (created.status !== 201) throw new Error(`Gift product creation failed: ${JSON.stringify(created.data)}`);
  productId = (created.data as Json).product.id as string;
}, 30_000);

afterAll(async () => {
  await suite?.stop();
});

type Placed = { orderNumber: string; order: Json; email: string };

async function placeGiftOrder(giftMessage: string, personalization: Record<string, string>): Promise<Placed> {
  const shopper = await suite.signUp();
  const added = await shopper.client.post("/api/v1/cart/items", {
    productId,
    variantId: "",
    quantity: 1,
    giftWrap: true,
    giftMessage,
    personalization
  });
  expect(added.status, JSON.stringify(added.data)).toBe(201);
  const pincode = await shopper.client.post("/api/v1/cart/shipping", { pincode: "518001" });
  expect(pincode.status, JSON.stringify(pincode.data)).toBe(200);
  const placed = await shopper.client.post("/api/v1/checkout", checkoutBody(shopper.email, `gift-${unique()}`));
  expect(placed.status, JSON.stringify(placed.data)).toBe(201);
  const order = (placed.data as Json).order as Json;
  return { orderNumber: order.orderNumber as string, order, email: shopper.email };
}

function orderRow(orderNumber: string) {
  const row = suite.db.prepare("SELECT * FROM orders WHERE order_number = ?").get(orderNumber);
  if (!row) throw new Error(`Order ${orderNumber} was not written.`);
  return row as Parameters<typeof ownerEmail>[1];
}

describe("gift details on the fulfilment path", () => {
  it("carries the card message typed on the product page into the order", async () => {
    const placed = await placeGiftOrder("Happy birthday Ammi", { recipientName: "Ammi", engraving: "R-K 2026" });
    const stored = suite.db
      .prepare("SELECT gift_message, gift_wrap, personalization_json FROM order_items WHERE order_id = (SELECT id FROM orders WHERE order_number = ?)")
      .get(placed.orderNumber) as { gift_message: string; gift_wrap: number; personalization_json: string };
    expect(stored.gift_message).toBe("Happy birthday Ammi");
    expect(stored.gift_wrap).toBe(1);
    expect(JSON.parse(stored.personalization_json) as Json).toMatchObject({ recipientName: "Ammi", engraving: "R-K 2026" });

    const item = ((placed.order.items as Json[])[0]) ?? {};
    expect(item.giftMessage).toBe("Happy birthday Ammi");
    expect(item.giftWrap).toBe(true);
    expect(item.personalization).toMatchObject({ recipientName: "Ammi", engraving: "R-K 2026" });
  });

  it("prints the wrap, the engraving and the card message on the invoice and in both emails", async () => {
    const placed = await placeGiftOrder("With love from the US", { recipientName: "Ammi", engraving: "R-K 2026" });
    const order = orderRow(placed.orderNumber);

    const invoice = renderInvoice(suite.db, order);
    expect(invoice).toContain("Gift wrapped");
    expect(invoice).toContain("Card message: With love from the US");
    expect(invoice).toContain("Engraving: R-K 2026");
    expect(invoice).toContain("For: Ammi");

    const toOwner = ownerEmail(suite.db, order);
    expect(toOwner.text).toContain("Gift wrapped");
    expect(toOwner.text).toContain("Card message: With love from the US");
    expect(toOwner.text).toContain("Engraving: R-K 2026");
    expect(toOwner.html).toContain("Card message: With love from the US");

    const toCustomer = customerEmail(suite.db, order);
    expect(toCustomer.text).toContain("Engraving: R-K 2026");
    expect(toCustomer.text).toContain("Card message: With love from the US");
    expect(toCustomer.html).toContain("For: Ammi");

    const pdf = await (await fetch(`${base}/api/v1/orders/${placed.orderNumber}/invoice.pdf?email=${encodeURIComponent(placed.email)}`)).text();
    expect(pdf.startsWith("%PDF")).toBe(true);
  });

  it("escapes hostile gift text in the invoice and in the emailed copies", async () => {
    const hostile = "<script>alert('gift')</script>";
    const placed = await placeGiftOrder(hostile, { engraving: '<img src=x onerror=alert(1)>' });
    const order = orderRow(placed.orderNumber);

    for (const document of [renderInvoice(suite.db, order), ownerEmail(suite.db, order).html, customerEmail(suite.db, order).html]) {
      expect(document).not.toContain("<script>alert('gift')</script>");
      expect(document).not.toContain("<img src=x onerror=alert(1)>");
      expect(document).toContain("&lt;script&gt;");
    }
    expect(ownerEmail(suite.db, order).text).toContain(hostile);
  });

  it("shows the card message to the shopper as well as to staff", async () => {
    const placed = await placeGiftOrder("Congrats on the new home", { message: "From the whole family" });
    const lookup = await fetch(`${base}/api/v1/orders/${placed.orderNumber}?email=${encodeURIComponent(placed.email)}`);
    expect(lookup.status).toBe(200);
    const body = (await lookup.json()) as Json;
    const item = ((body.order as Json).items as Json[])[0];
    expect(item.giftMessage).toBe("Congrats on the new home");
    expect(item.personalization).toMatchObject({ message: "From the whole family" });
  });

  it("still opens the order when a personalization row is unreadable", async () => {
    const placed = await placeGiftOrder("Readable note", { recipientName: "Ammi" });
    suite.db
      .prepare("UPDATE order_items SET personalization_json = '{not json' WHERE order_id = (SELECT id FROM orders WHERE order_number = ?)")
      .run(placed.orderNumber);
    const lookup = await fetch(`${base}/api/v1/orders/${placed.orderNumber}?email=${encodeURIComponent(placed.email)}`);
    expect(lookup.status).toBe(200);
    const item = ((((await lookup.json()) as Json).order as Json).items as Json[])[0];
    expect(item.personalization).toEqual({});
    const invoice = await fetch(`${base}/api/v1/orders/${placed.orderNumber}/invoice?email=${encodeURIComponent(placed.email)}`);
    expect(invoice.status).toBe(200);
    expect((await invoice.text()).length).toBeGreaterThan(400);
  });
});

describe("order status moves and public payload shape", () => {
  it("offers staff exactly the transitions the server allows", async () => {
    const placed = await placeGiftOrder("Anniversary surprise", {});
    const adminView = await suite.owner.get(`/api/v1/admin/orders/${encodeURIComponent(placed.orderNumber)}`);
    expect(adminView.status, JSON.stringify(adminView.data)).toBe(200);
    expect(((adminView.data as Json).order as Json).nextStatuses).toEqual(["confirmed", "cancelled"]);

    const moved = await suite.owner.post(
      `/api/v1/admin/orders/${encodeURIComponent(placed.orderNumber)}/status`,
      { status: "confirmed", note: "Packed the order." }
    );
    expect(moved.status, JSON.stringify(moved.data)).toBe(200);
    expect(((moved.data as Json).order as Json).nextStatuses).toEqual(["packed", "cancelled"]);

    const shopperView = await fetch(`${base}/api/v1/orders/${placed.orderNumber}?email=${encodeURIComponent(placed.email)}`);
    const publicOrder = ((await shopperView.json()) as Json).order as Json;
    expect(publicOrder.nextStatuses).toBeUndefined();
  });

  it("keeps build and environment details out of the public responses", async () => {
    const site = await fetch(`${base}/api/v1/content/site`);
    const siteBody = (await site.json()) as Json;
    expect(siteBody.build).toBeUndefined();
    expect(JSON.stringify(siteBody)).not.toContain("development");

    const health = await fetch(`${base}/api/v1/health`);
    const healthBody = (await health.json()) as Json;
    expect(healthBody.environment).toBeUndefined();
    expect(healthBody.database).toBe("ok");
  });
});
