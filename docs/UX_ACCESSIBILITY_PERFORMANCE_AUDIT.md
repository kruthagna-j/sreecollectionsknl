# UX, accessibility and performance audit

**Project:** Sree Collections storefront + API (`D:\SreeCollections\store`)
**Date:** 2026-10-26
**Measured, not assumed:** every number below comes from an executed command whose log is kept in `_qa/`. Where something was looked at but not measured, it says so in the same sentence.

---

## 1. How this was measured

| Instrument | What it drives | Log |
| --- | --- | --- |
| `_qa/perf-check.mjs` | the **built** bundle (`dist` + `dist-server`) served by the real production server on :4179, `NODE_ENV=production`, against a self-provisioned fixture database (`data/perf-probe.db`, created by `_qa/fresh-db.mjs`, deleted on exit). Chrome is driven over CDP with `Network.emulateNetworkConditions` + `Emulation.setCPUThrottlingRate`; metrics come from `PerformanceObserver` (`largest-contentful-paint`, `long-task`, `layout-shift`), `PerformanceNavigationTiming` and `ResourceTiming`. It ends with a **budget gate**: 12 `PASS`/`FAIL` lines, one per profile × page, and a non-zero exit if any cold-visit CLS exceeds 0.100 | `_qa/release-perf.log` |
| `_qa/cls-probe.mjs` | same stack on :4180, but records **every** layout shift with its `sources` (node, parent, previous rect → current rect) plus a 60 ms trace of the header/main/footer/loader/buy-bar boxes and document height. Profile is selectable with `QA_CLS_PROFILE=slow3g\|4g` | `_qa/cls-probe.log`, `_qa/cls-probe-after.log`, `_qa/release-cls-probe.log`, `_qa/cls-home-4g.log` |
| `_qa/a11y-check.mjs` | 112 DOM/CSSOM assertions against a production-mode server started by `_qa/run-checks.mjs` on :4181 | `_qa/release-browser-checks.log` |
| `_qa/visual-check.mjs` | 26 surfaces at 1440 / 390 / 360 px, overflow and height | same log |
| `npm run e2e` | the full buy path in a real browser, including the WhatsApp handoff and the invoice PDF | `_qa/final-e2e.log` |

Every one of those scripts boots its own server on its own port and its own fixture database, so none of them depends on a dev server left running or on `data/sree.db` — see `BUG_REGISTER.md` **B-27** for why that mattered.

**Three network/CPU profiles** were used, chosen for the store's actual customer base rather than a developer laptop:

1. **low-end mobile** — 4× CPU throttle, 500 kbps down / 125 kbps up / 800 ms RTT (slow 3G)
2. **mid-range mobile** — 4× CPU throttle, 4 Mbps down / 1 Mbps up / 150 ms RTT (4G)
3. **unthrottled desktop** — no CPU or network limit, as the control

The viewport is 390 × 844 (a common Android phone) for all mobile runs. Cold = first visit to that URL in a fresh browser context; warm = the same URL again in that context.

---

## 2. Performance — Core Web Vitals

### 2.1 Low-end mobile, slow 3G, 4× CPU (the profile that decides whether Kurnool shoppers can buy)

| Page | FCP | LCP | First text | Requests | Wire | Uncompressed | Long tasks | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Home (cold) | 5 824 ms | **6 356 ms** | 6 115 ms | 7 | 137.4 kB | 479.3 kB | 0 / 0 ms | **0.000** |
| Home (warm) | 1 424 ms | 1 772 ms | 1 726 ms | 19 | **6.8 kB** (12 from cache) | — | 0 / 0 ms | — |
| Product (cold) | 5 468 ms | **10 732 ms** | 9 904 ms | 24 | 277.9 kB | 644.6 kB | 0 / 0 ms | **0.000** |
| Product (warm) | 1 292 ms | 2 776 ms | 2 757 ms | 24 | **6.0 kB** (17 from cache) | — | 0 / 0 ms | — |
| Checkout (cold, after a throttled browse that filled a bag) | 1 380 ms | 2 880 ms | 2 808 ms | 21 | **12.8 kB** | 630.9 kB | 0 / 0 ms | **0.002** |
| Track order (cold) | 5 520 ms | 6 256 ms | 6 130 ms | 12 | 195.6 kB | 537.4 kB | 0 / 0 ms | **0.000** |

