# Test results

**Project:** Sree Collections storefront + API (`D:\SreeCollections\store`)
**Date of every run below:** 2026-10-26
**Environment:** Windows 10.0.26300 x64 · Node v24.19.0 · npm 12.0.2 · Chrome through `playwright-core@1.64.1` · database `node:sqlite`
**Rule followed:** nothing is reported as passed here unless the command was actually executed and the log was kept. Failures, flakes and not-tested areas are listed in the same document as the passes.

---

## 1. Command matrix

| # | Command | What it covers | Result | Log |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | `tsc -p tsconfig.json --noEmit` + `tsc -p tsconfig.server.json` | **exit 0**, no diagnostics | `_qa/final-typecheck.log` |
| 2 | `npm test` | 9 vitest files, 124 tests (unit + API against `:memory:` databases) | **124 passed / 0 failed**, 13.62 s, exit 0 | `_qa/final-tests.log` |
| 3 | `npm run build` | Vite client build + `tsc` server build | **exit 0**, 52 JS chunks, 1 stylesheet, 9 woff2 | `_qa/final-build.log` |
| 4 | `npm run e2e` | boots the real server on :4137 and drives the full buy path in Chrome | **27 PASS**, exit 0 | `_qa/final-e2e.log` |
| 5 | `node _qa/run-checks.mjs _qa/a11y-check.mjs _qa/visual-check.mjs` | **112 accessibility assertions** + 26 visual surfaces against a **production-mode** server on :4181, booted on a freshly seeded fixture database | **FAILURES 0 / ERRORS 0**, both exit 0 | `_qa/release-browser-checks.log` |
| 6 | `node _qa/prod-probe.mjs` | 20 production response/header probes (cache, CSP, 404/401/403/413, secret-path exposure) on a seeded fixture database | **exit 0**, results in §5 | `_qa/release-prod-probe.log` |
| 7 | `node _qa/perf-check.mjs` | Core Web Vitals on the built bundle: 3 throttled profiles × 4 pages × cold/warm, API latency, and a **12-measurement layout-shift budget assertion** | **exit 0** (`BENCH=0`, `CLS BUDGET FAILURES 0`), numbers in `UX_ACCESSIBILITY_PERFORMANCE_AUDIT.md` | `_qa/release-perf.log` |
| 8 | `node _qa/cls-probe.mjs` + `QA_CLS_PROFILE=4g node _qa/cls-probe.mjs /` | per-shift layout-shift attribution + 60 ms frame trace, on `/product/:slug` (slow 3G) and `/` (4G) | **product CLS 0.000** (0.383 before the fix); **home 4G CLS 0.067** attributed to one shift | `_qa/release-cls-probe.log`, `_qa/cls-home-4g.log`, `_qa/cls-probe.log`, `_qa/cls-probe-after.log` |
| 9 | `npm audit --omit=dev` | production dependency tree only | **found 0 vulnerabilities** | console (dev tree not asserted) |
| 10 | extract `sree-collections-store-2026-10-26.zip`, diff it against the working tree, then `npm ci` && `npm run typecheck` && `npm test` && `npm run build` && `npm run e2e` **inside the extracted copy** | the release artifact itself, not the working directory | **identical file-for-file**; `npm ci` 269 packages; typecheck exit 0; **124 passed / 0 failed**; build exit 0; **27 PASS**, exit 0 | `_qa/release-archive-tests.log`, `_qa/release-archive-build.log` |
| 11 | `node _qa/run-checks.mjs _qa/prod-probe.mjs _qa/a11y-check.mjs _qa/visual-check.mjs` **inside the same extraction** | that the shipped QA harness can provision and drive its own environment on a machine that has never run the store (B-27) | **20 probes exit 0** · **112 `PASS` + `FAILURES 0`** · **26 AUDIT rows + `ERRORS 0`** · `RUN_CHECKS_EXIT=0` · the `data/` directory is empty afterwards | `_qa/release-archive-browser.log` |

Total executed checks this round: **124 unit/API tests + 27 e2e + 112 a11y + 26 visual + 20 production probes + 12 CLS budget assertions = 321**, plus the benchmark, the shift traces, and the same 112 + 26 + 20 run a second time from inside the unpacked release archive (§1 row 11). The archive re-run repeats checks rather than adding to the 321; its value is that it was executed somewhere the dev database had never existed.

