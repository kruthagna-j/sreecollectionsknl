# Release readiness

**Project:** Sree Collections storefront + API (`D:\SreeCollections\store`) · app `0.1.0`
**Date:** 2026-10-26
**Built from:** [AUDIT_BASELINE.md](file:///D:/SreeCollections/store/docs/AUDIT_BASELINE.md) (what the tree is), [MASTER_FEATURE_MATRIX.md](file:///D:/SreeCollections/store/docs/MASTER_FEATURE_MATRIX.md) (what works), [BUG_REGISTER.md](file:///D:/SreeCollections/store/docs/BUG_REGISTER.md) (what was broken and fixed), [SECURITY_AUDIT_RESULTS.md](file:///D:/SreeCollections/store/docs/SECURITY_AUDIT_RESULTS.md), [FINANCIAL_AND_ORDER_LOGIC_AUDIT.md](file:///D:/SreeCollections/store/docs/FINANCIAL_AND_ORDER_LOGIC_AUDIT.md), [INTEGRATION_STATUS.md](file:///D:/SreeCollections/store/docs/INTEGRATION_STATUS.md), [UX_ACCESSIBILITY_PERFORMANCE_AUDIT.md](file:///D:/SreeCollections/store/docs/UX_ACCESSIBILITY_PERFORMANCE_AUDIT.md), [TEST_RESULTS.md](file:///D:/SreeCollections/store/docs/TEST_RESULTS.md), [REPAIR_CHANGELOG.md](file:///D:/SreeCollections/store/docs/REPAIR_CHANGELOG.md), [OWNER_ACTION_REQUIRED.md](file:///D:/SreeCollections/store/docs/OWNER_ACTION_REQUIRED.md).
**Rule used here:** nothing is called ready because it is "probably fine". A gate is PASS only when this audit executed the evidence named in it.

---

## 1. Verdict

# NOT READY

Not "bad", and not "nearly". **The code is in better shape than the business configuration around it, and a customer cannot be served by code alone.** Four inputs that only the owner can supply are missing, and two of them decide whether money or goods move wrongly on day one:

| Blocking | What is missing | Consequence if launched anyway |
| --- | --- | --- |
| **A-1** | `SMTP_URL` / `SMTP_FROM` | No invoice or confirmation email is ever sent. `sendCustomerEmail` is `true`, so the owner will be asked "where is my invoice?" by WhatsApp instead. The UI is honest about it (an executed e2e assertion checks that the confirmation page does **not** claim a mail was sent), so no shopper is lied to — but the store promised email delivery in its own policy text. |
| **A-2 / A-3** | `supportEmail`, `supportPhone`, street-level address, `notifications.ownerEmail` | Contact pages show a name, a locality and a WhatsApp number only. `sendOwnerEmail` is `true` with an **empty recipient**, so the shop never learns about an order except by opening the admin screen. |
| **A-4 / A-5** | Confirmed delivery fees, free-delivery thresholds, ETA windows, GSTIN and tax treatment | The live storefront would publish **₹49 / ₹99** and "1–2 / 4–7 days" and a `5 %` inclusive tax rate that no courier tariff and no CA has confirmed. Those are the numbers a customer is billed on and the numbers an invoice is legally printed with. The database stores the honest note "Confirm tax classifications and GST registration with the business before launch", and the invoice prints `GSTIN: not configured`. |
| **A-6 / A-7** | Legal review of the five policies; a source for "Since 1998 / 28 years / 4.4★ from 84 reviews" | The stored policy text literally begins "Template policy… Legal review required". The rating claims carry `sourceName: ""` and `sourceUrl: ""` — as of this audit **nothing links to Justdial anywhere** (removed deliberately, A-7), so the claims are now the shop's own assertion with no recorded evidence. Publishing an unverifiable rating is the kind of thing a competitor complains about. |

**And one condition that is not the owner's to fix by typing:** no payment gateway, courier booking or route-distance integration exists in this build, so an online-payment order answers `503 PAYMENT_PROVIDER_UNAVAILABLE` and tracking shows the shop's own status changes, never invented courier scans. That is correct behaviour for a launch, and it is a *scope* fact, not a defect — see [INTEGRATION_STATUS.md](file:///D:/SreeCollections/store/docs/INTEGRATION_STATUS.md).

### What is genuinely ready

* **The money path is correct and defended.** One server-side `buildQuote()` computes every total (the cart and checkout response are the *same bytes*, asserted); the browser's price, discount, stock and payment status are ignored (asserted); COD is priced, capped at ₹10,000, and the handling fee is stored so every printed document reconciles (migration v5); stock moves atomically inside `BEGIN IMMEDIATE` so the last unit sells once; an idempotency key makes a double submit one order; refunds follow a state machine that refuses illegal jumps. 124 tests, 27 production e2e checks, and one deliberately injected database fault prove it.
* **Transport and authorization are real.** `helmet` CSP with `frame-ancestors 'none'`, `nosniff`, and `strict-transport-security=max-age=31536000; includeSubDomains` printed on **all 20** probed production responses (`_qa/release-prod-probe.log`); sessions stored as SHA-256 token hashes (`server/lib/auth.ts:35-36`) in HttpOnly/SameSite=Strict cookies; **35 admin route handlers and 35 `requireRole(...)` guards in `server/routes/admin.ts`** — the counts match, and `security.test.ts` proves signed-out visitors and customers are closed out of every admin area; per-route rate limits; cross-customer access proven negative with real second accounts (the guest lookup needs order number **and** the checkout email together).
* **The customer experience works on a bad connection.** Zero long tasks on every profile; CLS 0.000 on the product page after fixing a measured 0.383 (B-25); warm visits at 4.4–6.8 kB. Slow-3G **first** visit is still 6.4 s home / 10.7 s product, and `UX_ACCESSIBILITY_PERFORMANCE_AUDIT.md` §7 records that row as **IMPLEMENTED BUT NOT ACCEPTABLE YET** rather than as a pass.
* **Nothing is faked.** No placeholder "order delivered", no seeded customer data, no invented tracking, no dead link to another website. Where a capability is absent, the UI says so in words a shopper can act on.

### The shortest path to READY

Do A-1, A-2/A-3, A-4/A-5, then set **A-9** (real `APP_ORIGIN`, HTTPS, `COOKIE_SECURE=true`) at the host, delete or source **A-7**, then run the nine checks in §3 in production. On a cooperative calendar that is **a few days, not weeks**: nothing in the verdict says the store must be rebuilt.

---

## 2. Evidence behind the verdict

| Claim | Executed evidence |
| --- | --- |
| 124 unit/API tests, 9 files, `:memory:` databases | `npm test` → `_qa/final-tests.log` (13.62 s, exit 0) |
| 27 end-to-end checks on the **built** bundle in real Chrome | `npm run e2e` → `_qa/final-e2e.log`, including the WhatsApp handoff, the invoice PDF, the honest email wording, and 0 console/page errors |
| 112 accessibility assertions, 0 failures | `_qa/release-browser-checks.log` (families and counts in `TEST_RESULTS.md` §4) |
| 26 visual surfaces, 0 errors, no horizontal overflow at 360/390/1440 | same log, AUDIT block |
| 20 production response/header probes | `_qa/release-prod-probe.log` — headers matrix, `robots.txt`/`sitemap.xml`, `401`/`403`/`413`/`404` cases, SQLite file unreachable through static serving |
| 12 layout-shift budget assertions | `_qa/release-perf.log` → `CLS BUDGET FAILURES 0`, `BENCH=0`; `perf-check.mjs` exits non-zero above 0.100 |
| Release artifact is the tested tree | ZIP extracted to an empty directory, diffed file-for-file against the working tree (**identical**), then `npm ci` (269 packages) / typecheck / 124 tests / build / the 27 end-to-end checks executed **inside that extraction** → `_qa/release-archive-tests.log`, `_qa/release-archive-build.log` |
| The shipped QA harness runs on a machine that never had the store | the same extraction ran `node _qa/run-checks.mjs _qa/prod-probe.mjs _qa/a11y-check.mjs _qa/visual-check.mjs`: 20 probes, **112 PASS / `FAILURES 0`**, 26 AUDIT rows / `ERRORS 0`, `RUN_CHECKS_EXIT=0`, fixture database created and deleted, `data/` empty afterwards → `_qa/release-archive-browser.log` (B-27) |
| No production dependency vulnerable | `npm audit --omit=dev` → found 0 vulnerabilities (dev tree not asserted) |

Total executed this round: **321 checks across the eleven commands in `TEST_RESULTS.md` §1**. The browser subset of those — 112 + 26 + 20 — was then executed a second time from inside the unpacked release archive, so the QA numbers are reproducible on a machine that has never run the store: every browser script boots its own production server against its own seeded fixture database and receives its staff credentials through the environment (`BUG_REGISTER.md` B-27).

---

## 3. Pre-launch gates, in running order (item 4 is the hard one)

Run these **after** deployment, against the real origin, with real credentials in `.env`. Item 4 is why this verdict is NOT READY: nothing below can pass until it does.

1. **Configuration honesty.** `GET /api/v1/health` must show `email: "configured_unverified"` (a key present) or `not_configured` (still empty) — never `verified`. Then send a real test order to a test address the owner controls and confirm the mail arrives in both directions (customer invoice + owner notification). Record the delivery lag.
2. **Business facts, from the owner, not from this audit.** Store details, support email/phone, full address with house/street, opening hours; delivery zone fees and ETA windows; COD ceiling and handling fee; tax rate, GSTIN and invoice series; the five policies reviewed by a person who can be sued for them. `Admin → Settings` is the only place these should be edited.
3. **Claims audit.** Either source or delete "Since 1998 / 28 years / 4.4★ from 84 reviews". Confirm the twelve seeded catalogue items (24 images across six categories, counted on a freshly seeded fixture database) are real, correctly priced, in stock, and photographable; replace the vector placeholders (**A-8**). Re-run `node _qa/perf-check.mjs` after the photographs land — §5's speed numbers are only valid for SVG art.
4. **Production configuration — the hard gate.** `APP_ORIGIN` set to the real HTTPS origin (it builds invoice return links and the sitemap `Sitemap:` line), `COOKIE_SECURE=true` unless the host terminates TLS in a way the app can see, `NODE_ENV=production`, and a `.env` that is **not** in the shipped archive. Two guards already help: `server/config.ts:25-28` **refuses to boot** in production with `APP_ORIGIN` unset, and `server/config.ts:36` defaults `cookieSecure` to `isProduction` rather than to `false`. What nothing checks is *scheme*: an `http://` origin boots happily, so confirm by hand that the session cookie carries `Secure`, that `/robots.txt`'s `Sitemap:` line names the real host, and that the invoice's return link is not `localhost` (`SECURITY_AUDIT_RESULTS.md` §8.2). Today all three read localhost because `.env` is a local file — *correct locally, wrong in production*. **This audit cannot pass gate 4 for the owner: there is no deployment here, and no authorization to make one.**
5. **First-order smoke test.** Place a real COD order as a stranger: quote a pan-India PIN, receive the invoice, open the WhatsApp handoff from a phone, confirm the admin screen shows the order and the timeline, then cancel it and confirm stock returns. Then confirm the notification mail reached the owner address from item 2.
6. **Backup and restore, in that order.** Choose the host/OS mechanism (**A-12**), schedule it, then **restore a copy into a spare `DATABASE_PATH` and open an old order**. A backup that has never been restored is a hope, not a backup.
7. **Version control.** `git init` + a private remote + tag this state (**A-11**, §4 below). There is no history to roll back to today, so items 2–6 are currently un-revertable.
8. **Payment / courier decision** (**A-10**): stay COD-only, or commission a gateway/courier adapter *with sandbox credentials and tests*. Do not enable an option the code cannot execute.
9. **Retire the developer login** (**A-13**). The local `data/sree.db` owner account still answers to the password this register used to print (B-29). Start production on a freshly seeded database and create the owner with `npm run admin:create`, **or** rotate that password from Admin → Account, and confirm the old string now gets `401 AUTH_FAILED`. The audit did not change it: resetting a working credential is the shop's decision, not a reviewer's.

---

## 4. Gate for version control and rollback

Neither `D:\SreeCollections` nor `store` is a Git repository: no commit history, no `git blame`, no tag, no way to revert. What exists instead is two snapshots — `sree-collections-store-2026-10-24.zip` (before this audit round) and the §6 artifact built from the tree this report describes — and `REPAIR_CHANGELOG.md` had to be reconstructed by hand because nothing else recorded what changed between them.

Consequence for release decisions: **every change in this round is currently only as safe as the ZIP.** `REPAIR_CHANGELOG.md` §2–§3 records the server and frontend files touched in this round, and none of them has a `git revert` behind it — if one of those edits turns out to be wrong in production, there is a re-upload of an older archive, which also discards real orders and settings.

Minimum acceptable state before opening for orders, in this order:

1. `git init` inside `store/`, commit the tree as-is, tag it `v0.1.0-audit`.
2. `.gitignore` already ships and already lists `node_modules/`, `dist/`, `dist-server/`, `data/*.db{,-shm,-wal}`, `.env`, `.env.local`, `_qa/shots/`, `_qa/*.log`, `_qa/vitest.json` and `uploads/` (the last four entries were added in this round so the ignore list matches the archive's exclusion list). Verify anyway, before the first commit, with `git status --porcelain` — it must show no `.env`, no database file and no log line carrying a token.
3. Push to a **private** remote (the store's own organisation, not a public repository), then make the §3 items 2–4 as commits. The `data/sree.db` inspection values quoted in `AUDIT_BASELINE.md` §4 become replaceable by real queries the moment history exists.
4. Keep the ZIP as a transport artifact only. It is not a history.

Rollback plan, given no history: before each owner-side change in §3, copy `data/sree.db` to a dated file **and** take the SQLite WAL checkpoint (`PRAGMA wal_checkpoint(TRUNCATE)`) so the copy is complete, not half-written. One file holds every order (`OPERATIONS.md`, **A-12**).

---

## 5. What this verdict does **not** cover

Honest limits, because "READY" claims more than a code-and-configuration audit inside one machine can know:

* **No load, soak or capacity test.** API latency is 9 sequential samples per route on localhost (medians 3–8 ms). Concurrency, cold cache, a remote disk and a noisy neighbour are unmeasured, so **no traffic figure is promised** and none should be quoted to a hosting provider as tested. (`MASTER_FEATURE_MATRIX.md` cites this section.)
* **The clean-unpack run is closed for the browser evidence.** `node _qa/run-checks.mjs _qa/prod-probe.mjs _qa/a11y-check.mjs _qa/visual-check.mjs` was executed inside a directory that had only ever held the unpacked ZIP, after `npm ci` + build in that same directory: 20 production probes, 112 accessibility assertions with `FAILURES 0`, 26 visual surfaces with `ERRORS 0`, exit 0 overall (`_qa/release-archive-browser.log`). That removes the last piece of machine-specific evidence from the browser half of this verdict. The 12 layout-shift budget assertions were run from the working tree with the same self-provisioning harness (`_qa/release-perf.log`) and were not re-run inside the extraction — the harness there does not read the developer database either, so the claim is "reproducible", not "reproduced twice". What none of this does is make the numbers a real handset or a real screen reader: they are Chrome-plus-CDP measurements on emulated throttling.
* **No integration is verified, because none exists.** Payment, courier, route distance and WhatsApp Business API are all BLOCKED BY EXTERNAL DEPENDENCY — no sandbox was reachable from this environment, so nothing here is marked working. A provider key added to `.env` changes only a health label, never a capability.
* **No screen reader, no real handset, no pixel-diff.** Accessibility is 112 DOM/CSSOM/contrast/focus assertions; performance is Chrome under CDP CPU (4×) and network throttling — an emulation of a cheap phone, not a measurement on one. CrUX/Lighthouse field data after launch is the missing half.
* **Email, invoice and WhatsApp paths are proven as *code*, not as *delivery*.** The senders run, the templates render, the escaping is asserted, and the confirmation page refuses to claim a send that did not happen — but no message left this machine, by design and by authorization boundary (`AUDIT_BASELINE.md` §9).
* **Two register items are honestly unverified by an automated assertion:** B-16 (a code fix with no test at all) and B-06's password/resend/unsubscribe limiters (wired, read, never fired at 11 attempts to prove a 429). Nine other fixes are pinned by script probes rather than by `npm test`, so a plain `npm test` green does **not** reproduce them.
* **`configured_no_adapter` cannot be executed here** (B-24): no provider credentials exist in this environment, by the audit's own rule, so that branch is verified by code read.
* **The home page keeps a 0.067 CLS at 4G on purpose** (B-26) — inside the "Good" band, traced to two named lines, and the fix would cost visible space on the page every customer enters.

---

## 6. Release artifact

`D:\SreeCollections\sree-collections-store-2026-10-26.zip` — **203 entries** with forward-slash names, so the archive unpacks correctly on Linux/macOS and not only on Windows; the tree as audited plus these eleven documents. The byte size and digest are not written here: the archive contains this document, so any number inside it would already be stale. Read them from the sidecar.

**Excluded on purpose:** `node_modules`, `dist`, `dist-server`, `data/*.db*` (no database, so **no customer row, no session, no order** travels with the archive), `.env` (only `.env.example` ships, and it carries no value the code reads as live), **every `_qa/*.log`** plus the generated `_qa/shots/` and `_qa/vitest.json` (`TEST_RESULTS.md` §7 is the command list that regenerates them), uploads, and any credential. The `_qa` folder in the archive therefore holds exactly the eight runnable harness scripts. The first build of this artifact got that wrong — it shipped scratch scripts and stale logs and omitted `_qa/fresh-db.mjs`, which made the shipped harness unable to run; the rebuild is what §1 rows 10–11 tested.

**Verified, not assumed:** the archive was extracted to an empty directory, diffed file-for-file against the tree that produced the 124-test run (**identical**), and then, **inside that extraction**, `npm ci --prefer-offline` (269 packages) → `npm run typecheck` (exit 0) → `npm test` (124 passed) → `npm run build` (exit 0) → `npm run e2e` (27 PASS) → `node _qa/run-checks.mjs _qa/prod-probe.mjs _qa/a11y-check.mjs _qa/visual-check.mjs` (112 PASS / `FAILURES 0`, 26 AUDIT / `ERRORS 0`, 20 probes, `RUN_CHECKS_EXIT=0`). Logs: `_qa/release-archive-tests.log`, `_qa/release-archive-build.log`, `_qa/release-archive-browser.log`.

**One npm-install fact, recorded rather than approved:** npm's `allowScripts` policy blocked the `esbuild@0.28.2` postinstall script inside the extraction. It was not approved. The build was run anyway and produced exit 0 with an identical hashed asset set, so the blocked script does not affect this project's output — but an owner installing on a different machine should expect that prompt and know it is safe to leave declined.

**Integrity:** the SHA-256 of this archive is published in the sidecar file `sree-collections-store-2026-10-26.zip.sha256` next to it, because a document cannot contain its own archive's digest.

**What the archive does not prove:** it is a source archive, not a deployment. Nothing here was installed under systemd, put behind nginx, given a TLS certificate, or run with a real `.env` — gate 4 in §3 is still the owner's, and `npm ci` on a Linux host with a different Node build has not been exercised (this run was Windows, Node `v24.19.0`, npm `12.0.2`).

---

## 7. First week after going live

* **Day 0:** one real order end-to-end (§3 item 5), watched from both sides — the shopper's inbox and the admin screen. Confirm the WhatsApp handoff opens on a real phone with the prepared message intact.
* **Day 1–2:** `SELECT status, COUNT(*) FROM orders GROUP BY status` daily; every `pending` older than the zone ETA is a process problem, not a code problem. Watch `GET /api/v1/health` for `email` labels and the warn-level log lines (`error_count` must stay 0).
* **Day 3:** restore drill from a real backup into a spare `DATABASE_PATH`; open an old order. Keep the result logged.
* **Day 7:** re-run the benchmark against the deployed origin (`node _qa/perf-check.mjs`) with the owner's photographs in place, and read the CLS budget line before believing anything else in this document's speed numbers. Check the 4.4★ / "Since 1998" decision (A-7) against the first real customer feedback.
* **Continuously:** any owner edit that should be reversible (§4) must be a commit. Unverified areas — gift finder ranking, category pages, customers list, audit log page, dashboard chart, search suggestions — are marked IMPLEMENTED BUT UNVERIFIED in the matrix **on purpose**, so the first bug report in one of them is not a surprise.

---

## 8. Conditions that would let this verdict change

| Verdict | Becomes true when |
| --- | --- |
| **READY WITH CONDITIONS** | A-1, A-2/A-3, A-4/A-5, A-9 are supplied and verified; §3 items 1, 5, 6, 7 and 9 pass against the real origin (item 9 = the developer login from B-29 is retired or rotated); A-7 is sourced or deleted; A-6 has a named reviewer. Conditions then carried forward: real-handset and field-data performance, AT testing, load testing, and the unverified UI areas. |
| **READY** | Additionally: an email that demonstrably arrives, a policy set reviewed by someone accountable for it, a backup that has been restored, a Git history that can be reverted, and one week of live orders with `error_count` at zero. |
| **BROKEN / NOT SAFE TO LAUNCH** | Not the current state. Nothing in §1 says money is computed wrongly, stock is unsafe, or a customer's data is exposed — those are the areas with the deepest executed evidence in this repository. |

The one thing this document will not do is convert a missing business input into a code-level "pass". Of the seven blocking items in §1, six are numbers, sentences and sign-offs only the shop can state, and the seventh (A-1) is an email account only the shop can buy; that is the entire distance between NOT READY and READY WITH CONDITIONS. **A-13 / B-29 sits outside that distance** — it is a five-minute credential rotation the shop has to choose to do, and this audit deliberately did not do it for them.
