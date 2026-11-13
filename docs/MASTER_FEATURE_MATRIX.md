# Master feature matrix

**Purpose:** state, feature by feature, what this codebase actually is at — not what it was intended to be.
**Method:** every status below is backed by something this audit *executed* (a test name, an `npm run` log, a `_qa/release-prod-probe.log` line) or by a direct read of the file that would have to make the claim true. Where nothing was executed, the status says so.
**Date:** 2026-10-26 · app version `0.1.0` · 124 automated tests, 27 production e2e checks, 112 accessibility checks, 26 visual surfaces, 20 production response probes and 12 layout-shift budget assertions (see `TEST_RESULTS.md`).

Statuses are the vocabulary defined in `AUDIT_BASELINE.md` §8:
`COMPLETE AND VERIFIED` · `IMPLEMENTED BUT UNVERIFIED` · `PARTIALLY IMPLEMENTED` · `MISSING` · `BROKEN` · `BLOCKED BY EXTERNAL DEPENDENCY` · `NOT APPLICABLE`

---

## 1. Public storefront

| Feature | Status | Evidence |
| --- | --- | --- |
| Home page (hero, collections, gift prompts) | COMPLETE AND VERIFIED | e2e "storefront home renders"; visual `desktop-home` 1440×2605 overflow=no; a11y contrast sweep `/` 0 below AA |
| Product listing with filters, sort, pagination | COMPLETE AND VERIFIED | `tests/api/flows.test.ts > "serves only the published catalogue"`; e2e "shop lists live catalogue products"; visual `mobile-shop`/`narrow-shop` |
| Price-band and category facets | COMPLETE AND VERIFIED | bands declared `server/routes/catalog.ts:33-37`; `/shop?category=birthday` served 200 in prod probe; a11y 21 headings on `/shop` |
| Product detail: images, variants, stock, related items | COMPLETE AND VERIFIED | e2e "product page opens from the catalogue"; visual `desktop-product` 2897px |
| Delivery-PIN check on the product page | COMPLETE AND VERIFIED | `tests/unit/pricing.test.ts` zone-range cases; a11y `/product/...` heading + contrast passes |
| Personalisation inputs (name, message, engraving, font, colour) | COMPLETE AND VERIFIED | `tests/api/inventory.test.ts > "keeps personalization keys to the allow-list"`; `tests/api/gift.test.ts > "carries the card message typed on the product page into the order"` |
| Gift finder wizard | IMPLEMENTED BUT UNVERIFIED | `src/pages/GiftFinder.tsx` + `/api/v1/content/gift-ideas` render; visual `desktop-giftfinder` overflow=no, 17 headings, contrast clean. **No test exercises its recommendation logic.** |
| Offers, Journal, About, Contact, FAQ, Stores pages | IMPLEMENTED BUT UNVERIFIED | content read from `/api/v1/content/site` (prod probe 200); a11y heading sweeps pass for `/about`, `/faq`, `/journal`, `/offers`. No automated content assertions. |
| Policy pages (privacy, shipping, returns, terms, gift-wrap, personalisation) | PARTIALLY IMPLEMENTED | Pages render and pass a11y sweeps. The **text is JSX, not data** — staff cannot edit it, and returns/terms still carry the string "Template policy. … Legal review required." (stored in `settings.returns.note`). Owner action, not a code fix: `OWNER_ACTION_REQUIRED.md` A-6. |
| Search suggestions | IMPLEMENTED BUT UNVERIFIED | endpoint + overlay exist and log anonymous `search_events`; no test asserts behaviour. |
| Testimonials / social proof | NOT APPLICABLE (by design) | API returns an empty array with an explanation; the brief forbids fabricated social proof. The unverified "4.4★ from 84 reviews" copy is a separate content problem — see §7. |
| Image upload for products | MISSING | no `multer`, no upload route, no storage directory; products reference seeded `/images/products/*.svg`. |
| Multi-currency, locales | NOT APPLICABLE | INR/`en-IN` only, single store. |
| Third-party analytics/ad trackers | MISSING (intentional) | prod probe: `scripts: 1`, `inline handlers: 0`, `justdial mentions: 0`. |