Two log prefixes appear below and the difference is deliberate. `_qa/final-*.log` are the runs taken earlier in the audit against the developer database (`npm test`, `typecheck`, `build` and `e2e` were not affected by the harness change and are quoted from those runs). `_qa/release-*.log` are the later runs taken after every browser harness was made self-provisioning, and they are the canonical numbers for the browser checks, the production probe, the benchmark and the shift trace — because they are the ones a clean unpack can reproduce. `_qa/release-archive-*.log` are the same commands re-executed from inside the unpacked release ZIP rather than from `D:\SreeCollections\store`; they are a second, independent confirmation and are not double-counted in the §1 total.

---

## 2. Unit tests (30 tests, no server, no database)

`tests/unit/pricing.test.ts` — **21 passed** — this is the money file; it proves `buildQuote()` is the only source of totals.

| Group | Tests | Named coverage |
| --- | --- | --- |
| shipping zones | 8 | configured local zone + estimate · free-delivery threshold against goods total · malformed PIN rejected · **any valid PIN served by the all-India zone** · pan-India free above threshold · specific zone preferred over the fallback · inactive zones ignored · `unserviceable` when no active zone covers the PIN |
| cart pricing | 13 | selected variant price, not the product headline · gift wrap per unit + free delivery above threshold · no wrap charge when the product does not offer it · percentage coupon applied before delivery and allocated to the line · coupon minimum subtotal enforced · free-delivery coupons · fixed coupons capped and never below zero · per-email redemption limit · unpublished items excluded with a reason · missing variant and over-stock flagged · empty cart returns an empty quote with a clear issue · **exclusive tax added to the payable total when configured** · COD disabled above the configured value |

`tests/unit/orders.test.ts` — **9 passed**

| Group | Tests | Named coverage |
| --- | --- | --- |
| order status transitions | 4 | documented forward path only · skipping stages and leaving terminal states blocked · cancellation before dispatch / return after dispatch · every declared status reachable in the transition map |
| restocking | 2 | product stock returned with an auditable movement · variant stock returned when the order used a variant |
| checkout helpers | 1 | cart lines carry the stock needed for a valid order |
| order numbers | 2 | well-formed, ambiguity-free and unique across a batch · carry the generation date |

---

## 3. API tests (94 tests, real Express app + `:memory:` SQLite per suite)

Each suite boots its own app instance because the eight rate limiters are per-app; `tests/helpers.ts:createTestDb()` opens `:memory:` so no test can touch `data/sree.db`.

### `tests/api/flows.test.ts` — 25 passed

| Group | n | Highlights |
| --- | --- | --- |
| public API | 7 | health does not present integrations as verified · **crawlers get real `robots.txt`/`sitemap.xml`, not the app shell** · unpublished products kept out of the sitemap · unknown non-HTML paths answer 404 instead of the storefront · only the published catalogue is served · state-changing request without CSRF refused · untrusted origin refused |
| cart and pricing | 7 | priced from the database, browser prices ignored · variant required and stock respected · gift wrap blocked where not offered · personalisation required and only allow-listed fields stored · local **and** pan-India quotes, remote order placed · unserviceable PIN reported · real coupons applied and removed |
| checkout | 5 | online payment rejected without taking money · terms and address validated · **COD order placed with server totals, stock decremented, bag cleared** · repeated checkout key idempotent, no double stock decrement · **COD handling fee stored so every printed total reconciles** (B-22) |
| accounts and roles | 4 | guest bag merged on registration with admin areas still closed · order moved through valid statuses, COD marked paid on delivery · stock restocked on cancellation and audited · finance role reads the summary but cannot change status |
| content | 2 | newsletter consent required and recorded once · policies published from configured settings without inventing payment support |

### `tests/api/security.test.ts` — 19 passed

| Group | n | Highlights |
| --- | --- | --- |
| transport hardening | 4 | missing CSRF token **and** foreign origin refused · API responses uncacheable + `nosniff` + session cookie flags · **oversized body → 413, not a server fault** (B-21) · registration body cannot assign a staff role |
| authentication storage | 2 | only a bcrypt hash and a hashed session token are stored · logout destroys the session and the stale cookie is rejected |
| cross-customer authorization | 4 | another customer's order/invoice/tracking/cancellation hidden · order number + order email treated as the lookup capability · addresses and returns scoped to the owner · every admin area closed to signed-out visitors and customers |
| server-side pricing integrity | 6 | every injectable price/discount/status field ignored · a coupon **named** at checkout is refused · COD order above the ceiling refused · **priced from the database after an admin change, not from the saved cart** (`SECURITY_AUDIT_RESULTS.md` §3) · malformed/negative/excessive quantities rejected · a variant belonging to a different product cannot be attached |
| coupon abuse | 3 | **coupon codes too short to guess are refused** (B-20) · discount cap with exact arithmetic · a scripted code-probing run is rate-limited |

