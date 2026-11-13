# Security audit results

**Target:** `D:\SreeCollections\store` (Express 5 API + React SPA served from the same origin, SQLite via `node:sqlite`)
**Date:** 2026-10-26 · app `0.1.0`
**Posture in one line:** the controls that exist are real, are exercised by 19 dedicated security assertions plus the production probe, and every gap found in this round was closed — but this was a **code-and-configuration audit inside one machine**, not a penetration test, and §8 states exactly what that leaves unproven.

---

## 1. What was actually executed

| Activity | Executed? | Artefact |
| --- | --- | --- |
| Dedicated API security test suite | **Yes** | `tests/api/security.test.ts`, 19 tests, all passing |
| Cross-cutting assertions inside other suites (roles, scoping, escaping, limits) | **Yes** | `admin`, `customer`, `flows`, `gift`, `inventory`, `lifecycle` suites |
| Production-mode response/header probe on a real built server | **Yes** | `_qa/prod-probe.mjs` → `_qa/release-prod-probe.log` (20 requests, server booted on a self-provisioned fixture database — `BUG_REGISTER.md` B-27) |
| Browser e2e against the production build under CSP | **Yes** | `npm run e2e` — 27 checks, 0 console/page errors |
| Secret scan of the tracked source tree | **Yes** | grep for live keys, inline passwords, bearer tokens across `server/`, `src/`, `scripts/` |
| Dynamic-SQL review of every templated `db.prepare()` | **Yes** | 12 sites reviewed, §5 |
| `npm audit` | **Yes** (production tree) | `npm audit --omit=dev` → 0 vulnerabilities |
| External penetration test / scanner (ZAP, Nuclei, Burp) | **No** | out of this environment; §8 |
| Real credential-stuffing or brute-force volume test | **No** | the limiter code path is proven, the *threshold under load* is not |
| TLS/HTTPS configuration review | **No** | the app terminates nothing; there is no deployment to review |
| Secret-scanning of history (no history exists) | **No** | not a Git repository — `AUDIT_BASELINE.md` §5 |

## 2. Threat model (what this store is actually exposed to)

A small, single-node, COD-first Indian storefront with a public catalogue, no card data, and a staff back-office. The realistic threats, ranked by what would hurt the business:

1. **Price/stock/coupon tampering** — direct money loss on every COD order.
2. **Horizontal privilege access** — one customer reading another's address/phone (PII breach, reputation damage).
3. **Staff-account takeover** — full control of orders, prices and customer PII.
4. **Stored XSS through free-text fields** (gift messages, support tickets) executing in the staff inbox or in an emailed invoice.
5. **Unauthenticated write abuse** — coupon guessing, email resend spam, DB growth via scripted carts.
6. **Data loss / no recovery** — one SQLite file, no backup automation, no version control. *(Arguably the highest-probability incident here.)*
7. **Information disclosure** — stack traces, `.env`, the database file, health internals.

Online-payment compromise is **not** in this list because there is no payment code path: the API returns `503 PAYMENT_PROVIDER_UNAVAILABLE` and creates no order.

## 3. Controls inventory

### 3.1 Authentication and sessions
| Control | Implementation | Verified by |
| --- | --- | --- |
| Password storage | bcryptjs, **cost 12** | `security.test.ts > "stores only a bcrypt hash and a hashed session token"` |
| Password policy | ≥10 chars, ≤128, letter+number required at registration | `server/routes/auth.ts:26-29`; staff CLI enforces ≥12 (`scripts/create-admin.ts`) |
| Session tokens | `randomBytes(32)` base64url; **only the hash is stored** | same test as row 1 |
| Session cookie | `sc_session`, `httpOnly`, `sameSite=lax`, `secure` from config, 30-day, `path=/` | `"marks API responses uncacheable and unsniffable and sets the session cookie flags"` |
| Logout | server-side row destroyed; the stale cookie is then rejected | `"destroys the session on logout and rejects the stale cookie"` |
| Password change | other devices signed out; old password refused | `customer.test.ts > "changes the password, signs other devices out and refuses the old password"` |
| Default accounts | **none.** No seeded admin, no default password in the tree | source scan; prod probe `/api/v1/admin/orders` → 401 |
| Staff 2FA | **MISSING** | — (residual risk §8.4) |
| Account lockout / breach notification | **MISSING** (only a 10/15-min per-IP credential limiter) | — |

