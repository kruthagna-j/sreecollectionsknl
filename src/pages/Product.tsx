import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useSite } from "../context/SiteContext";
import { useToast } from "../context/ToastContext";
import { api, errorMessage } from "../lib/api";
import { formatDate, money } from "../lib/format";
import { useRecentlyViewed, useSeo } from "../lib/hooks";
import type { ProductDetail, ProductSummary, ReviewList, ShippingQuote } from "../lib/types";
import {
  GiftIcon,
  HeartIcon,
  PinIcon,
  ShieldIcon,
  SparkleIcon,
  TruckIcon
} from "../components/Icons";
import { ProductCard } from "../components/ProductCard";
import {
  Alert,
  Breadcrumbs,
  CheckboxField,
  EmptyState,
  FormField,
  Price,
  QuantityStepper,
  SectionHeading,
  Spinner,
  StarRating
} from "../components/ui";

type ProductResponse = {
  product: ProductDetail;
  related: ProductSummary[];
  returns: { enabled: boolean; windowDays: number; note: string };
};

const PERSONAL_KEYS = ["recipientName", "engraving", "message"];

/**
 * Reserves roughly the space the finished page needs. Swapping a short spinner for a 3 000px
 * product page pushed the footer off the screen in one frame, which measured as a 0.36 layout
 * shift on a throttled phone; holding the height until the data arrives keeps it under 0.1.
 */
