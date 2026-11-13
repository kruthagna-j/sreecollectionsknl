# Financial and order-logic audit

**Subject:** every rupee that moves through this store — how it is computed, stored, displayed and reported.
**Reviewed files:** `server/lib/pricing.ts`, `server/lib/shipping.ts`, `server/lib/orders.ts`, `server/routes/checkout.ts`, `server/routes/cart.ts`, `server/lib/invoice.ts`, `server/lib/invoice-pdf.ts`, `server/lib/notifications.ts`, `server/routes/admin.ts` (summary/queries), `src/components/OrderDetails.tsx`, `src/lib/whatsapp.ts`.
**Method:** line-by-line read of the arithmetic, then execution of the 30 pricing/order unit tests, the checkout API tests, and one new reconciliation test written for this audit.
**Date:** 2026-10-26.

---

## 1. Money model

| Rule | Implementation | Status |
| --- | --- | --- |
| No floating-point currency | every amount is an **integer number of paise**; ₹1 = 100 | Verified (all columns are `INTEGER`) |
| Single currency | `currency TEXT DEFAULT 'INR'`, `orders.currency` CHECK-free but always `'INR'` at insert | Verified by code read |
| Display formatting | `rupees()` server-side (`server/lib/http.js`) and `money()` client-side | Verified — invoices/e2e show `₹` strings |
| Rounding | `Math.round()` on each derived amount; no `toFixed` arithmetic | Verified |
| Prices live on the server | `products.price`, `products.sale_price`, `product_variants.price`; the browser never supplies a price that survives | `security.test.ts > "ignores every price, discount and status field the browser tries to inject"` |
| Unit price precedence | `variant.price` → `product.sale_price` → `product.price` (`server/lib/pricing.ts:165`) | Verified by `pricing.test.ts > "uses the selected variant's server price, not the product headline price"` |

**Business-logic nuance worth flagging (F-6):** for a product that has variants, the *product-level* `sale_price` is bypassed entirely — only the variant price is used. That is a deliberate rule, but a shop owner who sets a site-wide sale price on a variant product will see no change. It should be written in the admin help text, not guessed.

## 2. The quote pipeline (exact, in order)

`buildQuote()` (`server/lib/pricing.ts:295-415`) is the **only** path to a total. Checkout calls it, the cart calls it, and the invoice never recomputes anything — it reads the stored row.

```
1  line             lineSubtotal = unitPrice × quantity          (quantity floored at 1)
2  line             giftWrapFee  = giftWrap.fee × quantity       (only if product.gift_wrappable)
3  cart             subtotal        = Σ lineSubtotal (available lines only)
4  cart             giftWrapTotal   = Σ giftWrapFee
5  coupon           discount        = evaluateCoupon(subtotal, email, userId)
6  allocation       lineDiscount    = round(discount × lineSubtotal / subtotal)
                     last line       = discount − Σ(previous allocations)   ← remainder, not rounded
                     lineTotal       = lineSubtotal − lineDiscount
7  cart             goodsAfterDiscount = max(0, subtotal − discount)
8  shipping         quoteShipping(pincode, goodsAfterDiscount) → fee | 0 if a free-shipping coupon
9  tax              per line, rate = line.taxRateBps ?? defaultRateBps
                     inclusive: taxIncluded += round(taxable × rate / (10000 + rate))      [informational]
                     exclusive: taxExclusive += round(taxable × rate / 10000)               [added]
                     gift wrap is always taxed at the *default* rate, not the product rate
10 cod              codFee = (method=cod and cod.enabled) ? cod.fee : 0
11 total            goodsAfterDiscount + giftWrapTotal + shippingFee + codFee + taxExclusive
```

### 1. Invariants checked

