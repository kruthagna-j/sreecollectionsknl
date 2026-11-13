import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../server/app.js";
import { newId, nowIso, type DB } from "../server/db.js";
import { hashPassword } from "../server/lib/auth.js";
import { createTestDb, TestClient as Client, type Json } from "./helpers.js";

export interface Suite {
  db: DB;
  base: string;
  owner: Client;
  stop: () => Promise<void>;
  signUp: (name?: string) => Promise<{ client: Client; email: string; user: Json }>;
  productIdOf: (slug: string) => string;
  setStock: (id: string, stock: number) => void;
  addToBag: (client: Client, productId: string, quantity?: number, variantId?: string) => Promise<Json>;
  address: (overrides?: Json) => Json;
  checkoutBody: (email: string, idempotencyKey: string, overrides?: Json) => Json;
  simpleProduct: (name: string, price: number, stock: number) => Json;
}

const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;

export function address(overrides: Json = {}): Json {
  return {
    recipient: "Audit Buyer",
    phone: "9876543210",
    line1: "44 Ring Road",
    city: "Kurnool",
    state: "Andhra Pradesh",
    pincode: "518001",
    ...overrides
  };
}

export function checkoutBody(email: string, idempotencyKey: string, overrides: Json = {}): Json {
  return {
    contact: { name: "Audit Buyer", email, phone: "9876543210" },
    shippingAddress: address(),
    billingSameAsShipping: true,
    paymentMethod: "cod",
    giftMessage: "",
    customerNote: "",
    acceptTerms: true,
    idempotencyKey,
    ...overrides
  };
}

/**
 * Every API suite gets its own app and database because the rate limiters are created per app:
 * one shared server would trip its own checkout limits long before the assertions run.
 */
export async function startSuite(ownerEmail: string, ownerPassword: string): Promise<Suite> {
  const db = createTestDb();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, name, phone, role, created_at) VALUES (?, ?, ?, 'Security Auditor', NULL, 'owner', ?)"
  ).run(newId(), ownerEmail, await hashPassword(ownerPassword), nowIso());

  const app = createApp(db);
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const owner = new Client(base);
  const login = await owner.post("/api/v1/auth/login", { email: ownerEmail, password: ownerPassword });
  if (login.status !== 200) throw new Error(`Owner login failed: ${JSON.stringify(login.data)}`);

  const productIdOf = (slug: string) => {
    const row = db.prepare("SELECT id FROM products WHERE slug = ?").get(slug) as { id: string } | undefined;
    if (!row) throw new Error(`No seeded product with slug "${slug}".`);
    return row.id;
  };

  const signUp = async (name = "Audit Shopper") => {
    const client = new Client(base);
    const email = `audit-${unique()}@example.com`;
    const registered = await client.post("/api/v1/auth/register", { name, email, password: "AuditShopper#2026" });
    if (registered.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(registered.data)}`);
    return { client, email, user: (registered.data as Json).user };
  };

  const addToBag = async (client: Client, productId: string, quantity = 1, variantId = "") => {
    const added = await client.post("/api/v1/cart/items", { productId, variantId, quantity });
    if (added.status !== 201) throw new Error(`Cart add failed: ${JSON.stringify(added.data)}`);
    return added.data as Json;
  };

  const setStock = (id: string, stock: number) => {
    db.prepare("UPDATE products SET stock_quantity = ?, status = 'published' WHERE id = ?").run(stock, id);
  };

  const simpleProduct = (name: string, price: number, stock: number) => {
    const suffix = unique();
    const category = db.prepare("SELECT id FROM categories LIMIT 1").get() as { id: string };
    return {
      name: `${name} ${suffix}`,
      slug: `${name.toLowerCase().replace(/[^a-z]+/g, "-")}-${suffix}`,
      sku: `SEC-${suffix}`,
      categoryId: category.id,
      shortDescription: "Created by the security test suite.",
      description: "A product used only by the security test suite.",
      price,
      taxRateBps: 0,
      stockQuantity: stock,
      status: "published",
      images: [{ url: "/images/products/rose-keepsake-box.svg", alt: "Test illustration" }],
      variants: []
    };
  };

  return {
    db,
    base,
    owner,
    signUp,
    productIdOf,
    setStock,
    addToBag,
    address,
    checkoutBody,
    simpleProduct,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())).then(() => void db.close())
  };
}

export { unique };