### `tests/api/admin.test.ts` — 16 passed

| Group | n | Highlights |
| --- | --- | --- |
| admin catalogue | 2 | draft product with a variant created then published · stock adjusted, variant never taken below zero |
| admin commerce controls | 4 | coupon created and applied to a real cart, duplicates rejected · delivery zone created and actually quoted to shoppers · pending review stays private until staff approve · refund requires a note and is recorded against the order |
| admin settings and roles | 4 | public listing profile validated and published · WhatsApp number stored and order-message preferences validated · order message attempts recorded and invoice PDFs served · scoped staff roles kept inside their own areas |
| admin partial edits | 6 | one product field changed **without resetting the rest of the record** (B-17) · product unpublished from the storefront and put back · variant list replaced with the stock change logged and a reused SKU rejected · category created then hidden · coupon retired without changing terms · zone fee edited without resetting terms |

### `tests/api/inventory.test.ts` — 12 passed

| Group | n | Highlights |
| --- | --- | --- |
| inventory under pressure | 5 | **last unit sold once, never oversold, never negative** (B-18) · admin stock adjustment and a concurrent purchase do not overwrite each other · two variant adjustments applied against the stored number · admin adjustment below zero refused · one idempotency key yields one order |
| return and refund state machine | 3 | refund recorded once, second refund refused · rejected → refunded jump blocked · repeated status is a no-op, not a second event |
| stored content | 3 | SQL-shaped input cannot alter schema or data · hostile gift text escaped in the server-rendered invoice · personalization keys held to the allow-list |
| fault injection | 1 | a failing database returns a generic envelope, never a stack trace |

### `tests/api/gift.test.ts` — 7 passed

Card message typed on the product page reaches the order · wrap + engraving + card message printed on the invoice and in **both** emails · hostile gift text escaped in the invoice and in the emailed copies · card message visible to the shopper as well as to staff · an unreadable personalization row still opens the order · staff offered exactly the transitions the server allows · build and environment details kept out of public responses.

### `tests/api/customer.test.ts` — 12 passed

Account profile (3): profile updated and invalid details rejected · password changed, other devices signed out, old password refused · **no password-reset email promised while no provider is configured** (B-19). Saved addresses (1). Wishlist (1). Reviews (1): held until staff approve, never shown as a fake rating. Returns (2): only after delivery, eligible item, once per item; refused while the policy is off. Support tickets (2): saved for the staff inbox and closable by staff; the support inbox kept out of customer accounts. Cancellation (1). Coupon limits (1): second use by the same email blocked and the total usage cap enforced.

### `tests/api/lifecycle.test.ts` — 3 passed

A status the fulfilment ladder has not reached is refused · a repeated status does not restock twice · the ladder is walked end to end, COD marked paid, event trail kept.

---

## 4. Browser checks

### `npm run e2e` — 27 PASS (`_qa/final-e2e.log`)

Health + DB · integrations reported as not configured · home renders · registration signs the shopper in · shop lists live catalogue · product page opens · add-to-bag opens the drawer · checkout validates the configured PIN · **checkout quotes pan-India delivery with a fee and estimate** · COD order placed and confirmed · **confirmation is honest about email delivery** (no claim of a sent email) · zone + estimate shown · **HTML and PDF invoice offered** · **WhatsApp handoff shown** · **WhatsApp opens with the prepared order message** · order visible in the account · guest tracking with the checkout email · owner signs in · admin confirms and the timeline records it · admin message log visible · admin opens the invoice PDF · admin catalogue lists products · no horizontal overflow in mobile admin · no horizontal overflow in mobile storefront · mobile drawer opens · mobile drawer closes on Escape · **no browser console or page errors**.

### Accessibility — 112 checks, 0 failures (`_qa/release-browser-checks.log`)

Every row below was counted out of the log itself, not from the script source.

