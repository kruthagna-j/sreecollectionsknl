import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, PageLoader, StarRating, StatusBadge } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, reviewStatus } from "../../lib/format";
import type { AdminReview } from "../../lib/types";

const TABS = [
  { key: "pending", label: "Awaiting moderation" },
  { key: "approved", label: "Published" },
  { key: "rejected", label: "Not published" }
];

export function AdminReviews() {
  const [status, setStatus] = useState("pending");
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const reviews = useQuery({
    queryKey: ["admin", "reviews", status],
    queryFn: () => api<{ items: AdminReview[] }>(`/admin/reviews?status=${encodeURIComponent(status)}`)
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; status: "approved" | "rejected" }) =>
      api<{ ok: true }>(`/admin/reviews/${input.id}/status`, { method: "POST", body: { status: input.status } }),
    onSuccess: (_data, input) => {
      notify(input.status === "approved" ? "Review published." : "Review not published.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "summary"] });
      void queryClient.invalidateQueries({ queryKey: ["product"] });
    },
    onError: (error) => notify(errorMessage(error), "error")
  });

  const items = reviews.data?.items ?? [];

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <p className="eyebrow">Service</p>
        <h1>Reviews</h1>
        <p>
          Only reviews written by customers with a delivered order reach this queue. Nothing is published on the
          storefront until it is approved here.
        </p>
      </header>

      <div className="admin-tabs" role="group" aria-label="Filter reviews">
        {TABS.map((tab) => (
          <button key={tab.key} type="button" className={status === tab.key ? "is-active" : undefined} onClick={() => setStatus(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>

      {reviews.isLoading ? <PageLoader label="Loading reviews…" /> : null}
      {reviews.isError ? (
        <EmptyState
          title="Reviews could not load"
          description={errorMessage(reviews.error)}
          action={{ label: "Try again", onClick: () => void reviews.refetch() }}
        />
      ) : null}
      {reviews.data && !items.length ? (
        <EmptyState
          title={status === "pending" ? "Nothing waiting" : "No reviews here"}
          description={
            status === "pending"
              ? "Customer reviews will appear here after delivery. There are no sample reviews in this store."
              : "Switch tabs to see reviews in another state."
          }
        />
      ) : null}

      <div className="admin-review-list">
        {items.map((review) => (
          <article key={review.id} className="admin-card admin-card--padded admin-review">
            <header className="admin-review__head">
              <div>
                <StarRating rating={review.rating} showCount={false} />
                <h2>{review.title || "Untitled review"}</h2>
                <p className="muted">
                  {review.author} · {review.email} · {formatDateTime(review.createdAt)}
                </p>
              </div>
              <div className="admin-review__badges">
                <StatusBadge status={review.status} label={reviewStatus(review.status)} />
                {review.verifiedPurchase ? <span className="pill pill--soft">Verified purchase</span> : null}
              </div>
            </header>
            <p className="admin-review__product">
              <Link to={`/admin/products/${review.productId}`}>{review.productName}</Link>
            </p>
            <p className="admin-review__body">{review.body}</p>
            <div className="admin-form__actions">
              {review.status !== "approved" ? (
                <button
                  type="button"
                  className="button button--primary button--small"
                  onClick={() => decide.mutate({ id: review.id, status: "approved" })}
                  disabled={decide.isPending}
                >
                  Publish
                </button>
              ) : null}
              {review.status !== "rejected" ? (
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => decide.mutate({ id: review.id, status: "rejected" })}
                  disabled={decide.isPending}
                >
                  Do not publish
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
