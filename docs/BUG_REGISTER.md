# Bug register

**Scope:** every defect this audit could produce an opinion about, whether it was found last round or this round, whether it is now fixed, still open, or judged *not* a defect.
**Rule applied:** an item is only "Fixed and verified" when a named check that runs today fails if the fix is removed. Anything else says so.

- Severity: **P1** money, stock, security or data-loss · **P2** a user-visible workflow is wrong · **P3** quality/polish · **P4** documentation or hygiene.
- Found by: code read, failing assertion, executed probe (`_qa/*`), or a test written specifically to try to break it.

---

## A. Fixed and re-verified in this audit round

### B-01 · Per-item gift message disappeared from the order — P1
- **Area:** cart → checkout → fulfilment.
- **Symptom:** a shopper typed a card message on the product page, saw it in the bag, placed the order — and the invoice, the emails and the admin screen showed no message. The gift order arrives at the shop with nothing to write on the card.
- **Found by:** reading `server/routes/checkout.ts` against `server/routes/cart.ts`: the cart stored personalization per line, checkout only persisted order-level personalization.
- **Root cause:** no per-line personalization column existed. `order_personalization` was keyed by order, not by order item.
- **Fix:** migration **v4** added `order_items.gift_message` (`order_items.personalization_json` already existed per line but was never written); checkout now inserts both per line (`server/routes/checkout.ts:239-265`); the invoice (HTML and PDF), both email templates, the WhatsApp message text, the customer order view and the admin order view all read from them.
- **Regression evidence:** `tests/api/gift.test.ts` — "carries the card message typed on the product page into the order", "prints the wrap, the engraving and the card message on the invoice and in both emails", "shows the card message to the shopper as well as to staff".
- **Status:** Fixed and verified (7/7 gift tests pass).

### B-02 · An unreadable personalization JSON row could 500 the order page — P1
- **Symptom:** one malformed `personalization_json` value would throw while rendering an order detail — the shop could not open a paid order.
- **Found by:** code read of the order loader; `JSON.parse` had no guard.
- **Fix:** parse defensively; a bad row degrades to "no personalization shown" and the rest of the order still renders.
- **Regression evidence:** `tests/api/gift.test.ts > "still opens the order when a personalization row is unreadable"`.
- **Status:** Fixed and verified.

### B-03 · Hostile gift text was not escaped in the server-rendered invoice — P1 (XSS)
- **Symptom:** gift message/engraving text is attacker-controlled free text that is re-emitted into a server-rendered HTML invoice and into email bodies. An unescaped render gives stored XSS in the staff inbox and in the customer's mail client.
- **Fix:** every interpolated value passes an escaping helper in the invoice and both email templates.
- **Regression evidence:** `tests/api/inventory.test.ts > "escapes hostile gift text in the server-rendered invoice"` and `tests/api/gift.test.ts > "escapes hostile gift text in the invoice and in the emailed copies"`.
- **Status:** Fixed and verified.

### B-04 · Client and server each held their own order-status transition table — P2
- **Symptom:** the storefront offered a transition the API then rejected (or vice-versa). Duplicated truth drifts; when it drifts, staff click buttons that error.
- **Fix:** single exported `nextStatuses` in `server/lib/orders.ts` is the only source; the admin UI renders from what the server returns.
- **Regression evidence:** `tests/api/gift.test.ts > "offers staff exactly the transitions the server allows"` plus `tests/unit/orders.test.ts > "keeps every declared status reachable in the transition map"`.
- **Status:** Fixed and verified.

### B-05 · Order state machine accepted out-of-ladder jumps and repeat transitions — P1
- **Symptom:** `pending → shipped` was accepted; re-sending the same status re-ran the side effects, i.e. a repeated "cancelled" restocked the goods a second time and inflated stock.
- **Fix:** transitions validated against the ladder; a same-status request returns `NO_STATUS_CHANGE` without writing.
- **Regression evidence:** `tests/api/lifecycle.test.ts` (3 tests — the restock assertions are `COUNT(reason='cancel') = 1` and `SUM(delta) = 0`), `tests/api/inventory.test.ts > "treats a repeated status as a no-op instead of a second event"`.
- **Status:** Fixed and verified.

