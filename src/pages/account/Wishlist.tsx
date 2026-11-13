import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import { ProductCard } from "../../components/ProductCard";
import { EmptyState, PageLoader } from "../../components/ui";
import { TrashIcon } from "../../components/Icons";
import { api, errorMessage } from "../../lib/api";
import type { ProductSummary } from "../../lib/types";

export function AccountWishlist() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const wishlist = useQuery({
    queryKey: ["account", "wishlist"],
    queryFn: () => api<{ items: ProductSummary[] }>("/account/wishlist")
  });

  const remove = async (product: ProductSummary) => {
    try {
      await api(`/account/wishlist/${encodeURIComponent(product.id)}`, { method: "DELETE" });
      notify("Removed from your wishlist.", "info");
      void queryClient.invalidateQueries({ queryKey: ["account", "wishlist"] });
      void queryClient.invalidateQueries({ queryKey: ["account", "summary"] });
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  return (
    <div>
      <header className="account-heading">
        <p className="eyebrow">Saved for later</p>
        <h1>Wishlist</h1>
        <p>Pieces you have kept an eye on. Prices and stock are shown live.</p>
      </header>

      {wishlist.isLoading ? <PageLoader label="Opening your wishlist…" /> : null}
      {wishlist.isError ? (
        <EmptyState
          title="Your wishlist could not be loaded"
          description={errorMessage(wishlist.error)}
          action={{ label: "Try again", onClick: () => void wishlist.refetch() }}
        />
      ) : null}
      {wishlist.data && !wishlist.data.items.length ? (
        <EmptyState
          title="Nothing saved yet"
          description="Use the heart on a product page to keep it here."
          action={{ label: "Browse the collection", to: "/shop" }}
        />
      ) : null}

      {wishlist.data?.items.length ? (
        <div className="product-grid wishlist-grid">
          {wishlist.data.items.map((product) => (
            <div key={product.id} className="wishlist-item">
              <ProductCard product={product} />
              <button
                type="button"
                className="wishlist-item__remove"
                onClick={() => void remove(product)}
                aria-label={`Remove ${product.name} from wishlist`}
              >
                <TrashIcon size={14} /> Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