| Invariant | How proven |
| --- | --- |
| `Σ line_total + gift_wrap_total + shipping_fee + cod_fee + tax_exclusive == total` | **new test this round:** `tests/api/flows.test.ts > "stores the cash-on-delivery handling fee so every printed total reconciles"`, asserted both on the API payload *and* on the raw database row |
| Discount allocation is exact (no paise gained or lost) | remainder assigned to the last line (`pricing.ts:319-329`); `security.test.ts > "applies the discount cap and keeps the totals arithmetic exact"` |
| A line's discount never exceeds that line's subtotal | `Math.max(0, Math.min(share, lineSubtotal))` |
| An unavailable (unpublished/variant-gone) line contributes nothing | `available = lines.filter(l => l.available)`; `pricing.test.ts > "excludes unpublished items and reports why"` |
| Free-shipping threshold is judged on **goods after discount**, not on the raw subtotal | `quoteShipping(db, pincode, goodsAfterDiscount)`; `pricing.test.ts > "applies the free-delivery threshold to the goods total"` |
| Tax is never double-counted when `inclusive` | inclusive mode puts the amount in `tax_included` only; `total` adds only `taxExclusive` |
| Empty or unserviceable carts produce `issues`, not a silent zero | `pricing.test.ts > "returns an empty quote with a clear issue for an empty cart"`, `"reports unserviceable when no active zone covers the PIN"` |

## 3. What the browser cannot influence

`POST /api/v1/checkout` accepts only contact, addresses, `paymentMethod`, `giftMessage`, `customerNote`, `acceptTerms`, an optional idempotency key (`server/routes/checkout.ts:100-101`). Prices, `subtotal`, `discount`, `total`, `status`, `payment_status`, `stock` and `coupon_code` are **not** read from the body — the coupon is taken from the server-side cart row, so naming a code at checkout without having applied it does nothing:

- `security.test.ts > "ignores every price, discount and status field the browser tries to inject"`
- `security.test.ts > "refuses a coupon the shopper names at checkout instead of honouring it"`
- `security.test.ts > "prices from the database after an admin change, not from the saved cart"` — a stale cart is re-priced, not trusted.

## 4. Coupons

| Behaviour | Evidence |
| --- | ---|
| Kinds: `percent`, `fixed`, `free_shipping` | `pricing.test.ts` "supports free-delivery coupons", "caps fixed coupons and never discounts below zero" |
| Minimum subtotal enforced | "rejects a coupon below its minimum subtotal" |
| `maxDiscount` cap enforced | "applies a percentage coupon before delivery and allocates it to the line" |
| Start/end window and per-email limit | "enforces per-email redemption limits"; `customer.test.ts > "blocks a second use by the same email and enforces the total usage cap"` |
| Redemption is written once, in the checkout transaction, against the real coupon id | `server/routes/checkout.ts:275-281` + a DB uniqueness constraint on `coupon_redemptions` |
| Guessing is throttled and codes are length-minimum enforced | `security.test.ts` "will not accept a coupon code short enough to guess", "stops a scripted run from probing coupon codes at speed" |
| A discount applies to **goods only** — gift wrap and delivery are not discounted | code read; `giftWrapTotal` is added after `goodsAfterDiscount`. Documented as rule F-7 for the owner. |

## 5. Delivery charges and promises

Local zone `518001–518999` → ₹49, free above ₹2,500, ETA 1–2 days. All-India zone `100000–999999` → ₹99, free above ₹1,999, ETA 4–7 days. Zone resolution:

- PIN normalised and validated as 6 digits before matching (`"rejects malformed PIN codes"`).
- The **more specific** zone wins over the all-India fallback (`"prefers the more specific zone before the all-India fallback"`).
- Inactive zones are skipped (`"ignores inactive zones"`), and an uncovered PIN returns an explicit "not serviceable" rather than a zero fee (`"reports unserviceable when no active zone covers the PIN"`, `flows.test.ts > "reports an unserviceable PIN when no active zone covers it"`).
- The zone name and ETA range are **snapshotted onto the order** (`shipping_zone`, `eta_days_min/max`), so later zone edits cannot rewrite what the customer was promised. That is correct financial/legal behaviour.
- **No courier tariff was available to this audit**, so the fee/ETA numbers are unvalidated business commitments — see `OWNER_ACTION_REQUIRED.md` A-4. The *logic* is verified; the *values* are not.