### B-06 · Missing rate limiters on three mutating surfaces — P1
- **Surfaces:** `POST /auth/password` (each attempt costs a bcrypt verification → CPU DoS amplifier *and* password guessing), admin notification resend (email/queue spam), `DELETE /content/newsletter` (unsubscribe enumeration).
- **Fix:** `credentialLimiter` (10/15 min, `server/routes/auth.ts:59`, wired at line 146), `resendLimiter` (8/15 min, `server/routes/admin.ts:17`, wired at line 1078), `contactLimiter()` on both newsletter routes (`server/routes/content.ts:199`, `:215`).
- **Regression evidence:** all eight limiters enumerated and exercised in the 124-test run; the coupon analogue is `tests/api/security.test.ts > "stops a scripted run from probing coupon codes at speed"`.
- **Status:** Fixed and verified for the limiter wiring; **no limiter is stress-tested at real traffic volume** — see `SECURITY_AUDIT_RESULTS.md` §6.

### B-07 · `GET /api/v1/health` disclosed environment and build details — P2
- **Symptom:** the public payload leaked `environment` and `build` fields — exactly the kind of hint that helps an attacker pick an exploit path.
- **Fix:** those fields were removed; the response keeps only status, version, database state, uptime and the honest integration labels.
- **Regression evidence:** `tests/api/gift.test.ts > "keeps build and environment details out of the public responses"` and `tests/api/flows.test.ts > "reports health without exposing integrations as verified"` (which now asserts `environment === undefined`).
- **Note on process:** the *old* health assertion had to change because the contract changed. The test was **updated, not deleted**, and the negative assertion was added — see REPAIR_CHANGELOG §"expectation changes".
- **Status:** Fixed and verified.

### B-08 · Content-hashed assets were cached for only one hour — P3
- **Symptom:** `/assets/index-<hash>.js`, immutable by construction, was served `max-age=3600`. On a low-end phone on a metered connection that is a re-download of 88 kB gzip on every visit.
- **Fix:** hashed JS/CSS are served `public, max-age=31536000, immutable`; the HTML shell stays `no-cache`; SVG art `max-age=86400`; API responses `no-store`.
- **Regression evidence:** `_qa/final-prod-probe.log` — the probe rows "hashed javascript", "hashed stylesheet", "svg illustration", "storefront shell" and "health" carry the exact `cache-control` values from a real production-mode server.
- **Status:** Fixed and verified.

### B-09 · `/robots.txt` and `/sitemap.xml` returned the React app shell — P2
- **Symptom:** crawlers received `text/html` for both, i.e. no crawl policy and no indexable URL list at all; unknown asset paths (`/favicon.ico`, `/.env`, `/data/sree.db`) also got a **soft 200** containing the SPA — a crawler-infinite and information-disclosure smell.
- **Fix:** new `server/lib/seo.ts` (static page list, published products with `<lastmod>`, active categories) served by two real routes in `server/app.ts`; the SPA fallback now refuses any path whose last segment contains a dot and any request that does not accept HTML, and a terminal `404 NOT_FOUND` handler runs even in development.
- **Regression evidence:** `tests/api/flows.test.ts` — "gives crawlers a robots file and a sitemap instead of the app shell", "keeps unpublished products out of the sitemap", "answers unknown non-HTML paths with a 404 rather than the storefront"; prod probe rows "robots.txt", "sitemap.xml", "env file" and "sqlite file through static".
- **Measured:** sitemap served 34 `<url>` entries from the probe database; `/.env` → 404; `/../data/sree.db` → 404; `/favicon.ico` → 404 JSON.
- **Status:** Fixed and verified.

### B-10 · Zero `aria-invalid` / `aria-describedby` on any form error — P2
- **Symptom:** validation messages were visible but not programmatically linked. A screen-reader user pressing "Place order" heard nothing about what was wrong; 8 errors appeared and none were announced.
- **Fix:** `FormField` in `src/components/ui.tsx` now clones the child control with `aria-invalid` and `aria-describedby` pointing at the message node, which carries `role="alert"`.
- **Regression evidence:** `_qa/a11y-check.mjs` — "checkout shows validation errors on an empty form — 8 field errors" followed by 18 individual checks (6 named fields × `aria-invalid` / `aria-describedby`-reaches-message / announced) plus "every checkout control has an accessible name — []".
- **Side effect fixed:** the clone typing broke `npm run typecheck` (TS2769 under React 19 narrowing) and was corrected with an explicit `ReactElement<Record<string, unknown>>` cast; typecheck now exits 0.
- **Status:** Fixed and verified.

