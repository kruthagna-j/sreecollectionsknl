# API reference

Base path: **`/api/v1`**. All responses are JSON except invoice routes, which return printable HTML or a PDF.

An OpenAPI 3.1 reference is available at [`docs/openapi.yaml`](openapi.yaml). It is hand-maintained; the route handlers remain the source of truth.

The browser client in `src/lib/api.ts` is the reference implementation. There is no public API versioning promise beyond the `/v1` prefix.

## Conventions

### Authentication

- Sessions use the HttpOnly `sc_session` cookie. Sign in with `POST /auth/login`.
- Guest carts use the HttpOnly `sc_cart` cookie, created automatically.
- CSRF uses a double-submit cookie: `sc_csrf` (readable by JavaScript) must be echoed in the `x-csrf-token` header on every `POST`, `PATCH`, `PUT` and `DELETE`.
- If no CSRF cookie exists yet, make a GET request (for example `/health`) first; the server issues one.
- Requests with an `Origin` header must match `APP_ORIGIN` exactly, otherwise they receive `403 ORIGIN_NOT_ALLOWED`.

### Access levels

| Label | Meaning |
| --- | --- |
| Public | No session required |
| Customer | Valid session; any role may use customer routes |
| Staff | Signed-in `owner` or `admin`, or one of the listed roles |
| Role list | `owner` and `admin` always pass; otherwise the role must be listed |

### Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the highlighted fields and try again.",
    "details": [{ "field": "contact.email", "message": "Enter a valid email address." }]
  }
}
```

Common statuses: `400` validation/business rule, `401 AUTH_REQUIRED`, `403 FORBIDDEN` / `CSRF_FAILED` / `ORIGIN_NOT_ALLOWED`, `404` missing resource, `409` conflict, `429 RATE_LIMITED`, `503` feature not configured.

### Example: create a session and a cart item

```bash
# 1. Obtain cookies (session + CSRF)
curl -c jar.txt http://localhost:4000/api/v1/health

# 2. Sign in
CSRF=$(grep sc_csrf jar.txt | awk '{print $7}')
curl -b jar.txt -c jar.txt -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF" \
  -d '{"email":"you@example.com","password":"your-password"}' \
  http://localhost:4000/api/v1/auth/login

# 3. Add to cart (price is never sent)
curl -b jar.txt -c jar.txt -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF" \
  -d '{"productId":"prod-bunny-plush","quantity":1,"giftWrap":true}' \
  http://localhost:4000/api/v1/cart/items
```

## Health

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/health` | Public | Status, version, environment, database check, uptime, capability labels. `503` if the database fails |

Capability values are `not_configured`, `configured_unverified` or `click_to_chat` (WhatsApp links only). `configured_unverified` only means environment variables are present; no provider call is proven by it.

## Authentication

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/auth/session` | Public | Current user or `null` |
| POST | `/auth/register` | Public | Create a customer account; merges the guest cart |
| POST | `/auth/login` | Public | Start a session; merges the guest cart |
| POST | `/auth/logout` | Optional session | Destroy the session and clear the cookie |
| POST | `/auth/password` | Customer | Change password with the current password |
| POST | `/auth/password/forgot` | Public | Always `503 EMAIL_NOT_CONFIGURED` — no email provider |

Password rules: at least 10 characters with a letter and a number for customers; staff creation requires 12.

## Catalogue (public)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/catalog/categories` | Active categories with product counts |
| GET | `/catalog/meta` | Occasions, recipients, budgets, popular tags, sort options |
| GET | `/catalog/products` | Published products with filters and pagination |
| GET | `/catalog/products/:slug` | Detail, images, variants, approved review summary, related products |
| GET | `/catalog/products/:slug/reviews` | Approved reviews |
| GET | `/catalog/gift-finder` | Curated recommendations by occasion, recipient, budget, personality |
| GET | `/catalog/search/suggestions?q=` | Up to 8 product/category suggestions |
| GET | `/catalog/delivery/check?pincode=` | Serviceability, fee and ETA for a PIN code |

Product list query parameters: `q`, `category`, `tag`, `minPrice`, `maxPrice` (rupees), `sort` (`featured`, `newest`, `price_asc`, `price_desc`, `rating`, `bestselling`, `discount`), `personalizable`, `giftWrap`, `inStock`, `featured` (`true`/`false`), `page`, `pageSize` (max 48). Prices in responses are paise.

Draft, scheduled, unpublished, archived and discontinued products are never returned by public catalogue endpoints.

## Cart

Cart responses include lines with resolved product data, the coupon result, shipping quote, gift-wrap fee, COD availability, GST breakdown and totals. All money is recalculated on every read and write.