## 6. Tax

- Default rate 500 bps (5%), applied per line from `products.tax_rate_bps`, falling back to the default when the column is negative.
- `settings.tax.inclusive` drives the mode; the local value is `true`, so displayed prices are GST-inclusive and `total` adds nothing.
- Gift wrap is taxed at the **default** rate rather than the item's rate (`server/lib/pricing.ts:358` and `:361`) — reasonable (services vs goods) but a *choice*, not a verified rule.
- A malformed tax setting is caught and leaves tax at zero while the payable total stays server-computed (`pricing.ts:364-366`) — fails safe on the customer's side, but silently under-reports tax. Recorded as **F-8**.
- `"adds exclusive tax to the payable total when configured"` proves the exclusive branch adds exactly the computed amount.
- **Not present and not invented:** GSTIN on the invoice (the field exists in the settings type but no number was supplied), place-of-supply logic, CGST/SGST vs IGST split for the *inclusive* case (the PDF does split when a tax amount is shown), HSN-code summary block, and any tax-period export. → `OWNER_ACTION_REQUIRED.md` A-5, and MISSING in the feature matrix. **This audit did not guess a tax number.**

## 7. Cash on delivery

| Control | Value / behaviour | Evidence |
| --- | --- | --- |
| Availability | `cod.enabled && total <= cod.maxTotal` → `paymentOptions.cod.available` with a human reason when false | `pricing.test.ts > "disables cash on delivery when the configured value is exceeded"` |
| Ceiling | ₹10,000 (`maxTotal: 1000000` paise) — an *unvalidated business choice*, low enough that a single fraudulent COD order caps the loss | `security.test.ts > "refuses a cash-on-delivery order above the configured ceiling"` |
| Handling fee | `cod.fee`, added to `total` when method is COD — currently **0** | see finding F-1 below |
| Payment status lifecycle | `cod_pending → paid` on `delivered`; `refunded` only via the returns workflow; `failed` is representable but nothing writes it | `lifecycle.test.ts > "walks the ladder, marks cash on delivery paid and keeps an event trail"` |
| Online payment | refused with `503 PAYMENT_PROVIDER_UNAVAILABLE` **before** any order row or stock write | `flows.test.ts > "rejects online payment without taking money"` (asserts the order count is unchanged) |

### F-1 (P2, latent — FIXED this round) COD fee was charged but never recorded
- The quote put `codFee` into `total`, but `orders` had no column for it, so **the stored components could not sum to the stored total** the moment anyone set a non-zero COD fee — and the invoice/HTML/PDF/email/WhatsApp breakdowns would visibly fail to add up on a money document.
- Not customer-visible today only because `cod.fee = 0` in the local settings.
- **Fix:** migration **v5** `ALTER TABLE orders ADD COLUMN cod_fee INTEGER NOT NULL DEFAULT 0`; checkout persists `quote.codFee`; `serializeOrder` exposes `totals.codFee`; the HTML invoice, PDF invoice, customer email (text + HTML), owner email and the WhatsApp order text each print a "Cash-on-delivery handling" line when it is non-zero; `src/components/OrderDetails.tsx` and `src/lib/types.ts` carry the field.
- **Regression test:** `tests/api/flows.test.ts > "stores the cash-on-delivery handling fee so every printed total reconciles"` — sets `cod.fee = 3000`, quotes, orders, asserts the API totals *and the raw row* reconcile to `total`, asserts the invoice contains the handling line, and restores the setting in a `finally`.

## 8. Stock as a financial control

Stock is the other half of the money story: overselling creates refunds and reputation loss.