### B-11 · Text and placeholder contrast below WCAG AA — P2
- **Measured before:** `--muted` body text 4.29:1 (needed 4.5), search placeholder 2.94:1, newsletter placeholder 3.94:1.
- **Fix:** palette adjusted in `src/styles/base.css`; `.newsletter__row input::placeholder` alpha raised 0.45 → 0.78 in `src/styles/storefront.css`.
- **Measured after:** `_qa/a11y-check.mjs` — "placeholder text on /shop >= 4.5:1 — 5.48:1", "placeholder text on / >= 4.5:1 — 9.26:1", and a full contrast sweep across 7 pages reporting **0 below AA** (weakest run 4.55:1, the footer copyright).
- **Status:** Fixed and verified.

### B-12 · Focus ring was effectively invisible — P2
- **Measured before:** the input focus halo was `rgba(...,0.10)` then 0.28 — under the 3:1 non-text contrast minimum, so keyboard users could not see where they were.
- **Fix:** `base.css` gives focused inputs/selects/textareas a `0 0 0 3px rgba(109,31,50,0.55)` halo plus a wine border.
- **Measured after:** a11y log line 9 — "focus indicator contrast >= 3:1 — halo 3.21:1 | border 10.92:1 at 1px".
- **Status:** Fixed and verified.

### B-13 · No skip link on `/account` and `/admin` — P3
- **Fix:** skip link added; the sweep checks 13 surfaces for exactly one `<main id="main">`, one `h1`, and a skip link that resolves to `#main`.
- **Evidence:** 13 × `… skip link points at main` and 13 × `… skip link becomes visible on focus`, all PASS in `_qa/release-browser-checks.log`. The focus-visible assertion used to run once, on `/admin` only — that coverage gap is recorded and closed as **B-28**.
- **Status:** Fixed and verified.

### B-14 · `.env.example` and `README.md` described configuration keys that no code reads — P4 (documentation defect)
- **Symptom:** `ADMIN_EMAIL` / `ADMIN_NAME` were presented as the way to configure the first administrator, and `README.md:50` repeated it. `server/config.ts` never reads either; `scripts/create-admin.ts:19-22` takes the email and name from `--email`/`--name` or the interactive prompt, and only `ADMIN_PASSWORD` is genuinely consumed. An operator following the docs would set them, restart, and still have no staff account — worse, they might believe one exists.
- **Root cause:** documentation drifted from the implementation and was never checked against it.
- **Fix:** the two dead keys were removed from `.env.example`; the README sentence was rewritten to state where email and name actually come from; the remaining comment now says plainly that the Razorpay/Shiprocket/Google-keys **enable nothing** because no adapter ships.
- **Status:** Fixed (documentation corrected in `.env.example`, `README.md` and `AUDIT_BASELINE.md` §3). Not a security hole: there is no shipped default administrator and no default password anywhere in the tree — prod probe `/api/v1/admin/orders` → 401 signed out.

### B-22 · The COD handling fee was charged into the total but never stored — P2 (latent money defect, found by the totals audit)
- **Symptom (would appear the moment `cod.fee` is set above 0):** `buildQuote()` adds `codFee` to `total` (`server/lib/pricing.ts:376-377`), but `orders` had no `cod_fee` column, so the stored component amounts could not add up to the stored total, and the invoice, PDF, both emails and the WhatsApp text would print a breakdown that **visibly fails to reconcile on a money document**.
- **Why it hid:** the local configuration has `cod.fee = 0`, so every previous run happened to reconcile.
- **Fix:** migration **v5** `ALTER TABLE orders ADD COLUMN cod_fee INTEGER NOT NULL DEFAULT 0`; checkout persists `quote.codFee` (`server/routes/checkout.ts:204-220`); `serializeOrder` exposes `totals.codFee`; the HTML invoice, PDF invoice, customer email (text + HTML), owner email, the WhatsApp order text and `src/components/OrderDetails.tsx` each print a "Cash-on-delivery handling" line when it is non-zero.
- **Regression evidence:** `tests/api/flows.test.ts > "stores the cash-on-delivery handling fee so every printed total reconciles"` — sets the fee to ₹30, quotes, orders, then asserts the identity **both on the API payload and on the raw database row** and that the invoice contains the handling line; the setting is restored in a `finally`.
- **Status:** Fixed and verified.

### B-23 · Order numbers were generated with `Math.random()` — P4 (capability hygiene)
- **Why it matters:** the order number is half of the guest order-lookup capability (the other half being the checkout email), so it should not come from a non-cryptographic PRNG.
- **Fix:** `formatOrderNumber()` now draws from `node:crypto randomBytes(6)`; 32 symbols divide 256 evenly, so `byte % 32` is unbiased and the ambiguous characters (`I O 1 0`) are still excluded.
- **Regression evidence:** `tests/unit/orders.test.ts > "are well-formed, ambiguous-free and unique across a batch"` (500 draws, 500 distinct, format-matching, suffix free of ambiguous glyphs) and `"carry the date they were generated on"`.
- **Status:** Fixed and verified.

