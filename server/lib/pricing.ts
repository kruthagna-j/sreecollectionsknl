import { getSetting, nowIso, type DB } from "../db.js";
import { quoteShipping, type ShippingQuote } from "./shipping.js";

export type CartRow = {
  id: string;
  token_hash: string;
  user_id: string | null;
  coupon_code: string | null;
  shipping_pincode: string | null;
  created_at: string;
  updated_at: string;
};

type LineRow = {
  id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  gift_wrap: number;
  gift_message: string;
  personalization_json: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  sale_price: number | null;
  mrp: number | null;
  tax_rate_bps: number;
  stock_quantity: number;
  low_stock_threshold: number;
  gift_wrappable: number;
  personalizable: number;
  product_status: string;
  category_name: string;
  category_slug: string;
  variant_name: string | null;
  variant_sku: string | null;
  variant_price: number | null;
  variant_stock: number | null;
  variant_active: number | null;
  image_url: string | null;
  image_alt: string | null;
  variant_total: number;
};

export type PricedLine = {
  id: string;
  productId: string;
  slug: string;
  variantId: string;
  name: string;
  variantName: string | null;
  sku: string;
  image: string | null;
  imageAlt: string;
  category: string;
  quantity: number;
  unitPrice: number;
  taxRateBps: number;
  compareAt: number | null;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
  giftWrap: boolean;
  giftWrapFee: number;
  giftMessage: string;
  personalization: Record<string, string>;
  stock: number;
  available: boolean;
  issue: string | null;
  personalizable: boolean;
  giftWrappable: boolean;
};

type CouponRow = {
  id: string;
  code: string;
  kind: "percent" | "fixed" | "free_shipping";
  value: number;
  min_subtotal: number;
  max_discount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_email_limit: number;
  first_order_only: number;
  is_active: number;
};

export type CouponResult = {
  code: string;
  valid: boolean;
  discount: number;
  freeShipping: boolean;
  message: string;
  description: string;
};

export type CartQuote = {
  lines: PricedLine[];
  itemCount: number;
  uniqueItems: number;
  subtotal: number;
  discount: number;
  giftWrapTotal: number;
  shipping: ShippingQuote | null;
  shippingFee: number;
  codFee: number;
  taxIncluded: number;
  taxExclusive: number;
  taxMode: "inclusive" | "exclusive";
  total: number;
  currency: "INR";
  coupon: CouponResult | null;
  couponError: string | null;
  issues: string[];
  requiresShipping: boolean;
  paymentMethods: Array<{ id: "cod" | "online"; label: string; available: boolean; reason?: string }>;
};

const EMPTY_PERSONALIZATION = "{}";

export function parsePersonalization(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value || EMPTY_PERSONALIZATION) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (typeof entry === "string" && entry.trim()) result[key.slice(0, 40)] = entry.slice(0, 500);
    }
    return result;
  } catch {
    return {};
  }
}

export function loadCartLines(db: DB, cartId: string): PricedLine[] {
  const rows = db
    .prepare(
      `SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity, ci.gift_wrap, ci.gift_message,
              ci.personalization_json,
              p.name, p.slug, p.sku, p.price, p.sale_price, p.mrp, p.tax_rate_bps,
              p.stock_quantity, p.low_stock_threshold, p.gift_wrappable, p.personalizable,
              p.status AS product_status, c.name AS category_name, c.slug AS category_slug,
              v.name AS variant_name, v.sku AS variant_sku, v.price AS variant_price,
              v.stock_quantity AS variant_stock, v.is_active AS variant_active,
              (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image_url,
              (SELECT i.alt FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image_alt,
              (SELECT COUNT(*) FROM product_variants sv WHERE sv.product_id = p.id AND sv.is_active = 1) AS variant_total
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants v ON v.id = ci.variant_id
       WHERE ci.cart_id = ?
       ORDER BY ci.added_at, ci.id`
    )
    .all(cartId) as unknown as LineRow[];

  const giftWrap = getSetting<{ fee: number }>(db, "giftWrap", { fee: 0 });
  const wrapFee = Math.max(0, giftWrap.fee ?? 0);

  return rows.map((row) => {
    const hasVariants = row.variant_total > 0;
    const variantValid = !hasVariants || (row.variant_id && row.variant_name && row.variant_active === 1);
    const unitPrice = (hasVariants ? row.variant_price : null) ?? row.sale_price ?? row.price;
    const stock = hasVariants ? row.variant_stock ?? 0 : row.stock_quantity;
    const published = row.product_status === "published";
    const available = published && Boolean(variantValid);
    const quantity = Math.max(1, row.quantity);
    const lineSubtotal = unitPrice * quantity;
    const giftWrapSelected = Boolean(row.gift_wrap) && Boolean(row.gift_wrappable);
    let issue: string | null = null;

    if (!published) issue = "This item is no longer available.";
    else if (hasVariants && !row.variant_id) issue = "Choose an option for this item.";
    else if (hasVariants && row.variant_active !== 1) issue = "The selected option is no longer available.";
    else if (!available) issue = "This item is no longer available.";
    else if (stock < quantity) issue = stock <= 0 ? "This item is out of stock." : `Only ${stock} left in stock.`;

    return {
      id: row.id,
      productId: row.product_id,
      slug: row.slug,
      variantId: row.variant_id ?? "",
      name: row.name,
      variantName: row.variant_name ?? null,
      sku: row.variant_sku ?? row.sku,
      image: row.image_url,
      imageAlt: row.image_alt || row.name,
      category: row.category_name,
      quantity,
      unitPrice,
      taxRateBps: row.tax_rate_bps,
      compareAt: row.mrp && row.mrp > unitPrice ? row.mrp : null,
      lineSubtotal,
      lineDiscount: 0,
      lineTotal: lineSubtotal,
      giftWrap: giftWrapSelected,
      giftWrapFee: giftWrapSelected ? wrapFee * quantity : 0,
      giftMessage: row.gift_message,
      personalization: parsePersonalization(row.personalization_json),
      stock,
      available,
      issue,
      personalizable: Boolean(row.personalizable),
      giftWrappable: Boolean(row.gift_wrappable)
    };
  });
}