| Control | Implementation | Evidence |
| --- | --- | --- |
| No oversell | conditional `UPDATE … WHERE stock_quantity >= ?` and `changes === 0 → 409 INSUFFICIENT_STOCK` | `inventory.test.ts > "sells the last unit once, never oversells and never writes a negative stock"` |
| No lost update | all deltas are relative SQL writes, never read-modify-write | `"keeps an admin stock adjustment and a purchase from overwriting each other"`, `"applies two variant adjustments against the stored number"` |
| Negative guard on manual edits | `WHERE stock_quantity + ? >= 0` → `409 STOCK_BELOW_ZERO` | `"refuses an admin adjustment that would take stock below zero"` |
| Atomicity | stock writes, order insert, item insert, event, redemption and cart clear are one `transaction()` (BEGIN IMMEDIATE) — a failure anywhere rolls the whole thing back | code read of `server/routes/checkout.ts:176-290` + idempotency test |
| Ledger | `stock_movements(delta, reason, reference)` — reasons `order`, `cancel`, `adjust` | `flows.test.ts` asserts `{delta:-2, reason:'order'}` on the order number; lifecycle asserts `SUM(delta)=0` after a restock |
| Auditability of restock | `reference = order_number` links every restock to its order | `lifecycle.test.ts > "rejects a repeated status without restocking the bag again"` |
| Variant vs product stock | variant products aggregate active variant stock; product-level stock used only when no variants exist (`catalog.ts:106-108`) | `pricing.test.ts > "flags a missing variant and quantites above stock"` |

**Concurrency caveat, stated honestly:** `BEGIN IMMEDIATE` serialises writers inside **one process**. This deployment is single-process, so it holds; running two API instances against the same SQLite file would not share the in-process rate limiters and would contend on the write lock. Documented in `KNOWN_LIMITATIONS.md`, not tested.

## 9. Order identity, capability and idempotency

- Format `SC-YYYYMMDD-XXXXXX`, alphabet excludes `I O 1 0` to survive phone read-back; uniqueness is checked against the table with 8 attempts before `500 ORDER_NUMBER_FAILED`.
- **F-2 (P4, fixed this round):** the suffix came from `Math.random()`. Because the order number is half of the guest-lookup capability, it now comes from `node:crypto randomBytes(6)` (32 symbols divide 256 evenly, so the mapping is unbiased). Pinned by `tests/unit/orders.test.ts > "are well-formed, ambiguous-free and unique across a batch"` (500 draws, all distinct) and `"carry the date they were generated on"`.
- Guest access requires the **pair** — order number *and* the checkout email; either alone yields 400/404, never a partial record (`security.test.ts > "treats the order number plus the order email as the lookup capability"`, `flows.test.ts` asserts the wrong-email 404).
- `idempotency_key TEXT UNIQUE`: a repeated key returns `200 {idempotent: true}` with the same order number and touches stock once (`flows.test.ts > "treats a repeated checkout key as idempotent…"`, `inventory.test.ts > "honours one idempotency key for one order"`). An absent key is filled with a server-generated id, so the guard is never "off".

## 10. Documents and what they show

| Document | Totals source | COD line | Gift lines | Escaping | Verified |
| --- | --- | --- | --- | --- | --- |
| Printable HTML invoice | the stored order row | printed when `cod_fee` ≠ 0 | wrap, engraving, per-item card message | `escapeHtml()` on every interpolation | yes, 2 tests |
| PDF invoice | the stored order row | printed when non-zero | yes | pdfkit text (not HTML) | content-type + e2e open |
| Customer email (text + HTML) | stored row + items | yes | `gift_message` + per-item notes | `escapeHtml()` in HTML | `gift.test.ts` asserts both copies |
| Owner email | stored row + items | yes | yes | `escapeHtml()` | same test |
| WhatsApp handoff text | serialized order payload | yes | gift message appended | URL-encoded by construction | e2e asserts the link and its message text |

**Numbering gap (F-3, MISSING, deliberate):** the invoice is identified by the order number. There is no statutory sequential tax-invoice series, no "original for recipient" block, no RMA numbering for returns. Adding one requires a CA's input on format and a GSTIN; **this audit did not invent either.** → `OWNER_ACTION_REQUIRED.md` A-5/A-6.

## 11. Refunds — the money-truth gap

