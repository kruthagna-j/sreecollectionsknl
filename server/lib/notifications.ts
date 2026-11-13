import { getSetting, newId, nowIso, type DB } from "../db.js";
import { config } from "../config.js";
import { escapeHtml, rupees } from "./http.js";
import { parseAddress, personalizationEntries, type OrderRow } from "./orders.js";
import { renderInvoicePdf } from "./invoice-pdf.js";
import { mailerConfigured, sendMail } from "./mailer.js";

export type NotificationSettings = {
  sendCustomerEmail: boolean;
  sendOwnerEmail: boolean;
  ownerEmail: string;
  whatsappAutoOpen: boolean;
};

export type NotificationChannel = "email_customer" | "email_owner";
export type NotificationStatus = "queued" | "sent" | "failed" | "not_configured";

export type NotificationRow = {
  id: string;
  order_id: string;
  channel: NotificationChannel;
  recipient: string;
  status: NotificationStatus;
  provider: string;
  error: string;
  attempts: number;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

type StoreSettings = {
  name?: string;
  supportEmail?: string;
  supportPhone?: string;
  supportWhatsApp?: string;
  address?: string;
};

export function getNotificationSettings(db: DB): NotificationSettings {
  return getSetting<NotificationSettings>(db, "notifications", {
    sendCustomerEmail: true,
    sendOwnerEmail: true,
    ownerEmail: "",
    whatsappAutoOpen: true
  });
}

function ownerRecipient(db: DB, settings: NotificationSettings): string {
  const store = getSetting<StoreSettings>(db, "store", {});
  return (settings.ownerEmail || store.supportEmail || "").trim();
}

export function latestEmailStatus(db: DB, orderId: string): string {
  const row = db
    .prepare(
      `SELECT status FROM order_notifications
       WHERE order_id = ? AND channel = 'email_customer'
       ORDER BY rowid DESC LIMIT 1`
    )
    .get(orderId) as { status: NotificationStatus } | undefined;
  if (row) return row.status;
  const other = db
    .prepare("SELECT status FROM order_notifications WHERE order_id = ? ORDER BY rowid DESC LIMIT 1")
    .get(orderId) as { status: NotificationStatus } | undefined;
  if (other) return other.status;
  return mailerConfigured() ? "configured" : "not_configured";
}

export function listOrderNotifications(db: DB, orderId: string): NotificationRow[] {
  return db
    .prepare("SELECT * FROM order_notifications WHERE order_id = ? ORDER BY rowid DESC")
    .all(orderId) as NotificationRow[];
}

export function queueOrderNotifications(db: DB, order: OrderRow): NotificationRow[] {
  const settings = getNotificationSettings(db);
  const recipients: Array<{ channel: NotificationChannel; recipient: string }> = [];
  if (settings.sendCustomerEmail) recipients.push({ channel: "email_customer", recipient: order.email });
  const owner = ownerRecipient(db, settings);
  if (settings.sendOwnerEmail && owner) recipients.push({ channel: "email_owner", recipient: owner });
  if (!recipients.length) return [];

  const configured = mailerConfigured();
  const insert = db.prepare(
    `INSERT INTO order_notifications
       (id, order_id, channel, recipient, status, provider, error, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'smtp', ?, 0, ?, ?)`
  );
  const now = nowIso();
  const rows: NotificationRow[] = [];
  for (const entry of recipients) {
    const id = newId();
    insert.run(
      id,
      order.id,
      entry.channel,
      entry.recipient,
      configured ? "queued" : "not_configured",
      configured ? "" : "SMTP_URL is not configured.",
      now,
      now
    );
    rows.push(db.prepare("SELECT * FROM order_notifications WHERE id = ?").get(id) as NotificationRow);
  }
  if (configured) {
    setImmediate(() => {
      void processOrderNotifications(db, order.id).catch(() => {
        // Each failed row is persisted with its own error.
      });
    });
  }
  return rows;
}

function invoiceLink(order: OrderRow): string {
  return `${config.appOrigin}/api/v1/orders/${encodeURIComponent(order.order_number)}/invoice.pdf?email=${encodeURIComponent(order.email)}`;
}

function orderItems(db: DB, orderId: string) {
  return db
    .prepare(
      `SELECT name, variant_name, sku, quantity, unit_price, line_total, gift_wrap, gift_message, personalization_json
       FROM order_items WHERE order_id = ? ORDER BY rowid`
    )
    .all(orderId) as Array<{
    name: string;
    variant_name: string | null;
    sku: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    gift_wrap: number;
    gift_message: string;
    personalization_json: string;
  }>;
}

/** The pickers and wrappers need the gift text in the mail, not only in the admin screen. */
function itemNotes(item: { gift_wrap: number; gift_message: string; personalization_json: string }): string[] {
  const notes: string[] = [];
  if (item.gift_wrap) notes.push("Gift wrapped");
  for (const entry of personalizationEntries(item.personalization_json)) notes.push(`${entry.label}: ${entry.text}`);
  if (item.gift_message) notes.push(`Card message: ${item.gift_message}`);
  return notes;
}

function itemNoteHtml(item: { gift_wrap: number; gift_message: string; personalization_json: string }): string {
  const notes = itemNotes(item);
  if (!notes.length) return "";
  return `<br><small style="color:#6d625c">${notes.map((note) => escapeHtml(note)).join("<br>")}</small>`;
}

export function customerEmail(db: DB, order: OrderRow): { subject: string; html: string; text: string } {
  const store = getSetting<StoreSettings>(db, "store", {});
  const items = orderItems(db, order.id);
  const address = parseAddress(order.shipping_address);
  const storeName = store.name ?? "Sree Collections";
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:8px 6px;border-bottom:1px solid #efe6db">${escapeHtml(item.name)}${
          item.variant_name ? `<br><small style="color:#6d625c">${escapeHtml(item.variant_name)}</small>` : ""
        }${itemNoteHtml(item)}</td><td style="padding:8px 6px;border-bottom:1px solid #efe6db;text-align:right">${item.quantity}</td><td style="padding:8px 6px;border-bottom:1px solid #efe6db;text-align:right">${rupees(
          item.line_total
        )}</td></tr>`
    )
    .join("");
  const textItems = items
    .map((item) => {
      const notes = itemNotes(item);
      return [
        `- ${item.quantity} x ${item.name}${item.variant_name ? ` (${item.variant_name})` : ""}: ${rupees(item.line_total)}`,
        ...notes.map((note) => `    ${note}`)
      ].join("\n");
    })
    .join("\n");
  const subject = `Your ${storeName} invoice ${order.order_number}`;
  const text = [
    `Thank you for your order from ${storeName}.`,
    "",
    `Order: ${order.order_number}`,
    `Placed: ${order.created_at.slice(0, 10)}`,
    `Payment: Cash on delivery`,
    "",
    textItems,
    "",
    `Delivery: ${rupees(order.shipping_fee)}`,
    ...(order.cod_fee ? [`Cash-on-delivery handling: ${rupees(order.cod_fee)}`] : []),
    `Total: ${rupees(order.total)}`,
    ...(order.gift_message ? ["", `Gift message: ${order.gift_message}`] : []),
    ...(order.customer_note ? ["", `Your note: ${order.customer_note}`] : []),
    "",
    `Deliver to: ${address.recipient}, ${address.line1}, ${address.city}, ${address.state} ${address.pincode}`,
    `Phone: ${address.phone}`,
    "",
    `Invoice PDF: ${invoiceLink(order)}`,
    "",
    `The store team will contact you on ${order.phone} if anything needs confirming.`
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f8f4ee;font-family:Arial,sans-serif;color:#2b2422">
  <div style="max-width:620px;margin:0 auto;padding:28px 18px">
    <div style="background:#fffdf9;border:1px solid #e8ddcf;padding:28px">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b">${escapeHtml(storeName)}</p>
      <h1 style="margin:0 0 8px;font-size:24px">Your order is in.</h1>
      <p style="margin:0 0 18px;color:#6d625c;font-size:14px">Order ${escapeHtml(order.order_number)} placed ${escapeHtml(order.created_at.slice(0, 10))}. Please keep this invoice.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr><th style="text-align:left;padding:6px;color:#6d625c;font-size:11px;text-transform:uppercase">Item</th><th style="text-align:right;padding:6px;color:#6d625c;font-size:11px;text-transform:uppercase">Qty</th><th style="text-align:right;padding:6px;color:#6d625c;font-size:11px;text-transform:uppercase">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="text-align:right;font-size:16px;margin:18px 0 6px"><strong>Total ${rupees(order.total)}</strong></p>
      <p style="font-size:12px;color:#6d625c;margin:0 0 18px">Cash on delivery. Delivery is shown as ${rupees(order.shipping_fee)}${order.cod_fee ? `, with a ${rupees(order.cod_fee)} cash-on-delivery handling charge` : ""}.</p>
      ${order.gift_message ? `<p style="font-size:13px;color:#6d625c">Gift message: ${escapeHtml(order.gift_message)}</p>` : ""}
      ${order.customer_note ? `<p style="font-size:13px;color:#6d625c">Your note: ${escapeHtml(order.customer_note)}</p>` : ""}
      <p style="font-size:14px;line-height:1.6"><strong>Deliver to</strong><br>${escapeHtml(address.recipient)}<br>${escapeHtml(address.line1)}${address.line2 ? `<br>${escapeHtml(address.line2)}` : ""}<br>${escapeHtml(address.city)}, ${escapeHtml(address.state)} ${escapeHtml(address.pincode)}<br>Phone: ${escapeHtml(address.phone)}</p>
      <p style="margin-top:22px"><a href="${escapeHtml(invoiceLink(order))}" style="display:inline-block;background:#7a1f2b;color:#fff;text-decoration:none;padding:12px 18px;font-size:13px">Download invoice PDF</a></p>
      <p style="font-size:12px;color:#6d625c;margin-top:24px">The store team will contact you on ${escapeHtml(order.phone)} if anything about the order needs confirming.</p>
    </div>
  </div>
</body></html>`;
  return { subject, html, text };
}