function isWithinWindow(coupon: CouponRow, now: string): boolean {
  if (coupon.starts_at && now < coupon.starts_at) return false;
  if (coupon.ends_at && now > coupon.ends_at) return false;
  return true;
}

export function evaluateCoupon(
  db: DB,
  rawCode: string,
  context: { subtotal: number; email?: string | null; userId?: string | null }
): CouponResult {
  const code = rawCode.trim().toUpperCase();
  const fail = (message: string): CouponResult => ({
    code,
    valid: false,
    discount: 0,
    freeShipping: false,
    message,
    description: ""
  });

  const coupon = db.prepare("SELECT * FROM coupons WHERE code = ?").get(code) as CouponRow | undefined;
  if (!coupon || !coupon.is_active) return fail("This coupon code is not valid.");
  if (!isWithinWindow(coupon, nowIso())) return fail("This coupon has expired or is not active yet.");
  if (context.subtotal < coupon.min_subtotal) {
    return fail(`This coupon needs an order of at least ₹${Math.ceil(coupon.min_subtotal / 100)}.`);
  }
  if (coupon.usage_limit !== null) {
    const usage = db
      .prepare("SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = ?")
      .get(coupon.id) as { count: number };
    if (usage.count >= coupon.usage_limit) return fail("This coupon has reached its usage limit.");
  }
  const email = context.email?.trim().toLowerCase() || null;
  if (email) {
    const used = db
      .prepare("SELECT COUNT(*) AS count FROM coupon_redemptions WHERE coupon_id = ? AND email = ?")
      .get(coupon.id, email) as { count: number };
    if (used.count >= coupon.per_email_limit) return fail("You have already used this coupon.");
    if (coupon.first_order_only) {
      const orders = db
        .prepare("SELECT COUNT(*) AS count FROM orders WHERE email = ? AND status <> 'cancelled'")
        .get(email) as { count: number };
      if (orders.count > 0) return fail("This coupon is for a first order only.");
    }
  }

  if (coupon.kind === "free_shipping") {
    return {
      code,
      valid: true,
      discount: 0,
      freeShipping: true,
      message: "Free delivery applied.",
      description: "Free delivery"
    };
  }

  let discount =
    coupon.kind === "percent" ? Math.round((context.subtotal * coupon.value) / 10000) : coupon.value;
  if (coupon.max_discount !== null) discount = Math.min(discount, coupon.max_discount);
  discount = Math.max(0, Math.min(discount, context.subtotal));

  return {
    code,
    valid: true,
    discount,
    freeShipping: false,
    message: "Coupon applied.",
    description:
      coupon.kind === "percent"
        ? `${(coupon.value / 100).toFixed(coupon.value % 100 === 0 ? 0 : 1)}% off`
        : `₹${Math.round(coupon.value / 100)} off`
  };
}

export type QuoteOptions = {
  couponCode?: string | null;
  email?: string | null;
  userId?: string | null;
  pincode?: string | null;
  paymentMethod?: "cod" | "online";
};