### 3.2 Authorization
| Control | Verified by |
| --- | --- |
| Every `/admin` route behind `requireRole(...)`; signed-out and customer tokens both rejected | `"keeps every admin area closed to signed-out visitors and customers"` (enumerates the admin surface) |
| Six roles scoped to their own areas (owner/admin/catalogue/orders/support/finance) | `admin.test.ts > "keeps scoped staff roles inside their own areas"`, `flows.test.ts > "lets finance read the summary but not change order status"` |
| Object-level ownership on orders, invoices, tracking, cancellation, addresses, returns | `"hides another customer's order, invoice, tracking and cancellation"`, `"scopes addresses and return requests to their owner"` |
| Guest order access requires the *pair* (order number + checkout email) | `"treats the order number plus the order email as the lookup capability"` |
| Role escalation through request bodies is impossible (`role` is not in the register schema) | `"does not let registration body fields assign a staff role"` |
| Staff actions are written to `audit_logs` (53 rows in the local DB) | admin settings tests + `admin.test.ts` variant-list test asserts the movement/log rows |

### 3.3 Input handling and injection
| Control | Implementation | Verified by |
| --- | --- | --- |
| No trust in browser numbers | totals are rebuilt from the DB in `server/lib/pricing.ts`; `price`, `discount`, `stock`, `paymentStatus`, `status` keys in the payload are ignored | `"ignores every price, discount and status field the browser tries to inject"`, `"prices from the database after an admin change, not from the saved cart"` |
| SQL injection | every value is bound with `?`; 12 templated `prepare()` calls interpolate **only server-authored SQL fragments** (§5) | `inventory.test.ts > "survives SQL-shaped input without altering the schema or the data"` |
| `LIKE` wildcard injection | `escapeLike()` + explicit `ESCAPE '\'` | catalog search path, code-verified |
| Stored XSS in server-rendered HTML | escaping on the invoice and both email bodies | `"escapes hostile gift text in the server-rendered invoice"`, `gift.test.ts > "…in the emailed copies"` |
| Personalization key abuse | allow-list `recipientName, senderName, message, engraving, font, color` | `"keeps personalization keys to the allow-list"`, `flows.test.ts > "requires personalisation for personalised products and stores only allowed fields"` |
| Variant cross-product abuse | variant must belong to the product | `"will not let a shopper attach a variant belonging to a different product"` |
| Quantity abuse | malformed/negative/excessive rejected before stock touch | `"rejects malformed, negative and excessive quantities"` |
| Body size | JSON 100 kB, urlencoded 50 kB (`server/app.ts:50-51`) | `"rejects an oversized request body with 413 rather than a server fault"`; prod probe 2 MB → 413 |

### 3.4 Transport, headers, caching
Verified from the production probe, on **every** response:
```
content-security-policy: default-src 'self'; base-uri 'self'; font-src 'self' data:;
  form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https:; object-src 'none';
  script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'
x-frame-options: SAMEORIGIN · x-content-type-options: nosniff
referrer-policy: no-referrer · strict-transport-security: max-age=31536000; includeSubDomains
(no x-powered-by)
```
Plus `cache-control: no-store` on all `/api` responses (`server/app.ts:100`) and `trust proxy` set in production (`server/app.ts:26`), so limiter keys and secure-cookie behaviour survive a reverse proxy.

### 3.5 CSRF and cross-origin
- Double-submit: `sc_csrf` cookie (readable by design) must equal the `x-csrf-token` header, compared with `timingSafeEqual` (`server/lib/auth.ts:129-149`).
- Mutation requests carrying a foreign `Origin` are refused before routing (`server/app.ts:74-85`).
- Verified: `"refuses a mutating request with no CSRF token and one from a foreign origin"` + the `csrf-less mutation` (`403 CSRF_FAILED`) and `forged origin` (`403 ORIGIN_NOT_ALLOWED`) rows of `_qa/release-prod-probe.log`.