| Method | Path | Body / query | Purpose |
| --- | --- | --- | --- |
| GET | `/cart` | — | Current cart and quote |
| POST | `/cart/items` | `productId`, `variantId?`, `quantity` (1–20), `giftWrap?`, `giftMessage?`, `personalization?` | Add a line |
| PATCH | `/cart/items/:id` | `quantity?`, `giftWrap?`, `giftMessage?`, `personalization?` | Update a line |
| DELETE | `/cart/items/:id` | — | Remove a line |
| POST | `/cart/coupon` | `code` | Apply a coupon (validated server-side) |
| DELETE | `/cart/coupon` | — | Remove the coupon |
| POST | `/cart/shipping` | `pincode` | Store the delivery PIN and re-quote |
| DELETE | `/cart` | — | Empty the cart |

The cart never accepts a price, line total or discount from the client. Unowned cart IDs cannot be read by another session.

## Checkout and order lookup

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/checkout` | Public or customer | Place an order from the current cart |
| GET | `/orders/track?orderNumber=&email=` | Public or customer | Tracking data for an order |
| GET | `/orders/:orderNumber?email=` | Public or customer | Order detail |
| GET | `/orders/:orderNumber/invoice?email=` | Public or customer | Printable HTML invoice |
| GET | `/orders/:orderNumber/invoice.pdf?email=` | Public or customer | Invoice PDF (`application/pdf`, `no-store`) |

Checkout body:

```json
{
  "contact": { "name": "Asha Rao", "email": "asha@example.com", "phone": "9876543210" },
  "shippingAddress": {
    "recipient": "Asha Rao",
    "phone": "9876543210",
    "line1": "12 Rose Lane",
    "line2": "",
    "city": "Kurnool",
    "state": "Andhra Pradesh",
    "pincode": "518001"
  },
  "billingSameAsShipping": true,
  "paymentMethod": "cod",
  "couponCode": "OPTIONAL",
  "giftMessage": "",
  "customerNote": "",
  "idempotencyKey": "optional-client-generated-key",
  "acceptTerms": true
}
```

Behaviour:

- `paymentMethod` is `cod` or `online`. `online` always returns `503 PAYMENT_PROVIDER_UNAVAILABLE`; no order is created and no payment is attempted.
- Reusing an `idempotencyKey` for the same customer returns the existing order with `"idempotent": true`.
- A successful COD order returns `201` with the order, `paymentStatus: "cod_pending"`, and the cart cleared. The order includes `delivery` (pincode, zone name, ETA range) and `notifications` (email state, WhatsApp handoff number and auto-open flag). The response also lists `notificationChannels` with each outbox row's channel and status.
- Order emails are queued to the customer and owner according to notification settings. Without SMTP they are recorded as `not_configured`; the order is still created.
- Lookup requires the order number and the matching email unless the signed-in user placed the order. Invoice rendering is escaped and served with a locked-down CSP; PDF responses are `application/pdf` with `Cache-Control: no-store`.

## Account

All require a signed-in session.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/account` | Profile and counts (orders, wishlist, addresses, open returns) |
| PATCH | `/account` | Update name and phone |
| GET | `/account/addresses` | List addresses |
| POST | `/account/addresses` | Create an address |
| PATCH | `/account/addresses/:id` | Update an address |
| DELETE | `/account/addresses/:id` | Delete an address |
| POST | `/account/addresses/:id/default` | Mark as default |
| GET | `/account/orders` | Order history |
| GET | `/account/orders/:orderNumber` | Own order detail |
| POST | `/account/orders/:orderNumber/cancel` | Cancel while `pending` or `confirmed`; restocks |
| GET | `/account/wishlist` | Saved products |
| POST | `/account/wishlist/:productId` | Add to wishlist |
| DELETE | `/account/wishlist/:productId` | Remove from wishlist |
| GET | `/account/reviews` | Own reviews |
| POST | `/account/reviews` | Submit a review for a product in a delivered/owned order; enters moderation |
| GET | `/account/returns` | Own return requests |
| POST | `/account/returns` | Request a return for an order item |