## 2. Cart and checkout

| Feature | Status | Evidence |
| --- | --- | --- |
| Cart drawer + cart page | COMPLETE AND VERIFIED | e2e "adding to bag opens the cart drawer with the item"; a11y "cart drawer is labelled" |
| Guest cart persisted by cookie, merged on registration | COMPLETE AND VERIFIED | `tests/api/flows.test.ts > "merges a guest bag on registration and keeps admin areas closed"` |
| Gift wrap per item + fee | COMPLETE AND VERIFIED | `tests/unit/pricing.test.ts` (21 tests) incl. non-wrappable products; `tests/api/gift.test.ts > "prints the wrap, the engraving and the card message on the invoice and in both emails"` |
| Per-item card message reaching the order | COMPLETE AND VERIFIED (fixed this round) | was lost between cart and `order_personalization`; migration v4 + propagation. Regression: the two gift tests above plus `src/pages/OrderConfirmation` display asserted by "shows the card message to the shopper as well as to staff". |
| Coupon application (percent / fixed / free-shipping) | COMPLETE AND VERIFIED | `tests/api/security.test.ts > "applies the discount cap and keeps the totals arithmetic exact"`; `"refuses a coupon the shopper names at checkout instead of honouring it"` |
| Server-authoritative pricing (ignore browser prices) | COMPLETE AND VERIFIED | `tests/api/security.test.ts > "ignores every price, discount and status field the browser tries to inject"` |
| COD ceiling enforcement | COMPLETE AND VERIFIED | `"refuses a cash-on-delivery order above the configured ceiling"`; `settings.cod.maxTotal = 1000000` |
| Pan-India PIN coverage (100000–999999 zone) | COMPLETE AND VERIFIED | `tests/unit/pricing.test.ts` range/priority/fallback; e2e "checkout quotes pan-India delivery with a fee and estimate" |
| Zone-local PIN validation with honest rejection | COMPLETE AND VERIFIED | e2e "checkout validates the configured delivery PIN" |
| Quantity / variant sanity checks | COMPLETE AND VERIFIED | `"rejects malformed, negative and excessive quantities"`, `"will not let a shopper attach a variant belonging to a different product"` |
| Idempotent order placement | COMPLETE AND VERIFIED | `tests/api/inventory.test.ts > "honours one idempotency key for one order"` |
| Atomic stock decrement under concurrency | COMPLETE AND VERIFIED (fixed earlier round) | `tests/api/inventory.test.ts > "keeps an admin stock adjustment and a purchase from overwriting each other"`; SQL uses `stock_quantity = stock_quantity + ?` (`server/lib/orders.ts:252-257`) |
| Online payment (card/UPI/wallet) | BLOCKED BY EXTERNAL DEPENDENCY | checkout option disabled; API answers `503 PAYMENT_PROVIDER_UNAVAILABLE`; no Razorpay adapter is wired despite three env keys being documented. The `health` row of `_qa/release-prod-probe.log` reports `onlinePayments: "not_configured"`. |
| Inline form validation + a11y error plumbing | COMPLETE AND VERIFIED (fixed this round) | a11y "checkout shows validation errors on an empty form — 8 field errors" and 24 paired `aria-invalid`/`aria-describedby`/`role=alert` checks |

## 3. Orders, fulfilment and money