export function buildQuote(db: DB, cart: CartRow, options: QuoteOptions = {}): CartQuote {
  const lines = loadCartLines(db, cart.id);
  const available = lines.filter((line) => line.available);
  const subtotal = available.reduce((sum, line) => sum + line.lineSubtotal, 0);
  const giftWrapTotal = available.reduce((sum, line) => sum + line.giftWrapFee, 0);
  const couponCode = options.couponCode !== undefined ? options.couponCode : cart.coupon_code;
  const email = options.email ?? null;

  let coupon: CouponResult | null = null;
  let couponError: string | null = null;
  let discount = 0;
  let freeShipping = false;

  if (couponCode) {
    const evaluation = evaluateCoupon(db, couponCode, { subtotal, email, userId: options.userId });
    if (evaluation.valid) {
      coupon = evaluation;
      discount = evaluation.discount;
      freeShipping = evaluation.freeShipping;
    } else {
      couponError = evaluation.message;
    }
  }

  if (discount > 0 && available.length > 0 && subtotal > 0) {
    let allocated = 0;
    available.forEach((line, index) => {
      const share =
        index === available.length - 1
          ? discount - allocated
          : Math.round((discount * line.lineSubtotal) / subtotal);
      line.lineDiscount = Math.max(0, Math.min(share, line.lineSubtotal));
      line.lineTotal = line.lineSubtotal - line.lineDiscount;
      allocated += line.lineDiscount;
    });
  }

  const goodsAfterDiscount = Math.max(0, subtotal - discount);
  const pincode = options.pincode !== undefined ? options.pincode : cart.shipping_pincode;
  const shipping = pincode ? quoteShipping(db, pincode, goodsAfterDiscount) : null;
  const shippingFee = shipping?.serviceable ? (freeShipping ? 0 : shipping.fee) : 0;

  const settings = db.prepare("SELECT key, value FROM settings WHERE key IN ('tax','cod')").all() as Array<{
    key: string;
    value: string;
  }>;
  const settingMap = new Map(settings.map((row) => [row.key, row.value]));
  let taxIncluded = 0;
  let taxExclusive = 0;
  let taxMode: "inclusive" | "exclusive" = "inclusive";
  try {
    const tax = JSON.parse(settingMap.get("tax") ?? "{}") as {
      inclusive?: boolean;
      defaultRateBps?: number;
    };
    taxMode = tax.inclusive === false ? "exclusive" : "inclusive";
    const defaultRate = tax.defaultRateBps ?? 500;
    for (const line of available) {
      const rate = line.taxRateBps >= 0 ? line.taxRateBps : defaultRate;
      const taxable = line.lineTotal;
      const wrapTaxable = line.giftWrapFee;
      if (taxMode === "inclusive") {
        taxIncluded += Math.round((taxable * rate) / (10000 + rate));
        taxIncluded += Math.round((wrapTaxable * defaultRate) / (10000 + defaultRate));
      } else {
        taxExclusive += Math.round((taxable * rate) / 10000);
        taxExclusive += Math.round((wrapTaxable * defaultRate) / 10000);
      }
    }
  } catch {
    // A malformed tax setting leaves tax at zero; the payable total is still server-calculated.
  }

  let cod = { enabled: false, maxTotal: 0, fee: 0 };
  try {
    const parsed = JSON.parse(settingMap.get("cod") ?? "{}") as Partial<typeof cod>;
    cod = { enabled: Boolean(parsed.enabled), maxTotal: parsed.maxTotal ?? 0, fee: parsed.fee ?? 0 };
  } catch {
    // COD stays unavailable when its configuration cannot be read.
  }
  const paymentMethod = options.paymentMethod ?? "cod";
  const codFee = paymentMethod === "cod" && cod.enabled ? cod.fee : 0;
  const total = goodsAfterDiscount + giftWrapTotal + shippingFee + codFee + taxExclusive;

  const issues = lines.filter((line) => line.issue).map((line) => `${line.name}: ${line.issue}`);
  if (lines.length === 0) issues.push("Your cart is empty.");
  if (pincode && shipping && !shipping.serviceable) issues.push(shipping.message);
  if (pincode && !shipping) issues.push("Enter a delivery PIN code to see availability.");
  if ((options.paymentMethod ?? "cod") === "online") issues.push("Online payment is not configured for this store.");

  return {
    lines,
    itemCount: available.reduce((sum, line) => sum + line.quantity, 0),
    uniqueItems: available.length,
    subtotal,
    discount,
    giftWrapTotal,
    shipping,
    shippingFee,
    codFee,
    taxIncluded,
    taxExclusive,
    taxMode,
    total,
    currency: "INR",
    coupon,
    couponError,
    issues,
    requiresShipping: available.length > 0,
    paymentMethods: [
      {
        id: "cod",
        label: "Cash on delivery",
        available: cod.enabled && total <= cod.maxTotal,
        reason: !cod.enabled
          ? "Cash on delivery is not currently enabled."
          : total > cod.maxTotal
            ? "This order value is above the cash-on-delivery limit."
            : undefined
      },
      {
        id: "online",
        label: "Online payment",
        available: false,
        reason: "No payment provider is configured for this store yet."
      }
    ]
  };
}