The track-order row moved more than the others between the two benchmark runs (8 requests / 139.2 kB → 12 requests / 195.6 kB): at 500 kbps the four Manrope faces either start before the measurement window closes or they do not, so **cold bytes on that page are timing-sensitive, not page-specific**. The time figures moved by roughly 8 % in both directions, which is the honest repeat-run spread of this harness (§6).

### 2.2 Mid-range 4G, 4× CPU

Home 2 504 / 3 820 ms (FCP/LCP, CLS **0.067**) · Product 2 484 / 4 068 (CLS 0.000) · Checkout 648 / 1 396 (CLS 0.002) · Track 2 496 / 3 180 (CLS 0.000). Warm repeats: FCP 600–676 ms, 4.4–6.0 kB transferred.

### 2.3 Unthrottled desktop (control)

Home 352 / 516 · Product 340 / 508 · Checkout 76 / 156 · Track 300 / 416 ms (FCP/LCP), **CLS 0.000 on all four**, warm FCP 68–92 ms.

### 2.4 What that means, stated plainly

* **Interaction cost is not the problem.** Zero long tasks in every single measurement, on every profile, including 4× CPU throttle. The JavaScript does not block the main thread into 50 ms+ chunks.
* **Stability is fixed.** CLS is 0.000 on all four pages under the harshest profile; the worst value in the whole 12-cell matrix is the home page at 4G (**0.067**), still inside Google's "good" band, and `_qa/perf-check.mjs` now **exits non-zero** if any cell exceeds 0.100 so this cannot regress silently. See §3 for the defect this replaced and B-26 for the 0.067.
* **Repeat visits are genuinely cheap**: 4.4–6.8 kB over the wire because hashed assets are served `public, max-age=31536000, immutable`.
* **First visit on slow 3G is still slow, and it is a download problem, not a rendering problem.** The next two sections show exactly where the time goes.

### 2.5 LCP attribution — the measurement that changed the diagnosis

`_qa/release-perf.log` (low-end profile, LCP element printed for every page and profile):

| Page | LCP element | Size | LCP time | The resource itself |
| --- | --- | --- | --- | --- |
| Home (3G) | `h1.hero__title` — "Gifts that keep the moment." | 358 × 69 | 6 356 ms | none — it is text painted by React |
| Home (4G / desktop) | `img` — `/images/products/rose-keepsake-box.svg` | 356 × 428 | 3 820 / 516 ms | fetched 3 601→3 787 ms = 186 ms for 1.6 kB |
| Product (3G) | `img` — `/images/products/rose-keepsake-box.svg` | 358 × 448 | **10 732 ms** | fetched **9 561 → 10 412 ms = 851 ms for 1.6 kB** |

