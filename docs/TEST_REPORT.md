# Test report

> **Superseded.** This is the 2026-10-24 round. The current executed evidence is [TEST_RESULTS.md](TEST_RESULTS.md) (2026-10-26, 321 checks, including a run from inside the unpacked release archive). Kept as history, not as the release gate — and its Node version predates the upgrade to v24.19.0.

Date: **2026-10-24**
Project: `D:\SreeCollections\store`
Node: 24.18.0 · npm: 12.0.2 · OS: Windows 10.0.26300 x64 · Chrome: installed at `C:/Program Files/Google/Chrome/Application/chrome.exe`

This report records what was actually executed on this checkout. It does not claim tests that were not run.

## Summary

| Check | Command | Result |
| --- | --- | --- |
| TypeScript (client + server) | `npm run typecheck` | **Pass**, no errors |
| Unit and API tests | `npm test` | **59 / 59 pass**, 4 files, 7.27 s |
| Production build | `npm run build` | **Pass**; client and server emitted |
| Browser end-to-end (production build) | `npm run e2e` | **27 / 27 pass**, zero console/page errors |
| Responsive visual audit | `node _qa/visual-check.mjs` | **26 / 26 audits**, no horizontal overflow, zero browser errors |
| Production dependency audit | `npm audit --omit=dev` | **0 vulnerabilities** |

## Automated unit and API tests

Framework: Vitest 5. Runner output:

```
✓ tests/unit/pricing.test.ts (21 tests)
✓ tests/unit/orders.test.ts (7 tests)
✓ tests/api/flows.test.ts (21 tests)
✓ tests/api/admin.test.ts (10 tests)
Test Files  4 passed (4)
Tests       59 passed (59)
```

### `tests/unit/pricing.test.ts` — 21 tests

Pricing and coupon arithmetic against an in-memory seeded database:

- Shipping: Kurnool local zone quote and estimate (518001–518999, ₹49), free-above threshold on the goods total, malformed PIN rejection.
- All-India fallback: any valid PIN is deliverable at the configured fee; free delivery above the pan-India threshold; a more specific zone wins before the fallback; inactive zones are ignored; an unserviceable result is returned only when no active zone covers the PIN.
- Variant price overrides and base price fallback.
- Gift wrap charged per unit; non-wrappable products rejected.
- Percentage coupon allocation across lines; minimum subtotal rejection.
- Free-shipping coupon.
- Fixed coupon capped at order value.
- Per-email redemption limit.
- Unpublished products excluded from quotes.
- Missing variant and insufficient stock issues.
- Empty cart.
- Exclusive tax mode.
- COD maximum-total gating.

### `tests/unit/orders.test.ts` — 7 tests

- Allowed status transitions and rejection of stage skipping.
- Terminal states cannot be left.
- Cancellation and return rules.
- Every declared status is reachable in the transition map.
- Restock of product-level and variant-level stock.
- Stock movement audit rows written on restock.

### `tests/api/flows.test.ts` — 21 tests

Real HTTP calls against an ephemeral Express app with a seeded in-memory database. The test client manages the session, cart and CSRF cookies.

- Health reports a connected database and honest integration states.
- Public catalogue only returns published products.
- Mutating requests without a CSRF token are rejected.
- Requests from an untrusted origin are rejected.
- Server-side pricing ignores client-supplied prices.
- Variant, stock, gift-wrap and personalisation validation.
- Local and pan-India shipping quotes; a remote order is placed with the all-India fee and zone/ETA snapshot, and its invoice PDF is served with `no-store`.
- An unserviceable PIN is rejected at checkout only when no active zone covers it.
- Coupon application and rejection.
- Online payment returns `503` and creates **no** order.
- Checkout validation errors.
- Successful COD order: stock decremented, movement written, cart cleared, tracking available, invoice escapes HTML.
- Idempotency key returns the same order and does not double-decrement stock.
- Registration merges a guest cart.
- Admin order transitions; delivering a COD order marks it paid.
- Cancellation restocks and writes audit movements.
- Finance role can read the summary but cannot change order status.
- Newsletter requires consent and records it.
- Content honesty: testimonials empty with a note; integrations `not_configured`; policies do not invent online payment.

Fixtures use `owner-test@example.com` with a password generated only inside the test database. No fixture credential is used in development or production.