### 3.6 Rate limiting (8 limiters, all created inside `createApp`)
| Limiter | Window | Limit | Protects |
| --- | --- | --- | --- |
| global API | 5 min | 900 | `/api`, skips `/v1/health` |
| `authLimiter` | 15 min | 30 | register, login, forgot-password |
| `credentialLimiter` | 15 min | **10** | password change (bcrypt CPU guard) — added this round |
| `checkoutLimiter` | 10 min | 15 | order placement |
| `lookupLimiter` | 15 min | 40 | guest order tracking |
| `contactLimiter` | 15 min | 10 | contact form, newsletter POST **and** DELETE-unsubscribe (added this round) |
| `couponLimiter` | 15 min | 20 | coupon apply |
| `resendLimiter` | 15 min | **8** | admin notification resend — added this round |

## 4. Findings by OWASP category

| Category | Result | Notes |
| --- | --- | --- |
| A01 Broken access control | **No open finding** | Object-level scoping and role matrices tested (§3.2). The one real gap is *configuration*, not code: `ownerEmail` empty (BUG_REGISTER O-1). |
| A02 Cryptographic failures | **No open finding** | bcrypt-12, hashed session tokens, `randomBytes` tokens, no custom crypto, no card data at rest. |
| A03 Injection | **No open finding** | B-03 (invoice XSS) fixed and pinned; SQL is bound throughout; LIKE escaped; fault injection returns a generic envelope, never a stack trace. |
| A04 Insecure design | **2 accepted** | COD ceiling (₹10,000) bounds exposure; returns have no money movement so a "refunded" state is a human note, not a payout — flagged in `FINANCIAL_AND_ORDER_LOGIC_AUDIT.md` §6. |
| A05 Security misconfiguration | **3 closed this round** | health disclosure (B-07), missing limiters (B-06), asset-cache/`no-store` policy (B-08). Remaining: dev-mode CSP is off by design (`server/app.ts:30`), and `COOKIE_SECURE` must be `true` in the real deployment — it is currently `false` locally, which is correct for `http://localhost` and **wrong to ship**. |
| A06 Vulnerable and outdated components | **0 in prod tree** | `npm audit --omit=dev` → 0. Dev tree not asserted; no CI dependency scanning exists to keep that true. |
| A07 Authentication failures | **1 open (by design)** | password reset returns `503 EMAIL_NOT_CONFIGURED` and points at the shop — no token-based reset exists. Safe but manual for customers. |
| A08 Software and data integrity failures | **1 open** | No version control, no build provenance, no backup/restore automation (§8.1). |
| A09 Logging and monitoring failures | **Partially open, 1 closed this round** | Structured JSON logs record method/path/status/duration only — **no bodies, no tokens, no PII** (verified in the prod probe server log). The audit's own *capture* file was the exception: `_qa/prod-probe.mjs` printed `Set-Cookie` values, so every probe log held ephemeral `sc_csrf` tokens until B-29 masked them. Still missing: aggregation, a retention policy, and any alert on repeated 401/403. |
| A10 Server-side request forgery | **Not applicable / none found** | The server makes no outbound HTTP calls at all: no payment, courier or image-fetch requests. Only `wa.me` links are *generated for the browser*, never fetched. The one stored URL (`trackingUrl`) is validated as `https://` and is never requested server-side. |

## 5. Dynamic SQL review (12 sites)

Every `db.prepare(\`…\`)` in the tree was read. The interpolated values are:
- `PRODUCT_SELECT` / `price` — module constants of authored SQL.
- `whereSql` — `where.join(" AND ")` over hard-coded predicate strings; **all user values arrive as bound `?` params**.
- `orderSql` — lookup into a fixed `sorts` map (`server/lib/catalog.ts:310`); an unknown key falls through to a literal default, so a client-supplied sort string can never reach SQL text.
- `${table}` — either a TypeScript union `"products" | "categories"` chosen by `uniqueSlug()` or a ternary between two literals (`server/routes/admin.ts:798`).
- `setSql` in `server/routes/admin.ts:670` — column names come from an object the handler builds from its own code, and the values are passed as `...Object.values(columns)` to bound parameters.

**Verdict:** no user-controlled string reaches SQL text. This is a code-review conclusion supported by `inventory.test.ts > "survives SQL-shaped input without altering the schema or the data"`, not a claim that no injection bug *could* exist.

## 6. What is deliberately **not** claimed

- No limiter was proven at production traffic volume; the tests only prove a scripted run gets cut off.
- No OWASP ZAP/Burp/Nuclei scan, no fuzzing, no real brute-force attempt was performed.
- No screen-reader or real-device attack surface test; no physical/session hijack test.
- TLS, WAF, hosting hardening, firewall rules and OS patching are **outside this codebase** and unreviewed.
- The `unsafe-inline` in `styleSrc` is required by React's inline `style` attributes; `imgSrc https:` is required because product image URLs may be remote. Both are **accepted, documented trade-offs**, not oversights.

