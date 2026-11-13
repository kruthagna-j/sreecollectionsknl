import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useSite } from "../context/SiteContext";
import { useToast } from "../context/ToastContext";
import { AddressFields, emptyAddress, type AddressDraft } from "../components/AddressFields";
import { Alert, Breadcrumbs, CheckboxField, EmptyState, FormField, PageLoader, Spinner } from "../components/ui";
import { CheckIcon, LockIcon, ShieldIcon, TruckIcon } from "../components/Icons";
import { api, ApiError, errorMessage, fieldErrors } from "../lib/api";
import { money } from "../lib/format";
import { useSeo } from "../lib/hooks";
import { checkoutAttemptKey, clearCheckoutAttempt, rememberOrder } from "../lib/orderCache";
import type { Address, Order } from "../lib/types";

type Contact = { name: string; email: string; phone: string };

type ErrorGroups = {
  contact: Record<string, string>;
  shipping: Record<string, string>;
  billing: Record<string, string>;
  other: Record<string, string>;
};

const EMPTY_ERRORS: ErrorGroups = { contact: {}, shipping: {}, billing: {}, other: {} };

function groupErrors(error: unknown): ErrorGroups {
  const flat = fieldErrors(error);
  const groups: ErrorGroups = { contact: {}, shipping: {}, billing: {}, other: {} };
  for (const [key, message] of Object.entries(flat)) {
    const [head, ...rest] = key.split(".");
    const leaf = rest.join(".") || head;
    if (head === "contact") groups.contact[leaf] = message;
    else if (head === "shippingAddress") groups.shipping[leaf] = message;
    else if (head === "billingAddress" && rest.length) groups.billing[leaf] = message;
    else groups.other[key] = message;
  }
  return groups;
}

function validateForm(contact: Contact, shipping: AddressDraft, billingSame: boolean, billing: AddressDraft, accepted: boolean): ErrorGroups {
  const groups: ErrorGroups = { contact: {}, shipping: {}, billing: {}, other: {} };
  const checkAddress = (address: AddressDraft, target: Record<string, string>) => {
    if (address.recipient.trim().length < 2) target.recipient = "Enter the recipient's name.";
    if (!/^[6-9]\d{9}$/.test(address.phone)) target.phone = "Enter a valid 10-digit Indian mobile number.";
    if (address.line1.trim().length < 5) target.line1 = "Enter the street address.";
    if (address.city.trim().length < 2) target.city = "Enter the city.";
    if (address.state.trim().length < 2) target.state = "Choose a state.";
    if (!/^[1-9]\d{5}$/.test(address.pincode)) target.pincode = "Enter a valid 6-digit PIN code.";
  };
  if (contact.name.trim().length < 2) groups.contact.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email.trim())) groups.contact.email = "Enter a valid email address.";
  if (!/^[6-9]\d{9}$/.test(contact.phone)) groups.contact.phone = "Enter a valid 10-digit Indian mobile number.";
  checkAddress(shipping, groups.shipping);
  if (!billingSame) checkAddress(billing, groups.billing);
  if (!accepted) groups.other.terms = "Please accept the terms and privacy policy.";
  return groups;
}

function hasErrors(groups: ErrorGroups): boolean {
  return [groups.contact, groups.shipping, groups.billing, groups.other].some((group) => Object.keys(group).length > 0);
}