| Feature | Status | Evidence |
| --- | --- | --- |
| Order create + `order_events` trail | COMPLETE AND VERIFIED | `tests/api/lifecycle.test.ts > "walks the ladder, marks cash on delivery paid and keeps an event trail"` → events `["pending","confirmed","packed","shipped","delivered"]` |
| Status transition ladder enforced server-side | COMPLETE AND VERIFIED (fixed this round) | `"refuses a status the fulfilment ladder has not reached yet"` (INVALID_TRANSITION), `"rejects a repeated status without restocking the bag again"` (NO_STATUS_CHANGE) |
| Single source of truth for allowed transitions | COMPLETE AND VERIFIED (fixed this round) | `nextStatuses` in `server/lib/orders.ts`; `tests/api/gift.test.ts > "offers staff exactly the transitions the server allows"` |
| Cancel + restock, exactly once | COMPLETE AND VERIFIED | lifecycle test asserts one `reason='cancel'` movement and `SUM(delta)=0`; customer side: `tests/api/customer.test.ts > "cancels a fresh order, restocks it and refuses once the parcel has shipped"` |
| COD marked paid on delivery | COMPLETE AND VERIFIED | lifecycle ladder test observes `payment_status = 'paid'` |
| Tracking number + https URL (manual entry) | IMPLEMENTED BUT UNVERIFIED | stored only when staff type a real value; no courier call is made, so no scan data exists. Not covered by a test. |
| Invoice, printable HTML | COMPLETE AND VERIFIED | `tests/api/inventory.test.ts > "escapes hostile gift text in the server-rendered invoice"`; e2e "confirmation offers HTML and PDF invoices" |
| Invoice PDF | COMPLETE AND VERIFIED (content-type) / PARTIALLY (visual) | `pdfkit` route asserted for customer and admin; e2e "admin can open the invoice PDF". Page layout was not visually diffed. |
| Order notification outbox rows | COMPLETE AND VERIFIED | `tests/api/gift.test.ts` asserts both emailed copies contain the wrap/engraving/message; admin message log covered by e2e "admin sees the order message log" |
| Actual email delivery | BLOCKED BY EXTERNAL DEPENDENCY | `SMTP_URL`/`SMTP_FROM` are empty in `.env`; health says `email: "not_configured"`; outbox rows are written but nothing leaves the machine. |
| Owner notification email | BROKEN BY CONFIGURATION (not code) | `settings.notifications.ownerEmail` is `""`, `sendOwnerEmail` is `true` → the owner copy has no recipient. Code path is tested; the value is missing. `OWNER_ACTION_REQUIRED.md` A-3. |
| WhatsApp handoff with prepared order message | COMPLETE AND VERIFIED (link generation only) | e2e "confirmation shows the WhatsApp handoff" and "confirmation opens WhatsApp with the prepared order message". The **customer** presses send; there is no Business API, so no message is ever sent *by* the store. |
| Refund processing (money movement) | MISSING | no `refunds` table, no amount column on `return_requests`; the admin workflow records "refunded" as a status note only. Partial refunds impossible. |
| Return request lifecycle | COMPLETE AND VERIFIED (state machine) | `tests/api/inventory.test.ts > "records a refund once and refuses to refund the same return twice"`, `"blocks an impossible jump from a rejected return straight to a refund"`, `"treats a repeated status as a no-op instead of a second event"` |
| Customer-initiated return | COMPLETE AND VERIFIED | `tests/api/customer.test.ts > "opens a return only after delivery, for an eligible item, once per item"` and the policy-off case |
| Statutory GST invoice numbering | MISSING | invoice numbers derive from the order number; there is no sequential tax invoice series, no place-of-supply/HSN summary block. Needs a CA's decision, not a code guess. |

## 4. Customer account

