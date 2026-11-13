import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { money, personalizationLabel } from "../lib/format";
import { useEscape, useLockBody } from "../lib/hooks";
import { BagIcon, CloseIcon, GiftIcon, TrashIcon } from "./Icons";
import { EmptyState, QuantityStepper, Spinner } from "./ui";

export function CartDrawer() {
  const { cart, cartOpen, closeCart, updateItem, removeItem } = useCart();
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useLockBody(cartOpen);
  useEscape(cartOpen, closeCart);

  useEffect(() => {
    if (!cartOpen) return;
    window.setTimeout(() => closeRef.current?.focus(), 40);
  }, [cartOpen]);

  const lines = cart?.lines ?? [];

  const changeQuantity = async (id: string, quantity: number) => {
    setBusyLine(id);
    try {
      await updateItem(id, { quantity });
    } finally {
      setBusyLine(null);
    }
  };

  const remove = async (id: string) => {
    setBusyLine(id);
    try {
      await removeItem(id);
    } finally {
      setBusyLine(null);
    }
  };

  return (
    <>
      <div className={cartOpen ? "drawer-backdrop is-open" : "drawer-backdrop"} onClick={closeCart} aria-hidden="true" />
      <aside
        className={cartOpen ? "cart-drawer is-open" : "cart-drawer"}
        aria-label="Shopping bag"
        aria-hidden={!cartOpen}
        inert={!cartOpen ? true : undefined}
      >
        <header className="cart-drawer__header">
          <div>
            <p className="eyebrow">Your selection</p>
            <h2>Shopping bag</h2>
          </div>
          <button type="button" ref={closeRef} className="icon-button" onClick={closeCart} aria-label="Close bag">
            <CloseIcon size={20} />
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="cart-drawer__empty">
            <EmptyState
              icon={<BagIcon size={26} />}
              title="Your bag is waiting"
              description="Choose something thoughtful from the collection."
              action={{ label: "Browse the collection", to: "/shop" }}
            />
            <Link to="/gift-finder" className="text-link cart-drawer__finder" onClick={closeCart}>
              Not sure? Use the gift finder →
            </Link>
          </div>
        ) : (
          <>
            <div className="cart-drawer__lines">
              {lines.map((line) => (
                <article className={line.issue ? "cart-line cart-line--issue" : "cart-line"} key={line.id}>
                  <Link to={`/product/${line.slug}`} onClick={closeCart} className="cart-line__media">
                    {line.image ? <img src={line.image} alt={line.imageAlt} width="90" height="112" loading="lazy" /> : null}
                  </Link>
                  <div className="cart-line__body">
                    <div className="cart-line__top">
                      <div>
                        <h3>
                          <Link to={`/product/${line.slug}`} onClick={closeCart}>
                            {line.name}
                          </Link>
                        </h3>
                        {line.variantName ? <p className="cart-line__variant">{line.variantName}</p> : null}
                        {line.giftWrap ? (
                          <p className="cart-line__meta">
                            <GiftIcon size={12} /> {line.giftWrap ? "Gift wrapped" : null}
                          </p>
                        ) : null}
                        {Object.entries(line.personalization).length ? (
                          <p className="cart-line__meta">
                            {Object.entries(line.personalization)
                              .slice(0, 2)
                              .map(([key, value]) => `${personalizationLabel(key)}: ${value}`)
                              .join(" · ")}
                          </p>
                        ) : null}
                        {line.issue ? <p className="cart-line__issue">{line.issue}</p> : null}
                      </div>
                      <button
                        type="button"
                        className="cart-line__remove"
                        onClick={() => void remove(line.id)}
                        disabled={busyLine === line.id}
                        aria-label={`Remove ${line.name}`}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                    <div className="cart-line__bottom">
                      <QuantityStepper
                        value={line.quantity}
                        onChange={(quantity) => void changeQuantity(line.id, quantity)}
                        max={Math.max(1, Math.min(20, line.stock || 1))}
                        disabled={busyLine === line.id}
                      />
                      <div className="cart-line__price">
                        {busyLine === line.id ? <Spinner label="Updating" /> : null}
                        <span>{money(line.lineSubtotal)}</span>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <footer className="cart-drawer__footer">
              {cart?.issues.length ? (
                <p className="cart-drawer__notice">{cart.issues[0]}</p>
              ) : null}
              <div className="cart-drawer__subtotal">
                <span>Subtotal</span>
                <strong>{money(cart?.subtotal ?? 0)}</strong>
              </div>
              <p className="cart-drawer__fine">
                {cart?.itemCount ?? 0} {cart?.itemCount === 1 ? "item" : "items"} · Delivery calculated at checkout · Taxes included
              </p>
              <div className="cart-drawer__actions">
                <Link to="/cart" onClick={closeCart} className="button button--quiet">
                  View bag
                </Link>
                <Link to="/checkout" onClick={closeCart} className="button button--primary">
                  Checkout
                </Link>
              </div>
            </footer>
          </>
        )}
      </aside>
    </>
  );
}