**The hero picture is not slow. It is late.** 851 ms of the 10 732 ms is the image transfer; the other ~9.5 s is the browser downloading and executing the app before React can even emit the `<img>`. `fetchPriority="high"` is already set on that element ([src/pages/Product.tsx:305](file:///D:/SreeCollections/store/src/pages/Product.tsx#L305)) and the SVG is 1.6 kB, so there is nothing left to win at the image layer.

The second row is the same file seen from a faster pipe: when the JavaScript arrives sooner, the element that wins LCP flips from the `h1` to the image. Both readings agree on the diagnosis — every element on the page, text or image, is gated on booting the bundle.

### 2.6 Where the bytes actually go (cold, low-end profile)

| Page | Scripts | Web fonts | CSS | Images | API (fetch) | Total wire |
| --- | --- | --- | --- | --- | --- | --- |
| Home | 87.6 kB (64 %) | 0 kB on this page* | 24.5 kB | — | — | 137.4 kB |
| Product | 91.5 kB (33 %) | **125.2 kB (45 %)** | — (in the 24.5 kB above) | 5.0 kB | 5.7 kB | 277.9 kB |

\* Home fetched 2 faces; the product page pulled **7 of the 9 declared faces** — 3 Cormorant Garamond (23.1 + 23.1 + 22.6 kB) and 4 Manrope (≈14 kB each). They are already-compressed woff2, which is why the log reads "responses served compressed: 12/24" rather than 24/24.

Largest single objects: `index-*.js` **84.1 kB on the wire (274 kB raw)**, `index-*.css` 24.5 kB (128.7 kB raw), then three ~23 kB serif faces, then `hooks-*.js` 19.5 kB.

### 2.7 API latency (localhost, unthrottled, in-page `fetch`, 9 samples per route)

| Route | Median | Min | Max | HTTP |
| --- | --- | --- | --- | --- |
| `GET /api/v1/health` | 4 ms | 4 | 10 | 200 |
| `GET /api/v1/catalog/meta` | 5 ms | 4 | 40 | 200 |
| `GET /api/v1/catalog/products?pageSize=50` | 6 ms | 5 | 7 | 200 |
| `GET /api/v1/catalog/products/:slug` | 6 ms | 5 | 8 | 200 |
| `GET /api/v1/catalog/delivery/check?pincode=560001` | 4 ms | 3 | 10 | 200 |
| `POST /api/v1/cart/items` | 9 ms | 8 | 14 | **201** |
| `POST /api/v1/cart/shipping` (server-side quote) | 7 ms | 7 | 12 | **200** |
| `GET /api/v1/admin/summary` (signed out) | 5 ms | 4 | 7 | 401 |

SQLite + Express is **not** the bottleneck; the whole server-side path is single-digit milliseconds locally. This is a localhost measurement and says nothing about concurrency or a remote disk — see §6.

### 2.8 Open performance findings, ranked by measured impact

These are **recommendations with their tradeoffs**, not changes I made silently. None of them is a defect; the shipped behaviour is what §2.1 measured.

| # | Finding | Evidence | Fix and its cost |
| --- | --- | --- | --- |
| P-1 | **Seven web-font faces are 45 % of the product page's first-visit bytes.** They compete for the same 500 kbps pipe as the JavaScript that renders the LCP image. | `_qa/release-perf.log` product row: `css 7/125.2kB` of 277.9 kB, with the seven faces named individually in the "largest (cold)" line | Cut to the weights the design truly needs (e.g. drop one serif weight and one sans weight, or ship one variable font) — saves roughly 40–70 kB, but **changes the brand typography**, so it is the owner's call, not mine. Subsetting to the glyphs actually used is the no-visual-change version and needs a font-tooling step in the build. |
| P-2 | **The 84.1 kB entry chunk is on every page's critical path**, including the product page that only needs 6.2 kB of its own route code. | `index-*.js 84.1 kB on wire / 274 kB raw`; `Product-*.js 6.2 kB` | The safe part is moving more shared code out of the entry (React Query + router are already split as `hooks-*.js` 19.5 kB). Going further means re-planning the route map; a measurable but multi-file change, deferred rather than rushed. |
| P-3 | **Nothing renders before React boots.** Home's LCP is the `h1` painted at 6 356 ms; the server currently sends an empty shell. | `_qa/release-perf.log` home row: `LCP element: h1.hero__title 358x69 "Gifts that keep the moment." · rendered at 6356 ms`, with FCP 5 824 ms of pure download | Server-render the shell + above-the-fold hero (or pre-render the home HTML) so FCP and LCP stop depending on JS execution. Real win on 3G, but it introduces SSR into a stack that deliberately has none — a project-level decision, listed in [RELEASE_READINESS.md](file:///D:/SreeCollections/store/docs/RELEASE_READINESS.md) as a post-launch option. |
| P-4 | **The admin dashboard ships a 360 kB chart bundle** to a screen the owner opens on a phone. | `Dashboard-*.js 360.21 kB / gzip 104.44 kB` in `_qa/final-build.log` | `recharts` is already behind the admin route split, so customers never pay it. If the owner's phone is low-end, lazy-load the chart panel only when the dashboard tab is visible. |
| P-5 | **Catalogue art is vector placeholder illustrations, not product photographs.** | `/images/products/*.svg`, 1.6 kB each; seeded with the demo catalogue | Real photos arrive with the owner's images and will change every number in this section (dimensions, weight, and whether they need a CDN). This is [OWNER_ACTION_REQUIRED.md](file:///D:/SreeCollections/store/docs/OWNER_ACTION_REQUIRED.md) **A-8**, and re-running `node _qa/perf-check.mjs` after the swap is mandatory. |

---

## 3. Layout stability: the defect this round found and fixed (B-25)

**Before** (`_qa/cls-probe.log`, slow 3G, 4× CPU, `/product/rose-keepsake-box`):

```
total CLS 0.383 across 3 shifts
+0.3555 at 6752 ms
    moved: footer.site-footer rect [0,544,390,300] -> [0,0,0,0]
```

The trace around that shift is what made the cause unarguable:

```
 6187 ms  header 40x65   main 105x439   footer 544x1214   loader 105x439   doc 1758
 6846 ms  header 40x65   main 105x2926  footer 3031x1302  loader null      doc 4333
```

Two separate faults, both visible only under throttling:

1. `<Suspense>` wrapped the **whole layout** in `src/App.tsx`, so loading a route chunk unmounted the header, footer and navigation the shopper was already looking at — the shift source literally reads `footer → [0,0,0,0]`, i.e. removed from the document.
2. The loading placeholder was 439 px tall while the finished product page needs 2 926 px, so the footer teleported 2 487 px down the screen in one frame.

**Fix, in three small parts:**
* the Suspense boundary moved inside the shell, around `<Outlet />` only — [src/components/Layout.tsx](file:///D:/SreeCollections/store/src/components/Layout.tsx), and the same for account and admin ([src/pages/account/AccountLayout.tsx](file:///D:/SreeCollections/store/src/pages/account/AccountLayout.tsx), [src/pages/admin/AdminLayout.tsx](file:///D:/SreeCollections/store/src/pages/admin/AdminLayout.tsx));
* `.page-loader` reserves 88 vh so the footer is already below the fold while anything loads ([src/styles/base.css](file:///D:/SreeCollections/store/src/styles/base.css));
* the product page renders a height-reserving skeleton instead of a spinner (`ProductSkeleton` in [src/pages/Product.tsx](file:///D:/SreeCollections/store/src/pages/Product.tsx)).

**After** (`_qa/cls-probe-after.log`):

```
total CLS 0.000 across 1 shifts
+0.0003 at 8509 ms   moved: p ["28 YEARS OF GIFTING IN KURNOOL · …"] rect [21,6,347,14] -> [40,6,311,14]
 9401 ms  header 40x65   main 105x2956   footer 3061x1302   buyBar 787x57   doc 4363
```

0.383 → **0.000**. The only surviving shift is the announcement bar re-wrapping when a web font swaps in (0.0003, and `font-display: swap` is what allows it). Note the footer still moves 1049 → 3061 px at 9 401 ms and contributes **nothing** to CLS — that is the point of reserving a viewport: a shift is only scored when on-screen content moves. The fix respects the standing instruction not to "solve overlap by hiding the animation on mobile": the mobile sticky buy bar and every animation are still present in the post-fix trace (`buyBar 787x57`).

Re-measured across the whole 12-cell matrix (`_qa/release-perf.log`, and now asserted by the script itself — it exits non-zero if any cold-visit CLS passes 0.100): home, product and track order are **0.000** under slow 3G, checkout is 0.002 on both mobile profiles, and the only cell above 0.002 anywhere is **home at 4G — 0.067**, which is §3.1.

### 3.1 The cell that is not 0.000: home at 4G, CLS 0.067 (B-26, open on purpose)

`QA_CLS_PROFILE=4g node _qa/cls-probe.mjs /` → `_qa/cls-home-4g.log` records **one shift, +0.0669 at 3483 ms**, and names every element that moved:

```
moved: span ["HAND-WRAPPED"]      inside div.hero__marks   rect [16,457,98,17]  -> [141,457,98,17]
moved: span ["PERSONALISED GIFTS"] inside div.hero__marks  rect [130,457,121,17] -> [16,482,121,17]
moved: p ["28 YEARS OF GIFTING…"] inside div.announcement  rect [21,6,347,14]   -> [40,6,311,14]
moved: div.hero__visual                                     rect [0,486,390,358] -> [0,511,390,333]
```

The frame trace puts the shell on screen at 2158 ms and the shift 1.3 s later, which is the arrival of `/content/site` and `/content/home`. Two named lines explain it: `src/pages/Home.tsx:76-88` inserts the third "Cash on delivery" hero mark only once `site?.policies.cod.enabled` is known, so the marks row re-wraps, and `src/components/Header.tsx:40` replaces the hard-coded fallback announcement with the fetched one, which changes that paragraph's own width. The page still scores **0.000** at 3G (the content lands before the row is painted) and **0.000** on desktop (same reason, the other way round) — which is exactly why this is a timing race and not a structural fault.

**It is left as it is, deliberately.** 0.067 is inside the "Good" band, the benchmark would fail at 0.100, and the two ways to erase it are to reserve a box for a mark that may not be enabled or to show an empty announcement bar until the fetch lands — both visible costs on the page every customer enters, paid to move a number that is already passing. If the owner wants the number instead of the trade, both changes are one-line and this section is the place to re-measure.

---

## 4. Accessibility — 112 executed checks, 0 failures

`_qa/release-browser-checks.log` (production server on :4181, fixture database). Every `n` below is counted out of the log, and the families sum to 112:

| Family | n | Result |
| --- | --- | --- |
| WCAG AA contrast sweep per page | 7 | **0 runs below AA**; the weakest text on the entire storefront is 4.55:1 (the 9.5 px footer copyright line) |
| Heading order never skips a level | 20 | e.g. `/shop` 21 headings, `/gift-finder` 17, `/checkout` 10 |
| Exactly one `<main id="main">` | 13 | all storefront, account and admin surfaces |
| Exactly one visible `<h1>` | 13 | the same 13 surfaces |
| Skip link present and pointing at `main` | 13 | `Skip to content → #main` |
| **Skip link becomes visible on focus** | **13** | every swept surface, not just `/admin` — this was 1 check until B-28 |
| Checkout error wiring: `aria-invalid` | 6 | name, email, phone, recipient, ship-phone, PIN |
| Checkout error wiring: `aria-describedby` reaches the visible message | 6 | e.g. `checkout-name-error → "Enter your name"` |
| Checkout error wiring: message announced | 6 | live-region text present for the same 6 fields |
| Empty checkout submit raises errors | 1 | 8 field errors |
| Every checkout control has an accessible name | 1 | violations list `[]` |
| Field is focusable | 1 | `#contact-name` |
| Focus indicator contrast ≥ 3:1 | 1 | `#contact-name` halo 3.21:1, border 10.92:1 |
| Placeholder text ≥ 4.5:1 | 2 | `/shop` 5.48:1, home 9.26:1 |
| Cart drawer labelled | 1 | `aria-label="Shopping bag"`, `hidden="true"` when closed |
| `prefers-reduced-motion` | 1 | honoured; of 29 animated nodes **0** still exceed 20 ms (Chrome reports the override as `1e-05s`) |
| 200 % zoom (640 px layout viewport) | 3 | `/`, `/product/…`, `/checkout` all show `scrollWidth == clientWidth` |
| 320 px reflow (WCAG 1.4.10) | 3 | the same three pages, `scroll == client` |
| Harness prerequisite: test bag filled through the public API | 1 | 201 + 200 |
| **Total** | **112** | **FAILURES 0** |

Three accessibility facts are established **outside** that sweep, and are not counted as checks: `<html lang="en-IN">` is in both `index.html:2` and the built `dist/index.html` (read, not asserted by the script); every seeded catalogue image carries substantive `alt` — `SELECT alt FROM product_images` on a freshly seeded fixture database returns **24 rows, 0 empty or thin** — and thumbnails inside the product gallery are deliberately `alt=""` because they duplicate the named hero image; keyboard Escape-close is proven by e2e (2 of the 27 assertions in `_qa/final-e2e.log`), not by this sweep.

Structural facts verified by reading the shipped code, not only by probing: `:where(a, button, summary, [tabindex]):focus-visible` is the single focus treatment ([src/styles/base.css:158](file:///D:/SreeCollections/store/src/styles/base.css#L158)); the reduced-motion block is global (`*`, `*::before`, `*::after`) in [src/styles/responsive.css:1531](file:///D:/SreeCollections/store/src/styles/responsive.css#L1531); touch targets on account/admin forms are 40–48 px min-height.

### 4.1 Accessibility gaps that are real and still open

| Gap | Status | Why it is a gap |
| --- | --- | --- |
| **No screen reader was run.** | NOT VERIFIED | Every check above is DOM/CSSOM. Whether NVDA or VoiceOver announces the checkout error list in an order a blind shopper can act on is untested, and `aria-live` presence is not the same as usable announcement. |
| **English only.** | PARTIALLY IMPLEMENTED / missing | The store serves Kurnool, Andhra Pradesh. `grep` for `i18n`/locale providers across `src/` returns nothing, and there is no Telugu content anywhere. For a gift shop whose buyers are often regional-language first, this is the largest single accessibility-adjacent barrier in the product — it is a content + feature decision, not a CSS fix. |
| Focus trap in the cart drawer / modal dialogs | NOT VERIFIED | The drawer is labelled and hides correctly, but tab cycling while it is open was not probed. |
| Non-text contrast (WCAG 1.4.11) for icons, borders and the sticky buy bar | PARTIALLY COVERED | Only the focus ring and text were measured. |
| Captioning / audio | NOT APPLICABLE | No video or audio content exists. |
| Cognitive / reading-level review | NOT ASSESSED | No readability measurement was performed; policy copy is explicitly marked "Template policy… Legal review required" in the stored settings. |
| Keyboard-only end-to-end purchase | NOT VERIFIED | Escape-close and skip-link are proven; a full Tab-only order was not executed. |

---

## 5. UX review, page by page

Statuses use the vocabulary in [AUDIT_BASELINE.md](file:///D:/SreeCollections/store/docs/AUDIT_BASELINE.md#L88) §8. "Verified" means the named script produced the evidence; nothing here is claimed on sight.

| Surface | What was verified in a browser | Remaining UX judgement |
| --- | --- | --- |
| **Home** | renders (`e2e`), 1 `h1`, heading-order-safe, contrast AA, LCP is the value proposition itself (`h1.hero__title` on 3G), CLS 0.000 on 3G and desktop, 0.067 at 4G (B-26) | On slow 3G the first pixels arrive at 5.8 s; the page is a promise the connection cannot keep until §2.8 P-3 is addressed |
| **Shop / listing** | lists live catalogue (`e2e`), filters by category through the query string, 21 headings in order, placeholder contrast 5.48:1, no overflow at 360/390/1440 | Sorting/facet depth was not evaluated against a competitor set |
| **Product** | opens from the catalogue (`e2e`); variant, gift-wrap, engraving and card-message paths are pinned by `tests/api/gift.test.ts`; hero carries `width`/`height`/`fetchPriority="high"` and real alt text; sticky mobile buy bar measured in the CLS trace; skeleton reserves height while loading | LCP 10.7 s cold on slow 3G (§2.5). Personalisation input is where a shopper can type hostile text — escaped and asserted in tests, and the visible preview is the honest one |
| **Cart** | drawer opens with the item (`e2e`), labelled and hidden correctly, `alt=""` thumbnails, 7 headings in order | Free-delivery threshold nudging exists but its persuasiveness was not user-tested |
| **Checkout** | 8 field errors raised on empty submit, 6 asserted as `aria-invalid` + described + announced; **PIN validated server-side**, pan-India quote with fee and estimate (`e2e`), COD placed with server totals | Long form on a phone. The 4381 px mobile page height means real scrolling; address auto-fill and a Telugu label set would both cut abandonment, and neither exists |
| **Order confirmation** | **honest about email delivery** (it does not claim a mail was sent while SMTP is unconfigured), shows zone + estimate, offers HTML and PDF invoices, **offers the WhatsApp handoff and opens WhatsApp with the prepared order message** — all asserted by `e2e` | The handoff is a `wa.me` link the shopper taps; it is not an automated send, which matches the "nothing is invented" rule and the `INTEGRATION_STATUS.md` finding |
| **Track order** | guest lookup with the order number + checkout email works (`e2e`), scoped to the owner (`tests/api/security.test.ts`), 195.6 kB cold / CLS 0.000 | FCP 5.5 s cold on slow 3G; a shopper at the door of a delivery is exactly the case where that hurts |
| **Account** | order appears after purchase (`e2e`); addresses, wishlist, reviews, returns and tickets are pinned by 12 tests in `customer.test.ts` | Password reset is deliberately **not promised** while no provider is configured (**A-1**); the shopper is routed to WhatsApp/support instead — an owner decision waiting on SMTP |
| **Gift finder** | 1 `main`, 1 `h1`, 17 headings in order, no overflow at any width | Its recommendation quality depends on catalogue tagging, which is seeded demo data (**A-8**) |
| **Admin** | owner sign-in, confirm order + timeline, message log, invoice PDF, catalogue list, scoped roles — all by `e2e` and 16 tests; partial-edit safety proven so a one-field save cannot reset a record (B-17); mobile admin has no horizontal overflow | A 360 kB chart chunk on a low-end phone (§2.8 P-4); no default admin account or known password exists, by design |
| **Content pages** (about/contact/faq/journal/offers/5 policies) | heading order and single-h1/main proven on every one; contact field is focusable with a 3.21:1 focus halo | Contact facts, hours and the "Since 1998 / 4.4★ / 84 reviews" claims have **no recorded source** — see AUDIT_BASELINE §4 and OWNER_ACTION_REQUIRED |

---

## 6. What this audit did **not** measure

* **No real handset.** 4× CPU throttling and a 500 kbps pipe emulate a low-end phone; they do not reproduce a specific SoC, its GPU, thermal throttling, or a real Android WebView. Field data (CrUX / RUM after launch) is outstanding.
* **No concurrency, load or soak test.** §2.7 is 9 sequential samples on localhost. Rate limiting is proven by a test (`stops a scripted run from probing coupon codes at speed`), capacity is not.
* **No screen reader, no switch access, no voice-control pass.** §4.1.
* **No pixel-diff visual regression.** The visual check asserts overflow and heights, not that a component still looks the way the owner approved.
* **No A/B or real-shopper testing.** Everything in §5 is structural and measured; none of it is conversion evidence.
* **One build, one network path.** HTTP/2 vs HTTP/1.1, a CDN in front, and Brotli instead of gzip would all move these numbers; the probe ran against the app's own Express static server with compression middleware.
* `robots.txt`, `sitemap.xml` and the SEO routes were verified to answer correctly in production (§5 of TEST_RESULTS); **search-engine indexing itself was not**, because the site has no public origin yet (`APP_ORIGIN` is still a localhost value — **A-9** in OWNER_ACTION_REQUIRED).

## 7. Area verdicts

| Area | Verdict | Basis |
| --- | --- | --- |
| Layout stability (CLS) | **COMPLETE AND VERIFIED** | 0.383 → 0.000 measured before/after, trace-attributed |
| Blocking (long tasks / JS main-thread) | **COMPLETE AND VERIFIED** | 0 long tasks in 24 measurements |
| Caching / repeat visits | **COMPLETE AND VERIFIED** | `immutable` hashed assets; 4.4–6.8 kB warm |
| Colour contrast, semantics, forms, motion preference, reflow | **COMPLETE AND VERIFIED** for what a scripted audit can prove (112 checks) | `_qa/release-browser-checks.log` |
| Assistive-technology usability | **IMPLEMENTED BUT UNVERIFIED** | no AT run |
| First-visit speed on slow 3G | **IMPLEMENTED BUT NOT ACCEPTABLE YET** — 6.4 s home / 10.7 s product LCP | `_qa/release-perf.log`; causes ranked in §2.8, each with an owner-visible tradeoff |
| Language coverage (Telugu) | **MISSING** | no locale code or translated content exists anywhere in `src/` |
| Real-product imagery performance | **BLOCKED BY EXTERNAL DEPENDENCY** | photographs are the owner's to supply (**A-8**) |
