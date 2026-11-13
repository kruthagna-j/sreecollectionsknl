# Integrations

The store works without any provider for **cash on delivery**. Email and the WhatsApp handoff have working code paths, but email stays disabled until real SMTP credentials are supplied; WhatsApp is a click-to-chat handoff, not a Business API integration.

## Status at a glance

| Capability | Status | Customer-facing behaviour |
| --- | --- | --- |
| Cash on delivery | Working | Available when enabled in settings and within the COD maximum |
| Online payments (Razorpay placeholder) | **Not implemented** | Option is disabled in checkout with "Not configured — no payment can be taken online." API returns `503 PAYMENT_PROVIDER_UNAVAILABLE` |
| Transactional email (SMTP) | **Implemented, not configured here** | With `SMTP_URL` + `SMTP_FROM` set, order invoices are emailed to the customer and owner and logged in the order's message log. Without them, each attempt is recorded as `not_configured` and the UI says no email was sent |
| PDF invoice | Working | Rendered with PDFKit server-side and streamed from the invoice route; attached to order emails |
| WhatsApp handoff | Working (click-to-chat) | After a COD order the confirmation page opens `wa.me` with a ready-to-send message for the shop, including a link to the invoice PDF. The customer must press send in WhatsApp |
| Courier booking / automatic tracking (Shiprocket placeholder) | **Not implemented** | Staff can paste a real tracking number and https link. No courier is contacted |
| SMS | **Not implemented** | Not offered |
| Google route distance (placeholder) | **Not implemented** | Delivery is PIN-zone based, not distance based |
| Analytics / ad pixels | **Not implemented** | No third-party scripts |
| Reviews provider | Not needed | Reviews are stored locally and moderated in admin |
| Newsletter delivery | **Not implemented** | Consent is stored; API explicitly returns `delivery: "not_configured"` |

## How capability labels work

`/api/v1/health` and `/api/v1/content/site` inspect environment variables and report:

- `not_configured` — variables absent.
- `configured_unverified` — variables present. **This does not mean delivery has been proven.** No SMTP handshake or inbox receipt is part of the automated test suite; the operator must send a real test order through their provider.
- `click_to_chat` — a WhatsApp number is saved in store settings and links are generated. No message is sent by the server.

The storefront uses these labels only for disclosure copy. The checkout's online option is always disabled and the server always rejects online payment.

## Environment

```dotenv
# Payments and courier placeholders (not read by any adapter)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=
GOOGLE_ROUTES_API_KEY=

# Email (real adapter)
SMTP_URL=smtp://user:password@host:587
SMTP_FROM="Sree Collections <orders@yourdomain.com>"
```

`SMTP_URL` accepts `smtp://` (STARTTLS) or `smtps://` (implicit TLS, default port 465). URL-encode special characters in the password. `APP_ORIGIN` must be the public site origin because invoice links in emails are built from it.

Only `SMTP_URL`/`SMTP_FROM` activate a real provider call. Filling the other placeholders only changes a capability string.

## How order messages work

1. Checkout commits the order, stock movement and coupon redemption in one transaction.
2. `queueOrderNotifications` writes one row per enabled recipient into `order_notifications`:
   - `email_customer` to the checkout email;
   - `email_owner` to the notification settings owner email, falling back to the store support email.
3. If SMTP is configured, a background pass renders the invoice PDF and sends each email with the PDF attached. Each row ends as `sent` or `failed` with the provider error.
4. If SMTP is not configured, rows are written as `not_configured` and no network call is made.
5. Staff can see every row on the admin order page and resend customer/owner mail. A resend without SMTP returns `503 EMAIL_NOT_CONFIGURED` and records the attempt.
6. The customer's confirmation page and the tracking page show the email state honestly and link to the printable/PDF invoice.

The WhatsApp handoff is separate: it is a `https://wa.me/<number>?text=...` link generated in the browser from the saved store WhatsApp number (the seed ships `919494498937`; change it in Admin → Settings → Store). Opening it does **not** send anything; the customer still presses send.

### Owner email content

Items, quantities, totals, delivery fee, address, phone, email, gift message, customer note and the invoice PDF attachment. Reply-To is the customer's email so the shop can answer directly.

## What a real integration must add

Provider work belongs on the server. Secrets must never reach the frontend, the database seed or source control.

### Online payments

1. Server-side provider SDK/HTTP client using credentials from the environment.
2. A `POST /checkout/payment-intent` style endpoint that creates a provider order for the server-calculated amount.
3. Return only the public key/order reference to the browser.
4. Webhook endpoint with signature verification, replay protection and idempotent handling.
5. Order creation/payment-status update only after verified server-side confirmation; never trust a browser "success" flag.
6. Refund path and reconciliation report.
7. Sandbox test evidence recorded against a real provider test account.

Until all of that exists, keep the current hard `503` in `server/routes/checkout.ts`. It prevents an order being marked paid without money arriving.

### Email hardening still recommended

1. A verified sending domain (SPF, DKIM, DMARC) and a provider with delivery feedback.
2. A scheduled retry queue. Today sending happens in-process right after checkout; failed rows are visible but are not retried automatically.
3. Password reset and status-change templates (the outbox currently covers the order invoice only).
4. Real inbox-delivery evidence from the operator's provider.

### WhatsApp Business API (only if needed)

The click-to-chat handoff needs no account and sends nothing by itself. Automated templates would require a WhatsApp Business account, server-side token, approved templates, consent tracking, opt-out handling and delivery evidence. Do not describe the handoff as an automated WhatsApp notification.

### Courier and tracking

1. Provider authentication and pickup/address configuration.
2. Shipment creation from a packed order with correct weight/dimensions.
3. Webhook or polling for real scans, mapped to internal statuses without inventing events.
4. Tracking URL returned by the provider; staff should not hand-type scans.
5. Failure/exception handling and cancellation.

Today the admin can store a genuine tracking number and `https://` link. That is a manual record, not an integration, and the UI labels it as such.

### Route distance

Distance-based delivery would need an origin address (store latitude/longitude already exist in settings), a routing API key, caching, and a fallback to PIN zones when the provider is unavailable. The current zone model is deterministic and auditable, which is preferable until a provider is contracted.

## Shipping model in use

Delivery is configured in **Admin → Delivery zones**:

- One or more zones, each with a list of PIN codes or `start-end` ranges.
- Fee in paise, optional free-above threshold, ETA in working days.
- The first active matching zone wins (ordered by sort order).
- Unmatched PINs are rejected at checkout with `OUT_OF_DELIVERY_AREA`.

The seed ships a `zone-all-india` fallback covering `100000`–`999999` (₹99, free above ₹1,999, 4–7 working days) plus a Kurnool local zone (`518001`–`518999`, ₹49, free above ₹2,500, 1–2 days). The owner can edit both fees, thresholds and ETAs in Admin → Delivery zones, and can narrow coverage by deactivating the fallback.

## Integration acceptance rule

No row above may be changed to "working" without:

1. A real or sandbox provider account.
2. A recorded request/response or webhook test.
3. A browser-visible flow exercised end to end.
4. Failure-path testing (timeout, rejected payment, bad signature).
5. Credentials kept out of the repository and release archive.

Email is marked "implemented, not configured here" rather than working because no mailbox has received a message from this checkout.
