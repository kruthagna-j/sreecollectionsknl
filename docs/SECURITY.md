# Security

This document describes what the code actually enforces, what it assumes about the hosting environment, and what must be true before a public launch.

## Threat model

The store handles account credentials, delivery addresses, order history and cash-collection state. The main risks are:

- Credential stuffing or brute force against customer/staff login.
- Cross-site request forgery and cross-origin write attempts.
- Price, discount, shipping or stock manipulation through browser requests.
- Unauthorized access to another customer's order or invoice.
- Privilege escalation between staff roles.
- Injection through catalogue, address, review, ticket or checkout text.
- Secret leakage through source, logs or the release archive.
- Denial of service through expensive or repeated requests.

It is **not** a payment processor and does not store card data. Online payment is disabled; no card, UPI or bank credentials are accepted anywhere. A future payment integration must keep provider secrets server-side and verify webhook signatures.

## Controls in place

### Authentication and sessions

| Control | Implementation |
| --- | --- |
| Password hashing | bcrypt cost 12 (`bcryptjs`) |
| Session token | 32 random bytes, base64url; only a SHA-256 hash is stored |
| Session cookie | `sc_session`, HttpOnly, SameSite=Lax, `Secure` by default in production, 30-day expiry |
| Session revocation | Password change deletes all sessions, then creates a fresh one |
| Login rate | 30 attempts / 15 min per IP on auth endpoints |
| Staff creation | Security-reviewed CLI only; no default account; minimum 12-character password |
| Role check | Server-side on every admin route; owner/admin pass; UI gates are cosmetic |

Guest carts use a separate opaque token stored as a hash. Signing in merges the guest cart into the account cart.

### CSRF and origin

- Every mutating `/api` request requires `x-csrf-token` to equal the `sc_csrf` cookie (timing-safe comparison).
- The token is issued by any GET and is readable by the storefront (double-submit pattern).
- If an `Origin` header is present on a mutating request, it must exactly match `APP_ORIGIN` after removing a trailing slash.
- Cookies are SameSite=Lax as a second layer.

### Server authority

- The client never sends authoritative prices, totals, discounts, shipping fees or payment status.
- Checkout rebuilds the quote from database values: product/variant price, publication status, stock, gift-wrap eligibility, coupon rules, shipping zone, GST mode and COD limits.
- Stock is decremented inside the same transaction that creates the order; the cart is cleared only on success.
- Coupon redemptions are unique per order and constrained by date, total usage, per-email usage and first-order rules.
- Order and invoice lookup require the matching email unless the viewer is the order owner.
- Order status changes are restricted to the defined transition graph.
- Admin product/category/zone/settings writes are audited with actor ID.

### Input and output

- Zod schemas validate every mutating payload and key query parameters (lengths, formats, enums, numeric ranges).
- All SQL uses bound parameters. Dynamic `ORDER BY`/column fragments are drawn from fixed allow-lists, not user strings.
- Body limits: 100 kB JSON, 50 kB form-encoded.
- Invoice HTML escapes customer-supplied values. The invoice response sets `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:` and `Cache-Control: no-store`.
- Product descriptions are rendered as text by React, not raw HTML.
- Review and ticket text is stored and displayed as text; review publication requires moderation.
- Uploaded files are not accepted. Product images are URLs; only use assets you control. Remote `https` images are permitted by CSP and could leak visitor IPs to the image host.

### Transport and headers

- Helmet sets standard protective headers. Production adds a CSP restricted to same-origin scripts, styles and fonts, with data/https images, no framing, no objects and same-origin form actions.
- `x-powered-by` is disabled.
- Production cookies are `Secure` unless `COOKIE_SECURE=false` is explicitly set.
- The app does not terminate TLS. Run it behind an HTTPS reverse proxy and do not expose the Node port directly.

### Rate limits and monitoring

- 900 requests / 5 min per IP across `/api` (health excluded).
- 15 checkout attempts / 10 min, 30 auth attempts / 15 min, 40 lookups / 15 min, 10 contact/newsletter messages / 15 min.
- Structured request logs include method, path, status and duration; fields with potential secrets are not logged.
- Unexpected errors return a generic message and are logged server-side without stack traces in the response.

### Secrets

