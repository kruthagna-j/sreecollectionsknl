import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import { Alert, CheckboxField, FormField, PageLoader, Spinner, StatusBadge } from "../../components/ui";
import { api, errorMessage, fieldErrors } from "../../lib/api";
import { money } from "../../lib/format";
import type { AdminProduct, Category } from "../../lib/types";

type VariantDraft = { id?: string; name: string; sku: string; priceRupees: string; stock: string };
type ImageDraft = { url: string; alt: string };

type Draft = {
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  priceRupees: string;
  salePriceRupees: string;
  mrpRupees: string;
  costPriceRupees: string;
  taxRatePercent: string;
  hsnCode: string;
  stockQuantity: string;
  lowStockThreshold: string;
  weightG: string;
  status: string;
  featured: boolean;
  giftWrappable: boolean;
  personalizable: boolean;
  returnEligible: boolean;
  fragile: boolean;
  tagsText: string;
  imageAlt: string;
  seoTitle: string;
  seoDescription: string;
  searchKeywords: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  preparationDays: string;
  images: ImageDraft[];
  variants: VariantDraft[];
};

const EMPTY: Draft = {
  name: "",
  slug: "",
  sku: "",
  categoryId: "",
  shortDescription: "",
  description: "",
  priceRupees: "",
  salePriceRupees: "",
  mrpRupees: "",
  costPriceRupees: "",
  taxRatePercent: "5",
  hsnCode: "",
  stockQuantity: "0",
  lowStockThreshold: "5",
  weightG: "400",
  status: "draft",
  featured: false,
  giftWrappable: true,
  personalizable: false,
  returnEligible: true,
  fragile: false,
  tagsText: "",
  imageAlt: "",
  seoTitle: "",
  seoDescription: "",
  searchKeywords: "",
  lengthMm: "0",
  widthMm: "0",
  heightMm: "0",
  preparationDays: "1",
  images: [],
  variants: []
};

function rupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "";
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

function toPaise(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function toInt(value: string, fallback = 0): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fromProduct(product: AdminProduct): Draft {
  return {
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    categoryId: product.categoryId,
    shortDescription: product.shortDescription,
    description: product.description,
    priceRupees: rupees(product.price),
    salePriceRupees: rupees(product.salePrice),
    mrpRupees: rupees(product.mrp),
    costPriceRupees: rupees(product.costPrice),
    taxRatePercent: String(product.taxRateBps / 100),
    hsnCode: product.hsnCode,
    stockQuantity: String(product.stockQuantity),
    lowStockThreshold: String(product.lowStockThreshold),
    weightG: String(product.weightG),
    status: product.status,
    featured: product.featured,
    giftWrappable: product.giftWrappable,
    personalizable: product.personalizable,
    returnEligible: product.returnEligible,
    fragile: product.fragile,
    tagsText: product.tags.join(", "),
    imageAlt: product.imageAlt,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    searchKeywords: product.searchKeywords,
    lengthMm: String(product.dimensions.lengthMm),
    widthMm: String(product.dimensions.widthMm),
    heightMm: String(product.dimensions.heightMm),
    preparationDays: String(product.preparationDays),
    images: product.images.map((image) => ({ url: image.url, alt: image.alt })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      priceRupees: rupees(variant.price),
      stock: String(variant.stock)
    }))
  };
}

