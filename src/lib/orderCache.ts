import type { Order } from "./types";

const PREFIX = "sc_order:";
const LAST_KEY = "sc_last_order";

type Cached = { email: string; savedAt: string; order: Order };

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberOrder(order: Order) {
  const store = storage();
  if (!store) return;
  try {
    const entry: Cached = { email: order.email, savedAt: new Date().toISOString(), order };
    store.setItem(`${PREFIX}${order.orderNumber}`, JSON.stringify(entry));
    store.setItem(LAST_KEY, order.orderNumber);
  } catch {
    // Session storage can be full or blocked; the order still exists on the server.
  }
}

export function recallOrder(orderNumber: string): Order | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(`${PREFIX}${orderNumber.toUpperCase()}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Cached;
    return entry.order ?? null;
  } catch {
    return null;
  }
}

export function recallOrderEmail(orderNumber: string): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(`${PREFIX}${orderNumber.toUpperCase()}`);
    if (!raw) return null;
    return (JSON.parse(raw) as Cached).email ?? null;
  } catch {
    return null;
  }
}

export function lastOrderNumber(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function checkoutAttemptKey(): string {
  const store = storage();
  if (!store) return crypto.randomUUID();
  try {
    const existing = store.getItem("sc_checkout_key");
    if (existing) return existing;
    const key = crypto.randomUUID();
    store.setItem("sc_checkout_key", key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearCheckoutAttempt() {
  try {
    window.sessionStorage.removeItem("sc_checkout_key");
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