| Feature | Status | Evidence |
| --- | --- | --- |
| Register / sign in / sign out | COMPLETE AND VERIFIED | e2e "customer registration signs the shopper in"; `tests/api/security.test.ts > "destroys the session on logout and rejects the stale cookie"` |
| Profile update + validation | COMPLETE AND VERIFIED | `tests/api/customer.test.ts > "updates the profile and rejects invalid details"` |
| Password change with other-device signout | COMPLETE AND VERIFIED (fixed this round: limiter) | `"changes the password, signs other devices out and refuses the old password"` |
| Forgot password by email | BLOCKED BY EXTERNAL DEPENDENCY | `503 EMAIL_NOT_CONFIGURED`; page directs the shopper to contact the store. Code path exists, no transport. |
| Saved addresses CRUD + default | COMPLETE AND VERIFIED | `"stores, defaults, updates and deletes addresses"` |
| Order history + detail | COMPLETE AND VERIFIED | e2e "order appears in the customer's account"; scoping test in `security.test.ts` |
| Guest tracking by number + email | COMPLETE AND VERIFIED | e2e "guest order tracking works with the checkout email"; `"treats the order number plus the order email as the lookup capability"` |
| Wishlist | COMPLETE AND VERIFIED | `"adds once, lists the real product and removes it again"` |
| Reviews (purchase-gated, moderated) | COMPLETE AND VERIFIED | `"holds a verified review until staff approve it and never shows a fake rating"`; admin side `"keeps a pending review private until support approves it"` |
| Support ticket submission | COMPLETE AND VERIFIED | `"saves a ticket for the staff inbox and lets staff close it"`, `"keeps the support inbox out of customer accounts"` |
| Link a prior guest order to a new account | MISSING | guest orders stay capability-based and never attach to a later registration |
| Loyalty points / wallet / store credit / gift cards / referral | MISSING | no tables, no routes, no UI. Listed as business decisions in `OWNER_ACTION_REQUIRED.md`. |

## 5. Staff admin

| Feature | Status | Evidence |
| --- | --- | --- |
| Role-based access (owner/admin/catalogue/orders/support/finance) | COMPLETE AND VERIFIED | `tests/api/admin.test.ts > "keeps scoped staff roles inside their own areas"`; `flows.test.ts > "lets finance read the summary but not change order status"`; `security.test.ts > "keeps every admin area closed to signed-out visitors and customers"` |
| Dashboard summary | COMPLETE AND VERIFIED | summary authorization asserted; admin chunk built (see performance doc) |
| Sales chart (recharts) | IMPLEMENTED BUT UNVERIFIED | renders in visual `desktop-admin-dashboard` with overflow=no; no data-shape test. It is the sole reason for the 360 kB admin chunk. |
| Product create / update / publish / unpublish | COMPLETE AND VERIFIED | `tests/api/admin.test.ts` create-draft-then-publish case; unpublished items excluded from sitemap by `tests/api/flows.test.ts > "keeps unpublished products out of the sitemap"` |
| PATCH must not clobber omitted fields | COMPLETE AND VERIFIED (fixed earlier round) | `partialUpdate()` at `server/routes/admin.ts:80-89` with the reason recorded in the comment above it |
| Variant management | COMPLETE AND VERIFIED (API) / UNVERIFIED (replace-list UI) | variant created through the product payload; the reorder UI has no test |
| Manual stock adjustment + movement history | COMPLETE AND VERIFIED | `409 STOCK_BELOW_ZERO` refusal plus the concurrency test above |
| Category management | IMPLEMENTED BUT UNVERIFIED | create/update validated; no automated assertion |
| Order list, search, filter | PARTIALLY IMPLEMENTED | list navigation covered by e2e "owner signs in… admin confirms the order"; search/filter combinations untested |
| Order detail + status moves + staff notes | COMPLETE AND VERIFIED | gift/lifecycle tests plus e2e confirmation-with-note |
| Invoice from admin (HTML + PDF) | COMPLETE AND VERIFIED | e2e "admin can open the invoice PDF" |
| Notification resend | COMPLETE AND VERIFIED (fixed this round: limiter + honest 503) | resend refused with `503 EMAIL_NOT_CONFIGURED` when SMTP absent |
| Coupon management | COMPLETE AND VERIFIED (create) | duplicate-code rejection and cart discount asserted in `tests/api/admin.test.ts` |
| Delivery zone management | COMPLETE AND VERIFIED (create) | zone creation returns the correct quote |
| Settings: store, tax, gift wrap, COD, returns, notifications, public profile | COMPLETE AND VERIFIED | `tests/api/admin.test.ts` settings/roles group (4 tests); finance blocked from writing `publicProfile` |
| Review moderation queue | COMPLETE AND VERIFIED | pending-hidden-then-approved test pair |
| Support ticket handling | COMPLETE AND VERIFIED | close-a-ticket test |
| Returns workflow | COMPLETE AND VERIFIED | refund-once + illegal-jump tests |
| Customers list | IMPLEMENTED BUT UNVERIFIED | page + endpoint exist; no assertion |
| Audit log | IMPLEMENTED BUT UNVERIFIED | 53 rows written in the local DB by staff/auth actions; page itself untested |
| Staff account creation | COMPLETE AND VERIFIED | `npm run admin:create` CLI enforces ≥12-character password; **no default admin exists anywhere in the tree** |
| Bulk product import/export, CSV | MISSING | no importer, no exporter |