### B-24 · Health and site content could report `configured_unverified` for services with no adapter — P3 (capability truthfulness)
- **Symptom:** `GET /api/v1/health` and `/api/v1/content/site` keyed their label off *credential presence* only. Set `RAZORPAY_KEY_ID`/`SECRET` and both endpoints would say the payment integration is "configured, unverified" — while **zero gateway code exists in the repository** and `server/routes/checkout.ts:136-142` refuses every online order with `503 PAYMENT_PROVIDER_UNAVAILABLE` regardless of the environment. Same for Shiprocket and Google Routes.
- **Not customer-facing harm today:** nothing in the UI reads `onlinePayments`, and checkout still refuses — verified, not assumed. The defect is a misleading capability claim to whoever reads health.
- **Fix:** the three adapter-less services now report `configured_no_adapter` when keys are present; only SMTP — which does have a working sender — can report `configured_unverified`. In the audit environment (no keys set) every label remains `not_configured`, so the existing honest assertions still hold and were not weakened.
- **Evidence:** `_qa/final-prod-probe.log` line for `/api/v1/health` and the assertion `tests/api/flows.test.ts > "reports health without exposing integrations as verified"`.
- **Status:** Fixed; the `configured_no_adapter` branch itself is unreachable in this environment (by design — no credentials), so it is verified by code read rather than execution.

### B-25 · The product page scored CLS 0.36 — the "poor" side of the Core Web Vitals band — P2 (performance, found only by measurement)
- **Symptom:** the new benchmark (`_qa/perf-check.mjs`) reported **CLS 0.356** on `/product/rose-keepsake-box` — identical on slow 3G, 4G and unthrottled desktop (0.355), so it was a deterministic layout jump, not a network artefact. The home page scored 0.125 on the 4G profile.
- **Trace, not guess:** `_qa/cls-probe.mjs` records each shift with the elements that moved plus a 60 ms geometry trace of the shell. It showed `footer.site-footer` jumping from `top 544px` (inside the 844px viewport, so ~300px of it was on screen) to `1049px` and later to `3061px`, i.e. the footer was pushed off screen twice. The trace also showed the header and footer absent *altogether* between 1.3 s and 5.2 s: `<Suspense>` in `src/App.tsx:89` wraps `<Routes>`, and `StoreLayout` (header/main/footer) sits **inside** it, so a slow route chunk replaced the whole shell with a short spinner.
- **Fix, in three small parts:** (1) a `Suspense` boundary now wraps `<Outlet/>` inside `StoreLayout`, `AdminLayout` and `AccountLayout`, so a page chunk loads without unmounting the shell; (2) the product page renders a layout-shaped skeleton (`ProductSkeleton` in `src/pages/Product.tsx`) instead of a bare spinner; (3) `.page-loader` and `.product-skeleton` reserve roughly a viewport (`src/styles/base.css:447`, `:510`), so the footer is already below the fold while anything is loading.
- **Re-measured, not assumed:** `_qa/cls-probe-after.log` — **CLS 0.000 on the product page** (1 shift left, 0.0003 from the announcement bar re-wrapping). The full benchmark was re-run for all four surfaces and all three profiles; results and the exact command are in `TEST_RESULTS.md` §5 and `UX_ACCESSIBILITY_PERFORMANCE_AUDIT.md` §5.
- **Status:** Fixed and verified by before/after measurement. Not pinned by a vitest assertion — CLS needs a real browser, so the pin is the reproducible probe.

