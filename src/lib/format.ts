const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const currencyExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

export function money(paise: number | null | undefined): string {
  return currency.format((paise ?? 0) / 100);
}

export function moneyExact(paise: number | null | undefined): string {
  return currencyExact.format((paise ?? 0) / 100);
}

export function percent(value: number): string {
  return `${value}%`;
}

export function clockLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${match[2]} ${suffix}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Order placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  refunded: "Refunded"
};

export function orderStatus(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

const PAYMENT_LABELS: Record<string, string> = {
  cod_pending: "Cash on delivery · due at handover",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded"
};

export function paymentStatus(status: string): string {
  return PAYMENT_LABELS[status] ?? status.replaceAll("_", " ");
}

const RETURN_LABELS: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Declined",
  received: "Received",
  refunded: "Refunded",
  closed: "Closed"
};

export function returnStatus(status: string): string {
  return RETURN_LABELS[status] ?? status;
}

export function reviewStatus(status: string): string {
  const labels: Record<string, string> = {
    pending: "Awaiting moderation",
    approved: "Published",
    rejected: "Not published"
  };
  return labels[status] ?? status;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

export function bpsToPercent(bps: number): string {
  return `${bps / 100}%`;
}

export function personalizationLabel(key: string): string {
  const labels: Record<string, string> = {
    recipientName: "Name",
    senderName: "From",
    message: "Message",
    engraving: "Engraving",
    font: "Lettering style",
    color: "Colour"
  };
  return labels[key] ?? key;
}

export function truncate(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
}

export function paiseToRupeeInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "";
  return (paise / 100).toFixed(paise % 100 === 0 ? 0 : 2);
}

export function rupeeInputToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}