### `tests/api/admin.test.ts` — 10 tests

Staff API coverage:

- Creates a draft product with a variant and image, then publishes it and confirms it appears in the public catalogue.
- Adjusts variant stock, refuses to take it below zero with `409 STOCK_BELOW_ZERO`, and asserts the `stock_movements` row.
- Creates a percentage coupon and applies its discount to a real cart; a duplicate code returns `409`.
- Creates a delivery zone and receives the expected fee and ETA quote for a matching PIN.
- Keeps a pending review hidden from the public API until support approves it; checks the `review.approved` audit entry.
- Approves a return, requires a note before refund (`400 REFUND_NOTE_REQUIRED`), then records the refund and order event.
- Saves the public listing profile, rejects an out-of-range rating and a 12-hour time string, and confirms the public site serves only attributed facts (rating, count, years, locality, closing time, categories) with no source fields.
- Stores the shop WhatsApp number, returns it from the public site endpoint, and rejects an invalid owner email and malformed notification preferences.
- Records order message attempts: the customer and owner email rows are created as `not_configured` with an `SMTP_URL` explanation, resend returns `503 EMAIL_NOT_CONFIGURED`, and invoice PDFs require staff or the order lookup.
- Enforces scoped roles: catalogue cannot reach orders or coupons, support cannot reach products or return-status updates, and finance can read settings but cannot write the public listing profile.

## Browser end-to-end

Script: `tests/e2e.mjs`. It uses the **production build** (`dist/` + `dist-server/`), a temporary `data/e2e.db`, a random owner account and a server on port 4137 with `NODE_ENV=production`. The database and process are removed afterwards. The WhatsApp external hop (`wa.me`) is stubbed for the test so the generated chat URL can be inspected; no message is actually sent.

All 27 checks passed:

```
PASS  health endpoint reports a connected database
PASS  provider integrations are reported as not configured
PASS  storefront home renders
PASS  customer registration signs the shopper in
PASS  shop lists live catalogue products
PASS  product page opens from the catalogue
PASS  adding to bag opens the cart drawer with the item
PASS  checkout validates the configured delivery PIN
PASS  checkout quotes pan-India delivery with a fee and estimate
PASS  COD order is placed and confirmed
PASS  confirmation is honest about email delivery
PASS  confirmation shows the delivery zone and estimate
PASS  confirmation offers HTML and PDF invoices
PASS  confirmation shows the WhatsApp handoff
PASS  confirmation opens WhatsApp with the prepared order message
PASS  order appears in the customer's account
PASS  guest order tracking works with the checkout email
PASS  owner signs in to the admin area
PASS  admin confirms the order and the timeline records it
PASS  admin sees the order message log
PASS  admin can open the invoice PDF
PASS  admin catalogue lists products
PASS  mobile admin has no horizontal page overflow
PASS  mobile storefront has no horizontal page overflow
PASS  mobile navigation drawer opens
PASS  mobile navigation closes with Escape
PASS  no browser console or page errors
All end-to-end checks passed.
```

This exercises the full purchase path: catalogue → product → cart drawer → local PIN quote → Delhi PIN quote through the all-India zone → COD order → confirmation with email honesty, delivery estimate, invoice links and WhatsApp handoff → account order list → sign-out → guest tracking → staff sign-in → order confirmation with note → message log and invoice PDF. It also runs under the production CSP.

The WhatsApp check asserts the popup URL is `https://wa.me/919876500000?text=…` and that the decoded text contains the order number. This proves the browser opens the prepared owner message; it does not prove a message was delivered, because delivery happens when the customer presses send inside WhatsApp.

## Responsive visual audit

Script: `_qa/visual-check.mjs` against the development server. Each page is screenshotted and measured for `documentElement.scrollWidth > clientWidth` plus off-screen non-fixed elements.

| Viewport | Pages audited | Overflow | Browser errors |
| --- | --- | --- | --- |
| 1440 px | home, shop, product, cart, checkout, gift finder, about, account, admin dashboard, admin products, admin settings, admin orders | none | 0 |
| 390 px | home, footer, shop, product (top and lower), cart, checkout, account, admin dashboard, admin menu, admin products | none | 0 |
| 360 px | home, shop, product | none | 0 |

Result: **26 audits, 26 `overflow=no`, `ERRORS 0`**.

