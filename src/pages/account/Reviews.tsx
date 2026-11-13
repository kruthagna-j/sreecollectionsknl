import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, PageLoader, StarRating, StatusBadge } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, reviewStatus } from "../../lib/format";
import type { MyReview } from "../../lib/types";

export function AccountReviews() {
  const reviews = useQuery({
    queryKey: ["account", "reviews"],
    queryFn: () => api<{ items: MyReview[] }>("/account/reviews")
  });

  return (
    <div>
      <header className="account-heading">
        <p className="eyebrow">Your words</p>
        <h1>Reviews</h1>
        <p>Reviews can be written on delivered orders and appear once the store has approved them.</p>
      </header>

      {reviews.isLoading ? <PageLoader label="Loading your reviews…" /> : null}
      {reviews.isError ? (
        <EmptyState
          title="Reviews could not be loaded"
          description={errorMessage(reviews.error)}
          action={{ label: "Try again", onClick: () => void reviews.refetch() }}
        />
      ) : null}
      {reviews.data && !reviews.data.items.length ? (
        <EmptyState
          title="No reviews yet"
          description="Open a delivered order to review the items in it."
          action={{ label: "View your orders", to: "/account/orders" }}
        />
      ) : null}

      <ul className="my-reviews">
        {reviews.data?.items.map((review) => (
          <li key={review.id} className="my-review">
            <div className="my-review__head">
              <Link to={`/product/${review.productSlug}`}>{review.productName}</Link>
              <StatusBadge status={review.status === "approved" ? "approved_review" : review.status} label={reviewStatus(review.status)} />
            </div>
            <div className="my-review__meta">
              <StarRating rating={review.rating} />
              <small>{formatDate(review.createdAt)}</small>
              {review.verifiedPurchase ? <span className="pill pill--soft">Verified purchase</span> : null}
            </div>
            {review.title ? <strong>{review.title}</strong> : null}
            <p>{review.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