## 7. Secrets and supply chain

- No `sk_live`, `AKIA`, bearer tokens or inline passwords in `server/`, `src/` or `scripts/` (the only match was a user-facing validation sentence in `src/pages/Register.tsx:40`). `tests/**` deliberately contains fixture log-ins (`TestOwner#2026`, `Shopper#2026`, …) that exist only against the `:memory:` databases each suite builds and discards — the brief asks for test accounts, and these are not credentials for anything real.
- **One real exception, found in the audit's own writing and corrected:** `BUG_REGISTER.md` briefly printed the fixed password of the developer database's owner account, and a read-only `bcrypt.compareSync` check proved that password still authenticates it. The value is deleted from every file in the tree (`grep -rn` over the shipped directories returns nothing), the account itself was left for the owner to rotate (**A-13**, defect **B-29**), and no database ships in the archive. A secret-scanning gate in CI is the permanent fix, and there is no CI yet (§8.1).
- `.env` exists locally, holds no real credentials (`SMTP_URL`/`SMTP_FROM` are empty), and is listed in `.gitignore` along with `data/*.db*`.
- `.gitignore` also excludes `dist/`, `dist-server/`, `test-results/`, `qa-shots/`, and — since this round — `_qa/shots/`, `_qa/*.log`, `_qa/vitest.json` and `uploads/`, so the ignore list matches the release archive's exclusion list. Those logs are the reason: before the masking change they carried `Set-Cookie` values from a throwaway fixture session, and an unignored evidence file is a file that gets committed and pasted.
- Nothing in the shipped archive depends on a private npm package.
- **The brief's rule "never store API secrets… in source control" is currently satisfied — but there is no source control to violate, which is a different problem (§8.1).**

## 8. Residual risks, ranked

1. **No version control and no backup automation** — the highest-probability security-adjacent loss here. A single `data/sree.db` on one Windows disk, with no history and no tested restore, means an operator mistake or a disk failure is an unrecoverable business event. → `OWNER_ACTION_REQUIRED.md` A-11, A-12.
2. **Deployment checklist risk** — `COOKIE_SECURE=false`, `APP_ORIGIN=http://localhost:5175`, `NODE_ENV` unset and CSP disabled are all *correct locally and wrong in production*. Nothing in the code refuses to boot in production with a non-HTTPS `APP_ORIGIN`. → A-9, and `RELEASE_READINESS.md` §3 gate 4.
3. **A developer admin credential was published, then redacted** — the local database's owner account still answers to the password this audit's register used to print (§7, defect **B-29**). The value is gone from the tree and no database ships, so nothing is exposed to a shopper; the residual risk is the account itself, which outlives the document until it is rotated. → **A-13** / `RELEASE_READINESS.md` §3 gate 9.
4. **Email transport absent** — the order confirmation the customer relies on exists only as an outbox row and an on-screen invoice. Until SMTP is configured and a real send is observed, "everything goes via email" is not true. → `INTEGRATION_STATUS.md` §3.
5. **No staff 2FA, no lockout** — a staff password is currently the only gate on customer PII and on price editing. Cost-12 bcrypt plus a 10/15-min credential limiter makes online guessing slow, not impossible. Recommended before any card-payment launch.
6. **Unreviewed business claims** — `publicProfile` rating/years are displayed as facts with no source (`AUDIT_BASELINE.md` §4). That is a compliance exposure rather than an exploitable bug. → A-7.
7. **Origin check only fires when an `Origin` header is present** — a non-browser client may omit it. This is defence-in-depth behind the double-submit token, which an off-origin page cannot read; recorded for completeness, not as a defect.

## 9. Verdict

**Security status: implemented controls are verified; the deployment and recovery layers are not.**

Nothing in this audit produced an exploitable open finding in the application code. All previously confirmed injection, XSS, disclosure, tampering and authorization defects are fixed with named regression checks (14 pinned by a vitest assertion, 10 by an executed probe — `BUG_REGISTER.md` §E). The genuine remaining security exposure is operational: backups, production configuration values, email transport, staff authentication strength, and the one developer login that B-29 redacted but only the owner can retire.
