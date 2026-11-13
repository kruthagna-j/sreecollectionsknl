export type Role = "customer" | "owner" | "admin" | "catalogue" | "orders" | "support" | "finance";

export type User = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  product_count: number;
};

export type ProductSummary = {
  id: string;
  slug: string;
  sku: string;
  name: string;
  shortDescription: string;
  category: { slug: string; name: string };
  price: number;
  compareAt: number | null;
  discountPercent: number;
  image: string | null;
  imageAlt: string;
  inStock: boolean;
  stock: number;
  stockLabel: string;
  variantCount: number;
  featured: boolean;
  personalizable: boolean;
  giftWrappable: boolean;
  tags: string[];
  rating: { average: number; count: number };
  createdAt: string;
};

export type ProductVariant = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  inStock: boolean;
};

export type ProductDetail = ProductSummary & {
  description: string;
  seoTitle: string;
  seoDescription: string;
  images: Array<{ url: string; alt: string }>;
  variants: ProductVariant[];
  specifications: {
    weightGrams: number;
    dimensions: { lengthMm: number; widthMm: number; heightMm: number };
    hsnCode: string | null;
    taxRateBps: number;
    preparationDays: number;
    returnEligible: boolean;
    fragile: boolean;
    giftWrappable: boolean;
    personalizable: boolean;
  };
  ratingBreakdown: Array<{ stars: number; count: number }>;
};

export type ProductPage = {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

export type Review = {
  rating: number;
  title: string;
  body: string;
  verifiedPurchase: boolean;
  createdAt: string;
  author: string;
};

export type ReviewList = {
  summary: { average: number; count: number };
  items: Review[];
};

export type CatalogMeta = {
  occasions: Array<{ id: string; label: string }>;
  recipients: Array<{ id: string; label: string }>;
  budgets: Array<{ id: string; label: string; max: number }>;
  tags: string[];
  sortOptions: Array<{ id: string; label: string }>;
};

export type Personalization = Record<string, string>;

export type CartLine = {
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
  personalization: Personalization;
  stock: number;
  available: boolean;
  issue: string | null;
  personalizable: boolean;
  giftWrappable: boolean;
};

export type ShippingQuote = {
  serviceable: boolean;
  pincode: string;
  zoneName: string | null;
  fee: number;
  freeAbove: number | null;
  freeApplied: boolean;
  etaDaysMin: number | null;
  etaDaysMax: number | null;
  message: string;
};

export type CartQuote = {
  id: string;
  couponCode: string | null;
  shippingPincode: string | null;
  lines: CartLine[];
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
  coupon: {
    code: string;
    valid: boolean;
    discount: number;
    freeShipping: boolean;
    message: string;
    description: string;
  } | null;
  couponError: string | null;
  issues: string[];
  requiresShipping: boolean;
  paymentMethods: Array<{
    id: "cod" | "online";
    label: string;
    available: boolean;
    reason?: string;
  }>;
};

export type Address = {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
  createdAt?: string;
};

export type AddressInput = Omit<Address, "id" | "createdAt">;

export type OrderItem = {
  id: string;
  productId: string;
  slug: string | null;
  name: string;
  sku: string;
  variantName: string | null;
  image: string;
  unitPrice: number;
  quantity: number;
  lineSubtotal: number;
  lineDiscount: number;
  lineTotal: number;
  giftWrap: boolean;
  giftMessage: string;
  personalization: Personalization;
};

export type OrderTotals = {
  subtotal: number;
  discount: number;
  giftWrap: number;
  shipping: number;
  codFee: number;
  taxIncluded: number;
  taxExclusive: number;
  taxMode: "inclusive" | "exclusive";
  total: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: "cod" | "online";
  paymentStatus: "cod_pending" | "paid" | "failed" | "refunded";
  email: string;
  phone: string;
  currency: string;
  totals: OrderTotals;
  couponCode: string | null;
  shippingAddress: { recipient: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
  billingAddress: { recipient: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
  delivery: {
    pincode: string;
    zone: string | null;
    etaDaysMin: number | null;
    etaDaysMax: number | null;
  };
  giftMessage: string;
  customerNote: string;
  tracking: { number: string; url: string | null } | null;
  items: OrderItem[];
  events: Array<{ status: string; note: string; created_at: string }>;
  createdAt: string;
  updatedAt: string;
  notifications: {
    email: string;
    sms: string;
    whatsapp: string;
    whatsappNumber: string;
    whatsappAutoOpen: boolean;
  };
  userId?: string | null;
  adminNote?: string;
  paymentReference?: string | null;
  idempotencyKey?: string | null;
  nextStatuses?: string[];
};

export type OrderPage = {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

export type SiteInfo = {
  store: {
    name: string;
    tagline: string;
    supportEmail: string;
    supportPhone?: string;
    supportWhatsApp?: string;
    address?: string;
  };
  publicProfile?: {
    rating: number | null;
    ratingCount: number | null;
    yearsInBusiness: number | null;
    locality: string;
    closesAt: string;
    categories: string[];
  };
  operational: { maintenance: boolean; message: string };
  policies: {
    returns: { enabled: boolean; windowDays: number; note: string };
    giftWrap: { fee: number; label: string };
    cod: { enabled: boolean; maxTotal: number; fee: number };
  };
  shipping: {
    zones: Array<{ name: string; fee: number; freeAbove: number | null; etaDaysMin: number; etaDaysMax: number }>;
    note: string;
  };
  integrations: {
    onlinePayments: string;
    email: string;
    sms: string;
    whatsapp: string;
    courier: string;
    routeDistance: string;
  };
};

export type HomeInfo = {
  announcement: string;
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    ctaLabel: string;
    ctaHref: string;
    image: string;
  } | null;
  sections: Array<{ id: string; type: string; title: string; subtitle: string; enabled: boolean; order: number }>;
  categories: Category[];
  collections: {
    featured: ProductSummary[];
    newest: ProductSummary[];
    personalised: ProductSummary[];
    bestsellers: ProductSummary[];
  };
  testimonials: unknown[];
  testimonialsNote: string;
};

export type AccountSummary = {
  user: User;
  counts: { orders: number; wishlist: number; addresses: number; open_returns: number };
};

export type MyReview = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  verifiedPurchase: boolean;
  createdAt: string;
};

export type ReturnRequest = {
  requestNumber: string;
  orderNumber: string;
  reason: string;
  reasonLabel: string;
  detail: string;
  status: string;
  adminNote: string;
  createdAt: string;
};

export type AdminSummary = {
  orders: { total: number; byStatus: Record<string, number> };
  revenue: { orderValue: number; collected: number; pendingCod: number };
  counts: { customers: number; products: number; pending_reviews: number; open_tickets: number; open_returns: number };
  salesLast14Days: Array<{ day: string; orders: number; total: number }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customer: string;
    email: string;
    status: string;
    total: number;
    createdAt: string;
  }>;
  topProducts: Array<{ id: string; name: string; slug: string; quantity: number; revenue: number }>;
  lowStock: Array<{ id: string; name: string; sku: string; stock: number; threshold: number }>;
  note: string;
};

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  categoryId: string;
  category: { id: string; name: string; slug: string };
  shortDescription: string;
  description: string;
  price: number;
  salePrice: number | null;
  mrp: number | null;
  costPrice: number | null;
  taxRateBps: number;
  hsnCode: string;
  stock: number;
  stockQuantity: number;
  lowStockThreshold: number;
  weightG: number;
  status: string;
  featured: boolean;
  giftWrappable: boolean;
  personalizable: boolean;
  returnEligible: boolean;
  fragile: boolean;
  tags: string[];
  imageAlt: string;
  seoTitle: string;
  seoDescription: string;
  searchKeywords: string;
  dimensions: { lengthMm: number; widthMm: number; heightMm: number };
  preparationDays: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  images: Array<{ url: string; alt: string }>;
  variants: Array<{ id: string; name: string; sku: string; price: number | null; stock: number; isActive: boolean }>;
};