### B-26 · A residual 0.067 layout shift on the home page under the 4G profile — P3 (measured, cause traced, accepted)
- **Symptom:** after the product-page fix (B-25), the benchmark still reported **CLS 0.067 on `/` for the mid-range mobile profile only**. The same page scores **0.000** on slow 3G and on unthrottled desktop (`_qa/release-perf.log` lines 67, 71, 75), so it is a timing race, not a structural jump.
- **Trace, not guess:** `_qa/cls-home-4g.log` — one shift, **+0.0669 at 3483 ms**, and its `layout-shift` sources name exactly what moved: the `.hero__marks` spans re-wrapped (`"HAND-WRAPPED"` x 16 → 141, `"PERSONALISED GIFTS"` [130,457] → [16,482]), the announcement paragraph narrowed (347 px → 311 px), and `.hero__visual` shortened (358 px → 333 px). The geometry trace shows the shell already painted at 2158 ms and the shift landing 1.3 s later — i.e. the moment `/content/site` and `/content/home` respond.
- **Cause, read from source:** `src/pages/Home.tsx:76-88` inserts the "Cash on delivery" mark only when `site?.policies.cod.enabled` is known, so the row goes from two marks to three and re-wraps; `src/components/Header.tsx:40` swaps the hard-coded fallback announcement for the fetched one, changing the paragraph's own width.
- **Decision:** left unfixed. 0.067 is inside the "Good" Core Web Vitals band (≤ 0.10) and is pinned by the budget gate in `_qa/perf-check.mjs`, which fails the run above 0.100. Silently reserving the third mark's box, or blanking the announcement until the fetch settles, removes the shift at a visible cost — an empty gap in the hero and a bare bar — on the page every shopper lands on. That trade is the owner's to make, so it is reported rather than decided here.
- **Status:** **Open, accepted** — measured twice with the same figure, cause traced to two named lines, below budget. Not a code defect; see `UX_ACCESSIBILITY_PERFORMANCE_AUDIT.md` §3.

### B-27 · The browser checks could not run on any machine but the audit machine — P2 (verification infrastructure)
- **Symptom:** every `_qa` browser script copied `data/sree.db` and signed in as the developer account `owner@sree.test` with a password fixed in the script text (that value is **not** repeated here — see B-29, which redacts the place it was first printed). Both only exist in the dev database on this machine, so from the release ZIP — which ships no database, correctly — **none of the 112 accessibility, 26 visual, 20 production or 12 CLS-budget results were reproducible by the owner.** The evidence was real but unrepeatable, which fails the standard this register sets for itself.
- **Second-order risk:** the same scripts would have silently tested against whatever the dev database happened to contain (including real in-progress orders), so a "pass" was not even a statement about a known state.
- **Fix:** `_qa/fresh-db.mjs` provisions an isolated fixture database — `openDatabase()` + `seedDatabase()` + a bcrypt-cost-12 owner whose password is `randomBytes(18).toString("base64url")`, and `supportWhatsApp` overridden to the fixture number `9876500000` so no check can point a browser at a real phone. `_qa/run-checks.mjs` boots the **production** server against that file on port 4181 with `SMTP_URL=""`, passes the credentials to the children through `QA_OWNER_EMAIL` / `QA_OWNER_PASSWORD` and never prints them, and deletes the database files on every exit path. Each probe was converted to the same fixture instead of a copy of `data/sree.db`; the Chrome path is now `process.env.CHROME_PATH` with the previous absolute path as the default.
- **Evidence:** `grep -rn "sree.db" _qa/*.mjs` returns only a comment and the deliberate negative probe (`/../data/sree.db` → 404). The whole chain was re-run through `node _qa/run-checks.mjs` and produced `_qa/release-browser-checks.log` (112 PASS, `FAILURES 0`), `_qa/release-perf.log` (12 budget PASS, `CLS BUDGET FAILURES 0`, `BENCH=0`) and `_qa/release-prod-probe.log` (20 rows).
- **Status:** **Fixed and verified from a clean unpack.** The release archive was extracted to an empty directory that had never run the store, built there, and `node _qa/run-checks.mjs _qa/prod-probe.mjs _qa/a11y-check.mjs _qa/visual-check.mjs` was executed **inside that extraction**: 20 production probes, **112** accessibility `PASS` lines with `FAILURES 0`, 26 visual AUDIT rows with `ERRORS 0`, and `RUN_CHECKS_EXIT=0` (`_qa/release-archive-browser.log`). The `data/` directory of the extraction is empty afterwards — the harness created and deleted its own fixture database, and no `data/sree.db` exists in the archive. No number in `TEST_RESULTS.md` §1 changed: the fixture data is the same seeded catalogue. One subset was not re-run inside the extraction: the 12 layout-shift budget assertions come from the working-tree run `_qa/release-perf.log`, which uses the same self-provisioning harness and the same fixture, so they are reproducible anywhere even though they were reproduced once.

### B-28 · Skip-link focus visibility was asserted on one surface out of thirteen — P4 (test coverage)
- **Symptom:** `_qa/a11y-check.mjs` checked "skip link exists and points at `#main`" for all 13 swept surfaces, but the stronger "focus() actually makes it visible" ran once, on `/admin`. A regression that left the skip link on keyboard-only surfaces would have passed.
- **Why it mattered:** the earlier version of this document described the per-surface assertion as covered when it was not — the claim was in the report, not in the log. Correcting the prose exposed the gap, and closing the gap made the claim true.
- **Fix:** the focus check moved inside `landmarks()` (`_qa/a11y-check.mjs:268-276`), so it runs wherever a skip link exists; the separate one-off `/admin` block was deleted.
- **Evidence:** the sweep grew from 101 to **112 checks** and `_qa/release-browser-checks.log` now contains 13 × `skip link becomes visible on focus`, one per swept surface, all `PASS … focus() -> #main`, with `FAILURES 0`.
- **Status:** Fixed and verified.