## 6. Platform, security, operations

| Feature | Status | Evidence |
| --- | --- | --- |
| SQLite schema + forward migrations (v1–v4) | COMPLETE AND VERIFIED | `server/db.ts` migration array; every test run migrates an isolated DB |
| Transactional write path (`BEGIN IMMEDIATE`) | COMPLETE AND VERIFIED | `transaction()` used by checkout, cancel, restock; concurrency test proves no lost update |
| CSRF double-submit + origin pinning | COMPLETE AND VERIFIED | `security.test.ts > "refuses a mutating request with no CSRF token and one from a foreign origin"`; `_qa/release-prod-probe.log` rows `csrf-less mutation` (403 `CSRF_FAILED`) and `forged origin` (403 `ORIGIN_NOT_ALLOWED`) |
| Security headers, CSP, HSTS | COMPLETE AND VERIFIED | `_qa/release-prod-probe.log` prints the same header block on every one of the 20 rows; `x-powered-by` absent |
| API responses uncacheable, assets cacheable | COMPLETE AND VERIFIED (fixed this round) | prod probe: `cache-control=no-store` on `/api/v1/health`, `no-cache` on the shell, `public, max-age=31536000, immutable` on hashed JS/CSS, `max-age=86400` on SVG |
| Rate limiting on every abusive surface | COMPLETE AND VERIFIED (gaps closed this round) | 8 limiters enumerated in `SECURITY_AUDIT_RESULTS.md` §4; `"stops a scripted run from probing coupon codes at speed"` |
| Input validation (Zod) at every write | COMPLETE AND VERIFIED | `"ignores every price, discount and status field the browser tries to inject"`; `"does not let registration body fields assign a staff role"` |
| SQL injection resistance | COMPLETE AND VERIFIED | `"survives SQL-shaped input without altering the schema or the data"`; only prepared statements |
| XSS resistance in server-rendered documents | COMPLETE AND VERIFIED | `"escapes hostile gift text in the server-rendered invoice"` and the emailed-copy equivalent in `gift.test.ts` |
| Secret / PII leakage in responses and logs | COMPLETE AND VERIFIED (fixed this round) | `"keeps build and environment details out of the public responses"`; prod probe `/.env` → 404, `/../data/sree.db` → 404 |
| Password + session storage | COMPLETE AND VERIFIED | `"stores only a bcrypt hash and a hashed session token"` (bcrypt cost 12, hashed tokens) |
| robots.txt + sitemap.xml | COMPLETE AND VERIFIED (added this round) | `server/lib/seo.ts`; `_qa/release-prod-probe.log` rows `robots.txt` (200, `text/plain`) and `sitemap.xml` (200, `application/xml`, `<loc>` entries for every published product); `tests/api/flows.test.ts > "gives crawlers a robots file and a sitemap instead of the app shell"` and `> "keeps unpublished products out of the sitemap"` |
| Correct 404 for asset probes instead of app shell | COMPLETE AND VERIFIED (fixed this round) | `"answers unknown non-HTML paths with a 404 rather than the storefront"`; prod probe `/favicon.ico` → 404 JSON |
| Structured JSON logging | IMPLEMENTED BUT UNVERIFIED | request log lines visible in prod probe; no aggregation/retention policy |
| Backup / restore automation | MISSING | `data/sree.db` only; no snapshot script, no offsite copy, no tested restore |
| Version control | MISSING | no `.git` anywhere under `D:\SreeCollections` (`AUDIT_BASELINE.md` §5) |
| Horizontal scaling | NOT APPLICABLE / MISSING | single-process SQLite writer, in-memory limiters; documented, not attempted |
| SMS notifications | MISSING | not offered, not pretended |
| Real carrier booking / live tracking scans | BLOCKED BY EXTERNAL DEPENDENCY | no courier credentials; health reports the integration as not configured |
| Load / soak testing | NOT DONE | out of this environment's evidence; `RELEASE_READINESS.md` §5 |