| Check family | n | What it proves |
| --- | --- | --- |
| WCAG contrast sweep | 7 (one per page) | weakest ratio on every page 4.55:1, **0 runs below AA** |
| Heading order never skips a level | 20 pages | e.g. `/shop` 21 headings, `/gift-finder` 17, `/checkout` 10 |
| Exactly one `<main>` | 13 | including `/admin`, `/admin/orders`, `/admin/products` |
| Exactly one visible `<h1>` | 13 | same 13 surfaces |
| Skip link resolves to a `<main>` | 13 | `Skip to content → #main` |
| **Skip link becomes visible on focus** | **13** | every swept surface, not just `/admin` (was 1 check; see `BUG_REGISTER.md` B-28) |
| Checkout error wiring: `aria-invalid` | 6 | name, email, phone, recipient, ship-phone, PIN |
| Checkout error wiring: `aria-describedby` reaches the message | 6 | e.g. `checkout-name-error -> "Enter your name"` |
| Checkout error wiring: error is announced | 6 | live-region text present |
| Empty checkout submit raises errors | 1 | 8 field errors |
| Every checkout control has an accessible name | 1 | violations list `[]` |
| Field is focusable | 1 | `#contact-name` |
| Focus-indicator contrast ≥ 3:1 | 1 | halo 3.21:1, border 10.92:1 |
| Placeholder contrast | 2 | `/shop` 5.48:1, `/` 9.26:1 |
| Cart drawer labelled | 1 | `aria-label="Shopping bag"` |
| `prefers-reduced-motion` honoured | 1 | media query `honoured=true`; of 29 animated nodes **0 still above 20 ms** — Chrome reports the override as `1e-05s` |
| 200 % zoom (640 px layout viewport) | 3 | `/`, `/product/…`, `/checkout` all show `scroll == client` |
| 320 px reflow (WCAG 1.4.10) | 3 | same three pages, `scroll == client` |
| Test bag filled through the public API (harness prerequisite) | 1 | 201 + 200 |
| **Total** | **112** | FAILURES 0 |

The zoom checks replaced an attempt at `Emulation.setTextZoom`, which this Chrome build does not implement (`Protocol error: 'Emulation.setTextZoom' wasn't found`); measuring the equivalent layout viewports is what the criterion actually constrains, so no coverage was lost.

### Visual / responsive — 26 surfaces, 0 errors

12 desktop surfaces at 1440 px and 14 mobile/narrow surfaces at 390 px and 360 px, each recorded for horizontal overflow and page height. Every row reads `overflow=no`. Heights measured post-fix include the reserved skeleton space.

---

## 5. Production-mode response probes (20, exit 0)

Run against the built server with `NODE_ENV=production` on an isolated copy of the local database (`data/prod-probe.db`, deleted afterwards).

| Probe | Status | Note |
| --- | --- | --- |
| `GET /` storefront shell | 200 | `cache-control: no-cache`, full CSP, `nosniff`, HSTS, `referrer-policy: no-referrer` |
| `GET /assets/<hashed>.js` | 200 | `public, max-age=31536000, immutable` |
| `GET /assets/index-*.css` | 200 | same immutable policy |
| `GET /images/products/rose-keepsake-box.svg` | 200 | `public, max-age=86400` |
| `GET /favicon.svg` | 200 | the icon the HTML actually declares |
| `GET /favicon.ico` | 404 | legacy fallback hit; answers the JSON 404 envelope, harmless |
| `GET /shop?category=birthday` | 200 | SPA fallback with `no-cache` |
| `GET /this-page-does-not-exist` | 200 | client route, correct for a SPA |
| `GET /robots.txt` | 200 | `public, max-age=3600`, real robots content with `Sitemap:` line |
| `GET /sitemap.xml` | 200 | `public, max-age=3600`, published products only |
| `GET /api/v1/health` | 200 | integrations labelled by honesty, see below |
| `GET /api/v1/content/site` | 200 | |
| `GET /api/v1/nothing-here` | 404 | structured `ENDPOINT_NOT_FOUND` |
| `GET /.env` | 404 | **secret file not served** |
| `GET /../data/sree.db` | 404 | **database not reachable through static serving** |
| `GET /api/v1/admin/orders` signed out | 401 | |
| `POST /api/v1/cart/items` without CSRF | 403 | |
| `POST /api/v1/auth/register` forged origin | 403 | |
| `POST /api/v1/content/newsletter` oversized | 413 | |
| `GET /api/v1/orders/SC-00000000-000000?email=probe@example.invalid` | 404 | generic, does not leak which half failed |

`/api/v1/health` reports `onlinePayments: "not_configured"`, `email: "not_configured"`, `courier: "not_configured"` and `routeDistance: "not_configured"` in the probe run, because the probe blanks every provider environment variable. The labels change meaning, not just value: a key present without an adapter now reads `configured_no_adapter`, and only SMTP — the one sender that exists in this build — can ever read `configured_unverified` (B-24). Setting a key therefore enables nothing and is never reported as working.

