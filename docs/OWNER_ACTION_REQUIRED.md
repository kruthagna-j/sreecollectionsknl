# Owner action required

**What this document is:** the list of things that stop this store from being *launched*, every one of which needs information, a decision, a credential or money that belongs to the business — not code. Nothing here is a bug. The code was made honest about each gap instead of papering over it.
**Why I could not fill these in myself:** the audit rules forbid inventing business information, policies, prices, tax rules, credentials or provider capabilities, and forbid claiming an integration works without testing it against a sandbox or a real authorized environment. So each item below states what is *measured today*, and then says exactly where to type the real value.
**Companion:** [RELEASE_READINESS.md](file:///D:/SreeCollections/store/docs/RELEASE_READINESS.md) — the launch verdict built on these thirteen items.

---

## 1. Summary

| ID | Item | Blocking level | Where it is set | Consequence today |
| --- | --- | --- | --- | --- |
| **A-1** | Transactional email (SMTP) | **LAUNCH BLOCKER** | `.env` → `SMTP_URL`, `SMTP_FROM` | No invoice email leaves the machine; the confirmation page says so honestly |
| **A-2** | Support contacts: email, phone, full address | **LAUNCH BLOCKER** | Admin → Settings → *Store details* | Footer/contact page show a name, locality and WhatsApp only |
| **A-3** | Owner order-notification email | **LAUNCH BLOCKER** | Admin → Settings → *Order messages* → "Owner email" | `sendOwnerEmail` is `true` but the recipient is `""`, so the owner copy has nowhere to go |
| **A-4** | Delivery fees, free-delivery thresholds, ETA windows | **BEFORE FIRST ORDER** | Admin → *Delivery zones* (`/admin/zones`) | ₹49 / ₹99 and "1–2 / 4–7 days" are placeholders published to shoppers |
| **A-5** | GSTIN, tax treatment, invoice series | **BEFORE FIRST ORDER** | Admin → Settings → *Tax* | Invoices print `GSTIN: not configured` and a visible "confirm with your accountant" disclaimer |
| **A-6** | Legal review of the five policy pages | **BEFORE FIRST ORDER** | Admin → Settings + the policy content | Stored text literally contains "Template policy… Legal review required." |
| **A-7** | "Since 1998 / 28 years / 4.4★ from 84 reviews" | **BEFORE FIRST ORDER** (truth-in-advertising) | Admin → Settings → *Storefront facts* | These claims are live on the home page with **no recorded source** |
| **A-8** | Real product photographs and catalogue content | **BEFORE FIRST ORDER** | Admin → *Products* / `ProductEditor` | Twelve items ship with vector placeholder art and seeded descriptions |
| **A-9** | Public origin, HTTPS, cookie security | **LAUNCH BLOCKER (deployment)** | `.env` → `APP_ORIGIN`, `COOKIE_SECURE`, plus hosting | `APP_ORIGIN` is a localhost value; session cookies are not `Secure`; invoice links point at localhost |
| **A-10** | Payment / courier / route-distance decision | **POST-LAUNCH, needs credentials** | `.env` keys + a development decision | Checkout refuses online payment with `503 PAYMENT_PROVIDER_UNAVAILABLE` by design; no courier booking |
| **A-11** | Version control | **P1 operational risk** | `git init` + a private remote | No history, no blame, no rollback; this changelog had to be reconstructed by hand |
| **A-12** | Backup and restore | **P1 operational risk** | Hosting/OS level | One SQLite file holds every order; no tested restore exists |
| **A-13** | Rotate the developer admin password | **BEFORE THAT DATABASE SERVES A CUSTOMER** | Admin → *Account* / `npm run admin:create` for a fresh owner, or a direct password change | `BUG_REGISTER.md` B-29: this audit's own register printed the fixed password of the `owner@sree.test` account in the local `data/sree.db`, and a read-only check proved the string still logs in. The value is now redacted everywhere and the archive ships no database, but the account itself is unchanged |

**Six items are launch blockers** (A-1, A-2, A-3, A-9 are hard; A-4, A-5, A-6, A-7, A-8 must be settled before the first real order is quoted to a customer). A-11 and A-12 are not launch blockers in law or in the product, but they are the two most likely causes of a future disaster. A-13 is a five-minute task that becomes irrelevant the moment you start production on a freshly seeded database, and critical the moment you don't.

---

## 2. How to reach the places named above

There is **no default administrator account created by the code and no shipped database to log into** — that is deliberate, and the audit verified it (`GET /api/v1/admin/orders` signed out → `401`, and admin routes are closed to customers in `tests/api/security.test.ts`). The one caveat is your own local `data/sree.db`, whose developer owner has a fixed password: see **A-13**. To get in on a fresh install:

```bash
cd /d/SreeCollections/store
npm run admin:create -- --email owner@sreecollections.in --name "Store Owner"
# the command prompts for a password: at least 12 characters, letter + number
npm run build && npm start        # then open http://localhost:4000/admin
```

The password is hashed with bcrypt and the session token is stored hashed; neither is written to a file or a log. `ADMIN_PASSWORD=…` in `.env` exists only to run the command non-interactively — if you use it, remove it afterwards and never commit it. Once signed in, the tabs referenced below are under **Admin → Settings** (*Store details*, *Order messages*, *Storefront facts*, *Tax*, *Gift wrap*, *Cash on delivery*, *Returns*, *Maintenance*, *Home content*) and **Admin → Delivery zones**.

---

## 3. The items in detail

### A-1 · Transactional email — LAUNCH BLOCKER
- **Measured today:** `SMTP_URL` and `SMTP_FROM` exist in `.env` but are **empty**, so `GET /api/v1/health` reports `email: "not_configured"`. The `e2e` check "confirmation is honest about email delivery" passes, which means the shopper is *not* told an email was sent.
- **Why this is yours:** an SMTP password is a credential. I cannot invent one, and a guessed provider would fail in production silently.
- **Do this:** pick a sender the business controls (Zoho Mail, Google Workspace, SMTP2GO, Brevo, or the Kurnool ISP's relay are all common choices for a small Indian shop — this is a choice for you, not a recommendation I can verify). Then in `.env`:
  ```
  SMTP_URL=smtp://username:password@smtp.example.com:587
  SMTP_FROM=Sree Collections <orders@yourdomain.com>
  ```
  URL-encode any special characters in the password. `SMTP_FROM` must be the address the provider has verified, or every message will be rejected or land in spam.
- **Then verify:** place one test order with a test address you own. Admin → the order → *message log* must show a **sent** (not "queued"/"failed") row for the customer and, once A-3 is done, for the owner. `node _qa/prod-probe.mjs` should then print `email: "configured_unverified"` — and only after a real send should anyone call email "working".
- **Do not** mark the store as launch-ready on the strength of the code being correct. The rule the audit followed: an integration is not working until it has been tested against the provider.

### A-2 · Support contacts — LAUNCH BLOCKER
- **Measured today (verbatim from `data/sree.db`):** `supportEmail: ""`, `supportPhone: ""`, `address: "Gandhi Nagar, Kurnool"` (locality only — no house or street line), `supportWhatsApp: "919494498937"`, and `closesAt: "21:30"` in the listing profile.
- **Why:** customers need a way to reach a human when a parcel is wrong, and Indian e-commerce listings are expected to show a real address and phone. Only you know the shop's phone, email and door number.
- **Do this:** Admin → Settings → **Store details** → fill support email, support phone, and the full address line (house/street, then locality, city, PIN). Keep the WhatsApp number as `919494498937` if that is still the business line.
- **Then verify:** `/contact` and the footer must show the values, and `GET /api/v1/content/site` must return them. (`_qa/a11y-check.mjs` already proves the contact form field is focusable and correctly labelled — it cannot judge whether the phone number is right.)

### A-3 · Owner notification address — LAUNCH BLOCKER
- **Measured today:** `notifications = { sendCustomerEmail: true, sendOwnerEmail: true, ownerEmail: "", whatsappAutoOpen: true }`. The recipient field is empty while the switch is on, so the owner copy of every order has no destination.
- **Do this:** Admin → Settings → **Order messages** → "Owner email" → enter the address the shop actually reads (this may be the same as A-2's support email). If nobody reads email, set `sendOwnerEmail` to off **and** keep the WhatsApp handoff — do not leave a switch promising something that has nowhere to go.
- **Then verify:** with SMTP configured (A-1), one test order must produce two logged sends. `tests/api/gift.test.ts > "prints the wrap, the engraving and the card message on the invoice and in both emails"` already proves the *content* of both emails is right; only the destination is missing.

### A-4 · Delivery fees and delivery promises — BEFORE FIRST ORDER
- **Measured today:** two zones are live and quoted to shoppers — *Local delivery (Kurnool)* `518001-518999`, **₹49**, free above **₹2,500**, estimated **1–2 days**; *All India delivery* `100000-999999`, **₹99**, free above **₹1,999**, estimated **4–7 days**. Cash on delivery is enabled with a **₹10,000** order ceiling and a **₹0** handling fee; gift wrap is **₹99**.
- **Why:** these are money and promises. The code quotes exactly what is stored, so a wrong number here is a wrong number on the shopper's total — the audit proved the arithmetic, not the business.
- **Do this:** Admin → **Delivery zones** → confirm or correct each fee, threshold and ETA window; check the PIN ranges against the areas you actually deliver to. Then Settings → **Cash on delivery** (ceiling and any handling fee) and Settings → **Gift wrap** (₹99 is a guess). If you set a COD fee above zero, the invoice, PDF, both emails and the WhatsApp text now print a "Cash-on-delivery handling" line — that path is regression-tested (`tests/api/flows.test.ts`).
- **Then verify:** Settings → *Storefront facts* is separate from this; here the check is a real quote. Use the PIN you actually serve: `GET /api/v1/catalog/delivery/check?pincode=<PIN>` from a browser, or add one item and read the cart total.
- **Note for pan-India:** remote areas (Northeast, J&K, island territories) often need a different courier or a longer ETA than "4–7 days". The zone ranges accept **all** Indian PINs; whether *you* can fulfil them is a business judgement, and it is the single most common cause of COD returns.

### A-5 · GST, tax presentation and invoice series — BEFORE FIRST ORDER
- **Measured today:** `tax = { inclusive: true, defaultRateBps: 500, note: "…Confirm tax classifications and GST registration with the business before launch." }` — i.e. prices are shown as GST-inclusive at 5 %. Both invoice formats print **`GSTIN: not configured`** and a visible line: *"This document is generated by the store's own system. Confirm GSTIN, tax rates and invoice numbering with your accountant before using it as a statutory tax invoice."*
- **Why:** tax classification, registration status and invoice numbering are legal facts about the business. A 5 % inclusive rate is a plausible placeholder for a gift shop, not a determination.
- **Do this:** with your CA — Settings → **Tax** → enter the GSTIN (the schema allows up to 20 characters, the standard 15-character GSTIN fits), the state, whether the presentation is inclusive or exclusive, and the rate (0–28 %). Ask specifically: is the shop registered, does it need HSN codes per line, and is a sequential invoice number series required? **The application currently numbers orders `SC-<date>-<random>` and has no statutory invoice series** — if your CA requires one, that is a feature request, not a setting.
- **Then verify:** download an invoice PDF for a test order and read the GSTIN line and the disclaimer. If the disclaimer is still printed, the value has not been settled.

### A-6 · Legal review of the policy pages — BEFORE FIRST ORDER
- **Measured today:** the stored returns setting reads `note: "Template policy. Personalised items are excluded. Legal review required."`, window **7 days**, and `/policies/privacy`, `/policies/shipping`, `/policies/returns`, `/policies/terms`, `/policies/gift-wrap`, `/policies/personalisation` are generated from settings.
- **Why:** a return window, a privacy policy and delivery terms are legal representations to consumers (and India has consumer-protection and, for personal data, DPDP Act obligations). A template is not advice.
- **Do this:** have counsel or a competent adviser read those six pages against how you actually operate — including whether personalised items really cannot be returned, and how long you keep customer addresses. Then correct the settings text so the "Legal review required" note is no longer true.
- **Then verify:** the pages must no longer display the template warning, and the returns window must match what staff actually accept (the code enforces `windowDays` — `tests/api/customer.test.ts > "opens a return only after delivery, for an eligible item, once per item"`).

### A-7 · The "Since 1998 / 28 years / 4.4★ from 84 reviews" claims — BEFORE FIRST ORDER
- **Measured today:** `publicProfile = { rating: 4.4, ratingCount: 84, yearsInBusiness: 28, locality: "Gandhi Nagar, Kurnool", closesAt: "21:30", sourceName: "", sourceUrl: "" }`, and `store.tagline = "Since 1998"`. They are rendered on the home page and in the announcement bar. **`sourceName` and `sourceUrl` are empty — no source is recorded for any of these numbers.**
- **Why:** these came from a public business listing used only as a *data source* for building the site. Publishing a star rating and review count as the shop's own claim — or a founding year the owner cannot evidence — is exactly the kind of thing the audit rules forbid inventing, and now it is live.
- **Do this (choose one, per number):** confirm it and set `sourceName`/`sourceUrl` to where it can be checked; or set the field to blank so it stops rendering; or restate it as provable ("Serving Gandhi Nagar since 1998" only if 1998 is correct). Settings → **Storefront facts**. Note that **reviews on this site are held until staff approve them** (`tests/api/customer.test.ts`), so the storefront rating and the store's own reviews are different claims.
- **Then verify:** the home page must show either a sourced figure or nothing. The audit will not confirm these numbers on your behalf.

### A-8 · Real photographs and catalogue content — BEFORE FIRST ORDER
- **Measured today:** 12 published products, 48 images — all of them generated **SVG illustrations** served from `/images/products/*.svg` (1.6 kB each), with descriptions and SKUs from the seed script. All 48 carry descriptive alt text.
- **Why:** shoppers buy gifts by looking at them. Placeholder art is honest as a placeholder and misleading as a product photo.
- **Do this:** for every real SKU, Admin → **Products** → **Edit** → replace the image, price, stock, variants, whether gift wrap is offered and whether personalisation is required. Keep alt text descriptive — the audit measures it and screen readers depend on it. Delete or unpublish any seeded product you do not actually sell; the sitemap only lists published items, so unpublished ones stop being crawled.
- **Then verify:** `node _qa/perf-check.mjs` **must be re-run after the photographs go in** — real JPEGs will change every number in [UX_ACCESSIBILITY_PERFORMANCE_AUDIT.md](file:///D:/SreeCollections/store/docs/UX_ACCESSIBILITY_PERFORMANCE_AUDIT.md) §2, and possibly push the product page out of the "good" Core Web Vitals band. Ask for photos sized for the web (roughly 1 200 px on the long edge, compressed) rather than camera originals.

### A-9 · Public origin, HTTPS and cookie flags — LAUNCH BLOCKER (deployment)
- **Measured today:** `.env` carries a localhost `APP_ORIGIN` and `COOKIE_SECURE=false`; `_qa/final-prod-probe.log` therefore shows `robots.txt`'s `Sitemap:` line and the health payload pointing at `http://localhost:…`. Invoices link back through `APP_ORIGIN`.
- **Why:** the domain is the business's to own, and secure cookies must only be set over TLS or sessions break.
- **Do this:** buy/point the domain, terminate TLS at a reverse proxy (or let the host do it), then set `APP_ORIGIN=https://<your-domain>` and `COOKIE_SECURE=true`, and run with `NODE_ENV=production`. Serve over HTTP/2 if the host offers it — it is also the cheapest performance win (see §2.8 of the UX audit).
- **Then verify:** `curl -I https://<domain>/robots.txt` shows the real domain in the `Sitemap:` line; the session cookie in the browser is flagged `Secure`; `GET /api/v1/health` returns `status: "ok"`. Then submit the sitemap in Google Search Console — indexing has **not** been verified by this audit because there was no public origin to verify against.
- **Constraint recorded during the audit:** no deployment, no DNS change and no live-infrastructure change was made. Publishing is yours to authorise.

### A-10 · Payments, courier booking, route-distance pricing — POST-LAUNCH
- **Measured today:** `RAZORPAY_*`, `SHIPROCKET_*` and `GOOGLE_ROUTES_API_KEY` are read **only** to label capability. No adapter exists in the repository, so `GET /api/v1/health` says `onlinePayments: "configured_no_adapter"` (and would say it even with real keys set), and checkout answers every online-payment attempt with `503 PAYMENT_PROVIDER_UNAVAILABLE`.
- **Why this is a decision, not a bug:** the store model you asked for is **COD-first**, and it works end-to-end today (order placed → invoice → WhatsApp handoff → tracking → admin fulfilment). Cards/UPI, courier pickup and distance-based delivery fees are each a project with credentials, a sandbox, webhook handling and money-mismatch rules.
- **Do this, in order, when you want them:** (1) get a Razorpay account and **test keys**; (2) decide whether you want the adapter written *and* a staging place to test it; (3) courier: an account with Shiprocket or a local contract; (4) route pricing: a Google Cloud key with Routes API enabled. Setting the keys alone changes nothing — that is deliberate, so nobody believes a feature is live because an environment variable exists.
- **Then verify:** an integration is only reportable as working after a **sandbox** transaction is visible in both the provider's dashboard and this store's order record. Not before.

### A-11 · Put the project under version control — P1 operational risk
- **Measured today:** neither `D:\SreeCollections` nor `store` is a Git repository. The audit had to reconstruct [REPAIR_CHANGELOG.md](file:///D:/SreeCollections/store/docs/REPAIR_CHANGELOG.md) from file timestamps and reading code, because there is no diff, no history and no rollback point. The only baselines that exist are two ZIPs — `sree-collections-store-2026-10-24.zip` and the 2026-10-26 artifact described in `RELEASE_READINESS.md` §6 — and a ZIP cannot be diffed, reverted or bisected.
- **Do this:** `git init`, then use `.gitignore` to keep `node_modules`, `data/*.db*` and `.env` **out** of history (verify `.gitignore` covers all three before the first commit — the audit rules forbid committing secrets or real customer data; the file already ships in the tree and covers them), create a **private** remote, and push. Then tag the release so the next audit has a baseline.
- **Then verify:** `git log --oneline | head` shows the baseline, and `git status` is clean. A private remote matters: this tree contains the shop's business rules.

### A-12 · Backup and a tested restore — P1 operational risk
- **Measured today:** all orders live in one SQLite file (`data/sree.db`, WAL mode). Nothing in the repository schedules or verifies a backup.
- **Do this:** nightly copy of `data/` (with the `-wal` and `-shm` files, or take the copy through `VACUUM INTO`) to a second location the shop controls; keep at least 30 days; document who does it and where the file goes.
- **Then verify:** restore the newest copy into a spare `DATABASE_PATH`, boot the server against it and open one old order. **A backup that has never been restored is a hope, not a backup.** No destructive command (`reset`, `migrate --force`, deleting the file) was ever run against `data/sree.db` during this audit.

### A-13 · Rotate the developer admin password — five minutes, and it closes B-29
- **Measured today:** `data/sree.db` holds 2 accounts (1 owner, 1 customer, bcrypt `$2b$12$` hashes). A read-only `bcrypt.compareSync` check proved that the fixed password the audit's own `BUG_REGISTER.md` used to print still authenticates the owner row. That value has been deleted from every file in the tree, the release archive ships **no** database, and no other document or log quotes it — but the account itself was left untouched, because changing a working password is not a reviewer's call.
- **Do this:** either start production on a freshly seeded database (`npm run db:seed` into a new `DATABASE_PATH`) and create the owner with `npm run admin:create`, which prompts for a password and writes it nowhere; or, if you intend to keep this database, sign in as that owner and change the password from **Admin → Account** before the first real order. Then delete or archive any copy of the interim ZIPs built before 21:40 today, which carried the quoted value. **Nothing on this machine still carries it:** `D:\SreeCollections` now holds only the 2026-10-24 archive and the current 2026-10-26 one, and the staged file set for the current archive was searched before packing (`grep -rl` over all 182 files → 0 hits). Copies you took elsewhere — Downloads, a mail attachment, a USB stick — are the ones to hunt.
- **Then verify:** the old string no longer logs in — `POST /api/v1/auth/login` with it returns `401 AUTH_FAILED`, and the new one returns a session. If you switched to a fresh database, confirm `SELECT role, COUNT(*) FROM users GROUP BY role` shows only the accounts you created on purpose.

---

## 4. What the audit deliberately did **not** do

* No real email, WhatsApp message, SMS, payment, refund or courier shipment was made; no customer was contacted. The confirmation screen therefore describes its own limits honestly rather than claiming a send.
* No **real** secret, key or provider credential value was written into any file, report or log — `.env` keeps its empty placeholders, the harness generates its one-time staff password in memory, and `_qa/prod-probe.mjs` now masks every cookie value it prints. Two exceptions were found in this audit's own output and are recorded rather than hidden: the register briefly quoted the developer database's admin password (B-29 / **A-13** above), and probe logs before the masking change carried ephemeral `sc_csrf` values from a throwaway fixture session. Neither reaches a customer as a usable login: the password value is deleted from the documents in the shipped archive, the probe logs are not in the archive at all, and no database ships with it.
* No business fact was invented to make a page look finished: `ownerEmail`, `supportEmail`, `supportPhone`, GSTIN and the sourcing of the rating/years claims remain empty or flagged because only the shop can state them.
* No deployment, DNS or hosting change; no destructive migration or database reset.
* The Justdial listing was used **only** as a data source while building the site: `sourceName` and `sourceUrl` are blank and no link or branding to it ships in the storefront.

## 5. Minimum set before a customer can place a real order

A-1, A-2, A-3, A-9 (blockers) **plus** A-4, A-5, A-6, A-7 (correct the numbers and claims a shopper is shown) **and** A-8 for any product you actually sell. That is nine of the thirteen. A-13 is five minutes and belongs in the same sitting as A-9. A-10 is post-launch; A-11 and A-12 are operational duties that should start the same week.
