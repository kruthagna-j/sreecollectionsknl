# Sree Collections

A complete, self-contained gift-store e-commerce platform: React storefront, Express API, SQLite database, customer accounts, staff admin, pan-India COD checkout, HTML/PDF invoices, order-message outbox, WhatsApp handoff and automated tests.

The store is built to be honest about what is and is not connected. Cash on delivery works end to end. Online payments and courier booking are **not configured**. Order email is implemented but stays off until real SMTP credentials are supplied; the WhatsApp handoff is click-to-chat and sends nothing by itself. Before presenting this as a live shop, read the [verdict](docs/RELEASE_READINESS.md) (currently **NOT READY**, with the owner-only inputs listed in [Owner action required](docs/OWNER_ACTION_REQUIRED.md)), the [master feature matrix](docs/MASTER_FEATURE_MATRIX.md) and [Known limitations](docs/KNOWN_LIMITATIONS.md).

---

## Stack

| Layer | Technology |
| --- | --- |
| Storefront | React 19, TypeScript, Vite, React Router, TanStack Query |
| Styling | Hand-written CSS (layered), local Cormorant Garamond + Manrope fonts, SVG artwork |
| API | Express 5, Zod validation, bcrypt, Helmet, rate limiting |
| Database | SQLite via Node's built-in `node:sqlite` (`DatabaseSync`), WAL mode |
| Tests | Vitest (unit + HTTP integration), Playwright-core (browser end-to-end) |

No cloud services, external CDNs or remote fonts are required at runtime.

## Requirements

- **Node.js 22.5 or newer** (the database uses the built-in `node:sqlite` module). Tested on Node 24.
- npm 10 or newer.
- Windows, macOS or Linux. The current checkout lives at `D:\SreeCollections\store`.

## Quick start

```bash
cd D:/SreeCollections/store
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run dev
```

- Storefront: http://localhost:5175
- API: http://localhost:4000
- Health: http://localhost:4000/api/v1/health

In development the API creates `data/sree.db` and seeds the demo catalogue automatically when the database is empty. The seed contains 12 published gift products, 6 categories, sample variants, a Kurnool local zone (518001–518999, ₹49, free above ₹2,500, 1–2 days) plus an all-India fallback (₹99, free above ₹1,999, 4–7 working days) and store settings. It does **not** create orders, payments, reviews or testimonials.

### Create the first staff account

No code path creates a default administrator, and nothing ships a database, so an install has no login until you make one. **One exception lives in your local development database only:** `data/sree.db` carries an early owner account whose fixed password appeared in an audit document before it was redacted (`docs/BUG_REGISTER.md` B-29). Rotate it, or start production on a freshly seeded database, before the first real order — the steps are `docs/OWNER_ACTION_REQUIRED.md` **A-13**.

```bash
npm run admin:create -- --email you@example.com --name "Store Owner" --role owner
```

The command prompts for a password of at least 12 characters with a letter and a number. The password is hashed with bcrypt and is never written to a file, log or seed. Email and name come only from the `--email` / `--name` flags or the interactive prompts — no environment variable supplies them. Setting `ADMIN_PASSWORD` in the environment lets you run the command without the password prompt.

Roles: `owner`, `admin`, `catalogue`, `orders`, `support`, `finance`. `owner` and `admin` pass every staff permission check; the other roles are scoped (see [Security](docs/SECURITY.md)).

Staff sign-in is at **`/login?next=%2Fadmin`** (`/admin` redirects there). The storefront footer and mobile menu also link to it as **Staff sign in**.

### Connect order email and WhatsApp

Order email is off by default and says so on the storefront. To enable it, set a real SMTP account in `.env`:

```dotenv
APP_ORIGIN=https://your-public-domain.example
SMTP_URL=smtp://user:password@host:587
SMTP_FROM="Sree Collections <orders@yourdomain.com>"
```

Restart the API, place a test order and confirm the customer and owner messages arrive with the invoice PDF. The admin order page shows each attempt; a failed send can be retried there. Use a verified sending domain (SPF/DKIM/DMARC) before launch.

For the WhatsApp handoff, the seeded store number is `919494498937`; sign in as owner and open **Admin → Settings → Store** to change it, then open **Order messages** to choose the owner email and whether the confirmation page may auto-open WhatsApp. No WhatsApp API credentials are involved: the button opens `wa.me` with the message and invoice link prewritten.

### Optional development coupon

A development-only coupon can be seeded explicitly:

```bash
npm run db:seed -- --with-dev-coupon
```