- `.env` and database files are git-ignored and excluded from the release archive.
- `.env.example` contains only empty placeholders.
- The admin creation CLI hashes the password immediately and states that it is not stored in a file or log.
- Provider environment variables are read but no provider code exists; setting them only changes a capability label.

## Staff role matrix

`owner` and `admin` can do everything.

| Area | catalogue | orders | support | finance |
| --- | --- | --- | --- | --- |
| Dashboard summary |  |  |  | ✓ |
| Products, categories, variants, stock | ✓ |  |  |  |
| Stock history | ✓ |  |  | ✓ |
| Order list/detail/invoice |  | ✓ |  | ✓ |
| Change order status / add note |  | ✓ |  |  |
| Coupons |  |  |  |  |
| Delivery zones |  |  |  |  |
| Read settings |  |  |  | ✓ |
| Write settings |  |  |  |  |
| Review moderation |  |  | ✓ |  |
| Support tickets |  |  | ✓ |  |
| Returns list |  | ✓ | ✓ |  |
| Advance returns |  | ✓ |  |  |
| Customers |  | ✓ | ✓ | ✓ |
| Audit log |  |  |  | ✓ |

Coupons, delivery zones and settings writes (including `publicProfile`, `store` and `notifications`) are restricted to `owner` and `admin`; the empty cells for those rows apply to every scoped role. Settings reads additionally allow `finance`. Treat staff accounts as trusted; there is no custom per-user permission editor.

## Data handled

| Data | Location | Retention |
| --- | --- | --- |
| Account name, email, phone, address | SQLite | Until deletion request or business policy |
| Password | bcrypt hash in SQLite | Account lifetime |
| Session | hash in SQLite, cookie in browser | 30 days; expired rows cleaned every 6 h |
| Guest cart | hash in SQLite, cookie in browser | 365 days of inactivity |
| Orders and invoices | SQLite | Financial record; do not delete casually |
| Order message log (recipient, delivery status, provider error) | SQLite | With the order |
| Support tickets, reviews, returns | SQLite | Business policy |
| Newsletter email and consent | SQLite | Until unsubscribe |
| Anonymous search terms | SQLite | For catalogue insight only |

There is no analytics or advertising tracker. The only cookies set by this application are `sc_session`, `sc_csrf` and `sc_cart`.

## Deployment checklist

- [ ] Serve only over HTTPS; redirect HTTP to HTTPS at the proxy.
- [ ] Set `NODE_ENV=production`, `APP_ORIGIN=https://real-domain`, `COOKIE_SECURE=true`.
- [ ] Store `.env` outside the release directory with file permissions limited to the service user.
- [ ] Put the SQLite file on a persistent volume outside the release directory; restrict filesystem permissions.
- [ ] Create the first owner with `npm run admin:create` and a unique password in a password manager.
- [ ] Remove or replace the development catalogue, settings and any `DEVWELCOME` coupon.
- [ ] Confirm no `data/*.db`, `.env` or backup is reachable under the web root.
- [ ] Configure the proxy to set/overwrite `X-Forwarded-For` and `X-Forwarded-Proto` (trust proxy is enabled in production).
- [ ] Configure log rotation and disk-space alerts.
- [ ] Schedule encrypted offsite database backups and test a restore.
- [ ] Decide and document a customer data deletion procedure.
- [ ] Keep Node and npm dependencies patched; run `npm audit` before each release.
- [ ] If enabling a provider later: keys only in server environment, HTTPS webhooks with signature verification, idempotent webhook handling, and a sandbox test record.

## Residual risks and deliberate gaps

- No email verification, MFA or email-based password reset. Staff and customers must contact the store for recovery.
- No account lockout beyond per-IP rate limiting; distributed credential stuffing is not fully mitigated.
- Rate limits are in-memory and reset on restart; multiple processes would not share counters.
- No antivirus or file scanning because uploads are not accepted.
- Online payment and courier integrations do not exist. SMTP email exists but requires operator-supplied credentials; no inbox delivery is claimed. WhatsApp is a client-side click-to-chat link, not an API integration, and SMS is absent.
- SQLite is a single-writer database; it is appropriate for a small store, not for high-concurrency flash sales.
- Content moderation and legal policy text are sample templates and need business/legal review.
- The application does not itself encrypt the database at rest; use volume or filesystem encryption.
- Session cookies are SameSite=Lax, not Strict, so top-level cross-site navigation still carries the session; mutations remain CSRF-protected.
