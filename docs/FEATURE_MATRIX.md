# Feature completion matrix

> **Superseded.** This snapshot was written on 2026-10-24 with a three-level legend. The audit round re-scored every feature against a seven-level taxonomy and is authoritative: [MASTER_FEATURE_MATRIX.md](MASTER_FEATURE_MATRIX.md). Where the two disagree, the master matrix is the one that was re-checked against executed evidence.

Status legend:

- **Verified** — exercised by an automated unit/API test or the production-build browser flow, in addition to type-checking.
- **Implemented** — code and UI exist and type-check; limited or no feature-specific automated coverage. Treat as needing manual acceptance before launch.
- **Disabled / absent** — intentionally not available. The UI or API says so rather than simulating it.

Last verified: 2026-10-24, on this checkout. Evidence details are in the [test report](TEST_REPORT.md).

## Storefront

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Home page with curated collections | Verified | Compact single-scroll layout; browser E2E and desktop/mobile visual audit |
| Public listing details (rating, years, locality, listed closing time) | Verified | Admin validation API test; storefront values edited in admin and checked in a browser; no external directory link or branding |
| Announcement, hero and section settings | Implemented | Rendered from `/content/home`; admin editing not automated-tested |
| Shop catalogue, filters, sort, pagination | Verified | Catalogue is returned published-only in API tests; desktop/mobile visual audit |
| Search suggestions and anonymous search log | Implemented | Endpoint and overlay implemented; not automated-tested |
| Product detail with images, variants, stock, related products | Verified | E2E opens a product and adds it to the bag |
| Gift finder | Implemented | Page and API exist; visual audit only |
| Cart drawer and cart page | Verified | E2E adds an item and reaches checkout |
| Guest cart persisted by cookie | Verified | API flow registers a customer and merges the guest cart |
| Wishlist | Implemented | Account + API implemented; no automated test |
| PIN-code delivery quote | Verified | Unit tests for ranges, zone priority, free thresholds and the all-India fallback; API checkout accepts a remote PIN and rejects when no zone covers it |
| Coupons | Verified | Unit tests for percent/fixed/free-shipping, caps, dates, limits; API apply test |
| Server-authoritative pricing | Verified | API test sends client prices and asserts they are ignored |
| Gift wrap fee and eligibility | Verified | Unit and API tests, including non-wrappable products |
| Personalisation validation | Verified | API tests require a valid variant and personalisation text |
| Cash-on-delivery checkout | Verified | API flow creates an order, decrements stock, clears cart; E2E completes purchase |
| Idempotent checkout | Verified | API test repeats an idempotency key and receives the same order |
| Online payment | **Disabled** | Checkout option disabled; API returns `503 PAYMENT_PROVIDER_UNAVAILABLE`; no order created |
| Order confirmation page | Verified | E2E and API order tests; shows delivery zone/ETA, invoice links and the email state |
| WhatsApp order handoff | Verified (link generation) | Order confirmation opens `wa.me` with a prewritten owner message and invoice link once the store number is saved; popup-blocked and re-open cases have a visible fallback button |
| Order email outbox | Verified | API tests assert `not_configured` rows without SMTP, admin message log contents and the `503 EMAIL_NOT_CONFIGURED` resend refusal |
| Guest order tracking | Verified | API test requires email; E2E tracks the placed order by number and email |
| Invoice (printable HTML and PDF) | Verified | HTML escaping API test; PDF route content type and `no-store` asserted for customer and admin routes |
| Customer registration and sign-in | Verified | API and E2E |
| Password change | Implemented | Implemented and type-checked; not automated-tested |
| Forgot password by email | **Disabled** | `503 EMAIL_NOT_CONFIGURED`; directs the customer to contact the store |
| Account dashboard/orders/detail | Verified | E2E opens account orders |
| Saved addresses | Implemented | CRUD implemented; no automated test |
| Order cancellation by customer | Verified | API tests cancellation rules and restock |
| Return requests | Implemented | Customer request + admin workflow implemented; no automated test |
| Review submission and moderation | Implemented | Purchase-gated submission and admin moderation implemented; no automated test |
| Newsletter consent | Verified | API test rejects missing consent and records consent timestamp |
| Contact/support ticket | Implemented | Saved ticket endpoint and page; no automated test |
| Static content (About, FAQ, Offers, Journal, Stores, Policies) | Implemented | Pages render; no claim of legal review |
| Testimonials | **Absent by design** | API returns an empty array with an explanation; no fabricated social proof |
| SEO titles/descriptions and no-index on private pages | Implemented | Client-side meta management; no sitemap/robots for a real domain |
| Image upload | **Absent** | Products reference image URLs; local SVG artwork is seeded |
| Multi-currency | **Absent** | INR only |
| Analytics/advertising trackers | **Absent** | No third-party scripts |

