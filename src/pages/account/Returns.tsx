import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSite } from "../../context/SiteContext";
import { Alert, EmptyState, PageLoader, StatusBadge } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDate, returnStatus } from "../../lib/format";
import type { ReturnRequest } from "../../lib/types";

export function AccountReturns() {
  const { site } = useSite();
  const returns = useQuery({
    queryKey: ["account", "returns"],
    queryFn: () => api<{ items: ReturnRequest[] }>("/account/returns")
  });
  const policy = site?.policies.returns;

  return (
    <div>
      <header className="account-heading">
        <p className="eyebrow">After delivery</p>
        <h1>Returns</h1>
        <p>
          {policy
            ? `Returns are ${policy.enabled ? "open" : "paused"}. Eligible items can be requested within ${policy.windowDays} days of delivery.`
            : "Return requests are reviewed by the store."}
        </p>
      </header>

      <Alert tone="info" title="How to start a return">
        <p>
          Open a delivered order in <Link to="/account/orders">Orders</Link> and choose “Request return” beside the item.
          The store reviews every request before anything is sent back, and personalised pieces are excluded unless they
          arrived damaged or incorrect.
        </p>
      </Alert>

      {returns.isLoading ? <PageLoader label="Loading return requests…" /> : null}
      {returns.isError ? (
        <EmptyState
          title="Return requests could not be loaded"
          description={errorMessage(returns.error)}
          action={{ label: "Try again", onClick: () => void returns.refetch() }}
        />
      ) : null}
      {returns.data && !returns.data.items.length ? (
        <EmptyState
          title="No return requests"
          description="Nothing has been returned. If something is not right, open the delivered order to start a request."
          action={{ label: "View delivered orders", to: "/account/orders" }}
        />
      ) : null}

      <ul className="return-list">
        {returns.data?.items.map((request) => (
          <li key={request.requestNumber} className="return-card">
            <div className="return-card__head">
              <div>
                <strong>{request.requestNumber}</strong>
                <small>
                  Order {request.orderNumber} · {formatDate(request.createdAt)}
                </small>
              </div>
              <StatusBadge status={request.status} label={returnStatus(request.status)} />
            </div>
            <p>
              <strong>{request.reasonLabel}</strong>
              {request.detail ? ` — ${request.detail}` : ""}
            </p>
            {request.adminNote ? <p className="return-card__note">Store note: {request.adminNote}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