The compact home page remains five sections (hero, trust strip, category chips, featured products, visit card). The shop rating is shown as attributed facts only, with no outgoing directory link. The earlier directory link was removed from the source.

One real defect was found and fixed during an earlier audit: wide admin tables inside `.table-wrap` leaked scrollable overflow to the document on mobile (reported 798 px scroll width at a 390 px viewport). Adding `contain: paint` to `.table-wrap` fixed it and reduces paint work. Re-audit returned 390/390.

## Build output

`npm run build` succeeded in 1.08 s for the client, followed by the server TypeScript build. Largest chunks:

| Asset | Size | Gzip |
| --- | --- | --- |
| `index-*.js` (storefront shell) | 287.03 kB | 87.50 kB |
| `Dashboard-*.js` (admin, Recharts) | 360.21 kB | 104.44 kB |
| `hooks-*.js` (shared) | 55.33 kB | 19.43 kB |
| `Settings-*.js` (admin) | 30.90 kB | 8.07 kB |
| `ProductEditor-*.js` (admin) | 18.80 kB | 5.08 kB |
| `Product-*.js` | 17.72 kB | 5.86 kB |
| `Checkout-*.js` | 15.74 kB | 5.01 kB |
| `OrderConfirmation-*.js` | 6.63 kB | 2.50 kB |

Every route is a separate chunk. The Recharts-heavy admin dashboard is loaded only by staff who open it, so storefront visitors do not pay that cost.

## Performance notes and limits

The build avoids remote fonts, heavy CSS effects, backdrop filters and animation libraries. Product artwork is SVG. Shared CSS uses `contain: paint` on scroll containers and route-level code splitting.

`NODE_ENV` is deliberately absent from `.env` and `.env.example`. Vite reads it during `npm run build`; setting it to `development` there inflates the entry chunk from 287 kB to 505 kB by bundling React's development runtime. Set `NODE_ENV=production` in the process environment instead.

**Not measured:** no Lighthouse score, no CPU/network-throttled low-end Android benchmark, no memory profiling. The claim is architectural and responsive, not a quantified performance guarantee.

## Security verification performed

- `npm audit --omit=dev`: 0 vulnerabilities.
- Automated CSRF and origin rejection tests.
- Automated verification that the browser cannot set prices.
- Automated verification that online payment creates no order.
- Automated invoice-escaping test.
- Automated invoice authorization test: an anonymous request cannot download a guest order's PDF by order number alone.
- Automated role-boundary test.
- Password hashing, session hashing, HttpOnly/SameSite/Secure cookie configuration and CSP reviewed in source.
- No SMTP password or WhatsApp credential is sent to the browser; the WhatsApp handoff contains only the order text the customer chose to share.

**Not performed:** third-party penetration test, automated accessibility audit (axe/WCAG), load testing, chaos/failure injection, real SMTP delivery test, real WhatsApp delivery test (click-to-chat has no delivery receipt).

## Manual checks still recommended before launch

These are implemented but lack feature-specific automated coverage (see [Feature matrix](FEATURE_MATRIX.md)):

1. Configure real SMTP credentials and place a test order to confirm the customer and owner emails arrive (the outbox and failure path are automated; successful delivery is not).
2. Set the real shop WhatsApp number in Settings → Store, place a test order on a phone and press send in WhatsApp to confirm the owner receives it.
3. Edit and unpublish an existing product in the admin editor, and replace its variant list through the form (API create and publish are covered).
4. Create a category; edit or deactivate an existing coupon; hit a coupon usage cap at checkout.
5. Edit an existing delivery zone and confirm the changed fee in checkout (creation and quoting are covered).
6. Submit a support ticket and move it through the admin inbox.
7. Submit a return request and a review from a delivered order through the customer UI (admin approval and refund are covered).
8. Test saved addresses, wishlist, profile update and password change.
9. Verify the remaining settings keys (store details, COD limit, tax mode, gift-wrap fee) reflect on the storefront.
10. Test with a screen reader and keyboard-only navigation.

## Reproducing

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run e2e
# with the dev server running:
node _qa/visual-check.mjs
```

The E2E script writes screenshots and logs nowhere permanent; the responsive audit writes images to `_qa/shots/`, which is a QA artifact and excluded from release packaging.
