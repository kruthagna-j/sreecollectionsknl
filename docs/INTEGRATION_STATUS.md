# Integration status

**Rule enforced here (from the brief):** *no integration is marked working until it has been tested with the provider's sandbox or a real authorized environment.* Nothing in this repository has been able to satisfy that rule except the SQLite database itself.

**Environment during the audit:** no provider credentials, no outbound internet from the API process, and an explicit prohibition on sending real SMS/WhatsApp/email or booking real shipments. Every "not verified" below is therefore an *environment limit*, not a guess about the provider.

---

## 1. Status table

| Integration | Adapter in code? | Credentials | Health label observed | Can it be marked working? |
| --- | --- | --- | --- | --- |
| **Cash on delivery** (the store's real "payment rail") | yes, first-party | none needed | n/a | **Yes — verified.** `lifecycle.test.ts`, `flows.test.ts`, e2e "COD order is placed and confirmed" |
| **Online payments** (card/UPI/wallet) | **no adapter at all** | `.env.example` keys exist but enable nothing | `onlinePayments: "not_configured"` in the `health` row of `_qa/final-prod-probe.log` | **No.** `server/routes/checkout.ts:136-142` returns `503 PAYMENT_PROVIDER_UNAVAILABLE` for `paymentMethod:"online"` unconditionally, before any order row or stock write (asserted by `flows.test.ts > "rejects online payment without taking money"`). |
| **Transactional email (SMTP)** | **yes, complete** — `server/lib/mailer.ts` (nodemailer 10, host/port/secure inferred, 15 s connect / 10 s greeting / 20 s socket timeouts, PDF attachment, `info.accepted` check) | `SMTP_URL` + `SMTP_FROM` present but **empty** | `email: "not_configured"` | **No.** The code path, the outbox rows, the message log and the honest `503 EMAIL_NOT_CONFIGURED` resend refusal *are* verified. **The send itself is not.** |
| **Owner notification email** | yes (same adapter) | `settings.notifications.ownerEmail` is `""` | n/a | **No, and currently cannot fire at all** — `queueOrderNotifications()` only pushes an `email_owner` recipient when `ownerRecipient()` resolves (`server/lib/notifications.ts:79-84`). Setting is `sendOwnerEmail: true` with an empty address. |
| **WhatsApp** | **handoff only** — no Business API, no webhook | store number `919494498937` (user-supplied) | `whatsapp: "click_to_chat"` | **Partly.** The generated `wa.me` link and its exact text are verified (e2e "confirmation opens WhatsApp with the prepared order message"). **The store never sends a message**; the customer presses send in their own app. No delivery receipt exists. |
| **Courier / shipment booking (Shiprocket etc.)** | **no adapter** | keys documented, unused | `courier: "not_configured"` | **No.** Staff paste a tracking number and an `https://` URL; nothing is fetched. `trackingUrl` is never requested server-side, so there is no SSRF surface either. |
| **Live tracking scans** | no | — | — | **No.** The order timeline shows *staff-entered* statuses only. |
| **Route-distance delivery pricing (Google Routes)** | **no adapter** | key documented, unused | `routeDistance: "not_configured"` | **Not applicable today** — the zone/PIN model replaced it deliberately (`shipping.ts`). |
| **SMS** | none, and none claimed | — | `sms: "not_configured"` | Not offered. |
| **Address verification / PIN validation** | first-party zone table | — | — | **Verified** — `pricing.test.ts` zone suite (8 tests) + `flows.test.ts` unserviceable-PIN case. |
| **PDF invoice generation** | yes, `pdfkit` | none needed | — | **Verified for the route** (content-type, `no-store`, opens in e2e). **Not verified** glyph/layout on paper or in a print dialog. |
| **Analytics / SEO submission** | none | — | — | robots + sitemap are served and verified; **submitting them to Google was not done** (needs the real domain + owner account). |
| **Maps / store locator** | static coordinates + a link, no Places API | — | — | Rendered in visual audit; no external API call. |

## 2. Label change made during this audit (B-24)

Before: health/content derived the label from *credential presence* alone, so setting `RAZORPAY_KEY_ID` would have made both endpoints report the payment integration as `configured_unverified` even though **no gateway code exists in the repository**. That is precisely the "mark an integration as working" mistake the brief forbids — just one layer earlier.

After (`server/app.ts:136-141`, `server/routes/content.ts:89-96`):

| Credential state | Adapter exists? | Label |
| --- | --- | --- |
| absent | any | `not_configured` |
| present | **no** (payments, courier, route distance) | `configured_no_adapter` |
| present | **yes** (SMTP) | `configured_unverified` |
| present **and a real send observed** | yes (SMTP) | *would be* `verified` — **not implementable in this environment, so the value is never emitted** |

`.env.example` now states the same thing in plain language, so an operator cannot read "set the key" as "payments turn on".

## 3. What a real email integration requires, and how it would be proven

The work is configuration plus one observed send — no code change is expected:

1. An SMTP account the business owns, with `SMTP_URL=smtps://…` and `SMTP_FROM` set to the **verified** sending address (domain SPF/DKIM configured by the owner).
2. `notifications.ownerEmail` set in admin → Settings, or the owner copy has no recipient.
3. One test order placed with a **test** address, then proof of: the inbox receiving it, the PDF opening, and the admin message log showing `sent` rather than `queued`/`failed`.
4. A deliberate failure run (bad credentials) to confirm the outbox records `failed` with the provider error and that the storefront confirmation still tells the truth (`"We could not email the invoice — here it is instead"`).

Step 3–4 are impossible here: there is no mailbox and no permitted outbound send. Until they are done, **the honest statement to the shop is "invoice by email is not live"**, which is exactly what the UI says today (e2e "confirmation is honest about email delivery").

## 4. Payment integration: what would have to be built first

Enabling card/UPI is **not** a credentials task. The audit found no payment code at all, and the money-logic gaps make it unsafe to add casually:

1. A gateway adapter with a server-side order intent (amount computed from `buildQuote`, never from the browser).
2. A `payments` table (reference, amount, mode, status, captured_at) — today `orders.payment_reference` is a single nullable text column with **no writer in the codebase**, so nothing can record a real capture.
3. Webhook ingestion with signature verification and idempotency (`.env.example` even names a webhook secret that no route consumes).
4. Refund capability, because returns currently move no money (`FINANCIAL_AND_ORDER_LOGIC_AUDIT.md` §11) — COD-only makes that tolerable, card payments would make it a customer-facing harm.
5. PCI scope decision (hosted checkout page vs. API) and a sandbox certification run.

**Recommendation:** do not enable online payment until 1–4 exist and are tested against a sandbox. This is recorded as a deliberate launch boundary, not a bug.

## 5. Courier integration: minimal honest path

Today the flow is: staff pack → mark shipped → paste tracking number + `https://` URL → customer sees it on `/track`.

That is already the safest possible design without an integration, because nothing is asserted that wasn't typed by a human. A real integration would need a shipment-creation call, a label artefact, and a scan webhook. Until then the storefront must not imply live tracking — the track page wording and the e2e "guest order tracking works with the checkout email" check keep it to status events, which is what the data actually holds.

## 6. Deliverables this audit could not produce, and why

| Deliverable | Status | Reason |
| --- | --- | --- |
| "Payment sandbox test passed" | **not claimed** | no gateway adapter, no credentials |
| "Order email delivered to a real inbox" | **not claimed** | no SMTP credentials; sending was prohibited |
| "Courier shipment created / label printed" | **not claimed** | no courier credentials; prohibited |
| "WhatsApp message delivered to the shop" | **not claimed** | the customer sends it; no API receipt exists to observe |
| "Live tracking scan visible to the customer" | **not claimed** | no courier integration |
| robots.txt + sitemap served correctly | **claimed and verified** | `_qa/final-prod-probe.log`, `tests/api/flows.test.ts` crawler tests |
| Order placement, stock, totals, invoice content, WhatsApp link text, admin fulfilment | **claimed and verified** | 124 tests + 27 e2e checks |

## 7. Bottom line

**One rail works and is tested: cash on delivery.** One integration (SMTP email) is **fully coded but unproven** because it has no credentials. WhatsApp is a **verified link generation**, not a verified message delivery. Payments, courier and distance pricing are **documented placeholders with no adapter**, and this audit tightened their labels so nobody can mistake a set-but-unused key for a capability.

The store can launch honestly on COD + on-screen/PDF invoice + WhatsApp handoff, provided the owner supplies real contact facts and, if email confirmation matters to them, SMTP credentials plus one observed test send.
