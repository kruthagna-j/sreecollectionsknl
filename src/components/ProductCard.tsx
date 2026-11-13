import { useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import type { ProductSummary } from "../lib/types";
import { Price, StarRating } from "./ui";
import { BagIcon, GiftIcon, SparkleIcon } from "./Icons";

export function ProductCard({ product, priority = false }: { product: ProductSummary; priority?: boolean }) {
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);

  const quickAdd = async () => {
    if (product.variantCount > 0 || !product.inStock) return;
    setAdding(true);
    try {
      await addItem({ productId: product.id, quantity: 1 });
    } catch {
      // The cart context surfaces the server message.
    } finally {
      setAdding(false);
    }
  };

  return (
    <article className="product-card">
      <div className="product-card__media">
        <Link to={`/product/${product.slug}`} aria-label={`View ${product.name}`}>
          {product.image ? (
            <img
              src={product.image}
              alt={product.imageAlt}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              width="600"
              height="750"
            />
          ) : (
            <div className="product-card__placeholder" aria-hidden="true" />
          )}
        </Link>
        <div className="product-card__badges">
          {product.compareAt ? <span className="product-badge product-badge--sale">Save {product.discountPercent}%</span> : null}
          {product.personalizable ? (
            <span className="product-badge product-badge--soft">
              <SparkleIcon size={12} /> Personalised
            </span>
          ) : null}
          {!product.inStock ? <span className="product-badge product-badge--muted">Sold out</span> : null}
        </div>
        {product.inStock && product.variantCount === 0 ? (
          <button
            type="button"
            className="product-card__quick"
            onClick={quickAdd}
            disabled={adding}
            aria-label={`Add ${product.name} to bag`}
          >
            {adding ? <span className="mini-spinner" aria-hidden="true" /> : <BagIcon size={15} />}
            <span>{adding ? "Adding" : "Add to bag"}</span>
          </button>
        ) : null}
      </div>
      <div className="product-card__body">
        <p className="product-card__category">{product.category.name}</p>
        <h3>
          <Link to={`/product/${product.slug}`}>{product.name}</Link>
        </h3>
        {product.rating.count > 0 ? (
          <StarRating rating={product.rating.average} count={product.rating.count} size={13} />
        ) : (
          <p className="product-card__quiet">
            {product.giftWrappable ? (
              <>
                <GiftIcon size={13} /> Gift wrap available
              </>
            ) : (
              "In the collection"
            )}
          </p>
        )}
        <div className="product-card__footer">
          <Price price={product.price} compareAt={product.compareAt} size="sm" />
          <span className={product.inStock ? "stock-note" : "stock-note stock-note--out"}>{product.stockLabel}</span>
        </div>
      </div>
    </article>
  );
}
