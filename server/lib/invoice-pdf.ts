import PDFDocument from "pdfkit";
import { getSetting, type DB } from "../db.js";
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

function inr(paise: number): string {
  return `INR ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(paise / 100)}`;
}

export function renderInvoicePdf(db: DB, order: OrderRow): Promise<Buffer> {
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

  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: {
      Title: `Invoice ${order.order_number}`,
      Author: store.name ?? "Sree Collections",
      Subject: `Invoice for order ${order.order_number}`
    }
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = 48;
  const right = 547;
  const muted = "#6d625c";
  const ink = "#2b2422";
  const rule = "#e8ddcf";

  doc.fillColor(ink).font("Helvetica-Bold").fontSize(20).text(store.name ?? "Sree Collections", left, 48);
  doc.font("Helvetica").fontSize(9).fillColor(muted);
  if (store.tagline) doc.text(store.tagline, left, 74);
  let headerY = 88;
  for (const line of [store.address, store.supportPhone, store.supportEmail]) {
    if (!line) continue;
    doc.text(line, left, headerY, { width: 300 });
    headerY += 12;
  }
  doc.text(`GSTIN: ${tax.gstin || "not configured"}`, left, headerY, { width: 300 });

  doc.fillColor(ink).font("Helvetica-Bold").fontSize(17).text("INVOICE", 360, 48, { width: 187, align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor(muted);
  doc.text(order.order_number, 360, 72, { width: 187, align: "right" });
  doc.text(order.created_at.slice(0, 10), 360, 88, { width: 187, align: "right" });
  doc
    .fillColor(order.payment_status === "paid" ? "#1f6b3a" : "#7a1f2b")
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(order.payment_status === "paid" ? "PAID" : "PAYMENT PENDING", 360, 106, { width: 187, align: "right" });

  doc.moveTo(left, 130).lineTo(right, 130).strokeColor(rule).stroke();

  const addressLines = (value: typeof shipping): string[] =>
    [
      value.recipient,
      value.line1,
      value.line2 || "",
      `${value.city}, ${value.state} ${value.pincode}`,
      `Phone: ${value.phone}`
    ].filter(Boolean);

  doc.fillColor(ink).font("Helvetica-Bold").fontSize(9).text("DELIVER TO", left, 146);
  doc.font("Helvetica").fontSize(9).fillColor(muted).text(addressLines(shipping).join("\n"), left, 162, {
    width: 220,
    lineGap: 2
  });
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(9).text("BILLED TO", 300, 146);
  doc.font("Helvetica").fontSize(9).fillColor(muted).text(addressLines(billing).join("\n"), 300, 162, {
    width: 240,
    lineGap: 2
  });
  doc.text(order.email, 300, doc.y + 4, { width: 240 });

  let y = Math.max(doc.y + 22, 250);
  doc.fillColor(ink).font("Helvetica-Bold").fontSize(9);
  doc.text("ITEM", left, y);
  doc.text("QTY", 360, y, { width: 40, align: "right" });
  doc.text("RATE", 410, y, { width: 60, align: "right" });
  doc.text("AMOUNT", 480, y, { width: 67, align: "right" });
  y += 16;
  doc.moveTo(left, y).lineTo(right, y).strokeColor(rule).stroke();
  y += 8;

  doc.font("Helvetica").fontSize(9).fillColor(ink);
  for (const item of items) {
    const label = `${item.name}${item.variant_name ? ` (${item.variant_name})` : ""}`;
    const notes = personalizationEntries(item.personalization_json).map((entry) => `${entry.label}: ${entry.text}`);
    if (item.gift_message) notes.push(`Card message: ${item.gift_message}`);
    if (item.gift_wrap) notes.push("Gift wrapped");
    const personalization = notes.join("\n");
    doc.font("Helvetica-Oblique").fontSize(7.5);
    const personalHeight = personalization ? doc.heightOfString(personalization, { width: 280 }) + 4 : 0;
    doc.font("Helvetica").fontSize(9);
    if (y + 22 + personalHeight > 706) {
      doc.addPage();
      y = 60;
    }
    doc.text(label, left, y, { width: 280 });
    doc.fillColor(muted).fontSize(7.5).text(item.sku, left, doc.y + 1, { width: 280 });
    if (personalization) {
      doc.font("Helvetica-Oblique").fillColor("#4a3f3a").text(personalization, left, doc.y + 2, { width: 280, lineGap: 1 });
    }
    doc.font("Helvetica").fillColor(ink).fontSize(9);
    const rowBottom = Math.max(doc.y, y + 20);
    doc.text(String(item.quantity), 360, y, { width: 40, align: "right" });
    doc.text(inr(item.unit_price), 410, y, { width: 60, align: "right" });
    doc.text(inr(item.line_total), 480, y, { width: 67, align: "right" });
    y = rowBottom + 8;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(rule).stroke();
    y += 8;
  }

  const totalRow = (label: string, value: string, options: { bold?: boolean; rule?: boolean } = {}) => {
    if (options.rule) {
      doc.moveTo(330, y - 3).lineTo(right, y - 3).strokeColor(ink).stroke();
    }
    doc
      .font(options.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(options.bold ? 11 : 9)
      .fillColor(ink)
      .text(label, 330, y, { width: 120 })
      .text(value, 450, y, { width: 97, align: "right" });
    y += options.bold ? 22 : 16;
  };

  y += 8;
  totalRow("Subtotal", inr(order.subtotal));
  if (order.discount) totalRow(`Discount${order.coupon_code ? ` (${order.coupon_code})` : ""}`, `-${inr(order.discount)}`);
  if (order.gift_wrap_total) totalRow("Gift wrap", inr(order.gift_wrap_total));
  totalRow("Delivery", order.shipping_fee ? inr(order.shipping_fee) : "Included");
  if (order.cod_fee) totalRow("COD handling", inr(order.cod_fee));
  if (taxAmount > 0) {
    if (sameState) {
      totalRow("CGST", inr(Math.floor(taxAmount / 2)));
      totalRow("SGST", inr(Math.ceil(taxAmount / 2)));
    } else {
      totalRow(tax.state ? "IGST" : "GST", inr(taxAmount));
    }
  }
  totalRow("Total", inr(order.total), { bold: true, rule: true });

  if (order.shipping_zone || order.eta_days_min !== null) {
    y += 8;
    doc.font("Helvetica").fontSize(8.5).fillColor(muted);
    const zone = order.shipping_zone ? `Delivery zone: ${order.shipping_zone}. ` : "";
    const eta =
      order.eta_days_min !== null && order.eta_days_max !== null
        ? `Estimated delivery in ${order.eta_days_min}-${order.eta_days_max} working days.`
        : "";
    doc.text(`${zone}${eta}`.trim(), left, y, { width: 460 });
    y = doc.y;
  }

  const giftNotes: string[] = [];
  if (order.gift_message) giftNotes.push(`Gift message: ${order.gift_message}`);
  if (order.customer_note) giftNotes.push(`Note from the customer: ${order.customer_note}`);
  if (giftNotes.length) {
    y += 14;
    if (y > 690) {
      doc.addPage();
      y = 60;
    }
    doc.fillColor(ink).font("Helvetica-Bold").fontSize(8.5).text("GIFT DETAILS", left, y);
    doc.fillColor(muted).font("Helvetica").text(giftNotes.join("\n"), left, y + 11, { width: 460, lineGap: 2 });
    y = doc.y;
  }

  y = Math.max(y + 20, 720);
  if (y > 740) {
    doc.addPage();
    y = 60;
  }
  doc.moveTo(left, y).lineTo(right, y).strokeColor(rule).stroke();
  y += 10;
  doc.font("Helvetica").fontSize(8).fillColor(muted);
  doc.text(
    `Payment method: ${order.payment_method === "cod" ? "Cash on delivery" : "Online"}. ${
      order.tax_mode === "inclusive" ? "Prices include GST." : "GST is added to the prices shown."
    }`,
    left,
    y,
    { width: 460 }
  );
  doc.text(
    "This document is generated by the store's own system. Confirm GSTIN, tax rates and invoice numbering with your accountant before using it as a statutory tax invoice.",
    left,
    doc.y + 4,
    { width: 460 }
  );

  doc.end();
  return finished;
}