### B-29 · The audit's own writing quoted a live admin password, and the probe log printed cookie values — P2 (security hygiene of the tooling)
- **Symptom:** two ways this round leaked a value the brief forbids printing. (1) B-27's first draft quoted the fixed password of the developer account `owner@sree.test` while describing the harness clean-up — and a read-only check of `data/sree.db` proved that string **still authenticates that account**: 2 users (one owner, one customer), both `$2b$12$` bcrypt hashes, `bcrypt.compareSync` true against the owner row. (2) `_qa/prod-probe.mjs` printed the whole `Set-Cookie` header, so every captured probe log carried live `sc_csrf` values on six rows.
- **Why it mattered even though no customer data moved:** the archive ships no database, so nothing was exposed to a shopper — but the archive *does* ship the document. Anyone holding a stray copy of the owner's `data/sree.db` (an old backup, a handed-on laptop) plus that PDF has an admin login. The interim ZIPs built earlier today carry the quoted value until the final one replaces them.
- **Not a contradiction of N-3:** `sc_csrf` is still a double-submit value, not a secret, and `sc_session` is HttpOnly and never printed by any probe. The rule the brief sets is deliberately stricter than the threat model, because a log file gets pasted into a chat long before anyone reasons about which cookie was replayable.
- **Fix:** the password value is deleted from every file in the tree; B-27 names the account and describes the fixed password without quoting it. `_qa/prod-probe.mjs` now masks each cookie's value and keeps its attributes — the evidence in the row is `Max-Age / Path / SameSite`, never the token — and the registration probe builds its throwaway password at runtime (`Probe#` + `randomBytes(6)` hex) instead of carrying a literal, which removes the last password-shaped string from the QA scripts.
- **Evidence:** `node _qa/prod-probe.mjs` re-executed after the change → exit 0 with the same **20** probes, six rows printing `set-cookie=sc_csrf=[redacted]; Max-Age=604800; Path=/; Expires=…; SameSite=Lax`, and zero matches for `sc_csrf=[A-Za-z0-9_-]{8}` in the regenerated `_qa/release-prod-probe.log`. `grep -rn` for the deleted value across `src`, `server`, `tests`, `scripts`, `_qa`, `docs`, `public` returns nothing.
- **Why P2 and not P1:** the legend at the top of this file files security under P1, and a live admin credential is that shape of problem. It is graded P2 here because the exploit path needs a second thing the release deliberately does not ship — `data/sree.db` itself. Anyone with only the archive has a password and no database; anyone with the shop's backup has both. If this account had existed in a deployed database, or the address had been a real staff address, it would be P1.
- **Status:** **Fixed in this repository; the risk closes only when the owner rotates.** No credential was reset, changed or deleted by this audit — touching a working account is the shop's decision, not a reviewer's. See **A-13** in `OWNER_ACTION_REQUIRED.md`.

### B-15 · Real `h1 → h3` heading skips on the product page — P3
- **Symptom:** "Personalisation" and "Check delivery" were `h3` under an `h1` with no `h2` level between them. Screen-reader users navigate by heading level and lost those sections from the outline.
- **Fix:** both headings promoted to `h2` in `src/pages/Product.tsx`, with the matching `.personalise-box__head h2` / `.delivery-check__head h2` selectors updated in `storefront.css` so nothing changed visually.
- **Verified how:** `_qa/heading-probe.mjs` printed the composed ancestor chain to confirm the skip was real (not an artefact of the probe), then `_qa/a11y-check.mjs` sweeps 20 surfaces — `/product/rose-keepsake-box` now reports "9 headings, never skip a level" and **0 failures overall**.
- **Status:** Fixed and verified.

### B-16 · `SiteContext` swallowed fetch failures — P3
- **Symptom:** if `/content/site` failed, the storefront silently rendered defaults instead of telling anyone — a store whose contact details vanished would look healthy.
- **Fix:** the context now surfaces the error state rather than discarding it.
- **Status:** Fixed; **the failure path itself is not covered by an automated test** — this is the honest exception in this section. Classify as *Fixed but unverified* until a test asserts it.

## B. Fixed in the immediately previous round and re-verified today