## Customer account

| Feature | Status |
| --- | --- |
| Profile view/update | Implemented |
| Address create/edit/delete/default | Implemented |
| Order history and detail | Verified (E2E + API) |
| Cancel pending/confirmed order | Verified (API) |
| Return request | Implemented |
| Wishlist add/remove | Implemented |
| Own reviews | Implemented |
| Guest-order data linking after later registration | **Absent** — guest orders remain accessible by number + email and do not auto-attach to a new account |

## Staff admin

`owner` and `admin` can access everything. Other roles are scoped as shown in [Security](SECURITY.md#staff-role-matrix).

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| Role-based route and API access | Verified | API tests confirm finance can read but not change, catalogue cannot use order/coupon APIs, and support cannot use product/return-status APIs |
| Dashboard summary and sales chart | Verified (summary API) / Implemented (chart) | Summary authorization tested; desktop/mobile visual audit |
| Product list and editor | Verified (list) / Implemented (editor form) | List rendered in E2E and visual audit; creation fields and publish transition covered by API test |
| Product create/update/status | Verified (create and publish) | API test creates a draft with variant and image, then publishes it and sees it publicly |
| Variants management | Verified (create) | API test creates a variant through the product payload; replace-list UI is manually verifiable |
| Manual stock adjustment with reason | Verified | API test restocks a variant, refuses overdraw with `409 STOCK_BELOW_ZERO` and asserts the movement row |
| Stock movement history | Implemented | Endpoint and page; API tests assert movements from orders/restock |
| Category management | Implemented | Create/update implemented; not automated-tested |
| Order list, search and filter | Verified (list navigation) | E2E opens the admin order list and follows an order number; search/filter combinations remain manual |
| Order detail, status transitions, notes | Verified | API tests for allowed/blocked transitions; E2E confirms an order with a note |
| COD paid-on-delivery | Verified | API test marks delivered and observes `paid` |
| Tracking number and https link | Implemented | Stored only when staff enter a real value; no courier calls |
| Invoice from admin (HTML and PDF) | Verified | Both routes tested; PDF content type asserted |
| Order message log and resend | Verified | Admin detail returns the outbox; resend is refused honestly when SMTP is absent |
| Coupon management | Verified (create) | API test creates a coupon, discounts a real cart and rejects a duplicate code; edit/deactivate still manual |
| Delivery zone management | Verified (create) | API test creates a zone and receives the correct quote; edit still manual |
| Store/tax/gift-wrap/COD/returns/home settings | Implemented | Validated and audit-logged; visual audit of settings page |
| Store WhatsApp number and order-message preferences | Verified | API test saves the number, rejects a malformed owner email and confirms the number is published to the storefront |
| Public listing settings | Verified | API test saves valid facts, asserts the removed source fields are absent, and rejects an out-of-range rating and a 12-hour time string |
| Review moderation | Verified (approval) | API test proves a pending review is hidden, then appears publicly after approval; customer submission UI is manual |
| Support tickets | Implemented | Endpoint and page; not automated-tested |
| Returns workflow | Verified (approval and refund) | API test approves a request, requires a refund note, then records the refund and order event; customer request UI is manual |
| Customers list | Implemented | Endpoint and page; not automated-tested |
| Audit log | Implemented | Entries written by staff actions and auth; page not automated-tested |
| Staff account creation | Verified | CLI hashes password; no default account |
| Settings permissions | Verified | Finance can read settings but cannot write `publicProfile`; catalogue and support boundaries also asserted |

## Platform and operations

| Feature | Status | Evidence / notes |
| --- | --- | --- |
| SQLite schema and migrations | Verified | Tests run migrations on an in-memory database |
| WAL, foreign keys, busy timeout | Implemented | Configured in `openDatabase`; production behaviour not load-tested |
| Transactional stock decrement and restock | Verified | API and unit tests |
| Coupon redemption uniqueness | Verified | Unit/API tests and DB constraint |
| CSRF double-submit | Verified | API test asserts rejection without the header |
| Origin allow-list | Verified | API test asserts rejection from another origin |
| Password/session security | Verified by code inspection and login flows | bcrypt 12, hashed session tokens, HttpOnly cookie; no penetration test |
| Rate limiting | Implemented | Configured; not stress-tested |
| Security headers / production CSP | Implemented | Production E2E runs under the CSP without console errors |
| Structured logging | Implemented | JSON request logs; no log aggregation configured |
| Health and capability reporting | Verified | API test asserts honest integration labels |
| Responsive layout | Verified | 26 page/viewport audits at 1440/390/360 with no document overflow; E2E mobile admin/product checks |
| Reduced motion and touch adaptations | Implemented | CSS media queries; no formal assistive-technology audit |
| Low-end phone performance | Partially verified | No heavy CSS effects, SVG assets, code splitting, `contain: paint`; no throttled-device benchmark or Lighthouse score recorded |
| Accessibility (labels, focus states, skip link) | Implemented | Basic semantics and form labels; no WCAG 2.2 audit |
| Automated unit/API tests | Verified | 59 tests passing across 4 files |
| Production-build browser E2E | Verified | 27 checks passing, zero console errors |
| Transactional email | **Implemented, not configured** | SMTP adapter, outbox and PDF attachment exist; no credentials supplied, so UI reports not configured and tests assert that state |
| Payment gateway | **Disabled** | No provider or adapter |
| Courier booking / live scans | **Disabled** | Manual tracking record only |
| WhatsApp notification | **Handoff only** | `wa.me` click-to-chat with a prewritten message; the customer sends it, no Business API |
| SMS | **Disabled** | Not offered |
| Route-distance delivery pricing | **Disabled** | PIN-zone model only |
| Sitemap / robots.txt | **Absent** | Needs a real production domain and content plan |
| Multi-process / horizontal scaling | **Absent** | SQLite single-writer, in-memory rate limits |
| Refund processing | **Absent** | Returns are workflow records; no money movement |
| Backups | Documented, not automated | Commands in Operations; scheduler is the operator's responsibility |

## Honest summary

The **transactional core** — catalogue, cart, pricing, stock, pan-India COD checkout, tracking, HTML/PDF invoices, the WhatsApp handoff, order message logging, customer accounts and staff order operations — is implemented and tested end to end.

The **peripheral admin workflows** now have meaningful API coverage for product creation/publishing, stock adjustment, coupon creation, zone creation, review approval, return refunds, public-listing settings and order message handling. Category editing, support tickets, customers, the audit-log page and customer-side submission forms still need manual acceptance testing before a store team relies on them.

**Payments, automated email, courier integration, automated WhatsApp/SMS and distance pricing are absent or unverified**, clearly labelled, and must not be described as working. Email sends only after the operator supplies SMTP credentials and proves delivery. The store is suitable for a cash-on-delivery launch only after the sample catalogue, delivery zones, policies and contact details are replaced with real business data.
