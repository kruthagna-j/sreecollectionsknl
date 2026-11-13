import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, EmptyState, FormField, Modal, PageLoader, StatusBadge } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { api, errorMessage, fieldErrors } from "../../lib/api";
import { formatDate, money, paiseToRupeeInput, rupeeInputToPaise } from "../../lib/format";
import type { Coupon } from "../../lib/types";

type Draft = {
  code: string;
  kind: Coupon["kind"];
  value: string;
  minSubtotal: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perEmailLimit: string;
  firstOrderOnly: boolean;
  isActive: boolean;
};

const emptyDraft: Draft = {
  code: "",
  kind: "percent",
  value: "",
  minSubtotal: "",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
  perEmailLimit: "1",
  firstOrderOnly: false,
  isActive: true
};

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function couponValueLabel(coupon: Coupon): string {
  if (coupon.kind === "percent") return `${coupon.value / 100}% off`;
  if (coupon.kind === "fixed") return `${money(coupon.value)} off`;
  return "Free delivery";
}

export function AdminCoupons() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const coupons = useQuery({
    queryKey: ["admin", "coupons"],
    queryFn: () => api<{ items: Coupon[] }>("/admin/coupons")
  });

  const save = useMutation({
    mutationFn: (payload: { id?: string; body: unknown }) =>
      payload.id
        ? api<{ coupon: unknown }>(`/admin/coupons/${payload.id}`, { method: "PATCH", body: payload.body })
        : api<{ coupon: unknown }>("/admin/coupons", { method: "POST", body: payload.body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
      notify(editing ? "Coupon updated." : "Coupon created.");
      close();
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      setFormError(errorMessage(error));
    }
  });

  const toggle = useMutation({
    mutationFn: (coupon: Coupon) =>
      api<{ coupon: unknown }>(`/admin/coupons/${coupon.id}`, {
        method: "PATCH",
        body: { isActive: !coupon.isActive }
      }),
    onSuccess: (_data, coupon) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] });
      notify(coupon.isActive ? "Coupon paused." : "Coupon activated.");
    },
    onError: (error) => notify(errorMessage(error), "error")
  });

  const close = () => {
    setOpen(false);
    setEditing(null);
    setErrors({});
    setFormError(null);
  };

  const openNew = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setErrors({});
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditing(coupon);
    setDraft({
      code: coupon.code,
      kind: coupon.kind,
      value:
        coupon.kind === "percent"
          ? String(coupon.value / 100)
          : coupon.kind === "fixed"
            ? paiseToRupeeInput(coupon.value)
            : "",
      minSubtotal: paiseToRupeeInput(coupon.minSubtotal),
      maxDiscount: paiseToRupeeInput(coupon.maxDiscount),
      startsAt: toLocalInput(coupon.startsAt),
      endsAt: toLocalInput(coupon.endsAt),
      usageLimit: coupon.usageLimit === null ? "" : String(coupon.usageLimit),
      perEmailLimit: String(coupon.perEmailLimit),
      firstOrderOnly: coupon.firstOrderOnly,
      isActive: coupon.isActive
    });
    setErrors({});
    setFormError(null);
    setOpen(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const nextErrors: Record<string, string> = {};
    if (draft.code.trim().length < 2) nextErrors.code = "Use at least two characters.";
    if (!/^[A-Za-z0-9_-]+$/.test(draft.code.trim())) nextErrors.code = "Use letters, numbers, hyphens or underscores.";
    let value = 0;
    if (draft.kind === "percent") {
      const percent = Number(draft.value);
      if (!Number.isFinite(percent) || percent < 0.01 || percent > 100) {
        nextErrors.value = "Enter a percentage between 0.01 and 100.";
      } else {
        value = Math.round(percent * 100);
      }
    }
    if (draft.kind === "fixed") {
      const paise = rupeeInputToPaise(draft.value);
      if (!paise) nextErrors.value = "Enter a discount amount above zero.";
      else value = paise;
    }
    const minSubtotal = rupeeInputToPaise(draft.minSubtotal) ?? 0;
    const maxDiscount = draft.kind === "percent" ? rupeeInputToPaise(draft.maxDiscount) : null;
    const startsAt = fromLocalInput(draft.startsAt);
    const endsAt = fromLocalInput(draft.endsAt);
    if (draft.startsAt && !startsAt) nextErrors.startsAt = "Choose a valid start date.";
    if (draft.endsAt && !endsAt) nextErrors.endsAt = "Choose a valid end date.";
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      nextErrors.endsAt = "The end must be after the start.";
    }
    const usageLimit = draft.usageLimit.trim() ? Number(draft.usageLimit) : null;
    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
      nextErrors.usageLimit = "Use a whole number of at least 1, or leave blank.";
    }
    const perEmailLimit = Number(draft.perEmailLimit);
    if (!Number.isInteger(perEmailLimit) || perEmailLimit < 1 || perEmailLimit > 100) {
      nextErrors.perEmailLimit = "Choose between 1 and 100.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    save.mutate({
      id: editing?.id,
      body: {
        code: draft.code.trim().toUpperCase(),
        kind: draft.kind,
        value,
        minSubtotal,
        maxDiscount,
        startsAt,
        endsAt,
        usageLimit,
        perEmailLimit,
        firstOrderOnly: draft.firstOrderOnly,
        isActive: draft.isActive
      }
    });
  };

  const items = coupons.data?.items ?? [];

  return (
    <div className="admin-page">
      <header className="admin-page__head admin-page__head--row">
        <div>
          <p className="eyebrow">Sales</p>
          <h1>Coupons</h1>
          <p>Discounts are validated only on the server. Coupon codes are never printed on public pages.</p>
        </div>
        <button type="button" className="button button--primary button--small" onClick={openNew}>
          New coupon
        </button>
      </header>

      {coupons.isLoading ? <PageLoader label="Loading coupons…" /> : null}
      {coupons.isError ? (
        <EmptyState
          title="Coupons could not load"
          description={errorMessage(coupons.error)}
          action={{ label: "Try again", onClick: () => void coupons.refetch() }}
        />
      ) : null}
      {coupons.data && !items.length ? (
        <EmptyState
          title="No coupons yet"
          description="Create a discount for a campaign or a welcome offer. Leave coupons paused until the offer is meant to be live."
          action={{ label: "Create a coupon", onClick: openNew }}
        />
      ) : null}

      {items.length ? (
        <div className="admin-card">
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Discount</th>
                  <th scope="col">Minimum spend</th>
                  <th scope="col">Limits</th>
                  <th scope="col">Window</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((coupon) => (
                  <tr key={coupon.id}>
                    <td>
                      <strong className="admin-code">{coupon.code}</strong>
                      <small className="muted admin-cell-note">
                        {coupon.redemptions} used · {coupon.firstOrderOnly ? "first order only" : "any order"}
                      </small>
                    </td>
                    <td>
                      {couponValueLabel(coupon)}
                      {coupon.maxDiscount ? <small className="muted admin-cell-note">up to {money(coupon.maxDiscount)}</small> : null}
                    </td>
                    <td>{coupon.minSubtotal ? money(coupon.minSubtotal) : "None"}</td>
                    <td>
                      {coupon.perEmailLimit}/email
                      {coupon.usageLimit ? <small className="muted admin-cell-note">{coupon.usageLimit} uses total</small> : null}
                    </td>
                    <td>
                      {coupon.startsAt || coupon.endsAt
                        ? `${formatDate(coupon.startsAt)} – ${formatDate(coupon.endsAt)}`
                        : "Always available"}
                    </td>
                    <td>
                      <StatusBadge
                        status={coupon.isActive ? "published" : "archived"}
                        label={coupon.isActive ? "Active" : "Paused"}
                      />
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button type="button" className="text-link" onClick={() => openEdit(coupon)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => toggle.mutate(coupon)}
                          disabled={toggle.isPending}
                        >
                          {coupon.isActive ? "Pause" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal open={open} onClose={close} title={editing ? `Edit ${editing.code}` : "New coupon"} size="lg">
        <form className="admin-form" onSubmit={submit}>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <div className="form-grid">
            <FormField label="Code" htmlFor="coupon-code" required error={errors.code} hint="Shown exactly as typed at checkout.">
              <input
                id="coupon-code"
                value={draft.code}
                onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                maxLength={40}
                placeholder="WELCOME10"
              />
            </FormField>
            <FormField label="Discount type" htmlFor="coupon-kind" required>
              <select
                id="coupon-kind"
                value={draft.kind}
                onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as Coupon["kind"] }))}
              >
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
                <option value="free_shipping">Free delivery</option>
              </select>
            </FormField>
          </div>

          <div className="form-grid">
            {draft.kind !== "free_shipping" ? (
              <FormField
                label={draft.kind === "percent" ? "Percentage off" : "Amount off (₹)"}
                htmlFor="coupon-value"
                required
                error={errors.value}
                hint={draft.kind === "percent" ? "For example 10 for 10% off." : undefined}
              >
                <input
                  id="coupon-value"
                  type="number"
                  inputMode="decimal"
                  min={draft.kind === "percent" ? 0.01 : 1}
                  max={draft.kind === "percent" ? 100 : undefined}
                  step={draft.kind === "percent" ? "0.01" : "1"}
                  value={draft.value}
                  onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
                />
              </FormField>
            ) : null}
            <FormField label="Minimum subtotal (₹)" htmlFor="coupon-min" hint="Leave blank for no minimum.">
              <input
                id="coupon-min"
                type="number"
                inputMode="decimal"
                min={0}
                value={draft.minSubtotal}
                onChange={(event) => setDraft((current) => ({ ...current, minSubtotal: event.target.value }))}
              />
            </FormField>
            {draft.kind === "percent" ? (
              <FormField label="Maximum discount (₹)" htmlFor="coupon-max" hint="Leave blank for no cap.">
                <input
                  id="coupon-max"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={draft.maxDiscount}
                  onChange={(event) => setDraft((current) => ({ ...current, maxDiscount: event.target.value }))}
                />
              </FormField>
            ) : null}
          </div>

          <div className="form-grid">
            <FormField label="Starts" htmlFor="coupon-start" error={errors.startsAt}>
              <input
                id="coupon-start"
                type="datetime-local"
                value={draft.startsAt}
                onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))}
              />
            </FormField>
            <FormField label="Ends" htmlFor="coupon-end" error={errors.endsAt}>
              <input
                id="coupon-end"
                type="datetime-local"
                value={draft.endsAt}
                onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))}
              />
            </FormField>
          </div>

          <div className="form-grid">
            <FormField label="Total uses allowed" htmlFor="coupon-usage" error={errors.usageLimit} hint="Blank means unlimited.">
              <input
                id="coupon-usage"
                type="number"
                inputMode="numeric"
                min={1}
                value={draft.usageLimit}
                onChange={(event) => setDraft((current) => ({ ...current, usageLimit: event.target.value }))}
              />
            </FormField>
            <FormField label="Uses per email" htmlFor="coupon-per-email" required error={errors.perEmailLimit}>
              <input
                id="coupon-per-email"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={draft.perEmailLimit}
                onChange={(event) => setDraft((current) => ({ ...current, perEmailLimit: event.target.value }))}
              />
            </FormField>
          </div>

          <div className="admin-switch-row">
            <label className="admin-switch">
              <input
                type="checkbox"
                checked={draft.firstOrderOnly}
                onChange={(event) => setDraft((current) => ({ ...current, firstOrderOnly: event.target.checked }))}
              />
              <span>
                <strong>First order only</strong>
                <small>Useful for a welcome offer; checked against real order history.</small>
              </span>
            </label>
            <label className="admin-switch">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
              />
              <span>
                <strong>Active</strong>
                <small>Inactive coupons are rejected at checkout.</small>
              </span>
            </label>
          </div>

          <div className="admin-form__actions">
            <button type="button" className="button button--ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="button button--primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save coupon" : "Create coupon"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