It creates `DEVWELCOME` (10% up to ₹200, minimum ₹999). It is **not** part of the production seed and must never be enabled on a live store.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | API + Vite dev server together |
| `npm run dev:api` | API only, port 4000 |
| `npm run dev:web` | Storefront only, port 5175 |
| `npm run build` | Type-checked production build (`dist/` + `dist-server/`) |
| `npm start` | Serve the API and built storefront from one process |
| `npm run typecheck` | TypeScript for frontend and server |
| `npm test` | Vitest unit and API integration suites |
| `npm run e2e` | Production-build browser flow with Playwright |
| `npm run db:seed` | Seed catalogue/settings into an empty database |
| `npm run admin:create` | Create a staff account interactively |

`npm run e2e` requires the app to be built first (`npm run build`) and Chrome installed at the path configured in `tests/e2e.mjs`. It starts its own server on port 4137 with a temporary database and cleans up afterwards.

The deeper browser checks live in `_qa/`. Each one boots the **built** server in production mode against its own seeded fixture database, so none of them reads or writes `data/sree.db` and none of them needs a developer database to exist first:

| Command | What it measures |
| --- | --- |
| `npm run build && node _qa/run-checks.mjs _qa/a11y-check.mjs _qa/visual-check.mjs` | Accessibility assertions and screenshot/overflow surfaces |
| `npm run build && node _qa/prod-probe.mjs` | Production response matrix: headers, caching, 404/401/403/413, secret-path exposure |
| `npm run build && node _qa/perf-check.mjs` | Core Web Vitals under throttled CPU/network profiles, plus API latency |
| `npm run build && node _qa/cls-probe.mjs` | Layout-shift trace with the elements responsible for each shift |

The checks create a throwaway staff account and receive its address and password through `QA_OWNER_EMAIL` / `QA_OWNER_PASSWORD`; those values are never printed. Set `CHROME_PATH` if Chrome is not at the default path.

The `_qa/*.log` files are captured evidence, not part of the project: they are excluded from the release archive and safe to delete. Any number quoted in `docs/` is regenerated by the four commands above plus `npm test` and `npm run e2e` — `docs/TEST_RESULTS.md` §7 lists them in order, and that list was itself executed inside an unpacked copy of the archive.

## What works today

Verified by the automated suites and browser checks recorded in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) (the 2026-10-26 round; [docs/TEST_REPORT.md](docs/TEST_REPORT.md) is the earlier 2026-10-24 run and is kept for history):

- Catalogue with categories, search, filters, sorting, pagination, product detail, variants, stock, related products and gift finder.
- Guest cart persisted in an HttpOnly cookie, merged into the account cart on sign-in.
- Server-authoritative pricing: prices, discounts, coupon eligibility, gift-wrap fees, shipping fees, GST allocation and COD limits are all recalculated from the database. Browser-submitted prices are ignored.
- PIN-code serviceability and delivery charges from admin-configured zones, with an all-India fallback so every valid Indian PIN can be quoted.
- Coupons with minimum spend, caps, date windows, usage limits, per-email limits and first-order-only rules.
- Cash-on-delivery checkout with idempotency, stock reservation/decrement, coupon redemption, order events, invoice HTML/PDF and tracking lookup.
- Order invoices by email to the customer and owner (with PDF attachment) once SMTP is configured, an admin message log with manual resend, and a WhatsApp click-to-chat handoff with the order details and invoice link prewritten.
- Customer account: profile, addresses, wishlist, orders, cancellation, return requests, verified-purchase review submission.
- A compact landing page: hero, trust strip, category chips, featured gifts and a visit card. Store facts (rating, years, locality) are owner-entered and shown without an external directory link.
- Staff admin: dashboard, products, variants, images by URL, stock adjustments with audit trail, categories, orders and status workflow, order messages, coupons, delivery zones, settings (including public facts and WhatsApp), review moderation, support tickets, returns, customers, audit log.
- Role-based navigation and API authorization, CSRF protection, origin checks, rate limits and hardened headers.
- Responsive storefront and admin verified at 1440 px, 390 px and 360 px widths with no horizontal document overflow.

Not available or not verified:

- Online payments (the option is disabled; the API returns `503 PAYMENT_PROVIDER_UNAVAILABLE`).
- Email delivery until `SMTP_URL` and `SMTP_FROM` are supplied and tested. Without them, orders record a `not_configured` row and password recovery returns `503 EMAIL_NOT_CONFIGURED`.
- Automated WhatsApp/SMS messages. WhatsApp is a click-to-chat handoff the customer must send.
- Courier booking / automatic tracking scans (staff can paste a real tracking number and https link).
- Google route distance, analytics, sitemap/robots generation for a real domain.

## Project layout