The returns workflow is a **state machine, not a payment rail**:
- `return_requests` has no amount column; there is no `refunds` table.
- Approving a return and marking it refunded sets `orders.payment_status = 'refunded'` and writes an event, with a mandatory staff note.
- Therefore *no code can move money back*, and *no partial refund can be expressed*. Verified by `inventory.test.ts > "records a refund once and refuses to refund the same return twice"` (that "once" is a **recorded fact**, not a transfer).

This is the single largest financial-logic gap in the system and the reason online payment must not be enabled until a refund rail exists (`INTEGRATION_STATUS.md` §2).

## 12. Reporting (what the owner's numbers actually mean)

`GET /api/v1/admin/summary` (`server/routes/admin.ts:336-393`):

| Metric | Query semantics | Correct? |
| --- | --- | --- |
| `order_value` | `SUM(total) WHERE status <> 'cancelled'` | Gross order value including delivery, wrap and any COD fee. Not net of refunds-by-status beyond `cancelled`. |
| `collected` | `SUM(total) WHERE payment_status = 'paid'` | For COD, cash is only "collected" at `delivered` — right for a COD shop. |
| `pending_cod` | `SUM(total) WHERE payment_status='cod_pending' AND status<>'cancelled'` | Includes orders that are *packed/shipped but uncollected* — a real receivables figure. |
| 14-day sales series | `SUM(total)` grouped by `substr(created_at,1,10)`, zero-filled per day, excluding cancelled | Bucketed on **creation** date, not payment date. Stated so the owner does not read it as cash-in-hand. |
| Top products | `SUM(oi.line_total)` by quantity | Line totals only: excludes gift wrap, delivery, COD fee. Product revenue ≠ order value — by design, but worth a tooltip. |

**No CSV/Excel export exists**, and no period close (F-4, MISSING). The owner currently reconciles by reading the screen.

## 13. Findings summary

| ID | Finding | Severity | Status |
| --- | --- | --- | --- |
| F-1 | COD fee charged into `total` but never stored → invoices could not reconcile | **P2 (latent)** | **Fixed** (migration v5 + 5 display surfaces + reconciliation test) |
| F-2 | Order-number suffix from `Math.random()` | P4 | **Fixed** (`randomBytes`, 500-draw uniqueness test) |
| F-3 | No statutory sequential invoice numbering, GSTIN, or RMA numbering | P2 | MISSING — needs the owner's tax inputs, deliberately not invented |
| F-4 | No accounting export or period close | P3 | MISSING |
| F-5 | Refunds are records, not money movement; no partial refunds | P2 | MISSING (no gateway) — must gate any payment launch |
| F-6 | Variant prices bypass `sale_price`, so a product-level sale price silently does nothing for variant products | P3 | Documented, not changed (changing it is a business rule the owner must pick) |
| F-7 | Discounts never apply to gift wrap or delivery | P4 | Documented rule; consistent across quote, invoice and email |
| F-8 | A malformed `tax` setting falls back to zero tax silently | P4 | Fails safe on price; flagged so an operator notices the admin screen |
| F-9 | Zone fees/ETAs, tax rate, COD ceiling and free-shipping thresholds are unvalidated business numbers | P2 | OPEN → A-4/A-5 |
| F-10 | Sales chart buckets by order creation, not by cash collected | P4 | Documented in §12 |

## 14. Verdict on the money logic

**The arithmetic is sound, server-authoritative, integer-exact and now self-consistent on every surface.** The tampering, oversell, double-spend, idempotency and restock paths are pinned by 30 unit tests plus the checkout/security API suites, and the totals identity is asserted on both the API payload and the stored row.

What keeps this from "financially complete" is not arithmetic but scope: no real refund rail, no statutory invoice series, no accounting export, and every configured *value* (fees, thresholds, tax rate, COD ceiling) still unconfirmed by the business. Those are owner/CA actions — listed in `OWNER_ACTION_REQUIRED.md` — and this audit deliberately did not guess them.
