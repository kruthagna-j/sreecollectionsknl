import { invoicePdfUrl } from "./api";
import { money } from "./format";
import type { Order } from "./types";

const MAX_MESSAGE = 1800;

export function whatsAppChatLink(number: string, message: string): string {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export function whatsAppNumber(value: string | undefined | null): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : "";
}

const PERSONALIZATION_LABELS: Record<string, string> = {
  recipientName: "For",
  senderName: "From",
  message: "Message",
  engraving: "Engraving",
  font: "Font",
  color: "Colour"
};

function itemLine(order: Order, index: number): string {
  const item = order.items[index];
  const notes = Object.entries(item.personalization ?? {})
    .filter(([, text]) => text.trim())
    .map(([key, text]) => `${PERSONALIZATION_LABELS[key] ?? key}: ${text.trim()}`);
  if (item.giftMessage) notes.push(`Card message: ${item.giftMessage}`);
  if (item.giftWrap) notes.push("Gift wrapped");
  return [
    `${item.quantity} x ${item.name}${item.variantName ? ` (${item.variantName})` : ""} — ${money(item.lineTotal)}`,
    ...notes.map((note) => `      ${note}`)
  ].join("\n");
}

export function orderWhatsAppMessage(order: Order): string {
  const address = order.shippingAddress;
  const lines = [
    `New order ${order.orderNumber}`,
    "",
    `Customer: ${address.recipient}`,
    `Phone: ${order.phone}`,
    `Email: ${order.email}`,
    "",
    "Items:",
    ...order.items.map((_, index) => itemLine(order, index)),
    "",
    `Total: ${money(order.totals.total)} (cash on delivery)`,
    `Delivery: ${money(order.totals.shipping)}`,
    ...(order.totals.codFee > 0 ? [`COD handling: ${money(order.totals.codFee)}`] : []),
    `Placed: ${new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`,
    "",
    `Deliver to: ${address.line1}${address.line2 ? `, ${address.line2}` : ""}, ${address.city}, ${address.state} - ${address.pincode}`
  ];
  if (order.giftMessage) lines.push("", `Gift message: ${order.giftMessage}`);
  if (order.customerNote) lines.push("", `Order note: ${order.customerNote}`);
  if (order.delivery.zone) {
    lines.push("", `Zone: ${order.delivery.zone}`);
  }
  const invoice = new URL(invoicePdfUrl(order.orderNumber, order.email), window.location.origin).toString();
  lines.push("", `Invoice PDF: ${invoice}`);
  const message = lines.join("\n");
  return message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE - 20)}\n[message trimmed]` : message;
}

export function orderWhatsAppLink(order: Order, number: string): string {
  return whatsAppChatLink(number, orderWhatsAppMessage(order));
}
