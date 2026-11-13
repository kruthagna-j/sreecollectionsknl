import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, EmptyState, FormField, Modal, PageLoader, StatusBadge } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { api, errorMessage, fieldErrors } from "../../lib/api";
import { money, paiseToRupeeInput, rupeeInputToPaise } from "../../lib/format";
import type { Zone } from "../../lib/types";

type Draft = {
  name: string;
  pincodes: string;
  fee: string;
  freeAbove: string;
  etaDaysMin: string;
  etaDaysMax: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyDraft: Draft = {
  name: "",
  pincodes: "",
  fee: "",
  freeAbove: "",
  etaDaysMin: "1",
  etaDaysMax: "3",
  sortOrder: "0",
  isActive: true
};

export function AdminZones() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const zones = useQuery({
    queryKey: ["admin", "zones"],
    queryFn: () => api<{ items: Zone[] }>("/admin/zones")
  });

  const save = useMutation({
    mutationFn: (payload: { id?: string; body: unknown }) =>
      payload.id
        ? api<{ zone: Zone }>(`/admin/zones/${payload.id}`, { method: "PATCH", body: payload.body })
        : api<{ zone: Zone }>("/admin/zones", { method: "POST", body: payload.body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "zones"] });
      void queryClient.invalidateQueries({ queryKey: ["site"] });
      notify(editing ? "Delivery zone updated." : "Delivery zone created.");
      close();
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      setFormError(errorMessage(error));
    }
  });

  const toggle = useMutation({
    mutationFn: (zone: Zone) =>
      api<{ zone: Zone }>(`/admin/zones/${zone.id}`, { method: "PATCH", body: { isActive: !zone.is_active } }),
    onSuccess: (_data, zone) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "zones"] });
      void queryClient.invalidateQueries({ queryKey: ["site"] });
      notify(zone.is_active ? "Zone paused." : "Zone activated.");
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

  const openEdit = (zone: Zone) => {
    setEditing(zone);
    setDraft({
      name: zone.name,
      pincodes: zone.pincodes,
      fee: paiseToRupeeInput(zone.fee),
      freeAbove: paiseToRupeeInput(zone.free_above),
      etaDaysMin: String(zone.eta_days_min),
      etaDaysMax: String(zone.eta_days_max),
      sortOrder: String(zone.sort_order),
      isActive: Boolean(zone.is_active)
    });
    setErrors({});
    setFormError(null);
    setOpen(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const nextErrors: Record<string, string> = {};
    if (draft.name.trim().length < 2) nextErrors.name = "Give the zone a name.";
    if (draft.pincodes.trim().length < 6) nextErrors.pincodes = "Add at least one PIN code or range.";
    const fee = rupeeInputToPaise(draft.fee);
    if (fee === null) nextErrors.fee = "Enter the delivery fee (0 for free).";
    const freeAbove = draft.freeAbove.trim() ? rupeeInputToPaise(draft.freeAbove) : null;
    if (draft.freeAbove.trim() && freeAbove === null) nextErrors.freeAbove = "Enter a valid amount.";
    const etaDaysMin = Number(draft.etaDaysMin);
    const etaDaysMax = Number(draft.etaDaysMax);
    if (!Number.isInteger(etaDaysMin) || etaDaysMin < 0 || etaDaysMin > 60) {
      nextErrors.etaDaysMin = "Use a whole number of days.";
    }
    if (!Number.isInteger(etaDaysMax) || etaDaysMax < 0 || etaDaysMax > 60) {
      nextErrors.etaDaysMax = "Use a whole number of days.";
    }
    if (Number.isInteger(etaDaysMin) && Number.isInteger(etaDaysMax) && etaDaysMax < etaDaysMin) {
      nextErrors.etaDaysMax = "The maximum cannot be shorter than the minimum.";
    }
    const sortOrder = Number(draft.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000) {
      nextErrors.sortOrder = "Choose a whole number between 0 and 1000.";
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    save.mutate({
      id: editing?.id,
      body: {
        name: draft.name.trim(),
        pincodes: draft.pincodes.trim(),
        fee,
        freeAbove,
        etaDaysMin,
        etaDaysMax,
        sortOrder,
        isActive: draft.isActive
      }
    });
  };

  const items = zones.data?.items ?? [];

  return (
    <div className="admin-page">
      <header className="admin-page__head admin-page__head--row">
        <div>
          <p className="eyebrow">Store</p>
          <h1>Delivery zones</h1>
          <p>
            Delivery is quoted only for PIN codes listed in an active zone. Estimates are configured here; they are not
            live courier promises.
          </p>
        </div>
        <button type="button" className="button button--primary button--small" onClick={openNew}>
          New zone
        </button>
      </header>

      {zones.isLoading ? <PageLoader label="Loading delivery zones…" /> : null}
      {zones.isError ? (
        <EmptyState
          title="Delivery zones could not load"
          description={errorMessage(zones.error)}
          action={{ label: "Try again", onClick: () => void zones.refetch() }}
        />
      ) : null}
      {zones.data && !items.length ? (
        <EmptyState
          title="No delivery zones yet"
          description="Without an active zone, checkout will report that no PIN code is serviceable."
          action={{ label: "Create a zone", onClick: openNew }}
        />
      ) : null}

      {items.length ? (
        <div className="admin-card">
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Zone</th>
                  <th scope="col">Coverage</th>
                  <th scope="col">Delivery fee</th>
                  <th scope="col">Estimated days</th>
                  <th scope="col">Sort</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((zone) => (
                  <tr key={zone.id}>
                    <td>
                      <strong>{zone.name}</strong>
                    </td>
                    <td>
                      <span className="admin-code admin-code--wrap">{zone.pincodes}</span>
                    </td>
                    <td>
                      {zone.fee === 0 ? "Free" : money(zone.fee)}
                      {zone.free_above ? <small className="muted admin-cell-note">Free above {money(zone.free_above)}</small> : null}
                    </td>
                    <td>
                      {zone.eta_days_min}–{zone.eta_days_max} working days
                    </td>
                    <td>{zone.sort_order}</td>
                    <td>
                      <StatusBadge
                        status={zone.is_active ? "published" : "archived"}
                        label={zone.is_active ? "Active" : "Paused"}
                      />
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button type="button" className="text-link" onClick={() => openEdit(zone)}>
                          Edit
                        </button>
                        <button type="button" className="text-link" onClick={() => toggle.mutate(zone)} disabled={toggle.isPending}>
                          {zone.is_active ? "Pause" : "Activate"}
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

      <Alert tone="info" title="How coverage is matched">
        Separate PIN codes with commas, spaces or semicolons. A six-digit range like <span className="admin-code">518001-518999</span>{" "}
        covers every code in between. PIN codes are compared as text, matching the checkout behaviour.
      </Alert>

      <Modal open={open} onClose={close} title={editing ? `Edit ${editing.name}` : "New delivery zone"} size="lg">
        <form className="admin-form" onSubmit={submit}>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <FormField label="Zone name" htmlFor="zone-name" required error={errors.name}>
            <input
              id="zone-name"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              maxLength={80}
              placeholder="Kurnool local"
            />
          </FormField>
          <FormField
            label="PIN codes covered"
            htmlFor="zone-pincodes"
            required
            error={errors.pincodes}
            hint="Comma-separated codes or ranges, for example 518001, 518002, 518010-518050."
          >
            <textarea
              id="zone-pincodes"
              value={draft.pincodes}
              onChange={(event) => setDraft((current) => ({ ...current, pincodes: event.target.value }))}
              maxLength={3000}
              rows={3}
            />
          </FormField>
          <div className="form-grid">
            <FormField label="Delivery fee (₹)" htmlFor="zone-fee" required error={errors.fee}>
              <input
                id="zone-fee"
                type="number"
                inputMode="decimal"
                min={0}
                value={draft.fee}
                onChange={(event) => setDraft((current) => ({ ...current, fee: event.target.value }))}
              />
            </FormField>
            <FormField label="Free delivery above (₹)" htmlFor="zone-free" error={errors.freeAbove} hint="Leave blank for none.">
              <input
                id="zone-free"
                type="number"
                inputMode="decimal"
                min={0}
                value={draft.freeAbove}
                onChange={(event) => setDraft((current) => ({ ...current, freeAbove: event.target.value }))}
              />
            </FormField>
          </div>
          <div className="form-grid">
            <FormField label="Minimum days" htmlFor="zone-eta-min" required error={errors.etaDaysMin}>
              <input
                id="zone-eta-min"
                type="number"
                inputMode="numeric"
                min={0}
                max={60}
                value={draft.etaDaysMin}
                onChange={(event) => setDraft((current) => ({ ...current, etaDaysMin: event.target.value }))}
              />
            </FormField>
            <FormField label="Maximum days" htmlFor="zone-eta-max" required error={errors.etaDaysMax}>
              <input
                id="zone-eta-max"
                type="number"
                inputMode="numeric"
                min={0}
                max={60}
                value={draft.etaDaysMax}
                onChange={(event) => setDraft((current) => ({ ...current, etaDaysMax: event.target.value }))}
              />
            </FormField>
            <FormField label="Sort order" htmlFor="zone-sort" error={errors.sortOrder}>
              <input
                id="zone-sort"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                value={draft.sortOrder}
                onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))}
              />
            </FormField>
          </div>
          <label className="admin-switch">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
            />
            <span>
              <strong>Zone active</strong>
              <small>Paused zones are not offered or quoted at checkout.</small>
            </span>
          </label>
          <div className="admin-form__actions">
            <button type="button" className="button button--ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="button button--primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save zone" : "Create zone"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
