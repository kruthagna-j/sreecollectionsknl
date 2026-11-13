import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Order } from "../lib/types";
import { formatDateTime, money, orderStatus, paymentStatus, personalizationLabel } from "../lib/format";
import { StatusBadge } from "./ui";
import { GiftIcon, PinIcon, TruckIcon } from "./Icons";

function AddressBlock({ label, address }: { label: string; address: Order["shippingAddress"] }) {
  return (
    <div className="order-address">
      <p className="order-address__label">{label}</p>
      <p>
        <strong>{address.recipient}</strong>
        <br />
        {address.line1}
        {address.line2 ? (
          <>
            <br />
            {address.line2}
          </>
        ) : null}
        <br />
        {address.city}, {address.state}
        <br />
        PIN {address.pincode}
        <br />
        {address.phone}
      </p>
    </div>
  );
}

export function OrderDetails({ order, actions }: { order: Order; actions?: ReactNode }) {
  return (
    <div className="order-details">
      <section className="order-panel">
        <div className="order-panel__head">
          <div>
            <p className="eyebrow">Order {order.orderNumber}</p>
            <h2>Placed {formatDateTime(order.createdAt)}</h2>
          </div>
          <div className="order-panel__badges">
            <StatusBadge status={order.status} label={orderStatus(order.status)} />
            <StatusBadge status={order.paymentStatus} label={paymentStatus(order.paymentStatus)} />
          </div>
        </div>

        {order.events.length ? (
          <ol className="order-timeline">
            {order.events.map((event, index) => (
              <li key={`${event.status}-${event.created_at}-${index}`} className="order-timeline__item">
                <span className="order-timeline__dot" aria-hidden="true" />
                <div>
                  <strong>{orderStatus(event.status)}</strong>
                  <small>{formatDateTime(event.created_at)}</small>
                  {event.note ? <p>{event.note}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : null}

        {order.tracking ? (
          <div className="order-tracking-note">
            <TruckIcon size={16} />
            <span>
              Tracking number <strong>{order.tracking.number}</strong>
              {order.tracking.url ? (
                <>
                  {" · "}
                  <a href={order.tracking.url} target="_blank" rel="noreferrer noopener">
                    Track parcel
                  </a>
                </>
              ) : null}
            </span>
          </div>
        ) : null}
      </section>

      <section className="order-panel">
        <h2 className="order-panel__title">Items</h2>
        <ul className="order-items">
          {order.items.map((item) => (
            <li key={item.id}>
              {item.image ? <img src={item.image} alt="" width="64" height="80" loading="lazy" /> : null}
              <div className="order-items__copy">
                <p>
                  {item.slug ? <Link to={`/product/${item.slug}`}>{item.name}</Link> : item.name}
                </p>
                <small>
                  {item.variantName ? `${item.variantName} · ` : ""}Qty {item.quantity} · SKU {item.sku}
                </small>
                {item.giftWrap ? (
                  <small className="order-items__gift">
                    <GiftIcon size={12} /> Gift wrapped
                  </small>
                ) : null}
                {Object.entries(item.personalization).length ? (
                  <ul className="order-items__personal">
                    {Object.entries(item.personalization).map(([key, value]) => (
                      <li key={key}>
                        <span>{personalizationLabel(key)}</span> {value}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {item.giftMessage ? (
                  <small className="order-items__personal">Card message: “{item.giftMessage}”</small>
                ) : null}
              </div>
              <div className="order-items__price">
                <strong>{money(item.lineTotal)}</strong>
                {item.lineDiscount > 0 ? <small>−{money(item.lineDiscount)}</small> : null}
                <small>
                  {money(item.unitPrice)} × {item.quantity}
                </small>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="order-panel-grid">
        <section className="order-panel">
          <h2 className="order-panel__title">
            <PinIcon size={16} /> Delivery
          </h2>
          <AddressBlock label="Shipping address" address={order.shippingAddress} />
          {order.delivery.etaDaysMin !== null && order.delivery.etaDaysMax !== null ? (
            <p className="order-panel__muted">
              <TruckIcon size={14} /> {order.delivery.zone ? `${order.delivery.zone} · ` : ""}
              estimated in {order.delivery.etaDaysMin}–{order.delivery.etaDaysMax} working days
            </p>
          ) : null}
          {order.billingAddress.line1 !== order.shippingAddress.line1 ? (
            <AddressBlock label="Billing address" address={order.billingAddress} />
          ) : null}
          {order.giftMessage ? (
            <div className="order-note">
              <p className="order-address__label">Gift message</p>
              <p>“{order.giftMessage}”</p>
            </div>
          ) : null}
          {order.customerNote ? (
            <div className="order-note">
              <p className="order-address__label">Your note</p>
              <p>{order.customerNote}</p>
            </div>
          ) : null}
        </section>

        <section className="order-panel">
          <h2 className="order-panel__title">Payment & total</h2>
          <dl className="order-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{money(order.totals.subtotal)}</dd>
            </div>
            {order.totals.discount > 0 ? (
              <div>
                <dt>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                <dd>−{money(order.totals.discount)}</dd>
              </div>
            ) : null}
            {order.totals.giftWrap > 0 ? (
              <div>
                <dt>Gift wrapping</dt>
                <dd>{money(order.totals.giftWrap)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Delivery</dt>
              <dd>{order.totals.shipping === 0 ? "Included" : money(order.totals.shipping)}</dd>
            </div>
            {order.totals.codFee > 0 ? (
              <div>
                <dt>Cash-on-delivery handling</dt>
                <dd>{money(order.totals.codFee)}</dd>
              </div>
            ) : null}
            <div className="order-totals__grand">
              <dt>Total</dt>
              <dd>{money(order.totals.total)}</dd>
            </div>
          </dl>
          <p className="order-panel__muted">
            {order.totals.taxMode === "inclusive"
              ? `Includes ${money(order.totals.taxIncluded)} GST`
              : `Includes ${money(order.totals.taxExclusive)} GST added at checkout`}
          </p>
          <p className="order-panel__muted">
            {order.paymentMethod === "cod"
              ? "Cash on delivery. Pay the courier when the parcel arrives."
              : "Online payment."}{" "}
            {paymentStatus(order.paymentStatus)}
          </p>
        </section>
      </div>

      {actions ? <div className="order-actions">{actions}</div> : null}
    </div>
  );
}

export function statusSummary(status: string): string {
  const messages: Record<string, string> = {
    pending: "We have your order and will confirm it shortly.",
    confirmed: "The store has confirmed your order.",
    packed: "Your parcel is packed and waiting for pickup.",
    shipped: "Your parcel is on its way.",
    delivered: "Delivered. We hope it brought a smile.",
    cancelled: "This order was cancelled.",
    returned: "This order was marked returned."
  };
  return messages[status] ?? `Order status: ${orderStatus(status)}`;
}