export type AdminProductListItem = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  category: string;
  price: number;
  salePrice: number | null;
  costPrice: number | null;
  status: string;
  stock: number;
  variantCount: number;
  featured: boolean;
  image: string | null;
  updatedAt: string;
};

export type AdminOrderListItem = {
  id: string;
  orderNumber: string;
  customer: string;
  email: string;
  phone: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  itemCount: number;
  createdAt: string;
};

export type Coupon = {
  id: string;
  code: string;
  kind: "percent" | "fixed" | "free_shipping";
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perEmailLimit: number;
  firstOrderOnly: boolean;
  isActive: boolean;
  redemptions: number;
  createdAt: string;
};

export type Zone = {
  id: string;
  name: string;
  pincodes: string;
  fee: number;
  free_above: number | null;
  eta_days_min: number;
  eta_days_max: number;
  is_active: number;
  sort_order: number;
};

export type AdminReview = {
  id: string;
  productId: string;
  productName: string;
  author: string;
  email: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  verifiedPurchase: boolean;
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  ticket_number: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  order_number: string | null;
  status: string;
  created_at: string;
};

export type AdminReturn = {
  id: string;
  request_number: string;
  order_number: string;
  reason: string;
  detail: string;
  status: string;
  admin_note: string;
  created_at: string;
  total: number;
};

export type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  created_at: string;
  orders: number;
  paid_total: number;
};

export type AuditRow = {
  id: string;
  action: string;
  actor: string;
  actorEmail: string | null;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type StockMovement = {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string | null;
  delta: number;
  reason: string;
  reference: string;
  created_at: string;
};

export type SettingsRow = { key: string; value: string; updated_at: string };
