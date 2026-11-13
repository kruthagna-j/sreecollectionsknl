import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useSite } from "../context/SiteContext";
import { useToast } from "../context/ToastContext";
import { errorMessage } from "../lib/api";
import { money, personalizationLabel } from "../lib/format";
import { useSeo } from "../lib/hooks";
import { ArrowRightIcon, GiftIcon, LockIcon, ShieldIcon, TagIcon, TrashIcon, TruckIcon } from "../components/Icons";
import { Alert, Breadcrumbs, EmptyState, PageLoader, QuantityStepper, Spinner } from "../components/ui";

export function Cart() {
  const { cart, isLoading, isError, updateItem, removeItem, applyCoupon, removeCoupon, setPincode, refresh } = useCart();
  const { site } = useSite();
  const { notify } = useToast();
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [coupon, setCoupon] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [pin, setPin] = useState(cart?.shippingPincode ?? "");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  useSeo({ title: "Your bag · Sree Collections", description: "Review your Sree Collections bag, add a coupon and check delivery.", noIndex: true });

  if (isLoading) return <PageLoader label="Gathering your bag…" />;
  if (isError || !cart) {
    return (
      <div className="container page-shell">
        <EmptyState
          title="Your bag could not be loaded"
          description="Please check your connection and try again."
          action={{ label: "Try again", onClick: refresh }}
        />
      </div>
    );
  }

  const hasLines = cart.lines.length > 0;
  const lineIssues = cart.lines.filter((line) => line.issue);
  const canCheckout = hasLines && lineIssues.length === 0;
  const giftWrapLabel = site?.policies.giftWrap.label || "Signature wrap";

  const changeQuantity = async (id: string, quantity: number) => {
    setBusyLine(id);
    try {
      await updateItem(id, { quantity });
    } catch {
      // Errors are surfaced by the cart context.
    } finally {
      setBusyLine(null);
    }
  };

  const remove = async (id: string) => {
    setBusyLine(id);
    try {
      await removeItem(id);
    } catch {
      // Errors are surfaced by the cart context.
    } finally {
      setBusyLine(null);
    }
  };

  const submitCoupon = async (event: FormEvent) => {
    event.preventDefault();
    setCouponError(null);
    setCouponBusy(true);
    try {
      await applyCoupon(coupon);
      setCoupon("");
    } catch (error) {
      setCouponError(errorMessage(error));
    } finally {
      setCouponBusy(false);
    }
  };

  const submitPin = async (event: FormEvent) => {
    event.preventDefault();
    setPinError(null);
    if (!/^[1-9][0-9]{5}$/.test(pin.trim())) {
      setPinError("Enter a valid 6-digit PIN code.");
      return;
    }
    setPinBusy(true);
    try {
      const next = await setPincode(pin.trim());
      if (next.shipping && !next.shipping.serviceable) setPinError(next.shipping.message);
      else notify("Delivery checked for this PIN code.");
    } catch (error) {
      setPinError(errorMessage(error));
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <div className="container page-shell cart-page">
      <Breadcrumbs items={[{ label: "Home", to: "/" }, { label: "Shopping bag" }]} />
      <header className="page-heading">
        <div>
          <p className="eyebrow">Almost there</p>
          <h1>Your shopping bag</h1>
          <p>{cart.itemCount > 0 ? `${cart.itemCount} ${cart.itemCount === 1 ? "item" : "items"} chosen with care.` : "Nothing here yet."}</p>
        </div>
        <Link to="/shop" className="text-link">
          Continue shopping <ArrowRightIcon size={15} />
        </Link>
      </header>

      {!hasLines ? (
        <EmptyState
          icon={<GiftIcon size={28} />}
          title="Your bag is waiting for something thoughtful"
          description="Browse the collection or let the gift finder narrow the shelves for you."
          action={{ label: "Browse the collection", to: "/shop" }}
        />
      ) : (
        <div className="cart-layout">
          <div className="cart-lines">
            {lineIssues.length > 0 ? (
              <Alert tone="warning" title="A few items need attention">
                <ul>
                  {lineIssues.map((line) => (
                    <li key={line.id}>
                      {line.name}: {line.issue}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {cart.lines.map((line) => (
              <article className={line.issue ? "cart-page-line cart-page-line--issue" : "cart-page-line"} key={line.id}>
                <Link to={`/product/${line.slug}`} className="cart-page-line__media">
                  {line.image ? <img src={line.image} alt={line.imageAlt} width="160" height="200" loading="lazy" /> : null}
                </Link>
                <div className="cart-page-line__body">
                  <div className="cart-page-line__top">
                    <div>
                      <p className="cart-page-line__category">{line.category}</p>
                      <h2>
                        <Link to={`/product/${line.slug}`}>{line.name}</Link>
                      </h2>
                      {line.variantName ? <p className="cart-page-line__variant">{line.variantName}</p> : null}
                      <p className="cart-page-line__sku">SKU {line.sku}</p>
                      {line.giftWrap ? (
                        <p className="cart-page-line__tag">
                          <GiftIcon size={13} /> {giftWrapLabel} · {money(line.giftWrapFee)}
                        </p>
                      ) : null}
                      {line.giftMessage ? <p className="cart-page-line__message">“{line.giftMessage}”</p> : null}
                      {Object.entries(line.personalization).length ? (
                        <ul className="cart-page-line__personal">
                          {Object.entries(line.personalization).map(([key, value]) => (
                            <li key={key}>
                              <span>{personalizationLabel(key)}</span> {value}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {line.issue ? <p className="cart-page-line__issue">{line.issue}</p> : null}
                    </div>
                    <div className="cart-page-line__price">
                      <strong>{money(line.lineSubtotal)}</strong>
                      {line.lineDiscount > 0 ? <small>−{money(line.lineDiscount)} coupon</small> : null}
                      {line.compareAt ? <s>{money(line.compareAt * line.quantity)}</s> : null}
                    </div>
                  </div>
                  <div className="cart-page-line__bottom">
                    <QuantityStepper
                      value={line.quantity}
                      onChange={(quantity) => void changeQuantity(line.id, quantity)}
                      max={Math.max(1, Math.min(20, line.stock || 1))}
                      disabled={busyLine === line.id}
                    />
                    {busyLine === line.id ? <Spinner label="Updating bag" /> : null}
                    <button
                      type="button"
                      className="text-button cart-page-line__remove"
                      onClick={() => void remove(line.id)}
                      disabled={busyLine === line.id}
                    >
                      <TrashIcon size={14} /> Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <aside className="order-summary" aria-label="Order summary">
            <div className="order-summary__head">
              <h2>Order summary</h2>
              <span>{cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}</span>
            </div>

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
                  {cart.shippingPincode
                    ? cart.shipping?.serviceable
                      ? cart.shippingFee === 0
                        ? "Included"
                        : money(cart.shippingFee)
                      : "Not available"
                    : "Set PIN code"}
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
            </div>

            <form className="order-summary__pin" onSubmit={submitPin}>
              <label htmlFor="cart-pin">
                <TruckIcon size={15} /> Delivery PIN code
              </label>
              <div>
                <input
                  id="cart-pin"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  placeholder="600001"
                />
                <button type="submit" className="button button--quiet button--small" disabled={pinBusy}>
                  {pinBusy ? "Checking…" : "Check"}
                </button>
              </div>
              {pinError ? <p className="field__error">{pinError}</p> : null}
              {cart.shipping?.serviceable ? (
                <p className="order-summary__eta">
                  {cart.shipping.zoneName} · {cart.shipping.message}
                  {cart.shipping.freeAbove && !cart.shipping.freeApplied
                    ? ` · Free above ${money(cart.shipping.freeAbove)}`
                    : ""}
                </p>
              ) : null}
              {cart.shipping?.freeAbove && cart.shipping.serviceable && !cart.shipping.freeApplied ? (
                <div className="free-shipping-meter">
                  <div
                    className="free-shipping-meter__fill"
                    style={{
                      width: `${Math.min(100, Math.round(((cart.subtotal - cart.discount) / cart.shipping.freeAbove) * 100))}%`
                    }}
                  />
                  <span>
                    {money(Math.max(0, cart.shipping.freeAbove - (cart.subtotal - cart.discount)))} away from free delivery
                  </span>
                </div>
              ) : null}
            </form>

            <div className="order-summary__coupon">
              {cart.coupon?.valid ? (
                <div className="coupon-applied">
                  <div>
                    <TagIcon size={15} />
                    <span>
                      <strong>{cart.coupon.code}</strong> applied
                      <small>{cart.coupon.description}</small>
                    </span>
                  </div>
                  <button type="button" className="text-button" onClick={() => void removeCoupon()}>
                    Remove
                  </button>
                </div>
              ) : (
                <form onSubmit={submitCoupon}>
                  <label htmlFor="coupon-code">Have a coupon?</label>
                  <div>
                    <input
                      id="coupon-code"
                      value={coupon}
                      onChange={(event) => setCoupon(event.target.value.toUpperCase())}
                      placeholder="Enter code"
                      maxLength={40}
                    />
                    <button type="submit" className="button button--quiet button--small" disabled={couponBusy || coupon.trim().length < 2}>
                      {couponBusy ? "Checking…" : "Apply"}
                    </button>
                  </div>
                  {couponError ? <p className="field__error">{couponError}</p> : null}
                </form>
              )}
            </div>

            {!canCheckout ? (
              <Alert tone="warning">
                {hasLines ? "Resolve the items marked above before checkout." : "Add an item to continue."}
              </Alert>
            ) : null}

            <Link
              to={canCheckout ? "/checkout" : "/cart"}
              className={canCheckout ? "button button--primary order-summary__checkout" : "button button--primary order-summary__checkout is-disabled"}
              aria-disabled={!canCheckout}
              onClick={(event) => {
                if (!canCheckout) event.preventDefault();
              }}
            >
              <LockIcon size={16} /> Proceed to checkout
            </Link>

            <p className="order-summary__assurance">
              <ShieldIcon size={15} /> Prices, stock and totals are confirmed by the store before the order is placed.
            </p>

            <div className="order-summary__payment">
              <p>Payment</p>
              <span>
                <LockIcon size={13} /> Cash on delivery
              </span>
              <small>Online payment is not enabled on this store yet.</small>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