export function AdminProductEditor() {
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [variantBusy, setVariantBusy] = useState(false);
  const [stock, setStock] = useState({ variantId: "", delta: "", reason: "" });
  const [stockBusy, setStockBusy] = useState(false);

  const productQuery = useQuery({
    queryKey: ["admin", "product", id],
    queryFn: () => api<{ product: AdminProduct }>(`/admin/products/${encodeURIComponent(id)}`),
    enabled: !isNew
  });

  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => api<{ items: Category[] }>("/admin/categories")
  });

  useEffect(() => {
    if (productQuery.data?.product) setDraft(fromProduct(productQuery.data.product));
  }, [productQuery.data]);

  useEffect(() => {
    if (isNew && categories.data?.items.length && !draft.categoryId) {
      setDraft((current) => ({ ...current, categoryId: categories.data!.items[0].id }));
    }
  }, [isNew, categories.data, draft.categoryId]);

  const product = productQuery.data?.product;

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const saveDetails = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const nextErrors: Record<string, string> = {};
    if (draft.name.trim().length < 2) nextErrors.name = "Enter a product name.";
    if (draft.sku.trim().length < 2) nextErrors.sku = "Enter a SKU.";
    if (!draft.categoryId) nextErrors.categoryId = "Choose a category.";
    if (!toPaise(draft.priceRupees)) nextErrors.price = "Enter a selling price above zero.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setFormError("Please check the highlighted fields.");
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: draft.name.trim(),
        sku: draft.sku.trim(),
        categoryId: draft.categoryId,
        shortDescription: draft.shortDescription.trim(),
        description: draft.description,
        price: toPaise(draft.priceRupees),
        salePrice: toPaise(draft.salePriceRupees),
        mrp: toPaise(draft.mrpRupees),
        costPrice: toPaise(draft.costPriceRupees),
        taxRateBps: Math.round(Number(draft.taxRatePercent || "0") * 100),
        hsnCode: draft.hsnCode.trim(),
        stockQuantity: toInt(draft.stockQuantity),
        lowStockThreshold: toInt(draft.lowStockThreshold),
        weightG: toInt(draft.weightG),
        status: draft.status,
        featured: draft.featured,
        giftWrappable: draft.giftWrappable,
        personalizable: draft.personalizable,
        returnEligible: draft.returnEligible,
        fragile: draft.fragile,
        tags: draft.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
        imageAlt: draft.imageAlt.trim(),
        seoTitle: draft.seoTitle.trim(),
        seoDescription: draft.seoDescription.trim(),
        searchKeywords: draft.searchKeywords.trim(),
        lengthMm: toInt(draft.lengthMm),
        widthMm: toInt(draft.widthMm),
        heightMm: toInt(draft.heightMm),
        preparationDays: toInt(draft.preparationDays, 1),
        images: draft.images
          .filter((image) => image.url.trim())
          .map((image) => ({ url: image.url.trim(), alt: image.alt.trim() || draft.name.trim() }))
      };
      if (draft.slug.trim()) payload.slug = draft.slug.trim().toLowerCase();
      if (isNew) {
        payload.variants = draft.variants
          .filter((variant) => variant.name.trim() && variant.sku.trim())
          .map((variant) => ({
            name: variant.name.trim(),
            sku: variant.sku.trim(),
            price: toPaise(variant.priceRupees),
            stock: toInt(variant.stock)
          }));
      }
      const response = await api<{ product: AdminProduct }>(isNew ? "/admin/products" : `/admin/products/${encodeURIComponent(id)}`, {
        method: isNew ? "POST" : "PATCH",
        body: payload
      });
      notify(isNew ? "Product created." : "Product saved.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
      if (isNew) {
        navigate(`/admin/products/${response.product.id}`, { replace: true });
      } else {
        setDraft(fromProduct(response.product));
        queryClient.setQueryData(["admin", "product", id], response);
      }
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const saveVariants = async () => {
    if (!product) return;
    setVariantBusy(true);
    try {
      const response = await api<{ product: AdminProduct }>(`/admin/products/${encodeURIComponent(product.id)}/variants`, {
        method: "PUT",
        body: {
          variants: draft.variants
            .filter((variant) => variant.name.trim() && variant.sku.trim())
            .map((variant) => ({
              ...(variant.id ? { id: variant.id } : {}),
              name: variant.name.trim(),
              sku: variant.sku.trim(),
              price: toPaise(variant.priceRupees),
              stock: toInt(variant.stock)
            }))
        }
      });
      setDraft(fromProduct(response.product));
      queryClient.setQueryData(["admin", "product", id], response);
      notify("Options saved. Removed options were deactivated, not deleted.");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setVariantBusy(false);
    }
  };

  const adjustStock = async (event: FormEvent) => {
    event.preventDefault();
    if (!product) return;
    const delta = Number.parseInt(stock.delta, 10);
    if (!Number.isFinite(delta) || delta === 0) {
      notify("Enter a non-zero stock change.", "error");
      return;
    }
    if (stock.reason.trim().length < 3) {
      notify("Add a short reason for the stock movement.", "error");
      return;
    }
    setStockBusy(true);
    try {
      await api(`/admin/products/${encodeURIComponent(product.id)}/stock`, {
        method: "POST",
        body: { variantId: stock.variantId, delta, reason: stock.reason.trim() }
      });
      notify("Stock adjusted.");
      setStock({ variantId: "", delta: "", reason: "" });
      await productQuery.refetch();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setStockBusy(false);
    }
  };

  if (!isNew && productQuery.isLoading) return <PageLoader label="Loading product…" />;
  if (!isNew && productQuery.isError) {
    return (
      <Alert tone="error" title="Product could not be loaded">
        <p>{errorMessage(productQuery.error)}</p>
        <Link to="/admin/products" className="text-link">
          Back to products
        </Link>
      </Alert>
    );
  }

  return (
    <div className="admin-page admin-editor">
      <header className="admin-page__head admin-page__head--row">
        <div>
          <Link to="/admin/products" className="text-link">
            ← Products
          </Link>
          <h1>{isNew ? "New product" : draft.name || "Product"}</h1>
          <p>{isNew ? "Create a draft, then publish when the details are complete." : `SKU ${draft.sku}`}</p>
        </div>
        <div className="admin-editor__head-actions">
          {!isNew ? <StatusBadge status={product?.status ?? draft.status} /> : null}
          {!isNew ? <span className="admin-editor__stock">Stock on hand: {product?.stock ?? 0}</span> : null}
        </div>
      </header>

      {formError ? <Alert tone="error">{formError}</Alert> : null}

      <form onSubmit={saveDetails} className="admin-editor__form">
        <section className="admin-card">
          <h2>Basics</h2>
          <div className="form-grid">
            <FormField label="Product name" htmlFor="product-name" error={errors.name} className="form-grid__full">
              <input
                id="product-name"
                value={draft.name}
                onChange={(event) => update("name", event.target.value)}
                maxLength={140}
                required
              />
            </FormField>
            <FormField label="SKU" htmlFor="product-sku" error={errors.sku}>
              <input id="product-sku" value={draft.sku} onChange={(event) => update("sku", event.target.value)} maxLength={60} required />
            </FormField>
            <FormField label="Category" htmlFor="product-category" error={errors.categoryId}>
              <select id="product-category" value={draft.categoryId} onChange={(event) => update("categoryId", event.target.value)} required>
                <option value="">Choose a category</option>
                {categories.data?.items.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="URL slug" htmlFor="product-slug" hint="Leave blank to generate from the name.">
              <input id="product-slug" value={draft.slug} onChange={(event) => update("slug", event.target.value.toLowerCase())} maxLength={80} />
            </FormField>
            <FormField label="Status" htmlFor="product-status">
              <select id="product-status" value={draft.status} onChange={(event) => update("status", event.target.value)}>
                {["draft", "scheduled", "published", "unpublished", "archived", "discontinued"].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Short description" htmlFor="product-short" hint="Shown on cards and search results." className="form-grid__full">
              <input
                id="product-short"
                value={draft.shortDescription}
                onChange={(event) => update("shortDescription", event.target.value)}
                maxLength={300}
              />
            </FormField>
            <FormField label="Full description" htmlFor="product-description" className="form-grid__full">
              <textarea
                id="product-description"
                rows={6}
                value={draft.description}
                onChange={(event) => update("description", event.target.value)}
                maxLength={6000}
              />
            </FormField>
            <FormField label="Tags" htmlFor="product-tags" hint="Comma separated, e.g. birthday, her, personalised." className="form-grid__full">
              <input id="product-tags" value={draft.tagsText} onChange={(event) => update("tagsText", event.target.value)} />
            </FormField>
          </div>
        </section>

        <section className="admin-card">
          <h2>Pricing & tax</h2>
          <div className="form-grid">
            <FormField label="Selling price (₹)" htmlFor="product-price" error={errors.price}>
              <input
                id="product-price"
                type="number"
                min="0"
                step="0.01"
                value={draft.priceRupees}
                onChange={(event) => update("priceRupees", event.target.value)}
                required
              />
            </FormField>
            <FormField label="Sale price (₹)" htmlFor="product-sale" hint="Optional. Must not exceed the MRP.">
              <input
                id="product-sale"
                type="number"
                min="0"
                step="0.01"
                value={draft.salePriceRupees}
                onChange={(event) => update("salePriceRupees", event.target.value)}
              />
            </FormField>
            <FormField label="MRP (₹)" htmlFor="product-mrp">
              <input
                id="product-mrp"
                type="number"
                min="0"
                step="0.01"
                value={draft.mrpRupees}
                onChange={(event) => update("mrpRupees", event.target.value)}
              />
            </FormField>
            <FormField label="Cost price (₹)" htmlFor="product-cost" hint="Internal. Never shown to customers.">
              <input
                id="product-cost"
                type="number"
                min="0"
                step="0.01"
                value={draft.costPriceRupees}
                onChange={(event) => update("costPriceRupees", event.target.value)}
              />
            </FormField>
            <FormField label="GST rate (%)" htmlFor="product-tax" error={errors.taxRateBps}>
              <input
                id="product-tax"
                type="number"
                min="0"
                max="28"
                step="0.01"
                value={draft.taxRatePercent}
                onChange={(event) => update("taxRatePercent", event.target.value)}
              />
            </FormField>
            <FormField label="HSN code" htmlFor="product-hsn">
              <input id="product-hsn" value={draft.hsnCode} onChange={(event) => update("hsnCode", event.target.value)} maxLength={20} />
            </FormField>
          </div>
          <p className="form-note">Prices are stored as integer paise on the server. The tax setting determines whether GST is included in prices.</p>
        </section>

        <section className="admin-card">
          <h2>Stock & shipping</h2>
          <div className="form-grid">
            <FormField label="Stock quantity" htmlFor="product-stock" hint="Ignored when active options exist.">
              <input
                id="product-stock"
                type="number"
                min="0"
                value={draft.stockQuantity}
                onChange={(event) => update("stockQuantity", event.target.value)}
              />
            </FormField>
            <FormField label="Low-stock threshold" htmlFor="product-threshold">
              <input
                id="product-threshold"
                type="number"
                min="0"
                value={draft.lowStockThreshold}
                onChange={(event) => update("lowStockThreshold", event.target.value)}
              />
            </FormField>
            <FormField label="Weight (g)" htmlFor="product-weight">
              <input id="product-weight" type="number" min="0" value={draft.weightG} onChange={(event) => update("weightG", event.target.value)} />
            </FormField>
            <FormField label="Preparation days" htmlFor="product-prep">
              <input
                id="product-prep"
                type="number"
                min="0"
                max="90"
                value={draft.preparationDays}
                onChange={(event) => update("preparationDays", event.target.value)}
              />
            </FormField>
            <FormField label="Length (mm)" htmlFor="product-length">
              <input id="product-length" type="number" min="0" value={draft.lengthMm} onChange={(event) => update("lengthMm", event.target.value)} />
            </FormField>
            <FormField label="Width (mm)" htmlFor="product-width">
              <input id="product-width" type="number" min="0" value={draft.widthMm} onChange={(event) => update("widthMm", event.target.value)} />
            </FormField>
            <FormField label="Height (mm)" htmlFor="product-height">
              <input id="product-height" type="number" min="0" value={draft.heightMm} onChange={(event) => update("heightMm", event.target.value)} />
            </FormField>
          </div>
        </section>

        <section className="admin-card">
          <h2>Merchandising</h2>
          <div className="check-grid">
            <CheckboxField label="Featured" description="Show in featured sections where relevant." checked={draft.featured} onChange={(value) => update("featured", value)} />
            <CheckboxField label="Gift wrappable" checked={draft.giftWrappable} onChange={(value) => update("giftWrappable", value)} />
            <CheckboxField
              label="Personalisable"
              description="Requires personalisation details on the product page."
              checked={draft.personalizable}
              onChange={(value) => update("personalizable", value)}
            />
            <CheckboxField
              label="Return eligible"
              description="Personalised items should generally be excluded."
              checked={draft.returnEligible}
              onChange={(value) => update("returnEligible", value)}
            />
            <CheckboxField label="Fragile" checked={draft.fragile} onChange={(value) => update("fragile", value)} />
          </div>
        </section>

        <section className="admin-card">
          <h2>Images</h2>
          <p className="form-note">Use a local /path or an https:// URL. Alt text is required for accessibility.</p>
          {draft.images.map((image, index) => (
            <div key={index} className="image-row">
              {image.url ? <img src={image.url} alt="" width="54" height="68" loading="lazy" /> : null}
              <div className="image-row__fields">
                <input
                  value={image.url}
                  onChange={(event) =>
                    update(
                      "images",
                      draft.images.map((entry, position) => (position === index ? { ...entry, url: event.target.value } : entry))
                    )
                  }
                  placeholder="/images/products/example.svg or https://…"
                  aria-label={`Image ${index + 1} URL`}
                />
                <input
                  value={image.alt}
                  onChange={(event) =>
                    update(
                      "images",
                      draft.images.map((entry, position) => (position === index ? { ...entry, alt: event.target.value } : entry))
                    )
                  }
                  placeholder="Alt text"
                  aria-label={`Image ${index + 1} alt text`}
                />
              </div>
              <button
                type="button"
                className="text-button text-button--danger"
                onClick={() => update("images", draft.images.filter((_, position) => position !== index))}
              >
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="button button--quiet button--small" onClick={() => update("images", [...draft.images, { url: "", alt: "" }])}>
            Add image
          </button>
          <FormField label="Default image alt text" htmlFor="product-image-alt" className="form-grid__full">
            <input id="product-image-alt" value={draft.imageAlt} onChange={(event) => update("imageAlt", event.target.value)} maxLength={200} />
          </FormField>
        </section>

        <section className="admin-card">
          <h2>Search & SEO</h2>
          <div className="form-grid">
            <FormField label="SEO title" htmlFor="product-seo-title" className="form-grid__full">
              <input id="product-seo-title" value={draft.seoTitle} onChange={(event) => update("seoTitle", event.target.value)} maxLength={160} />
            </FormField>
            <FormField label="SEO description" htmlFor="product-seo-description" className="form-grid__full">
              <textarea
                id="product-seo-description"
                rows={3}
                value={draft.seoDescription}
                onChange={(event) => update("seoDescription", event.target.value)}
                maxLength={300}
              />
            </FormField>
            <FormField label="Search keywords" htmlFor="product-keywords" hint="Internal keywords for storefront search." className="form-grid__full">
              <input id="product-keywords" value={draft.searchKeywords} onChange={(event) => update("searchKeywords", event.target.value)} maxLength={500} />
            </FormField>
          </div>
        </section>

        <div className="admin-savebar">
          <span>{isNew ? "New product will be created with these details." : "Changes are recorded in the audit log."}</span>
          <div>
            <Link to="/admin/products" className="button button--ghost">
              Cancel
            </Link>
            <button type="submit" className="button button--primary" disabled={busy}>
              {busy ? <Spinner label="Saving product" /> : null}
              {busy ? "Saving…" : isNew ? "Create product" : "Save changes"}
            </button>
          </div>
        </div>
      </form>

      {!isNew ? (
        <>
          <section className="admin-card">
            <div className="admin-card__head">
              <div>
                <h2>Options</h2>
                <p>Variants replace the base price and stock for that choice. Removing an option deactivates it.</p>
              </div>
              <button type="button" className="button button--quiet button--small" onClick={() => void saveVariants()} disabled={variantBusy}>
                {variantBusy ? <Spinner label="Saving options" /> : null}
                {variantBusy ? "Saving…" : "Save options"}
              </button>
            </div>
            {draft.variants.map((variant, index) => (
              <div key={variant.id ?? `new-${index}`} className="variant-row">
                <input
                  value={variant.name}
                  onChange={(event) =>
                    update("variants", draft.variants.map((entry, position) => (position === index ? { ...entry, name: event.target.value } : entry)))
                  }
                  placeholder="Option name"
                  aria-label="Option name"
                />
                <input
                  value={variant.sku}
                  onChange={(event) =>
                    update("variants", draft.variants.map((entry, position) => (position === index ? { ...entry, sku: event.target.value } : entry)))
                  }
                  placeholder="SKU"
                  aria-label="Option SKU"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={variant.priceRupees}
                  onChange={(event) =>
                    update("variants", draft.variants.map((entry, position) => (position === index ? { ...entry, priceRupees: event.target.value } : entry)))
                  }
                  placeholder="Price (₹, blank = base)"
                  aria-label="Option price in rupees"
                />
                <input
                  type="number"
                  min="0"
                  value={variant.stock}
                  onChange={(event) =>
                    update("variants", draft.variants.map((entry, position) => (position === index ? { ...entry, stock: event.target.value } : entry)))
                  }
                  placeholder="Stock"
                  aria-label="Option stock"
                />
                <button
                  type="button"
                  className="text-button text-button--danger"
                  onClick={() => update("variants", draft.variants.filter((_, position) => position !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button button--quiet button--small"
              onClick={() => update("variants", [...draft.variants, { name: "", sku: "", priceRupees: "", stock: "0" }])}
            >
              Add option
            </button>
          </section>

          <section className="admin-card">
            <h2>Adjust stock</h2>
            <p className="form-note">Every adjustment is recorded with a reason in the stock movement log and audit trail.</p>
            <form className="stock-form" onSubmit={adjustStock}>
              {draft.variants.length ? (
                <FormField label="Option" htmlFor="stock-variant">
                  <select id="stock-variant" value={stock.variantId} onChange={(event) => setStock((current) => ({ ...current, variantId: event.target.value }))}>
                    <option value="">Base product stock</option>
                    {draft.variants
                      .filter((variant) => variant.id)
                      .map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.name}
                        </option>
                      ))}
                  </select>
                </FormField>
              ) : null}
              <FormField label="Change" htmlFor="stock-delta" hint="Use a negative number to remove stock.">
                <input
                  id="stock-delta"
                  type="number"
                  value={stock.delta}
                  onChange={(event) => setStock((current) => ({ ...current, delta: event.target.value }))}
                  placeholder="e.g. 10 or -2"
                />
              </FormField>
              <FormField label="Reason" htmlFor="stock-reason">
                <input
                  id="stock-reason"
                  value={stock.reason}
                  onChange={(event) => setStock((current) => ({ ...current, reason: event.target.value }))}
                  placeholder="Stock received, damaged, recount…"
                  maxLength={120}
                />
              </FormField>
              <button type="submit" className="button button--quiet" disabled={stockBusy}>
                {stockBusy ? <Spinner label="Adjusting stock" /> : null}
                {stockBusy ? "Adjusting…" : "Apply adjustment"}
              </button>
            </form>
          </section>
        </>
      ) : null}

      {!isNew && product ? (
        <p className="admin-note">
          Selling price {money(product.price)} · last updated {product.updatedAt.slice(0, 10)}.
        </p>
      ) : null}
    </div>
  );
}