export function ownerEmail(db: DB, order: OrderRow): { subject: string; html: string; text: string } {
  const items = orderItems(db, order.id);
  const address = parseAddress(order.shipping_address);
  const subject = `New COD order ${order.order_number} - ${rupees(order.total)}`;
  const text = [
    `New cash-on-delivery order ${order.order_number}`,
    "",
    `Customer: ${address.recipient}`,
    `Phone: ${order.phone}`,
    `Email: ${order.email}`,
    "",
    ...items.flatMap((item) => [
      `- ${item.quantity} x ${item.name}${item.variant_name ? ` (${item.variant_name})` : ""}: ${rupees(item.line_total)}`,
      ...itemNotes(item).map((note) => `    ${note}`)
    ]),
    "",
    `Total: ${rupees(order.total)} (delivery ${rupees(order.shipping_fee)}${order.cod_fee ? `, COD handling ${rupees(order.cod_fee)}` : ""})`,
    "",
    `Deliver to: ${address.line1}${address.line2 ? `, ${address.line2}` : ""}, ${address.city}, ${address.state} ${address.pincode}`,
    ...(order.customer_note ? ["", `Customer note: ${order.customer_note}`] : []),
    ...(order.gift_message ? ["", `Gift message: ${order.gift_message}`] : []),
    "",
    `Invoice PDF is attached. Open the admin order for the full timeline.`
  ].join("\n");
  const rows = items
    .map(
      (item) =>
        `<tr><td style="padding:8px 6px;border-bottom:1px solid #efe6db">${escapeHtml(item.name)}${
          item.variant_name ? `<br><small style="color:#6d625c">${escapeHtml(item.variant_name)}</small>` : ""
        }${itemNoteHtml(item)}</td><td style="padding:8px 6px;border-bottom:1px solid #efe6db;text-align:right">${item.quantity}</td><td style="padding:8px 6px;border-bottom:1px solid #efe6db;text-align:right">${rupees(
          item.line_total
        )}</td></tr>`
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f8f4ee;font-family:Arial,sans-serif;color:#2b2422">
  <div style="max-width:620px;margin:0 auto;padding:28px 18px">
    <div style="background:#fffdf9;border:1px solid #e8ddcf;padding:28px">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7a1f2b">New order</p>
      <h1 style="margin:0 0 8px;font-size:24px">${escapeHtml(order.order_number)}</h1>
      <p style="margin:0 0 18px;color:#6d625c;font-size:14px">Cash on delivery · ${rupees(order.total)} · placed ${escapeHtml(order.created_at.slice(0, 16).replace("T", " "))}</p>
      <p style="font-size:14px;line-height:1.6"><strong>${escapeHtml(address.recipient)}</strong><br>${escapeHtml(order.phone)} · ${escapeHtml(order.email)}<br>${escapeHtml(address.line1)}${address.line2 ? `<br>${escapeHtml(address.line2)}` : ""}<br>${escapeHtml(address.city)}, ${escapeHtml(address.state)} ${escapeHtml(address.pincode)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr><th style="text-align:left;padding:6px;color:#6d625c;font-size:11px;text-transform:uppercase">Item</th><th style="text-align:right;padding:6px;color:#6d625c;font-size:11px;text-transform:uppercase">Qty</th><th style="text-align:right;padding:6px;color:#6d625c;font-size:11px;text-transform:uppercase">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="text-align:right;font-size:16px;margin:18px 0 6px"><strong>Total ${rupees(order.total)}</strong></p>
      ${order.customer_note ? `<p style="font-size:13px;color:#6d625c">Customer note: ${escapeHtml(order.customer_note)}</p>` : ""}
      ${order.gift_message ? `<p style="font-size:13px;color:#6d625c">Gift message: ${escapeHtml(order.gift_message)}</p>` : ""}
      <p style="font-size:12px;color:#6d625c;margin-top:24px">The invoice PDF is attached. This is an automated message from the store's own system.</p>
    </div>
  </div>
</body></html>`;
  return { subject, html, text };
}

async function sendOrderEmail(db: DB, order: OrderRow, channel: NotificationChannel) {
  const content = channel === "email_customer" ? customerEmail(db, order) : ownerEmail(db, order);
  const pdf = await renderInvoicePdf(db, order);
  const customer = channel === "email_customer";
  return sendMail({
    to: channel === "email_customer" ? order.email : notificationRecipient(db, order, channel),
    subject: content.subject,
    text: content.text,
    html: content.html,
    replyTo: customer ? undefined : order.email,
    attachments: [
      {
        filename: `invoice-${order.order_number}.pdf`,
        content: pdf,
        contentType: "application/pdf"
      }
    ]
  });
}

function notificationRecipient(db: DB, _order: OrderRow, channel: NotificationChannel): string {
  if (channel === "email_customer") return _order.email;
  const settings = getNotificationSettings(db);
  return ownerRecipient(db, settings);
}

export async function processOrderNotifications(db: DB, orderId: string): Promise<NotificationRow[]> {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as OrderRow | undefined;
  if (!order) return [];
  const pending = db
    .prepare("SELECT * FROM order_notifications WHERE order_id = ? AND status = 'queued' ORDER BY rowid")
    .all(orderId) as NotificationRow[];
  for (const row of pending) {
    try {
      const result = await sendOrderEmail(db, order, row.channel);
      db.prepare(
        `UPDATE order_notifications
         SET status = ?, error = ?, attempts = attempts + 1, updated_at = ?, sent_at = ?
         WHERE id = ?`
      ).run(
        result.status,
        result.status === "sent" ? "" : "error" in result ? result.error : "",
        nowIso(),
        result.status === "sent" ? nowIso() : null,
        row.id
      );
    } catch (error) {
      db.prepare(
        `UPDATE order_notifications
         SET status = 'failed', error = ?, attempts = attempts + 1, updated_at = ?
         WHERE id = ?`
      ).run(error instanceof Error ? error.message.slice(0, 600) : "Could not build the invoice email.", nowIso(), row.id);
    }
  }
  return listOrderNotifications(db, orderId);
}

export async function resendOrderEmail(
  db: DB,
  order: OrderRow,
  channel: NotificationChannel
): Promise<{ row: NotificationRow; status: NotificationStatus }> {
  const recipient = channel === "email_customer" ? order.email : ownerRecipient(db, getNotificationSettings(db));
  if (!recipient) throw new Error("No recipient is configured for this email.");
  const id = newId();
  const now = nowIso();
  const configured = mailerConfigured();
  db.prepare(
    `INSERT INTO order_notifications
       (id, order_id, channel, recipient, status, provider, error, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'smtp', ?, 0, ?, ?)`
  ).run(
    id,
    order.id,
    channel,
    recipient,
    configured ? "queued" : "not_configured",
    configured ? "" : "SMTP_URL is not configured.",
    now,
    now
  );
  if (configured) {
    await processOrderNotifications(db, order.id);
  }
  const row = db.prepare("SELECT * FROM order_notifications WHERE id = ?").get(id) as NotificationRow;
  return { row, status: row.status };
}