export function Checkout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cart, isLoading, isError, refresh, setPincode } = useCart();
  const { site } = useSite();
  const { notify } = useToast();

  const [contact, setContact] = useState<Contact>({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? ""
  });
  const [shipping, setShipping] = useState<AddressDraft>(emptyAddress);
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<AddressDraft>(emptyAddress);
  const [giftMessage, setGiftMessage] = useState("");
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<ErrorGroups>(EMPTY_ERRORS);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [chosenAddressId, setChosenAddressId] = useState<string | null>(null);
  const prefilled = useRef(false);

  useSeo({ title: "Checkout · Sree Collections", description: "Complete your Sree Collections order.", noIndex: true });

  const addresses = useQuery({
    queryKey: ["account", "addresses"],
    queryFn: () => api<{ items: Address[] }>("/account/addresses"),
    enabled: Boolean(user)
  });

  useEffect(() => {
    if (!user) return;
    setContact((current) => ({
      name: current.name || user.name,
      email: current.email || user.email,
      phone: current.phone || user.phone || ""
    }));
  }, [user]);

  useEffect(() => {
    if (prefilled.current || !user || !addresses.data?.items.length) return;
    const address = addresses.data.items.find((item) => item.isDefault) ?? addresses.data.items[0];
    prefilled.current = true;
    setChosenAddressId(address.id);
    setShipping({
      recipient: address.recipient,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode
    });
  }, [user, addresses.data]);

  const applyAddress = (address: Address) => {
    setChosenAddressId(address.id);
    setShipping({
      recipient: address.recipient,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode
    });
    setContact((current) => ({ ...current, phone: current.phone || address.phone }));
    setErrors((current) => ({ ...current, shipping: {} }));
  };

  const pinValid = /^[1-9]\d{5}$/.test(shipping.pincode);
  useEffect(() => {
    if (!cart || !pinValid || cart.shippingPincode === shipping.pincode) return;
    const timer = window.setTimeout(() => {
      setPinBusy(true);
      setPinMessage(null);
      void setPincode(shipping.pincode)
        .then((next) => {
          if (next.shipping && !next.shipping.serviceable) setPinMessage(next.shipping.message);
        })
        .catch((error) => setPinMessage(errorMessage(error)))
        .finally(() => setPinBusy(false));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [cart, pinValid, shipping.pincode, setPincode]);

  if (isLoading) return <PageLoader label="Preparing checkout…" />;
  if (isError || !cart) {
    return (
      <div className="container page-shell">
        <EmptyState
          title="Checkout is unavailable right now"
          description="We could not load your bag. Please try again."
          action={{ label: "Try again", onClick: refresh }}
        />
      </div>
    );
  }
  if (!cart.lines.length) {
    return (
      <div className="container page-shell">
        <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Bag", to: "/cart" }, { label: "Checkout" }]} />
        <EmptyState
          title="Your bag is empty"
          description="Add something thoughtful before checking out."
          action={{ label: "Browse the collection", to: "/shop" }}
        />
      </div>
    );
  }

  const cod = cart.paymentMethods.find((method) => method.id === "cod");
  const codAvailable = Boolean(cod?.available) && Boolean(site?.policies.cod.enabled);
  const pinMatches = pinValid && cart.shippingPincode === shipping.pincode;
  const serviceable = pinMatches && cart.shipping?.serviceable;
  const blocked = cart.lines.some((line) => line.issue);

  const updateBilling = (field: keyof AddressDraft, value: string) =>
    setBilling((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const nextErrors = validateForm(contact, shipping, billingSame, billing, accepted);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      setFormError("Please check the highlighted fields.");
      return;
    }
    setErrors(EMPTY_ERRORS);
    setSubmitting(true);
    try {
      const response = await api<{ order: Order; idempotent: boolean }>("/checkout", {
        method: "POST",
        body: {
          contact: { name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone },
          shippingAddress: {
            recipient: shipping.recipient.trim(),
            phone: shipping.phone,
            line1: shipping.line1.trim(),
            line2: shipping.line2.trim(),
            city: shipping.city.trim(),
            state: shipping.state,
            pincode: shipping.pincode
          },
          billingSameAsShipping: billingSame,
          ...(billingSame
            ? {}
            : {
                billingAddress: {
                  recipient: billing.recipient.trim() || shipping.recipient.trim(),
                  phone: billing.phone || shipping.phone,
                  line1: billing.line1.trim() || shipping.line1.trim(),
                  line2: billing.line2.trim(),
                  city: billing.city.trim() || shipping.city.trim(),
                  state: billing.state || shipping.state,
                  pincode: billing.pincode || shipping.pincode
                }
              }),
          couponCode: cart.couponCode ?? undefined,
          paymentMethod: "cod",
          giftMessage: giftMessage.trim(),
          customerNote: note.trim(),
          idempotencyKey: checkoutAttemptKey(),
          acceptTerms: true
        }
      });
      clearCheckoutAttempt();
      rememberOrder(response.order);
      refresh();
      notify(response.idempotent ? "This order was already placed — here are the details." : "Order placed. Thank you!");
      navigate(`/order/${encodeURIComponent(response.order.orderNumber)}?placed=1`, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.code === "IDEMPOTENCY_CONFLICT") {
        clearCheckoutAttempt();
      }
      setErrors(groupErrors(error));
      setFormError(errorMessage(error));
      if (error instanceof ApiError && error.code === "CART_EMPTY") refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container page-shell checkout-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Bag", to: "/cart" }, { label: "Checkout" }]} />
      <header className="page-heading">
        <div>
          <p className="eyebrow">Almost yours</p>
          <h1>Checkout</h1>
          <p>Share the delivery details. Everything is confirmed by the store before your order is placed.</p>
        </div>
        <Link to="/cart" className="text-link">
          Back to bag
        </Link>
      </header>

      {!user ? (
        <Alert tone="info" title="Checking out as a guest">
          <p>
            You can still track this order with your order number and email.{" "}
            <Link to="/login?next=/checkout">Sign in</Link> to use saved addresses and see the order in your account.
          </p>
        </Alert>
      ) : null}

      {formError ? (
        <Alert tone="error" title="Your order was not placed">
          <p>{formError}</p>
        </Alert>
      ) : null}

      {blocked ? (
        <Alert tone="warning" title="Some bag items need attention">
          <p>Please update your bag before placing the order.</p>
        </Alert>
      ) : null}

      <form className="checkout-layout" onSubmit={submit} noValidate>
        <div className="checkout-main">
          <section className="checkout-section" aria-labelledby="contact-heading">
            <div className="checkout-section__head">
              <span className="checkout-section__step">1</span>
              <div>
                <h2 id="contact-heading">Contact</h2>
                <p>We use this only for order updates and delivery questions.</p>
              </div>
            </div>
            <div className="form-grid">
              <FormField label="Full name" htmlFor="checkout-name" error={errors.contact.name} className="form-grid__full">
                <input
                  id="checkout-name"
                  value={contact.name}
                  onChange={(event) => setContact((current) => ({ ...current, name: event.target.value }))}
                  autoComplete="name"
                  maxLength={80}
                  required
                />
              </FormField>
              <FormField
                label="Email address"
                htmlFor="checkout-email"
                error={errors.contact.email}
                hint={
                  site?.integrations.email === "not_configured"
                    ? "Used for order updates. Email is not enabled yet, so your invoice will be on the confirmation page."
                    : "Your invoice and order updates are emailed here."
                }
              >
                <input
                  id="checkout-email"
                  type="email"
                  value={contact.email}
                  onChange={(event) => setContact((current) => ({ ...current, email: event.target.value }))}
                  autoComplete="email"
                  maxLength={160}
                  required
                />
              </FormField>
              <FormField label="Mobile number" htmlFor="checkout-phone" error={errors.contact.phone}>
                <input
                  id="checkout-phone"
                  type="tel"
                  inputMode="numeric"
                  value={contact.phone}
                  onChange={(event) =>
                    setContact((current) => ({ ...current, phone: event.target.value.replace(/\D/g, "").slice(0, 10) }))
                  }
                  autoComplete="tel"
                  required
                />
              </FormField>
            </div>
          </section>

          <section className="checkout-section" aria-labelledby="shipping-heading">
            <div className="checkout-section__head">
              <span className="checkout-section__step">2</span>
              <div>
                <h2 id="shipping-heading">Delivery address</h2>
                <p>We deliver across India. The fee and estimate depend on your PIN code.</p>
              </div>
            </div>

            {addresses.data?.items.length ? (
              <div className="address-picker" role="group" aria-label="Saved addresses">
                {addresses.data.items.map((address) => (
                  <button
                    type="button"
                    key={address.id}
                    className={chosenAddressId === address.id ? "address-chip is-selected" : "address-chip"}
                    onClick={() => applyAddress(address)}
                    aria-pressed={chosenAddressId === address.id}
                  >
                    <span className="address-chip__label">
                      {address.label}
                      {address.isDefault ? " · Default" : ""}
                    </span>
                    <span>{address.recipient}</span>
                    <small>
                      {address.line1}, {address.city} {address.pincode}
                    </small>
                    {chosenAddressId === address.id ? <CheckIcon size={14} /> : null}
                  </button>
                ))}
              </div>
            ) : null}

            <AddressFields
              value={shipping}
              onChange={(field, value) => {
                setShipping((current) => ({ ...current, [field]: value }));
                setChosenAddressId(null);
              }}
              errors={errors.shipping}
              prefix="ship"
            />

            <div className="checkout-pin-state" aria-live="polite">
              {pinBusy ? (
                <p>
                  <Spinner label="Checking delivery" /> Checking delivery for {shipping.pincode}…
                </p>
              ) : pinMessage ? (
                <p className="checkout-pin-state__error">{pinMessage}</p>
              ) : serviceable && cart.shipping ? (
                <p className="checkout-pin-state__ok">
                  <TruckIcon size={15} /> {cart.shipping.zoneName} · {cart.shipping.message}
                </p>
              ) : null}
            </div>
          </section>

          <section className="checkout-section" aria-labelledby="billing-heading">
            <div className="checkout-section__head">
              <span className="checkout-section__step">3</span>
              <div>
                <h2 id="billing-heading">Billing address</h2>
                <p>Used on the invoice.</p>
              </div>
            </div>
            <CheckboxField
              label="Same as delivery address"
              checked={billingSame}
              onChange={(checked) => {
                setBillingSame(checked);
                if (!checked) setBilling({ ...shipping });
              }}
              name="billingSame"
            />
            {!billingSame ? (
              <div className="checkout-billing">
                <AddressFields value={billing} onChange={updateBilling} errors={errors.billing} prefix="bill" />
              </div>
            ) : null}
          </section>

          <section className="checkout-section" aria-labelledby="payment-heading">
            <div className="checkout-section__head">
              <span className="checkout-section__step">4</span>
              <div>
                <h2 id="payment-heading">Payment</h2>
                <p>Online payment is not enabled on this store yet. No card details are collected.</p>
              </div>
            </div>
            <div className="payment-options">
              <label className={codAvailable ? "payment-option is-selected" : "payment-option is-disabled"}>
                <input type="radio" name="payment" value="cod" checked readOnly disabled={!codAvailable} />
                <span className="payment-option__copy">
                  <strong>Cash on delivery</strong>
                  <small>{codAvailable ? "Pay in cash when your parcel arrives." : cod?.reason ?? "Not available for this order."}</small>
                </span>
                {codAvailable ? <CheckIcon size={16} /> : null}
              </label>
              <label className="payment-option is-disabled">
                <input type="radio" name="payment" value="online" disabled />
                <span className="payment-option__copy">
                  <strong>Online payment</strong>
                  <small>Not configured — no payment can be taken online.</small>
                </span>
              </label>
            </div>
          </section>

          <section className="checkout-section" aria-labelledby="gift-heading">
            <div className="checkout-section__head">
              <span className="checkout-section__step">5</span>
              <div>
                <h2 id="gift-heading">A note for the store</h2>
                <p>Optional. Personalised messages are wrapped with the gift.</p>
              </div>
            </div>
            <FormField label="Gift message" htmlFor="checkout-gift" hint={`${giftMessage.length}/180 characters`}>
              <textarea
                id="checkout-gift"
                rows={3}
                maxLength={180}
                value={giftMessage}
                onChange={(event) => setGiftMessage(event.target.value)}
                placeholder="For someone who makes ordinary days feel special…"
              />
            </FormField>
            <FormField label="Order note" htmlFor="checkout-note" hint="Delivery instructions or anything we should know.">
              <textarea
                id="checkout-note"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </FormField>
          </section>
        </div>

        <aside className="checkout-summary" aria-label="Order summary">
          <div className="order-summary">
            <div className="order-summary__head">
              <h2>Order summary</h2>
              <Link to="/cart" className="text-link">
                Edit bag
              </Link>
            </div>

            <ul className="checkout-items">
              {cart.lines.map((line) => (
                <li key={line.id}>
                  {line.image ? <img src={line.image} alt="" width="56" height="70" loading="lazy" /> : null}
                  <div>
                    <span>{line.name}</span>
                    <small>
                      {line.variantName ? `${line.variantName} · ` : ""}Qty {line.quantity}
                      {line.giftWrap ? " · wrapped" : ""}
                    </small>
                  </div>
                  <strong>{money(line.lineTotal)}</strong>
                </li>
              ))}
            </ul>

            <div className="order-summary__lines">
              <div>
                <span>Subtotal</span>
                <span>{money(cart.subtotal)}</span>
              </div>
              {cart.discount > 0 ? (
                <div className="order-summary__discount">
                  <span>Coupon {cart.coupon?.code}</span>
                  <span>−{money(cart.discount)}</span>
                </div>
              ) : null}
              {cart.giftWrapTotal > 0 ? (
                <div>
                  <span>Gift wrapping</span>
                  <span>{money(cart.giftWrapTotal)}</span>
                </div>
              ) : null}
              <div>
                <span>Delivery</span>
                <span>
                  {serviceable
                    ? cart.shippingFee === 0
                      ? "Included"
                      : money(cart.shippingFee)
                    : pinValid
                      ? "Checking…"
                      : "By PIN code"}
                </span>
              </div>
              <div className="order-summary__total">
                <span>Total</span>
                <strong>{money(cart.total)}</strong>
              </div>
              <p className="order-summary__tax">
                {cart.taxMode === "inclusive"
                  ? `Includes ${money(cart.taxIncluded)} GST`
                  : `GST of ${money(cart.taxExclusive)} is added to this total`}
              </p>
              {!pinMatches ? <p className="order-summary__tax">Delivery is added once a serviceable PIN code is checked.</p> : null}
              {serviceable && cart.shipping ? (
                <p className="order-summary__tax">
                  {cart.shipping.zoneName} · estimated in {cart.shipping.etaDaysMin}–{cart.shipping.etaDaysMax} working days
                </p>
              ) : null}
            </div>

            {cart.coupon?.valid ? (
              <p className="checkout-coupon-note">
                Coupon <strong>{cart.coupon.code}</strong> is applied. You can change it in your bag.
              </p>
            ) : null}

            <div className="checkout-terms">
              <CheckboxField
                label="I accept the terms of sale and privacy policy"
                description="Including the returns and personalised-item policy."
                checked={accepted}
                onChange={setAccepted}
                error={errors.other.terms}
              />
              <p className="checkout-terms__links">
                <Link to="/policies/terms" target="_blank" rel="noreferrer">
                  Terms
                </Link>
                <Link to="/policies/privacy" target="_blank" rel="noreferrer">
                  Privacy
                </Link>
                <Link to="/policies/returns" target="_blank" rel="noreferrer">
                  Returns
                </Link>
              </p>
            </div>

            <button
              type="submit"
              className="button button--primary button--full checkout-place"
              disabled={submitting || blocked || !codAvailable}
            >
              {submitting ? <Spinner label="Placing order" /> : <LockIcon size={16} />}
              {submitting ? "Placing your order…" : `Place order · ${money(cart.total)}`}
            </button>

            <p className="order-summary__assurance">
              <ShieldIcon size={15} /> The store recalculates prices, stock and delivery when the order is placed.
            </p>
            {!accepted ? <p className="checkout-hint">Please accept the terms to enable the order button.</p> : null}
          </div>
        </aside>
      </form>
    </div>
  );
}