## 7. Content and business-truth items (status = the claim, not the code)

| Item | Status | Note |
| --- | --- | --- |
| "Since 1998", "28 years", "4.4★ from 84 reviews" | **UNVERIFIED CLAIM — must not ship unconfirmed** | stored in `settings.publicProfile` with `sourceName:""` and `sourceUrl:""`. No source recorded. Owner must confirm or remove; see A-7. |
| Store phone / hours / address | **UNVERIFIED** | `supportEmail` and `supportPhone` are empty strings; only `supportWhatsApp = "919494498937"` (user-supplied) and `address = "Gandhi Nagar, Kurnool"` (no house/street) are set. |
| Delivery promises (₹49/₹99, free above ₹2,500/₹1,999, 1–2 / 4–7 days) | **UNVERIFIED BUSINESS NUMBERS** | configured values, never reconciled against a real courier tariff. They are honest *labels* but an unvalidated *commitment*. |
| GST treatment (5% inclusive, HSN codes) | **UNVERIFIED** | `settings.tax.note` itself says "Confirm tax classifications and GST registration with the business before launch." |
| Legal policy text | **NOT REVIEWED** | returns note literally says "Template policy. … Legal review required." |

## 8. Counts

Machine-counted from the status column of sections 1–6 above (98 feature rows; `awk -F'|'` over this file, so these numbers are reproducible rather than asserted):

| Status | Rows |
| --- | --- |
| COMPLETE AND VERIFIED (including rows qualified as `(create)`, `(API)`, `(content-type)` etc.) | 68 |
| MISSING | 10 |
| IMPLEMENTED BUT UNVERIFIED | 9 |
| BLOCKED BY EXTERNAL DEPENDENCY | 4 |
| NOT APPLICABLE (one row is shared `NOT APPLICABLE / MISSING`) | 3 |
| PARTIALLY IMPLEMENTED | 2 |
| NOT DONE (out of this environment's scope: load/soak testing) | 1 |
| BROKEN | 1 |

The single BROKEN row is **the owner order email**: the code path is tested and correct, but `settings.notifications.ownerEmail` is empty while `sendOwnerEmail` is `true`, so in practice the owner receives nothing. It is a configuration defect owned by the business (`OWNER_ACTION_REQUIRED.md` A-3), not a code fault, and it is the only item in this matrix whose observable outcome is currently wrong.

Sixteen of the 68 verified rows are marked "fixed" in this or the immediately previous round; each has a named regression test in `TEST_RESULTS.md` and a line in `REPAIR_CHANGELOG.md`.

**Bottom line:** the transactional core verifies. What keeps this from "ready" is not broken code — it is 4 external dependencies, 10 absent features, 9 unverified implementations, the BROKEN owner-email setting, and the business claims in §7.
