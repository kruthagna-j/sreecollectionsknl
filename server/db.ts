import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type DB = DatabaseSync;

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT NOT NULL DEFAULT 'customer'
          CHECK (role IN ('customer','owner','admin','catalogue','orders','support','finance')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS addresses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT 'Home',
        recipient TEXT NOT NULL,
        phone TEXT NOT NULL,
        line1 TEXT NOT NULL,
        line2 TEXT,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        pincode TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        short_description TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        category_id TEXT NOT NULL REFERENCES categories(id),
        price INTEGER NOT NULL CHECK (price >= 0),
        sale_price INTEGER CHECK (sale_price IS NULL OR sale_price >= 0),
        mrp INTEGER CHECK (mrp IS NULL OR mrp >= 0),
        cost_price INTEGER CHECK (cost_price IS NULL OR cost_price >= 0),
        tax_rate_bps INTEGER NOT NULL DEFAULT 500,
        hsn_code TEXT,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        low_stock_threshold INTEGER NOT NULL DEFAULT 5,
        weight_g INTEGER NOT NULL DEFAULT 250,
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft','scheduled','published','unpublished','archived','discontinued')),
        featured INTEGER NOT NULL DEFAULT 0,
        gift_wrappable INTEGER NOT NULL DEFAULT 1,
        personalizable INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '',
        image_alt TEXT NOT NULL DEFAULT '',
        seo_title TEXT NOT NULL DEFAULT '',
        seo_description TEXT NOT NULL DEFAULT '',
        search_keywords TEXT NOT NULL DEFAULT '',
        length_mm INTEGER NOT NULL DEFAULT 0,
        width_mm INTEGER NOT NULL DEFAULT 0,
        height_mm INTEGER NOT NULL DEFAULT 0,
        preparation_days INTEGER NOT NULL DEFAULT 1,
        return_eligible INTEGER NOT NULL DEFAULT 1,
        fragile INTEGER NOT NULL DEFAULT 0,
        published_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

      CREATE TABLE IF NOT EXISTS product_images (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        alt TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

      CREATE TABLE IF NOT EXISTS product_variants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sku TEXT NOT NULL UNIQUE,
        price INTEGER CHECK (price IS NULL OR price >= 0),
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

      CREATE TABLE IF NOT EXISTS carts (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        coupon_code TEXT,
        shipping_pincode TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id);

      CREATE TABLE IF NOT EXISTS cart_items (
        id TEXT PRIMARY KEY,
        cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id),
        variant_id TEXT NOT NULL DEFAULT '',
        quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 20),
        gift_wrap INTEGER NOT NULL DEFAULT 0,
        gift_message TEXT NOT NULL DEFAULT '',
        personalization_json TEXT NOT NULL DEFAULT '{}',
        added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE (cart_id, product_id, variant_id)
      );
      CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);

      CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE COLLATE NOCASE,
        kind TEXT NOT NULL CHECK (kind IN ('percent','fixed','free_shipping')),
        value INTEGER NOT NULL CHECK (value >= 0),
        min_subtotal INTEGER NOT NULL DEFAULT 0,
        max_discount INTEGER,
        starts_at TEXT,
        ends_at TEXT,
        usage_limit INTEGER,
        per_email_limit INTEGER NOT NULL DEFAULT 1,
        first_order_only INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id TEXT PRIMARY KEY,
        coupon_id TEXT NOT NULL REFERENCES coupons(id),
        order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
        email TEXT NOT NULL COLLATE NOCASE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_redemptions_coupon ON coupon_redemptions(coupon_id);
      CREATE INDEX IF NOT EXISTS idx_redemptions_email ON coupon_redemptions(email);

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        email TEXT NOT NULL COLLATE NOCASE,
        phone TEXT NOT NULL,
        status TEXT NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cod','online')),
        payment_status TEXT NOT NULL CHECK (payment_status IN ('cod_pending','paid','failed','refunded')),
        subtotal INTEGER NOT NULL,
        discount INTEGER NOT NULL DEFAULT 0,
        gift_wrap_total INTEGER NOT NULL DEFAULT 0,
        shipping_fee INTEGER NOT NULL DEFAULT 0,
        tax_included INTEGER NOT NULL DEFAULT 0,
        tax_exclusive INTEGER NOT NULL DEFAULT 0,
        tax_mode TEXT NOT NULL DEFAULT 'inclusive' CHECK (tax_mode IN ('inclusive','exclusive')),
        total INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        coupon_code TEXT,
        shipping_address TEXT NOT NULL,
        billing_address TEXT NOT NULL,
        gift_message TEXT NOT NULL DEFAULT '',
        customer_note TEXT NOT NULL DEFAULT '',
        admin_note TEXT NOT NULL DEFAULT '',
        payment_reference TEXT,
        tracking_number TEXT,
        tracking_url TEXT,
        idempotency_key TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id),
        variant_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        sku TEXT NOT NULL,
        variant_name TEXT,
        image_url TEXT NOT NULL DEFAULT '',
        unit_price INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        line_subtotal INTEGER NOT NULL,
        line_discount INTEGER NOT NULL DEFAULT 0,
        tax_included INTEGER NOT NULL DEFAULT 0,
        line_total INTEGER NOT NULL,
        gift_wrap INTEGER NOT NULL DEFAULT 0,
        personalization_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

      CREATE TABLE IF NOT EXISTS order_events (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);

      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        variant_id TEXT NOT NULL DEFAULT '',
        delta INTEGER NOT NULL,
        reason TEXT NOT NULL,
        reference TEXT NOT NULL DEFAULT '',
        actor_id TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_stock_product ON stock_movements(product_id);

      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        verified_purchase INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE (product_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id, status);

      CREATE TABLE IF NOT EXISTS wishlist_items (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        PRIMARY KEY (user_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY,
        ticket_number TEXT NOT NULL UNIQUE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        order_number TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE IF NOT EXISTS shipping_zones (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pincodes TEXT NOT NULL,
        fee INTEGER NOT NULL DEFAULT 0,
        free_above INTEGER,
        eta_days_min INTEGER NOT NULL DEFAULT 1,
        eta_days_max INTEGER NOT NULL DEFAULT 3,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        details TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

      CREATE TABLE IF NOT EXISTS return_requests (
        id TEXT PRIMARY KEY,
        request_number TEXT NOT NULL UNIQUE,
        order_id TEXT NOT NULL REFERENCES orders(id),
        order_item_id TEXT REFERENCES order_items(id),
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        email TEXT NOT NULL COLLATE NOCASE,
        reason TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'requested'
          CHECK (status IN ('requested','approved','rejected','received','refunded','closed')),
        admin_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_returns_order ON return_requests(order_id);

      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        email TEXT PRIMARY KEY COLLATE NOCASE,
        source TEXT NOT NULL DEFAULT 'footer',
        consent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        unsubscribed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS search_events (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        results INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_search_events_created ON search_events(created_at);
    `
  },
  {
    version: 2,
    sql: `
      ALTER TABLE orders ADD COLUMN shipping_zone TEXT;
      ALTER TABLE orders ADD COLUMN eta_days_min INTEGER;
      ALTER TABLE orders ADD COLUMN eta_days_max INTEGER;

      CREATE TABLE IF NOT EXISTS order_notifications (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        channel TEXT NOT NULL CHECK (channel IN ('email_customer','email_owner')),
        recipient TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','not_configured')),
        provider TEXT NOT NULL DEFAULT '',
        error TEXT NOT NULL DEFAULT '',
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        sent_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_order_notifications_order ON order_notifications(order_id);
      CREATE INDEX IF NOT EXISTS idx_order_notifications_status ON order_notifications(status);

      INSERT OR IGNORE INTO shipping_zones
        (id, name, pincodes, fee, free_above, eta_days_min, eta_days_max, is_active, sort_order)
      VALUES
        ('zone-all-india', 'All India delivery', '100000-999999', 9900, 199900, 4, 7, 1, 100);
    `
  },
  {
    version: 3,
    sql: `
      UPDATE shipping_zones
      SET name = 'Local delivery (Kurnool)',
          pincodes = '518001-518999',
          fee = 4900,
          free_above = 250000,
          eta_days_min = 1,
          eta_days_max = 2
      WHERE id = 'zone-local-demo'
        AND pincodes = '500001,500002,500003,500004,500005,500006,500007,500008,500009,500010';

      UPDATE settings
      SET value = json_set(value, '$.supportWhatsApp', '919494498937'),
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE key = 'store'
        AND COALESCE(json_extract(value, '$.supportWhatsApp'), '') = '';
    `
  },
  {
    version: 4,
    sql: `
      ALTER TABLE order_items ADD COLUMN gift_message TEXT NOT NULL DEFAULT '';
    `
  },
  {
    version: 5,
    sql: `
      ALTER TABLE orders ADD COLUMN cod_fee INTEGER NOT NULL DEFAULT 0;
    `
  }
];

export function migrate(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((r) => r.version)
  );
  const insert = db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)");
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration.sql);
      insert.run(migration.version, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function openDatabase(path: string): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  migrate(db);
  return db;
}

export function transaction<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getSetting<T>(db: DB, key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(db: DB, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