```
store/
├─ src/                 React storefront, account and admin UI
│  ├─ pages/            Route components (lazy loaded)
│  ├─ components/       Layout, cart drawer, forms, UI primitives
│  ├─ context/          Auth, cart, site settings, toasts
│  ├─ lib/              API client, types, formatting, hooks
│  └─ styles/           CSS layers: tokens, base, components, storefront, commerce, account, admin, responsive
├─ server/              Express API
│  ├─ routes/           auth, catalog, cart, checkout, account, admin, content
│  ├─ lib/              pricing, shipping, orders, auth, invoice, catalog, audit
│  ├─ db.ts             Schema and migrations
│  ├─ seed-data.ts      Development catalogue and settings
│  └─ app.ts            Middleware, routes, static serving, error envelope
├─ scripts/             create-admin.ts
├─ tests/               test helpers, unit tests, API flow tests, Playwright e2e
├─ public/              Favicon, SVG product artwork
├─ docs/                Architecture, API, security, operations and reports
└─ data/                SQLite database (git-ignored; never shipped)
```

## Configuration

Copy `.env.example` to `.env`. The only required value in production is an explicit `APP_ORIGIN`.

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables CSP, secure cookies by default and static serving |
| `PORT` | `4000` | API port |
| `APP_ORIGIN` | `http://localhost:5175` | Allowed browser origin and canonical links; must be exact in production |
| `DATABASE_PATH` | `./data/sree.db` | Use an absolute path outside the release directory in production |
| `COOKIE_SECURE` | `true` in production | Set `false` only for local plain-HTTP production testing |
| `ADMIN_*` | empty | Used only by `npm run admin:create` |
| Provider keys | empty | Presence only changes a capability label; no provider adapter is implemented |

Never commit `.env`, a database file or real credentials. `.gitignore` already excludes them. Set `NODE_ENV` in the process environment for production, not in `.env`: Vite reads that file during `npm run build` and would bundle React's development runtime.

## Production run

```bash
npm ci
npm run build
NODE_ENV=production \
APP_ORIGIN=https://your-real-domain.example \
DATABASE_PATH=/var/lib/sree-collections/sree.db \
COOKIE_SECURE=true \
npm start
```

The server serves `dist/` and the API from one port. Place it behind HTTPS. On first production start the database is created empty; run `npm run db:seed` if you want the demo catalogue, then edit products and settings in the admin area. Seed data is sample content, not a real catalogue.

## Testing

```bash
npm run typecheck
npm test
npm run build
npm run e2e
```

The suites cover pricing and coupon arithmetic, shipping zones, order transitions and restocking, CSRF/origin rejection, server-side price authority, stock enforcement, checkout and idempotency, tracking and invoice authorization, role boundaries, review and newsletter rules, plus a full browser purchase flow. Exact results and evidence are in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) — 321 executed checks, including a run taken from inside an unpacked copy of the release archive.

## Documentation

**Read these first if you are deciding whether to launch** — they are the 2026-10-26 audit round and they disagree with nothing below, but they are the current word:

- [Release readiness](docs/RELEASE_READINESS.md) — the verdict (currently **NOT READY**) and the nine pre-launch gates
- [Owner action required](docs/OWNER_ACTION_REQUIRED.md) — the thirteen inputs only the shop can supply
- [Master feature matrix](docs/MASTER_FEATURE_MATRIX.md) — every feature with its status taxonomy and the evidence behind it
- [Bug register](docs/BUG_REGISTER.md) — 29 defects, what was fixed, and what is still open
- [Security audit results](docs/SECURITY_AUDIT_RESULTS.md) · [Financial and order logic audit](docs/FINANCIAL_AND_ORDER_LOGIC_AUDIT.md) · [Integration status](docs/INTEGRATION_STATUS.md)
- [UX, accessibility and performance audit](docs/UX_ACCESSIBILITY_PERFORMANCE_AUDIT.md) · [Test results](docs/TEST_RESULTS.md) · [Repair changelog](docs/REPAIR_CHANGELOG.md) · [Audit baseline](docs/AUDIT_BASELINE.md)

**Reference documents** (written before that round; still accurate for how the code is put together, and each is superseded where the audit quotes a different number):

- [Architecture](docs/ARCHITECTURE.md) — request flow, modules, order lifecycle, performance decisions
- [Database and ER diagram](docs/DATABASE.md) — tables, relationships, money rules, migrations
- [API reference](docs/API.md) — endpoints, roles, payloads, error codes
- [OpenAPI 3.1 specification](docs/openapi.yaml) — 66 documented paths
- [Security](docs/SECURITY.md) — controls, threat model, deployment checklist
- [Integrations](docs/INTEGRATIONS.md) — provider status and what must be built before enabling
- [Operations](docs/OPERATIONS.md) — backup, restore, deployment and troubleshooting
- [Feature matrix](docs/FEATURE_MATRIX.md) — the 2026-10-24 completion snapshot
- [Test report](docs/TEST_REPORT.md) — the 2026-10-24 run
- [Known limitations](docs/KNOWN_LIMITATIONS.md) — what is intentionally absent

## Licence and content

This is a private client project. Product copy, images and settings are sample content for development and must be replaced with the store's real catalogue before launch. No real customer data, payment credentials or production database is included.
