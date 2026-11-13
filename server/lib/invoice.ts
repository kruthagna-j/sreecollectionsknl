import { getSetting, type DB } from "../db.js";
import { escapeHtml, rupees } from "./http.js";
import { latestEmailStatus } from "./notifications.js";
import { parseAddress, personalizationEntries, type OrderRow } from "./orders.js";

type StoreSettings = {
  name?: string;
  tagline?: string;
  supportEmail?: string;
  supportPhone?: string;
  address?: string;
};

type TaxSettings = {
  inclusive?: boolean;
  gstin?: string;
  state?: string;
};

export function renderInvoice(db: DB, order: OrderRow): string {
  const store = getSetting<StoreSettings>(db, "store", {});
  const tax = getSetting<TaxSettings>(db, "tax", {});
  const items = db
    .prepare(
      `SELECT name, sku, variant_name, quantity, unit_price, line_discount, line_total, gift_wrap, gift_message, personalization_json
       FROM order_items WHERE order_id = ? ORDER BY rowid`
    )
    .all(order.id) as Array<{
    name: string;
    sku: string;
    variant_name: string | null;
    quantity: number;
    unit_price: number;
    line_discount: number;
    line_total: number;
    gift_wrap: number;
    gift_message: string;
    personalization_json: string;
  }>;
  const shipping = parseAddress(order.shipping_address);
  const billing = parseAddress(order.billing_address);
  const taxAmount = order.tax_mode === "inclusive" ? order.tax_included : order.tax_exclusive;
  const sameState = Boolean(tax.state) && tax.state!.trim().toLowerCase() === shipping.state.trim().toLowerCase();
  const taxRows = taxAmount > 0
    ? sameState
      ? `<tr><td>CGST</td><td>${rupees(Math.floor(taxAmount / 2))}</td></tr>
         <tr><td>SGST</td><td>${rupees(Math.ceil(taxAmount / 2))}</td></tr>`
      : `<tr><td>${tax.state ? "IGST" : "GST"}</td><td>${rupees(taxAmount)}</td></tr>`
    : `<tr><td>GST</td><td>${rupees(0)}</td></tr>`;

  const addressBlock = (value: typeof shipping) =>
    [
      escapeHtml(value.recipient),
      escapeHtml(value.line1),
      value.line2 ? escapeHtml(value.line2) : "",
      `${escapeHtml(value.city)}, ${escapeHtml(value.state)} ${escapeHtml(value.pincode)}`,
      `Phone: ${escapeHtml(value.phone)}`
    ]
      .filter(Boolean)
      .join("<br />");

  const itemNotes = (item: { gift_wrap: number; gift_message: string; personalization_json: string }) => {
    const notes = personalizationEntries(item.personalization_json).map((entry) => `${entry.label}: ${entry.text}`);
    if (item.gift_message) notes.push(`Card message: ${item.gift_message}`);
    if (item.gift_wrap) notes.push("Gift wrapped");
    return notes.map((note) => `<small>${escapeHtml(note)}</small>`).join("<br />");
  };

  const rows = items
    .map((item) => {
      const personalization = itemNotes(item);
      return `<tr>
        <td>${escapeHtml(item.name)}${item.variant_name ? `<br /><small>${escapeHtml(item.variant_name)}</small>` : ""}<br /><small>${escapeHtml(item.sku)}</small>${
          personalization ? `<br />${personalization}` : ""
        }</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${rupees(item.unit_price)}</td>
        <td class="num">${item.line_discount ? `−${rupees(item.line_discount)}` : "—"}</td>
        <td class="num">${rupees(item.line_total)}</td>
      </tr>`;
    })
    .join("");

  const giftLines = [
    order.gift_message ? `<p><strong>Gift message</strong><br />${escapeHtml(order.gift_message)}</p>` : "",
    order.customer_note ? `<p><strong>Note from the customer</strong><br />${escapeHtml(order.customer_note)}</p>` : ""
  ]
    .filter(Boolean)
    .join("");

  const emailStatus = latestEmailStatus(db, order.id);
  const emailNotes: Record<string, string> = {
    sent: `A copy of this invoice was emailed to ${escapeHtml(order.email)}.`,
    queued: "An emailed copy is queued and goes out automatically.",
    failed: "The emailed copy could not be sent. Ask support to resend it.",
    not_configured: "This store has no email service configured yet, so no copy has been emailed.",
    configured: "Email delivery is configured, so this copy is sent with the order notifications."
  };
  const emailNote = emailNotes[emailStatus] ?? emailNotes.not_configured!;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Invoice ${escapeHtml(order.order_number)} · ${escapeHtml(store.name ?? "Sree Collections")}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 40px 24px; font-family: "Segoe UI", Arial, sans-serif; color: #2b2422; background: #f8f4ee; }
  main { max-width: 820px; margin: 0 auto; background: #fffdf9; padding: 40px; border: 1px solid #e8ddcf; }
  header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #e8ddcf; padding-bottom: 20px; }
  h1 { font-size: 24px; margin: 0 0 6px; letter-spacing: .02em; }
  .muted { color: #6d625c; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 14px; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #efe6db; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 320px; margin-top: 18px; }
  .totals td { border: none; padding: 5px 8px; }
  .totals .grand td { border-top: 1px solid #2b2422; font-weight: 700; padding-top: 10px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; font-size: 14px; }
  .badge { display: inline-block; padding: 3px 8px; border: 1px solid #7a1f2b; color: #7a1f2b; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
  .gift { margin-top: 24px; border: 1px dashed #cbb7a4; padding: 12px 16px; font-size: 14px; }
  .gift p { margin: 0 0 8px; }
  .gift p:last-child { margin-bottom: 0; }
  footer { margin-top: 32px; font-size: 11px; color: #6d625c; border-top: 1px solid #e8ddcf; padding-top: 16px; }
  @media print { body { background: #fff; padding: 0; } main { border: none; padding: 0; } }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>${escapeHtml(store.name ?? "Sree Collections")}</h1>
      <div class="muted">${escapeHtml(store.tagline ?? "Since 1998")}</div>
      ${store.address ? `<div class="muted">${escapeHtml(store.address)}</div>` : ""}
      ${store.supportPhone ? `<div class="muted">${escapeHtml(store.supportPhone)}</div>` : ""}
      ${store.supportEmail ? `<div class="muted">${escapeHtml(store.supportEmail)}</div>` : ""}
      <div class="muted">GSTIN: ${escapeHtml(tax.gstin || "not configured")}</div>
    </div>
    <div>
      <span class="badge">${order.payment_status === "paid" ? "Paid" : "Payment pending"}</span>
      <h2 style="font-size: 18px; margin: 12px 0 4px;">Invoice</h2>
      <div class="muted">${escapeHtml(order.order_number)}</div>
      <div class="muted">${escapeHtml(order.created_at.slice(0, 10))}</div>
    </div>
  </header>

  <div class="grid">
    <div>
      <strong>Deliver to</strong><br />
      <span class="muted">${addressBlock(shipping)}</span>
    </div>
    <div>
      <strong>Billed to</strong><br />
      <span class="muted">${addressBlock(billing)}</span><br />
      <span class="muted">${escapeHtml(order.email)}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Discount</th><th class="num">Amount</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${rupees(order.subtotal)}</td></tr>
    ${order.discount ? `<tr><td>Discount${order.coupon_code ? ` (${escapeHtml(order.coupon_code)})` : ""}</td><td class="num">−${rupees(order.discount)}</td></tr>` : ""}
    ${order.gift_wrap_total ? `<tr><td>Gift wrap</td><td class="num">${rupees(order.gift_wrap_total)}</td></tr>` : ""}
    <tr><td>Delivery</td><td class="num">${order.shipping_fee ? rupees(order.shipping_fee) : "Included"}</td></tr>
    ${order.cod_fee ? `<tr><td>Cash-on-delivery handling</td><td class="num">${rupees(order.cod_fee)}</td></tr>` : ""}
    ${taxRows}
    <tr class="grand"><td>Total</td><td class="num">${rupees(order.total)}</td></tr>
  </table>

  ${giftLines ? `<section class="gift">${giftLines}</section>` : ""}

  <footer>
    <p>Payment method: ${order.payment_method === "cod" ? "Cash on delivery" : "Online"}. ${order.tax_mode === "inclusive" ? "Prices include GST." : "GST is added to the prices shown."}</p>
    <p>This document is generated by the store's own system. Confirm GSTIN, tax rates and invoice numbering with your accountant before using it as a statutory tax invoice. ${emailNote}</p>
  </footer>
</main>
</body>
</html>`;
}