## Content

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/content/site` | Public | Store settings, public store facts, operational pause, policies, delivery zones, integration labels, build info |
| GET | `/content/home` | Public | Announcement, hero, enabled sections, curated collections |
| POST | `/content/support/tickets` | Public | Save a contact message and return a ticket number |
| POST | `/content/newsletter` | Public | Record consent; response states that sending is `not_configured` |
| DELETE | `/content/newsletter?email=` | Public | Mark an email unsubscribed |

Testimonials are always an empty array with an explanatory note until real moderated reviews exist. The API does not invent social proof.

## Admin

Every route below is under `/admin` and requires a session. The role column shows the minimum role in addition to `owner`/`admin`.

### Dashboard and catalogue

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/summary` | `finance` | Order counts, revenue, collected, pending COD, catalogue/review/ticket/return counts, recent orders, sales series |
| GET | `/products` | `catalogue` | Search/filter products by status |
| GET | `/products/:id` | `catalogue` | Full product including variants and images |
| POST | `/products` | `catalogue` | Create draft/published product |
| PATCH | `/products/:id` | `catalogue` | Update product fields and status |
| PUT | `/products/:id/variants` | `catalogue` | Replace variant list |
| POST | `/products/:id/stock` | `catalogue` | Adjust stock with reason and audit movement |
| GET | `/categories` | `catalogue` | Categories with product counts |
| POST | `/categories` | `catalogue` | Create category |
| PATCH | `/categories/:id` | `catalogue` | Update category |
| GET | `/stock-movements` | `catalogue`, `finance` | Inventory audit trail |

### Orders and fulfilment

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/orders` | `orders`, `finance` | Order list with search and status filter |
| GET | `/orders/:id` | `orders`, `finance` | Order detail (ID or order number) plus `emailLog` outbox rows |
| POST | `/orders/:id/status` | `orders` | Transition status, optional note, tracking number and https tracking URL |
| POST | `/orders/:id/note` | `orders` | Add an internal note event |
| GET | `/orders/:id/invoice` | `orders`, `finance` | Invoice HTML |
| GET | `/orders/:id/invoice.pdf` | `orders`, `finance` | Invoice PDF with the same attachment headers as sent mail |
| GET | `/orders/:id/notifications` | `orders`, `finance`, `support` | Order message outbox rows |
| POST | `/orders/:id/notifications/resend` | `orders`, `support` | Queue and send one `email_customer` or `email_owner` row; `503 EMAIL_NOT_CONFIGURED` when SMTP is absent |

Status transitions follow the state machine in [Architecture](ARCHITECTURE.md#order-lifecycle). Delivering a COD order marks it paid.

### Promotions, delivery and settings

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/coupons` | Owner/admin | List coupons |
| POST | `/coupons` | Owner/admin | Create coupon |
| PATCH | `/coupons/:id` | Owner/admin | Update or deactivate coupon |
| GET | `/zones` | Owner/admin | Delivery zones |
| POST | `/zones` | Owner/admin | Create zone |
| PATCH | `/zones/:id` | Owner/admin | Update zone |
| GET | `/settings` | `finance` (or owner/admin) | All settings and editable keys |
| PUT | `/settings/:key` | Owner/admin | Update one of `store`, `tax`, `giftWrap`, `cod`, `returns`, `operational`, `home`, `publicProfile`, `notifications` |

`publicProfile` holds the storefront's public facts: `rating`, `ratingCount`, `yearsInBusiness`, `locality`, `closesAt` (`HH:MM`, 24-hour) and `categories`. They are entered by the owner and shown without an external directory link. `closesAt` is a listed detail, not a live open/closed status.

`store` includes `supportWhatsApp`, the number used for `wa.me` order handoff and contact links. Numbers are normalised to a 91-prefixed international form when links are built.

`notifications` holds `sendCustomerEmail`, `sendOwnerEmail`, `ownerEmail` (validated address, falls back to the store support email) and `whatsappAutoOpen`.

Coupon fields: `code`, `kind` (`percent`/`fixed`/`free_shipping`), `value`, `minSubtotal`, `maxDiscount`, `startsAt`, `endsAt`, `usageLimit`, `perEmailLimit`, `firstOrderOnly`, `isActive`. Values are paise for `fixed`.

### Service and oversight

| Method | Path | Roles | Purpose |
| --- | --- | --- | --- |
| GET | `/reviews` | `support` | Moderation queue |
| POST | `/reviews/:id/status` | `support` | Approve or reject |
| GET | `/tickets` | `support` | Support inbox |
| POST | `/tickets/:id/status` | `support` | Move ticket status |
| GET | `/returns` | `orders`, `support` | Return requests |
| POST | `/returns/:id/status` | `orders` | Advance return workflow |
| GET | `/customers` | `orders`, `finance`, `support` | Customer list with order totals |
| GET | `/audit` | `finance` | Audit log |
| GET | `/stock-movements` | `catalogue`, `finance` | Stock history |

## Rate limits

| Scope | Window | Limit |
| --- | --- | --- |
| All `/api` requests | 5 minutes | 900 per IP (health excluded) |
| Auth endpoints | 15 minutes | 30 per IP |
| Checkout | 10 minutes | 15 per IP |
| Order lookup / invoice | 15 minutes | 40 per IP |
| Contact and newsletter | 15 minutes | Per-IP limiter from the content router |

Limits are in-process. Behind a proxy, `trust proxy` is enabled only in production; ensure the proxy strips client-supplied forwarding headers.
