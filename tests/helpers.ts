import { openDatabase, type DB } from "../server/db.js";
import { seedDatabase } from "../server/seed-data.js";

export type Json = Record<string, any>;

/** HTTP client that keeps session, cart and CSRF cookies for API tests. */
export class TestClient {
  private cookies = new Map<string, string>();

  constructor(private readonly base: string) {}

  cookie(name: string) {
    return this.cookies.get(name) ?? "";
  }

  private cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private storeCookies(response: Response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  async request(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    const method = options.method ?? "GET";
    const mutating = !["GET", "HEAD"].includes(method);
    if (mutating && !this.cookies.has("sc_csrf")) await this.request("/api/v1/content/site");

    const headers: Record<string, string> = { Accept: "application/json", ...(options.headers ?? {}) };
    if (this.cookies.size) headers.Cookie = this.cookieHeader();
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (mutating) headers["x-csrf-token"] = this.cookie("sc_csrf");

    const response = await fetch(`${this.base}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    this.storeCookies(response);
    const text = await response.text();
    let data: Json | string = text;
    try {
      data = JSON.parse(text) as Json;
    } catch {
      // html or plain text responses stay as text
    }
    return { status: response.status, data, text, headers: response.headers };
  }

  get(path: string) {
    return this.request(path);
  }

  post(path: string, body?: unknown) {
    return this.request(path, { method: "POST", body });
  }

  patch(path: string, body?: unknown) {
    return this.request(path, { method: "PATCH", body });
  }

  put(path: string, body?: unknown) {
    return this.request(path, { method: "PUT", body });
  }
}

export function createTestDb(): DB {
  const db = openDatabase(":memory:");
  seedDatabase(db, { includeDevCoupon: true });
  return db;
}

export function productBySlug(db: DB, slug: string) {
  return db.prepare("SELECT * FROM products WHERE slug = ?").get(slug) as {
    id: string;
    slug: string;
    price: number;
    sale_price: number | null;
    stock_quantity: number;
    status: string;
    gift_wrappable: number;
    personalizable: number;
    tags: string;
  };
}

export function variantsOf(db: DB, slug: string) {
  const product = productBySlug(db, slug);
  return db
    .prepare("SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order, id")
    .all(product.id) as Array<{
    id: string;
    name: string;
    price: number | null;
    stock_quantity: number;
    is_active: number;
  }>;
}

export function createCart(db: DB, options: { userId?: string | null; pincode?: string; coupon?: string } = {}) {
  const id = `cart-${Math.random().toString(36).slice(2)}`;
  db.prepare(
    "INSERT INTO carts (id, token_hash, user_id, coupon_code, shipping_pincode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    `hash-${id}`,
    options.userId ?? null,
    options.coupon ?? null,
    options.pincode ?? null,
    new Date().toISOString(),
    new Date().toISOString()
  );
  return db.prepare("SELECT * FROM carts WHERE id = ?").get(id) as {
    id: string;
    token_hash: string;
    user_id: string | null;
    coupon_code: string | null;
    shipping_pincode: string | null;
    created_at: string;
    updated_at: string;
  };
}

export function addCartItem(
  db: DB,
  cartId: string,
  slug: string,
  options: { variantIndex?: number; quantity?: number; giftWrap?: boolean } = {}
) {
  const product = productBySlug(db, slug);
  const variants = variantsOf(db, slug);
  const variant = variants.length ? variants[options.variantIndex ?? 0] : null;
  const id = `item-${Math.random().toString(36).slice(2)}`;
  db.prepare(
    `INSERT INTO cart_items
       (id, cart_id, product_id, variant_id, quantity, gift_wrap, gift_message, personalization_json, added_at)
     VALUES (?, ?, ?, ?, ?, ?, '', '{}', ?)`
  ).run(
    id,
    cartId,
    product.id,
    variant?.id ?? "",
    options.quantity ?? 1,
    options.giftWrap ? 1 : 0,
    new Date().toISOString()
  );
  return id;
}