---

## 6. Honest limitations of this test evidence

* **The suite is flaky under machine pressure, and that was reproduced once.** An earlier `npm test` in this round printed `Test Files 7 passed (9)` / `Tests 100 passed (124)` with two unhandled errors: `Worker exited unexpectedly with exit code 134` while running `tests/api/customer.test.ts` and `tests/api/inventory.test.ts`. At that moment 23 `chrome.exe` and 10 `node.exe` processes were alive from prior QA runs. No source changed between that run and the 124/124 run recorded in §1 (19:31 → 19:33). **Diagnosis is "resource exhaustion in the harness", not a product defect — but it is a diagnosis, not a proof.** Nothing was deleted, skipped or re-expected to get the green run; exit code 134 is SIGABRT from the V8/OS allocator, and the two files that died are the two heaviest (`customer` 11.3 s, `inventory` 7.0 s). If it recurs on a quiet machine it must be treated as a real defect.
* **API latency is localhost, 9 samples per route, single request in flight.** It shows the SQLite + Express path is not the bottleneck (medians 4–9 ms, `POST /cart/items` 201 in 9 ms) and says nothing about concurrency, cold-cache or remote-database behaviour.
* **No test runs the payment, courier, route or email adapters, because none ship.** Every integration statement in this repository is therefore negative ("not configured", "no adapter") and is pinned by a test so it cannot silently claim success.
* **No screen-reader matrix.** The a11y suite is a DOM/contrast/focus inspection. `aria-live` presence and label reachability were verified programmatically; whether NVDA/VoiceOver announce the checkout errors in a usable order was not tested.
* **No real device.** Chrome CPU (4×) and network throttling emulate a low-end phone; it is an emulation, not a measurement on hardware the store's customers actually hold.
* **No visual regression baseline.** The visual check asserts overflow and height; it does not diff pixels against an approved design, so a styling regression that stays inside the viewport would not be caught.
* **No load, soak, or chaos test** beyond the single in-process database-fault injection.
* **The browser numbers were re-taken on seeded fixture data, and they moved.** Until the harness change described in B-27, every browser check copied `data/sree.db` — the developer database — so the measurements depended on rows that are not in the release artifact. Re-running on the seeded fixture changed the slow-3G home LCP from 5 892 ms to 6 356 ms and the product LCP from 10 456 ms to 10 732 ms (roughly ±8 %). The home-page 4G shift of 0.067 was present in both runs and had already been reported as a number; what the re-run added was the *cause*, because `_qa/cls-probe.mjs` can now be pointed at any page and profile (`_qa/cls-home-4g.log`). The fixture numbers in `_qa/release-*.log` are the ones quoted from here on.
* The `.env`-dependent behaviours (secure cookies, real `APP_ORIGIN`, live SMTP) were exercised only with `COOKIE_SECURE=false` and `SMTP_URL=""`, which is the honest local state.

---

## 7. Reproducing every number in this document

```bash
cd /d/SreeCollections/store
npm ci
npm run typecheck
npm test
npm run build
npm run e2e
node _qa/run-checks.mjs _qa/a11y-check.mjs _qa/visual-check.mjs
node _qa/prod-probe.mjs
node _qa/perf-check.mjs
node _qa/cls-probe.mjs                                   # /product/:slug on slow 3G
QA_CLS_PROFILE=4g node _qa/cls-probe.mjs "/"             # home on the 4G profile
```

`_qa/run-checks.mjs` builds a throwaway seeded database (`_qa/fresh-db.mjs`), boots the built server on :4181 against it, creates a one-run staff account, and hands the browser scripts `QA_BASE` plus `QA_OWNER_EMAIL` / `QA_OWNER_PASSWORD`. `_qa/prod-probe.mjs` (:4178), `_qa/perf-check.mjs` (:4179) and `_qa/cls-probe.mjs` (:4180) seed their own fixture databases the same way and delete them on exit. **None of the five reads or writes `data/sree.db`**, so every number above reproduces on a machine that has never run the store before — the requirement that motivated this change is recorded as `BUG_REGISTER.md` B-27. The scripts need `npm run build` first (they test the built output, not the dev server) and Chrome; set `CHROME_PATH` if it is not at the default location. The exact block above was run a second time in a directory that had only ever contained the unpacked ZIP — §1 row 11 is that run's log — so these commands are evidence, not instructions the audit never tried.