function ProductSkeleton() {
  return (
    <div className="container page-shell product-page">
      <p className="product-skeleton__status" role="status">
        Unwrapping this piece…
      </p>
      <div className="product-skeleton" aria-hidden="true">
        <div className="product-hero">
          <div className="product-gallery">
            <div className="product-gallery__main">
              <div className="skeleton skeleton--image" />
            </div>
          </div>
          <div className="product-info">
            <div className="skeleton skeleton--line skeleton--short" />
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line skeleton--short" />
            <div className="skeleton skeleton--area" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Product() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { addItem, closeCart } = useCart();
  const { site } = useSite();
  const { notify } = useToast();

  const [variantId, setVariantId] = useState("");
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [giftWrap, setGiftWrap] = useState(false);
  const [giftMessage, setGiftMessage] = useState("");
  const [personalisationOpen, setPersonalisationOpen] = useState(false);
  const [personalisation, setPersonalisation] = useState<Record<string, string>>({
    recipientName: "",
    engraving: "",
    message: ""
  });
  const [personalisationError, setPersonalisationError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [buying, setBuying] = useState(false);
  const [pin, setPin] = useState("");
  const [pinResult, setPinResult] = useState<ShippingQuote | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);

  const productQuery = useQuery({
    queryKey: ["product", slug],
    queryFn: () => api<ProductResponse>(`/catalog/products/${encodeURIComponent(slug)}`),
    enabled: Boolean(slug)
  });

  const product = productQuery.data?.product;
  const related = productQuery.data?.related ?? [];
  const returns = productQuery.data?.returns;

  const reviewsQuery = useQuery({
    queryKey: ["product-reviews", slug],
    queryFn: () => api<ReviewList>(`/catalog/products/${encodeURIComponent(slug)}/reviews`),
    enabled: Boolean(slug)
  });

  const wishlistQuery = useQuery({
    queryKey: ["account", "wishlist"],
    queryFn: () => api<{ items: ProductSummary[] }>("/account/wishlist"),
    enabled: Boolean(user)
  });

  const inWishlist = Boolean(wishlistQuery.data?.items.some((item) => item.id === product?.id));
  const recent = useRecentlyViewed(product);

  useEffect(() => {
    if (!product) return;
    setVariantId((current) => {
      if (product.variants.some((variant) => variant.id === current)) return current;
      return product.variants.find((variant) => variant.stock > 0)?.id ?? product.variants[0]?.id ?? "";
    });
    setImageIndex(0);
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedVariant = product?.variants.find((variant) => variant.id === variantId) ?? null;
  const unitPrice = selectedVariant?.price ?? product?.price ?? 0;
  const stock = selectedVariant ? selectedVariant.stock : product?.stock ?? 0;
  const available = Boolean(product?.inStock) && (selectedVariant ? selectedVariant.inStock : true);
  const stockLabel = available ? (stock <= 5 ? `Only ${stock} left` : "In stock") : "Out of stock";
  const requiresPersonalisation = Boolean(product?.tags.includes("personalised"));
  const showPersonalisation = Boolean(product?.personalizable) && (requiresPersonalisation || personalisationOpen);
  const wrapFee = site?.policies.giftWrap.fee ?? 0;

  const filledPersonalisation = useMemo(() => {
    const result: Record<string, string> = {};
    for (const key of PERSONAL_KEYS) {
      const value = personalisation[key]?.trim();
      if (value) result[key] = value;
    }
    return result;
  }, [personalisation]);

  useSeo({
    title: product?.seoTitle ?? "Product · Sree Collections",
    description: product?.seoDescription ?? product?.shortDescription,
    image: product?.images[0]?.url,
    type: "product",
    jsonLd: product
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: product.seoDescription,
          image: product.images.map((image) => image.url),
          sku: product.sku,
          brand: { "@type": "Brand", name: "Sree Collections" },
          category: product.category.name,
          offers: {
            "@type": "Offer",
            priceCurrency: "INR",
            price: (unitPrice / 100).toFixed(2),
            availability: available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url: window.location.href
          },
          ...(product.rating.count > 0
            ? { aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating.average, reviewCount: product.rating.count } }
            : {})
        }
      : undefined
  });

  if (productQuery.isLoading) return <ProductSkeleton />;
  if (productQuery.isError || !product) {
    return (
      <div className="container page-shell">
        <EmptyState
          title="This piece could not be found"
          description="It may have moved or is no longer in the collection. Browse the shelves from the shop."
          action={{ label: "Back to the shop", to: "/shop" }}
        />
      </div>
    );
  }

  const gallery = product.images.length
    ? product.images
    : product.image
      ? [{ url: product.image, alt: product.imageAlt }]
      : [];
  const activeImage = gallery[Math.min(imageIndex, gallery.length - 1)];

  const validate = (): boolean => {
    if (product.variantCount > 0 && !selectedVariant) {
      notify("Choose an option for this item.", "error");
      return false;
    }
    if (requiresPersonalisation && !filledPersonalisation.recipientName && !filledPersonalisation.engraving) {
      setPersonalisationError("Add a name, initials or engraving for this piece.");
      return false;
    }
    setPersonalisationError(null);
    return true;
  };

  const addToBag = async (goToCheckout = false) => {
    if (!validate()) return;
    if (goToCheckout) setBuying(true);
    else setAdding(true);
    try {
      await addItem({
        productId: product.id,
        variantId: selectedVariant?.id ?? "",
        quantity,
        giftWrap: product.giftWrappable && giftWrap,
        giftMessage: product.giftWrappable && giftWrap ? giftMessage : "",
        ...(product.personalizable && Object.keys(filledPersonalisation).length
          ? { personalization: filledPersonalisation }
          : {})
      });
      if (goToCheckout) {
        closeCart();
        navigate("/checkout");
      }
    } catch {
      // The cart context surfaces the error message.
    } finally {
      setAdding(false);
      setBuying(false);
    }
  };

  const checkPin = async () => {
    setPinError(null);
    if (!/^[1-9][0-9]{5}$/.test(pin.trim())) {
      setPinError("Enter a valid 6-digit PIN code.");
      return;
    }
    setPinBusy(true);
    try {
      const result = await api<ShippingQuote>(`/catalog/delivery/check?pincode=${encodeURIComponent(pin.trim())}`);
      setPinResult(result);
    } catch (error) {
      setPinError(errorMessage(error));
      setPinResult(null);
    } finally {
      setPinBusy(false);
    }
  };

  const toggleWishlist = async () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/product/${product.slug}`)}`);
      return;
    }
    setWishlistBusy(true);
    try {
      if (inWishlist) {
        await api(`/account/wishlist/${encodeURIComponent(product.id)}`, { method: "DELETE" });
        notify("Removed from your wishlist.", "info");
      } else {
        await api(`/account/wishlist/${encodeURIComponent(product.id)}`, { method: "POST" });
        notify("Saved to your wishlist.");
      }
      await queryClient.invalidateQueries({ queryKey: ["account", "wishlist"] });
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setWishlistBusy(false);
    }
  };

  const reviewSummary = reviewsQuery.data?.summary ?? product.rating;
  const reviewItems = reviewsQuery.data?.items ?? [];
  const dimensions = product.specifications.dimensions;
  const dimensionText = [dimensions.lengthMm, dimensions.widthMm, dimensions.heightMm].some((value) => value > 0)
    ? `${dimensions.lengthMm} × ${dimensions.widthMm} × ${dimensions.heightMm} mm`
    : null;

  return (
    <div className="container page-shell product-page">
      <Breadcrumbs
        items={[
          { label: "Home", to: "/" },
          { label: "Shop", to: "/shop" },
          { label: product.category.name, to: `/shop?category=${product.category.slug}` },
          { label: product.name }
        ]}
      />

      <div className="product-hero">
        <div className="product-gallery">
          <div className="product-gallery__main">
            {activeImage ? (
              <img src={activeImage.url} alt={activeImage.alt} width="1200" height="1500" fetchPriority="high" />
            ) : null}
            <div className="product-gallery__badges">
              {product.compareAt ? <span className="product-badge product-badge--sale">Save {product.discountPercent}%</span> : null}
              {product.personalizable ? (
                <span className="product-badge product-badge--soft">
                  <SparkleIcon size={12} /> Personalisable
                </span>
              ) : null}
            </div>
          </div>
          {gallery.length > 1 ? (
            <div className="product-gallery__thumbs" role="tablist" aria-label="Product images">
              {gallery.map((image, index) => (
                <button
                  key={`${image.url}-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={index === imageIndex}
                  className={index === imageIndex ? "is-active" : undefined}
                  onClick={() => setImageIndex(index)}
                >
                  <img src={image.url} alt="" width="90" height="112" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="product-info">
          <div className="product-info__top">
            <p className="eyebrow">{product.category.name}</p>
            <div className="product-info__title-row">
              <h1>{product.name}</h1>
              <button
                type="button"
                className={inWishlist ? "icon-button icon-button--bordered is-active" : "icon-button icon-button--bordered"}
                onClick={() => void toggleWishlist()}
                disabled={wishlistBusy}
                aria-label={inWishlist ? "Remove from wishlist" : "Save to wishlist"}
                aria-pressed={inWishlist}
              >
                <HeartIcon size={19} filled={inWishlist} />
              </button>
            </div>
            {reviewSummary.count > 0 ? (
              <button
                type="button"
                className="product-info__rating"
                onClick={() => document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" })}
              >
                <StarRating rating={reviewSummary.average} count={reviewSummary.count} />
                <span>Read reviews</span>
              </button>
            ) : (
              <p className="product-info__quiet">No customer reviews yet — be the first after your order arrives.</p>
            )}
            <p className="product-info__short">{product.shortDescription}</p>
            <Price price={unitPrice} compareAt={product.compareAt} size="lg" />
            <p className="product-info__tax">Inclusive of GST · Delivery calculated by PIN code at checkout</p>
          </div>

          {product.variants.length > 0 ? (
            <fieldset className="variant-field">
              <legend>
                Choose an option <span>{product.variants.length}</span>
              </legend>
              <div className="variant-grid">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    className={variant.id === variantId ? "variant-option is-selected" : "variant-option"}
                    onClick={() => setVariantId(variant.id)}
                    aria-pressed={variant.id === variantId}
                    disabled={!variant.inStock}
                  >
                    <span>{variant.name}</span>
                    <small>{variant.inStock ? money(variant.price) : "Sold out"}</small>
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {product.personalizable ? (
            <div className="personalise-box">
              <div className="personalise-box__head">
                <div>
                  <h2>
                    <SparkleIcon size={16} /> Personalisation
                  </h2>
                  <p>
                    {requiresPersonalisation
                      ? "This piece is made specific to the recipient. Add the details below."
                      : "Add a name, date or small message if you would like this made personal."}
                  </p>
                </div>
                {!requiresPersonalisation ? (
                  <button type="button" className="text-button" onClick={() => setPersonalisationOpen((open) => !open)}>
                    {personalisationOpen ? "Remove" : "Add"}
                  </button>
                ) : null}
              </div>
              {showPersonalisation ? (
                <div className="personalise-box__fields">
                  <FormField label="Name or initials" htmlFor="personalisation-name" required={requiresPersonalisation}>
                    <input
                      id="personalisation-name"
                      value={personalisation.recipientName}
                      maxLength={60}
                      onChange={(event) => setPersonalisation((current) => ({ ...current, recipientName: event.target.value }))}
                      placeholder="e.g. Ananya"
                    />
                  </FormField>
                  <FormField label="Engraving or printed line" htmlFor="personalisation-engraving" hint="Up to 24 characters works best.">
                    <input
                      id="personalisation-engraving"
                      value={personalisation.engraving}
                      maxLength={120}
                      onChange={(event) => setPersonalisation((current) => ({ ...current, engraving: event.target.value }))}
                      placeholder="e.g. 12.02.2019"
                    />
                  </FormField>
                  <FormField label="A note for the maker" htmlFor="personalisation-message">
                    <textarea
                      id="personalisation-message"
                      rows={2}
                      value={personalisation.message}
                      maxLength={300}
                      onChange={(event) => setPersonalisation((current) => ({ ...current, message: event.target.value }))}
                      placeholder="Anything we should know?"
                    />
                  </FormField>
                  {personalisationError ? <p className="field__error">{personalisationError}</p> : null}
                  <p className="personalise-box__fine">
                    We use the spelling exactly as entered. Personalised pieces are made for one person and are not
                    returnable. Please review the details before ordering.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {product.giftWrappable ? (
            <div className="gift-box">
              <CheckboxField
                label={site?.policies.giftWrap.label || "Signature gold-ribbon wrap"}
                description={`${money(wrapFee)} per item · Add a short gift message`}
                checked={giftWrap}
                onChange={setGiftWrap}
              />
              {giftWrap ? (
                <FormField label="Gift message" htmlFor="gift-message" hint="Printed on a small card, up to 180 characters.">
                  <textarea
                    id="gift-message"
                    rows={2}
                    maxLength={180}
                    value={giftMessage}
                    onChange={(event) => setGiftMessage(event.target.value)}
                    placeholder="For you, always."
                  />
                </FormField>
              ) : null}
            </div>
          ) : (
            <p className="product-info__gift-ready">
              <GiftIcon size={15} /> This item arrives gift-ready, so extra wrapping is not offered.
            </p>
          )}

          <div className="buy-row">
            <QuantityStepper value={quantity} onChange={setQuantity} max={Math.max(1, Math.min(20, stock || 1))} disabled={!available} />
            <button
              type="button"
              className="button button--primary buy-row__add"
              disabled={!available || adding || buying}
              onClick={() => void addToBag(false)}
            >
              {adding ? <Spinner label="Adding to bag" /> : null}
              {available ? (adding ? "Adding…" : "Add to bag") : "Out of stock"}
            </button>
            <button
              type="button"
              className="button button--gold buy-row__buy"
              disabled={!available || adding || buying}
              onClick={() => void addToBag(true)}
            >
              {buying ? "Preparing…" : "Buy now"}
            </button>
          </div>
          <p className={available ? "product-info__stock" : "product-info__stock product-info__stock--out"}>
            {stockLabel} · {product.specifications.preparationDays > 0 ? `Ready in ${product.specifications.preparationDays}–${product.specifications.preparationDays + 1} days` : "Ready to send"}
          </p>

          <div className="delivery-check">
            <div className="delivery-check__head">
              <PinIcon size={18} />
              <div>
                <h2>Check delivery</h2>
                <p>We deliver across India. Enter a PIN code for the delivery fee and estimated window.</p>
              </div>
            </div>
            <form
              className="delivery-check__form"
              onSubmit={(event) => {
                event.preventDefault();
                void checkPin();
              }}
            >
              <label className="sr-only" htmlFor="delivery-pin">
                PIN code
              </label>
              <input
                id="delivery-pin"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                placeholder="6-digit PIN code"
              />
              <button type="submit" className="button button--quiet button--small" disabled={pinBusy}>
                {pinBusy ? "Checking…" : "Check"}
              </button>
            </form>
            {pinError ? <p className="field__error">{pinError}</p> : null}
            {pinResult ? (
              <div className={pinResult.serviceable ? "delivery-result is-ok" : "delivery-result is-unavailable"}>
                <TruckIcon size={16} />
                <div>
                  <p>{pinResult.message}</p>
                  {pinResult.serviceable ? (
                    <small>
                      {pinResult.fee > 0 ? `Delivery ${money(pinResult.fee)}` : "Delivery included"}
                      {pinResult.freeAbove ? ` · Free above ${money(pinResult.freeAbove)}` : ""}
                    </small>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="product-assurances">
            <span>
              <ShieldIcon size={16} /> Secure checkout
            </span>
            <span>
              <GiftIcon size={16} /> Gift wrap available
            </span>
            <span>
              <TruckIcon size={16} /> Cash on delivery
            </span>
          </div>

          <div className="accordion">
            <details open>
              <summary>The piece</summary>
              <div className="accordion__body">
                <p>{product.description}</p>
              </div>
            </details>
            <details>
              <summary>Materials &amp; dimensions</summary>
              <div className="accordion__body">
                <dl className="spec-list">
                  {dimensionText ? (
                    <>
                      <dt>Dimensions</dt>
                      <dd>{dimensionText}</dd>
                    </>
                  ) : null}
                  <dt>Weight</dt>
                  <dd>{product.specifications.weightGrams} g</dd>
                  <dt>Preparation</dt>
                  <dd>{product.specifications.preparationDays} working {product.specifications.preparationDays === 1 ? "day" : "days"}</dd>
                  <dt>GST</dt>
                  <dd>Included at {(product.specifications.taxRateBps / 100).toFixed(0)}%</dd>
                  {product.specifications.fragile ? (
                    <>
                      <dt>Handling</dt>
                      <dd>Packed with extra care — this piece is fragile.</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </details>
            <details>
              <summary>Delivery &amp; returns</summary>
              <div className="accordion__body">
                <p>
                  Delivery is available only on the PIN-code zones configured by the store. The fee and estimate are
                  confirmed at checkout before you pay.
                </p>
                <p>
                  {returns?.enabled
                    ? `Eligible items may be returned within ${returns.windowDays} days of delivery. ${returns.note}`
                    : "Returns are not currently available. Contact the store if something arrives damaged."}
                </p>
                <Link to="/policies/shipping" className="text-link">
                  Read the delivery policy
                </Link>
              </div>
            </details>
            <details>
              <summary>Personalisation &amp; gift notes</summary>
              <div className="accordion__body">
                <p>
                  Personalised pieces are made to order. We use the spelling exactly as entered, so check names, dates and
                  punctuation before placing the order. Personalised items are excluded from returns unless they arrive
                  damaged or incorrect.
                </p>
                <p>Gift messages are printed on a small card and do not change the invoice.</p>
              </div>
            </details>
          </div>
        </div>
      </div>

      <section className="reviews-section section" id="reviews">
        <div className="reviews-section__head">
          <SectionHeading eyebrow="From our customers" title={reviewSummary.count > 0 ? "What has been said" : "Reviews, once they are real"} />
          {user ? (
            <Link to="/account/orders" className="text-link">
              Write a review from a delivered order
            </Link>
          ) : (
            <Link to="/login" className="text-link">
              Sign in to review an order
            </Link>
          )}
        </div>
        <div className="reviews-grid">
          <div className="reviews-summary">
            {reviewSummary.count > 0 ? (
              <>
                <p className="reviews-summary__score">{reviewSummary.average.toFixed(1)}</p>
                <StarRating rating={reviewSummary.average} count={reviewSummary.count} size={18} showCount={false} />
                <p className="reviews-summary__count">
                  {reviewSummary.count} verified {reviewSummary.count === 1 ? "review" : "reviews"}
                </p>
                <div className="rating-bars">
                  {product.ratingBreakdown.map((entry) => {
                    const percent = reviewSummary.count ? Math.round((entry.count / reviewSummary.count) * 100) : 0;
                    return (
                      <div className="rating-bar" key={entry.stars}>
                        <span>{entry.stars}</span>
                        <div className="rating-bar__track">
                          <div className="rating-bar__fill" style={{ width: `${percent}%` }} />
                        </div>
                        <small>{entry.count}</small>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="reviews-empty">
                <p>
                  Reviews can only be written by customers after a delivered order, and every review is moderated before it
                  appears. None have been approved for this piece yet.
                </p>
              </div>
            )}
          </div>
          <div className="reviews-list">
            {reviewItems.length > 0 ? (
              reviewItems.map((review, index) => (
                <article className="review" key={`${review.createdAt}-${index}`}>
                  <div className="review__top">
                    <div>
                      <StarRating rating={review.rating} size={14} showCount={false} />
                      {review.title ? <h3>{review.title}</h3> : null}
                    </div>
                    <span>{formatDate(review.createdAt)}</span>
                  </div>
                  <p>{review.body}</p>
                  <footer>
                    <span>{review.author}</span>
                    {review.verifiedPurchase ? <span className="review__verified">Verified purchase</span> : null}
                  </footer>
                </article>
              ))
            ) : (
              <p className="reviews-list__note">
                There are no approved reviews for this product yet. Once a customer’s delivered order is reviewed and
                approved, it will appear here.
              </p>
            )}
          </div>
        </div>
      </section>

      {related.length > 0 ? (
        <section className="section related-section">
          <SectionHeading
            eyebrow="In the same world"
            title="You may also like"
            action={{ label: "View all", to: `/shop?category=${product.category.slug}` }}
          />
          <div className="product-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}

      {recent.length > 0 ? (
        <section className="section recently-viewed">
          <SectionHeading eyebrow="Still on your mind" title="Recently viewed" />
          <div className="product-grid product-grid--four">
            {recent.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}

      <Alert tone="info" title="A note on availability">
        Stock and price are confirmed by the store when you add this piece to your bag and again when you place the order.
        {product.inStock ? "" : " This piece is currently out of stock."}
      </Alert>

      <div className="product-mobile-buy">
        <div>
          <strong>{money(unitPrice)}</strong>
          <span>{stockLabel}</span>
        </div>
        <button
          type="button"
          className="button button--primary button--small"
          disabled={!available || adding}
          onClick={() => void addToBag(false)}
        >
          {available ? "Add to bag" : "Out of stock"}
        </button>
      </div>
    </div>
  );
}