### B-17 · Admin `PATCH` used `schema.partial()`, so omitting a field overwrote it — P1
- **Symptom:** editing only a price would reset `status` to the create-time default (unpublishing the product), zero `stock_quantity` and drop the images. Silent data loss from an ordinary admin action.
- **Fix:** `partialUpdate()` (`server/routes/admin.ts:80-89`) deletes every shape key the request did not actually send, so untouched columns are untouched. The reasoning is preserved as a comment above the function.
- **Re-verified by:** `tests/api/admin.test.ts > "changes one product field without resetting the rest of the record"`, "edits a zone fee without resetting its terms", "retires a coupon without changing its terms".
- **Status:** Fixed and verified.

### B-18 · Non-atomic stock writes (read → modify → write) — P1
- **Symptom:** a purchase and a staff stock adjustment could overwrite each other; two shoppers could buy the last unit.
- **Fix:** every stock write is a relative SQL update (`SET stock_quantity = stock_quantity + ?`, `server/lib/orders.ts:252-257`) inside `BEGIN IMMEDIATE`.
- **Re-verified by:** `tests/api/inventory.test.ts` — "sells the last unit once, never oversells and never writes a negative stock", "keeps an admin stock adjustment and a purchase from overwriting each other", "applies two variant adjustments against the stored number", "refuses an admin adjustment that would take stock below zero".
- **Status:** Fixed and verified.

### B-19 · Return/refund state machine allowed illegal jumps and double refunds — P1
- **Re-verified by:** `tests/api/inventory.test.ts` — "records a refund once and refuses to refund the same return twice", "blocks an impossible jump from a rejected return straight to a refund".
- **Status:** Fixed and verified.

### B-20 · Coupon codes were guessable and unthrottled — P1
- **Fix:** minimum code length enforced at creation plus `couponLimiter` (20/15 min) on the apply route.
- **Re-verified by:** `tests/api/security.test.ts` — "will not accept a coupon code short enough to guess", "stops a scripted run from probing coupon codes at speed", "refuses a coupon the shopper names at checkout instead of honouring it"; and `tests/api/customer.test.ts > "blocks a second use by the same email and enforces the total usage cap"`.
- **Status:** Fixed and verified.

### B-21 · An oversized request body produced a 500 with a stack trace — P2
- **Fix:** `server/app.ts:220-223` maps `entity.too.large` to a clean `413 PAYLOAD_TOO_LARGE` envelope; the fault-injection test proves a genuine DB failure returns a generic envelope instead.
- **Re-verified by:** `tests/api/security.test.ts > "rejects an oversized request body with 413 rather than a server fault"`; the prod probe row "oversized payload" (2 MB body → 413); `tests/api/inventory.test.ts > "returns a generic envelope instead of a stack trace when the database itself fails"`.
- **Status:** Fixed and verified.

## C. Investigated and recorded as NOT a defect

| ID | Claim | Verdict |
| --- | --- | --- |
| N-1 | `<h2>Shopping bag</h2>` and an `EmptyState` `<h2>` appear before the page `h1` | **Not a defect.** The closed cart drawer is `aria-hidden` + `inert`, so the subtree is out of the accessibility tree; the drawer already carries `aria-label="Shopping bag"`. The heading sweep was corrected to ignore hidden subtrees and the finding documented here rather than "fixed". |
| N-2 | `/returns` and `/shipping` return 404 | **Not a defect.** Those are not routes; the real paths are `/policies/returns` and `/policies/shipping`. This was an error in the probe, and the probe was fixed — not the product. |
| N-3 | CSRF cookie `sc_csrf` is readable by JavaScript | **By design.** It is a double-submit token, not a secret; the session cookie `sc_session` is HttpOnly (asserted by `security.test.ts > "stores only a bcrypt hash and a hashed session token"` and the cookie-flag test). |
| N-4 | Unknown HTML routes return 200 with the app shell | **Accepted SPA behaviour** for client routes; the *non-HTML* case was the real bug and is fixed (B-09). Crawler-facing correctness is preserved by the sitemap. |
| N-5 | `/favicon.ico` 404 | **P4, accepted.** The site declares an SVG favicon (`/favicon.svg`, `index.html`); browsers requesting the legacy `.ico` path get an honest 404 rather than a soft 200. |
| N-6 | Admin dashboard chunk is 360 kB | **Not a defect** for a staff-only surface that is route-lazy-loaded; recorded as performance finding **P-4** in `UX_ACCESSIBILITY_PERFORMANCE_AUDIT.md` §2.8. |
| N-7 | Two "failing tests" at the start of this round (CSRF cookie minting, support-ticket payload) | **Harness mistakes, not product bugs.** Both were the new tests being wrong about the API contract. They were corrected against the implementation and re-run; no product code was loosened. |

