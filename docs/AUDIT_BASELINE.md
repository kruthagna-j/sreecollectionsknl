# Audit baseline

**Repository audited:** `D:\SreeCollections\store` (Sree Collections storefront + API)
**Audit date:** 2026-10-26
**Auditor:** Qoder agent acting as architect / QA / security / database / payments / UX / performance / deployment reviewer
**Application version:** `0.1.0` (declared in `package.json` and returned by `GET /api/v1/health`)
**Brief applied:** "Sree Collections — Ultimate master audit, feature verification, bug fixing, security testing and release readiness"

---

## 1. Environment actually used

| Item | Value (measured, not assumed) |
| --- | --- |
| Operating system | Windows 10.0.26300, x64 |
| Shell | Git Bash (`C:\Program Files\Git\bin\bash.exe`) |
| Node.js | v24.19.0 |
| npm | 12.0.2 |
| Database engine | `node:sqlite` (`DatabaseSync`), WAL journal, foreign keys on |
| Browser used for checks | Google Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe` through `playwright-core@1.64.1`; every script now honours `CHROME_PATH`, so an operator with Chrome elsewhere runs the same checks without editing code |

Runtime dependencies as installed (`npm ls --depth=0`): `express@5.3.0`, `react@19.3.1`, `react-dom@19.3.1`, `react-router-dom@7.18.4`, `@tanstack/react-query@5.x`, `zod@4.6.7`, `helmet@8.3.0`, `express-rate-limit@8.7.1`, `bcryptjs@3.0.3`, `nodemailer@10.2.1`, `pdfkit@0.20.2`, `recharts@3.10.1`, `compression@1.8.2`, `cookie-parser@1.4.7`, `dotenv@18.0.9`.
Toolchain: `typescript@7.0.2`, `vite@8.3.5`, `vitest@5.0.5`, `tsx@4.23.15`, `supertest@7.3.1`.

`npm audit --omit=dev` → **found 0 vulnerabilities** (production dependency tree only; dev tree not asserted).

## 2. Source inventory

| Surface | Count | How measured |
| --- | --- | --- |
| API route handlers | 84 (41 GET, 28 POST, 7 PATCH, 6 DELETE, 2 PUT) | counted from `router.<verb>(` occurrences in `server/routes/*.ts` |
| Documented API paths | 70 | `grep -c "^  /"` in `docs/openapi.yaml` |
| Database tables | 26 | `CREATE TABLE IF NOT EXISTS` in `server/db.ts` |
| Migrations applied to the local database | 5 (v1–v5); v4 and v5 were added **during** this round, the tree started at v1–v3 | `SELECT version FROM schema_migrations` on `data/sree.db` |
| Page components | 44 | `src/pages/*.tsx`, `src/pages/account/*.tsx`, `src/pages/admin/*.tsx` |
| Production JS chunks | 52 (44 route chunks + 8 shared) + 1 stylesheet | `dist/assets` after `npm run build` |
| Automated test files / tests | 9 files, 124 tests | `npm test` (see [TEST_RESULTS.md](file:///D:/SreeCollections/store/docs/TEST_RESULTS.md)) |
| Production end-to-end checks | 27 | `npm run e2e` |
| QA scripts | 8: `_qa/fresh-db.mjs` (fixture database), `_qa/run-checks.mjs` (boots the production server and drives the checks), `_qa/a11y-check.mjs`, `_qa/visual-check.mjs`, `_qa/prod-probe.mjs`, `_qa/heading-probe.mjs`, `_qa/perf-check.mjs`, `_qa/cls-probe.mjs` | files present; all except `heading-probe.mjs` were executed during this round. Four one-off scripts written earlier in the round (`smoke.mjs`, `diag.mjs`, `diag2.mjs`, `home-check.mjs`) were **deleted** once superseded — they hard-coded a login that no longer exists, and leaving them in the tree would have left a broken "how to check" in front of the owner |

## 3. Configuration surface

`.env.example` **as found at the start of this round** listed 15 keys: `PORT`, `APP_ORIGIN`, `DATABASE_PATH`, `COOKIE_SECURE`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `GOOGLE_ROUTES_API_KEY`, `SMTP_URL`, `SMTP_FROM`.

Verified against `server/config.ts`: the runtime reads `NODE_ENV`, `PORT`, `APP_ORIGIN`, `DATABASE_PATH`, `COOKIE_SECURE` and the six integration keys. `ADMIN_EMAIL` and `ADMIN_NAME` were **never read by any code** — `scripts/create-admin.ts:19-22` takes the email and name from `--email`/`--name` or the interactive prompt, and only `ADMIN_PASSWORD` is actually consumed — yet `README.md:50` told operators the other two worked. Fixed during this round: the two dead keys were dropped from `.env.example`, the README sentence was rewritten, and the remaining comment now states plainly that the payment/courier/route keys **enable nothing** because no adapter ships (`BUG_REGISTER.md` B-14). There is no shipped default administrator and no default password anywhere in the tree.

Local `.env` during the audit: `PORT`, `APP_ORIGIN`, `DATABASE_PATH`, `COOKIE_SECURE` set; `SMTP_URL` and `SMTP_FROM` present but **empty**, so email is genuinely `not_configured` in every check below.

## 4. Local data state (development database, read-only inspection)

`data/sree.db`: users 2, categories 6, products 12 (all published), product_images 48, product_variants 10, orders 1 (status `pending`, payment `cod_pending`), order_items 1, stock_movements 1, order_events 1, audit_logs 53, sessions 43, carts 22, cart_items 4, shipping_zones 2, settings 9.
Zero rows in: reviews, wishlist_items, support_tickets, return_requests, coupons, coupon_redemptions, newsletter_subscribers, order_notifications, addresses, search_events.

Business settings stored in that database (values quoted verbatim): `cod {enabled:true, maxTotal:1000000, fee:0}` (₹10,000 ceiling), `giftWrap {fee:9900}`, `returns {enabled:true, windowDays:7, note:"Template policy. Personalised items are excluded. Legal review required."}`, `tax {inclusive:true, defaultRateBps:500, note:"…Confirm tax classifications and GST registration with the business before launch."}`, `notifications {sendCustomerEmail:true, sendOwnerEmail:true, ownerEmail:"", whatsappAutoOpen:true}`, `store {name:"Sree Collections", tagline:"Since 1998", supportEmail:"", supportPhone:"", address:"Gandhi Nagar, Kurnool", supportWhatsApp:"919494498937"}`, `publicProfile {rating:4.4, ratingCount:84, yearsInBusiness:28, locality:"Gandhi Nagar, Kurnool", closesAt:"21:30", sourceName:"", sourceUrl:""}`, zones `Local delivery (Kurnool) 518001-518999 ₹49 free above ₹2,500 1–2 days` and `All India delivery 100000-999999 ₹99 free above ₹1,999 4–7 days`.

Two consequences are carried into the findings: **`notifications.ownerEmail` is empty**, so no owner order notification has a recipient; and the **"Since 1998 / 28 years / 4.4★ from 84 reviews" claims have no source recorded** (`sourceName`/`sourceUrl` are blank). Both are owner decisions, listed in `OWNER_ACTION_REQUIRED.md`.

## 5. Version control

Neither `D:\SreeCollections` nor `D:\SreeCollections\store` is a Git repository. There is no commit history, no branch, no `git blame` and no tag to anchor a baseline; the only prior release artifact is `D:\SreeCollections\sree-collections-store-2026-10-24.zip`. Every change made during this audit is therefore recorded file-by-file in `REPAIR_CHANGELOG.md`, and the absence of version control is itself raised as a release condition (see `RELEASE_READINESS.md` §4 and `OWNER_ACTION_REQUIRED.md` A-11).

## 6. Baseline before this audit round (first captured run)

`_qa/verify-run.log` (captured at the start of the round, before the second set of repairs):

```
Test Files  7 passed (7)
     Tests  108 passed (108)
   Duration  12.94s
```

At that point three assertions were **failing** in the inherited suite (CSRF cookie minting, support-ticket payload, invoice escaping of gift text). Those three were diagnosed — two were the new tests being wrong about the API contract (recorded as **N-7** in `BUG_REGISTER.md` §C, not as product defects), and the third was a real stored-XSS defect in the server-rendered invoice, fixed as **B-03**.

## 7. State after this audit round (all commands re-executed)

| Command | Result | Log kept |
| --- | --- | --- |
| `npm run typecheck` | exit 0, no diagnostics | `_qa/final-typecheck.log` |
| `npm test` | 9 files, **124 passed**, 13.62s, exit 0 | `_qa/final-tests.log` |
| `npm run build` | exit 0; 52 JS chunks + 1 CSS (131.74 kB / gzip 23.08) + 9 woff2 | `_qa/final-build.log` |
| `npm run e2e` | **27 PASS**, "All end-to-end checks passed.", exit 0 | `_qa/final-e2e.log` |
| `node _qa/run-checks.mjs _qa/a11y-check.mjs _qa/visual-check.mjs` | a11y **112 checks / FAILURES 0**, visual **26 surfaces / ERRORS 0**, both exit 0, run against a production server booted on a freshly seeded **fixture** database | `_qa/release-browser-checks.log` |
| `node _qa/prod-probe.mjs` | production-mode response/header matrix (20 probes) as specified, exit 0 | `_qa/release-prod-probe.log` |
| `node _qa/perf-check.mjs` | Core-Web-Vitals benchmark, 3 throttled profiles × 4 pages × cold/warm + API latency, plus the **layout-shift budget assertion: 12 PASS, `CLS BUDGET FAILURES 0`, `BENCH=0`** | `_qa/release-perf.log` |
| `node _qa/cls-probe.mjs` / `QA_CLS_PROFILE=4g node _qa/cls-probe.mjs /` | layout-shift trace with per-shift source attribution; **product CLS 0.000** (0.383 before the fix), **home at 4G 0.067** attributed to one named shift | `_qa/release-cls-probe.log`, `_qa/cls-home-4g.log`, `_qa/cls-probe.log`, `_qa/cls-probe-after.log` |
| extract the release ZIP into an empty directory, diff it against this tree, then `npm ci && npm run typecheck && npm test && npm run build && npm run e2e` **inside the extracted copy** | file-for-file identical; `npm ci` 269 packages; typecheck exit 0; **124 passed**; build exit 0; **27 PASS** | `_qa/release-archive-tests.log`, `_qa/release-archive-build.log` |
| `node _qa/run-checks.mjs _qa/prod-probe.mjs _qa/a11y-check.mjs _qa/visual-check.mjs` **inside that same extraction** | the shipped harness provisions its own environment on a machine that never held `data/sree.db`: 20 probes + **112 PASS / FAILURES 0** + **26 surfaces / ERRORS 0**, `RUN_CHECKS_EXIT=0`, fixture database deleted | `_qa/release-archive-browser.log` |
| `npm audit --omit=dev` | found 0 vulnerabilities | — |

Two notes on the integrity of this table. First, an earlier `npm test` run in the same round reported `100 passed (124)` with two vitest "Worker exited unexpectedly with exit code 134" errors on `tests/api/customer.test.ts` and `tests/api/inventory.test.ts`. 23 Chrome and 10 Node processes were alive at that moment; the identical suite with no source change passed 124/124 on a re-run at 19:33 (`_qa/final-tests.log`, which is the run recorded above). The flake is reported as an environment observation in `TEST_RESULTS.md` §6, not as a passing run. Second, an earlier latency table in this round showed HTTP 403 on the two POST routes; that was a harness bug — the script sent Node `fetch` with cookies borrowed from the browser context and a CSRF token read before the SPA had received one — and those rows were discarded, not reported. The API numbers in `UX_ACCESSIBILITY_PERFORMANCE_AUDIT.md` come from the in-page rewrite that returns 201/200.

Third: the `final-*` logs were produced while the browser checks still copied `data/sree.db` and signed in with an account that only existed there; the `release-*` logs are the same checks after they were made self-provisioning (`BUG_REGISTER.md` B-27). Where a number moved between the two runs it is reported as a spread, not silently replaced — see `TEST_RESULTS.md` §6. The `release-archive-*` logs are a third category: the same commands run from inside the unpacked release ZIP, so they certify the artifact rather than this working directory. In that extraction npm's `allowScripts` policy blocked the `esbuild@0.28.2` postinstall; the script was not approved, and typecheck, the 124 tests, the build (identical hashed assets) and the 27 end-to-end checks still passed, so the block is recorded as an install-time observation with no effect on output.

## 8. Status vocabulary used across these documents

| Status | Meaning |
| --- | --- |
| COMPLETE AND VERIFIED | Implemented, and this audit executed evidence that it behaves as described |
| IMPLEMENTED BUT UNVERIFIED | Code exists and reads correctly, but no executed proof was obtained in this environment |
| PARTIALLY IMPLEMENTED | The main path exists; specific, named capabilities are absent |
| MISSING | Not present in the repository at all |
| BROKEN | Present and demonstrably wrong — reserved for defects that still reproduce at audit time |
| BLOCKED BY EXTERNAL DEPENDENCY | Cannot be completed or verified without credentials, accounts or a live service owned by the business |
| NOT APPLICABLE | Out of scope for this store model (single store, single currency, COD-first) |

## 9. What this audit did **not** do

* No live payment, no real courier shipment, no real SMS/WhatsApp/email was sent to any customer or to the store's real inbox.
* No provider sandbox was reachable from this environment, so no gateway or courier call is marked working (see `INTEGRATION_STATUS.md`).
* No third-party accessibility auditor and no AT screen-reader matrix (NVDA/JAWS/VoiceOver) was run; the accessibility evidence is a scripted DOM, contrast and focus inspection. No real low-end handset was used: the performance evidence is the built bundle driven by Chrome under CDP CPU (4×) and network (slow-3G / 4G) throttling, which is an emulation of a cheap phone, not a measurement on one. Field data (Lighthouse CI on real hardware, CrUX after launch) is still outstanding.
* No load or soak test: API latency was sampled 9 times per route on localhost, which says nothing about behaviour under concurrency.
* No production database, DNS or infrastructure was touched. Every check ran against an isolated database it created itself — `_qa/fresh-db.mjs` seeds a fixture file (`data/prod-probe.db`, `data/perf-probe.db`, `data/cls-probe.db`, `data/checks-probe.db`) and deletes it on exit, so **nothing in this round read or wrote `data/sree.db`** (`BUG_REGISTER.md` B-27).
* No penetration tooling, no real credential stuffing, no denial-of-service exercise.
