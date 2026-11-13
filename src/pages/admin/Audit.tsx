import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, PageLoader, Pagination } from "../../components/ui";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import type { AuditRow } from "../../lib/types";

type AuditPage = {
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
};

export function AdminAudit() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const audit = useQuery({
    queryKey: ["admin", "audit", page],
    queryFn: () => api<AuditPage>(`/admin/audit?page=${page}&pageSize=50`)
  });

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <p className="eyebrow">Store</p>
        <h1>Audit log</h1>
        <p>
          A record of staff actions on orders, catalogue, coupons, settings and stock. Entries are append-only from the
          application; this page cannot edit them.
        </p>
      </header>

      {audit.isLoading ? <PageLoader label="Loading audit log…" /> : null}
      {audit.isError ? (
        <EmptyState
          title="Audit log could not load"
          description={errorMessage(audit.error)}
          action={{ label: "Try again", onClick: () => void audit.refetch() }}
        />
      ) : null}
      {audit.data && !audit.data.items.length ? (
        <EmptyState title="No actions recorded yet" description="Staff actions will be listed here as they happen." />
      ) : null}

      {audit.data?.items.length ? (
        <>
          <div className="admin-card">
            <div className="table-wrap">
              <table className="admin-table admin-table--audit">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Action</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Entity</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.items.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.createdAt)}</td>
                      <td>
                        <span className="admin-code">{entry.action}</span>
                      </td>
                      <td>
                        <strong>{entry.actor}</strong>
                        {entry.actorEmail ? <small className="muted admin-cell-note">{entry.actorEmail}</small> : null}
                      </td>
                      <td>
                        {entry.entityType}
                        {entry.entityId ? <small className="muted admin-cell-note">{entry.entityId}</small> : null}
                      </td>
                      <td>
                        <code className="admin-code admin-code--wrap">
                          {Object.keys(entry.details ?? {}).length ? JSON.stringify(entry.details) : "—"}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            page={audit.data.page}
            pages={audit.data.pages}
            onChange={(next) => {
              const updated = new URLSearchParams(params);
              updated.set("page", String(next));
              setParams(updated, { replace: true });
            }}
          />
        </>
      ) : null}

      <p className="admin-page__note">
        Showing {audit.data?.items.length ?? 0} of {audit.data?.total ?? 0} recorded actions. Audit entries are retained
        in the database; back up the database file to preserve them.
      </p>
    </div>
  );
}