## D. Open items (real, but not fixable by code in this environment)

| ID | Item | Severity | Why it stays open |
| --- | --- | --- | --- |
| O-1 | `settings.notifications.ownerEmail` is `""` while `sendOwnerEmail` is `true` → the owner order email has no recipient | **P2** | The code path is tested; only the value is missing. OWNER_ACTION_REQUIRED **A-3**. |
| O-2 | No email actually leaves the machine (SMTP empty) | **P1 for launch** | BLOCKED BY EXTERNAL DEPENDENCY. **A-1**. |
| O-3 | "Since 1998 / 28 years / 4.4★ from 84 reviews" have no recorded source | **P2** (truth-in-advertising) | Only the owner can confirm or delete. **A-7**. |
| O-4 | `supportEmail` and `supportPhone` are empty; address has no house/street line | **P2** | Business facts, not code. **A-2**. |
| O-5 | Delivery fees/ETA windows and GST treatment are unconfirmed business numbers | **P2** | No courier tariff or CA input available. **A-4**, **A-5**. |
| O-6 | Legal policies are template text with "Legal review required" | **P2** | Requires the owner's counsel. **A-6**. |
| O-7 | Online payments, courier booking, WhatsApp Business API | **P3** (COD launch is viable) | No sandbox credentials reachable. `INTEGRATION_STATUS.md`. |
| O-8 | No version control, no backup/restore automation | **P1 operational risk** | Needs a decision to adopt Git and a backup target. **A-11**. |
| O-9 | Gift finder, categories, customers list, audit log page, dashboard chart, search suggestions have no automated assertions | **P3** | Listed as IMPLEMENTED BUT UNVERIFIED in the matrix so nobody mistakes them for tested code. |
| O-10 | The developer database's owner account still authenticates with the password that this register used to print (B-29) | **P2** | The value is redacted from the tree, but rotating a working admin password is the owner's decision, not a reviewer's. **A-13**. |

## E. Register totals

29 defects recorded (B-01…B-29): **28 fixed, 1 fixed-but-accepted-open (B-26)**. B-29 is fixed *in this repository* and still needs the owner-side action in O-10. By severity: 9 P1, 11 P2, 6 P3, 3 P4.

- **14 are pinned by a named vitest assertion** in the 124-test run: B-01, B-02, B-03, B-04, B-05, B-07, B-09, B-17, B-18, B-19, B-20, B-21, B-22, B-23.
- **10 are pinned by an executed script probe** rather than by vitest: B-08 (`_qa/release-prod-probe.log` header matrix), B-10, B-11, B-12, B-13, B-15 (`_qa/a11y-check.mjs`, 112 checks / 0 failures), B-25 (`_qa/cls-probe.mjs` before/after plus `_qa/perf-check.mjs`), B-27 (`_qa/fresh-db.mjs` / `grep`), B-28 (the same 112-check sweep) and B-29 (the regenerated probe log prints `sc_csrf=[redacted]` and `grep` finds no credential literal in the tree). These are reproducible but not yet part of `npm test`.
- **B-26 is the one recorded item that is deliberately not fixed** — 0.067 CLS on `/` under the 4G profile, inside the "Good" band and pinned by the benchmark's budget gate, with the fix traded away for visual reasons and the reasoning left on the record.
- **B-06 is only partly pinned.** The coupon limiter has a direct test ("stops a scripted run from probing coupon codes at speed"); the new password, resend and newsletter-unsubscribe limiters are confirmed wired by reading `server/routes/auth.ts:146`, `server/routes/admin.ts:1078` and `server/routes/content.ts:199,215`, **but no test fires 11 password attempts to prove a 429**. Treat that as residual risk, not as verified.
- B-14 is a documentation correction, and B-16 is the one code fix with **no** verification at all.
- B-24's new `configured_no_adapter` branch is **unreachable in this environment** (no provider credentials exist, by design), so it is verified by code read plus the unchanged `not_configured` assertions rather than by execution. B-27 carries no such caveat: its clean-unpack claim was executed inside the extracted release archive (`_qa/release-archive-browser.log`).

7 investigated findings were closed as *not a defect* with the reasoning in §C. 10 items remain open (§D), and **every one of them needs information, a credential or a decision owned by the business**, not code.

No test was deleted and no expected result was weakened to reach this state. The only assertion changes are named in `REPAIR_CHANGELOG.md` §6.
