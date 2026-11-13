# Known limitations

These are deliberate boundaries of the current build, not hidden defects. Read them before describing the store as launch-ready.

## Commerce and money

- **Cash on delivery only.** Online payment is disabled at the UI and rejected by the API with `503 PAYMENT_PROVIDER_UNAVAILABLE`. No payment gateway is integrated.
- **No refunds.** Cancellations and returns update status and restock where applicable; no money is moved, and no refund transaction is recorded. Refunds must happen outside the system until a provider integration exists.
- **No partial cancellations or partial refunds.** Cancelling is per order. Returns are per order item, but the workflow does not calculate or disburse refunds.
- **INR only.** All prices are integer paise and formatted as INR.
- **Tax is a configurable calculation, not legal advice.** The seed assumes 5% inclusive GST and product-level rates. HSN codes, tax classifications and GST registration must be verified by the business before launch.
- **Shipping is PIN-zone based, not distance or weight based.** Fees, free-above thresholds and ETA ranges come from admin-configured zones. The seed includes an all-India fallback (`100000`–`999999`, ₹99, free above ₹1,999, 4–7 working days), so every valid Indian PIN is quotable out of the box; the owner can tighten coverage. No courier rate API is used.
- **No inventory reservations.** Stock is checked and decremented inside the checkout transaction. A cart does not hold stock, so two shoppers can race for the last unit; the second receives an insufficient-stock error.
- **No backorders or pre-orders.** Products cannot be sold below zero stock.
- **No order editing.** Staff can change status, add notes and tracking, but cannot add/remove items or change addresses after placement.

## Accounts and access

- **No email verification, MFA or social login.**
- **No self-service password reset.** Password recovery by email is disabled because no email provider exists; customers must contact the store. Signed-in customers can change their password.
- **Guest orders are not auto-linked to a later account.** They remain retrievable with the order number and checkout email. There is no claim-order flow.
- **Rate limiting is per IP and in memory.** It resets on restart and is not shared across processes. There is no account lockout or CAPTCHA.
- **No customer account deletion UI.** Deleting personal data requires a database operation and a documented procedure. Orders are financial records and are not automatically erased.
- **Staff roles are fixed and coarse.** `owner` and `admin` bypass every role check, and coupons, delivery zones and settings writes are owner/admin-only. There is no custom per-user permission editor or approval workflow. Review staff accounts regularly if the team grows.

## Admin workflows

- **No image uploads.** Products use image URLs. The seeded catalogue uses local SVG artwork. A real store should add controlled media storage before launch.
- **No bulk import/export, CSV tooling or supplier feeds.**
- **No printable picking/packing slips or shipping labels** beyond the invoice.
- **No automated courier booking.** Staff may paste a genuine tracking number and `https://` link; the store does not fetch scans.
- **Public listing details are entered manually.** The rating, rating count, years in business, locality and closing time are business facts supplied by the owner. They are shown without links to, or branding from, any external directory. The closing time is a listed detail rather than a live open/closed status.
- **Some store contact details are still incomplete.** The shop WhatsApp number (`919494498937`) is configured, but no verified voice phone number, support email, full weekly hours or exact street address has been supplied. Those fields stay empty rather than being invented; voice-phone actions are not offered until the owner saves them in admin.
- **Order email requires SMTP.** Without `SMTP_URL` and `SMTP_FROM`, each order records a `not_configured` row and the confirmation page says no email was sent. Failed sends are visible in the admin order message log but are not retried automatically.
- **WhatsApp is a click-to-chat handoff, not an automated message.** The confirmation page opens WhatsApp with the owner message and invoice link prewritten; the customer must press send. No WhatsApp Business API, template approval or delivery receipt exists.
- **SMS is not offered.**
- **Support tickets and returns do not send notifications.** They are internal records; the customer is not emailed.
- **Review moderation is manual.** No spam detection, photo reviews or reply threads.
- **No staff activity beyond the audit log.** There is no login history page or device management.
- **Product images are not validated for content or availability.** A broken remote URL results in a broken image.

## Platform and operations

- **SQLite single-writer.** Suitable for a small store. It is not designed for horizontal scaling or very high concurrent checkout volume. Rate limiters are also per process, so running multiple instances would require a shared store or sticky routing.
- **No background job runner.** Cleanup of expired sessions/abandoned guest carts runs in-process every six hours. Order emails are attempted in-process immediately after checkout; there is no scheduled retry queue, and scheduled product publishing would need a real scheduler.
- **Scheduled product status is a stored value, not a scheduler.** A product marked `scheduled` is not publicly listed, and no timer publishes it.
- **No automated backups.** Commands and retention guidance are documented; scheduling is an operator responsibility.
- **No built-in TLS.** Deploy behind an HTTPS reverse proxy.
- **No sitemap, robots.txt, canonical server-side URLs, structured data or server-rendered SEO.** Metadata is set client-side. Search engine indexing of a real domain needs additional work.
- **No PWA/offline mode**, no push notifications and no service worker.
- **No third-party analytics or advertising.** Business reporting is limited to the admin dashboard and local database.
- **Logs go to stdout/stderr.** There is no log viewer, metrics endpoint or alerting integration.

## Verification limits

- **No provider sandbox evidence**, because no payment, courier or email account was supplied. The email adapter, outbox and PDF attachment are exercised by tests without a network send; no inbox delivery is claimed.
- **Invoice links carry the order email as a query parameter.** They are unguessable in practice (random order number plus matching email), but anyone holding the link can open the invoice. Do not forward invoice links publicly.
- **No penetration test, load test or formal accessibility audit.** Security controls are tested where practical and reviewed in code, but this is not a certification.
- **No quantified low-end performance benchmark.** The design avoids known heavy patterns and was screenshot-audited at 360/390/1440 px, but no Lighthouse score or throttled-device measurement is claimed.
- **Some admin CRUD workflows still lack feature-specific automated tests.** Product creation/publishing, stock adjustment, coupon creation, zone creation, review approval, return refunds, public-listing settings, order message logging/resend refusal and invoice PDF routes are covered by API tests. Category editing, support tickets, the customers list, the audit-log page and the customer-side submission forms still need manual acceptance (see the [test report](TEST_REPORT.md#manual-checks-still-recommended-before-launch)).
- **No browser matrix testing.** Automated E2E used Chromium only. Safari/iOS and Firefox are unverified.
- **Sample catalogue and policy content.** The 12 products, prices and policy text are development data. The business name, Kurnool locality and shop WhatsApp number are owner-supplied facts. Delivery is configured as agreed (Kurnool ₹49, all-India ₹99), but the fee/ETA and local PIN range should be checked against real courier costs before launch.
- **No customer-ready claim.** Until real business data, provider integrations, legal review and the manual acceptance checks are complete, treat this as a working development build.

## Legal and policy content

The privacy, returns, shipping, terms and FAQ pages contain template-level copy around the implemented behaviour. They are not legal advice. A qualified person must review them for Indian consumer protection, e-commerce labelling, GST, privacy and returns obligations before launch.
