import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../../context/ToastContext";
import { AddressFields, emptyAddress, type AddressDraft } from "../../components/AddressFields";
import { Alert, CheckboxField, EmptyState, FormField, Modal, PageLoader, Spinner } from "../../components/ui";
import { api, errorMessage, fieldErrors } from "../../lib/api";
import type { Address } from "../../lib/types";

type Draft = AddressDraft & { label: string; isDefault: boolean };

const emptyDraft: Draft = { ...emptyAddress, label: "Home", isDefault: false };

function toDraft(address: Address): Draft {
  return {
    label: address.label,
    recipient: address.recipient,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    isDefault: address.isDefault
  };
}

export function AccountAddresses() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Address | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const addresses = useQuery({
    queryKey: ["account", "addresses"],
    queryFn: () => api<{ items: Address[] }>("/account/addresses")
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["account"] });
  };

  const startNew = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setErrors({});
    setError(null);
    setOpen(true);
  };

  const startEdit = (address: Address) => {
    setEditing(address);
    setDraft(toDraft(address));
    setErrors({});
    setError(null);
    setOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setErrors({});
    setBusy(true);
    try {
      const body = {
        label: draft.label.trim() || "Home",
        recipient: draft.recipient.trim(),
        phone: draft.phone,
        line1: draft.line1.trim(),
        line2: draft.line2.trim(),
        city: draft.city.trim(),
        state: draft.state,
        pincode: draft.pincode,
        isDefault: draft.isDefault
      };
      if (editing) {
        await api(`/account/addresses/${encodeURIComponent(editing.id)}`, { method: "PATCH", body });
        notify("Address updated.");
      } else {
        await api("/account/addresses", { method: "POST", body });
        notify("Address saved.");
      }
      setOpen(false);
      refresh();
    } catch (saveError) {
      setErrors(fieldErrors(saveError));
      setError(errorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (address: Address) => {
    try {
      await api(`/account/addresses/${encodeURIComponent(address.id)}/default`, { method: "POST" });
      notify("Default address updated.", "info");
      refresh();
    } catch (defaultError) {
      notify(errorMessage(defaultError), "error");
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/account/addresses/${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      notify("Address removed.", "info");
      setDeleting(null);
      refresh();
    } catch (removeError) {
      notify(errorMessage(removeError), "error");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div>
      <header className="account-heading account-heading--row">
        <div>
          <p className="eyebrow">Saved places</p>
          <h1>Addresses</h1>
          <p>Reused at checkout and kept separately from past orders.</p>
        </div>
        <button type="button" className="button button--primary button--small" onClick={startNew}>
          Add address
        </button>
      </header>

      {addresses.isLoading ? <PageLoader label="Loading addresses…" /> : null}
      {addresses.isError ? (
        <EmptyState
          title="Addresses could not be loaded"
          description={errorMessage(addresses.error)}
          action={{ label: "Try again", onClick: () => void addresses.refetch() }}
        />
      ) : null}

      {addresses.data && !addresses.data.items.length ? (
        <EmptyState
          title="No saved addresses"
          description="Add one now, or enter it at checkout — either is fine."
          action={{ label: "Add an address", onClick: startNew }}
        />
      ) : null}

      <div className="address-grid">
        {addresses.data?.items.map((address) => (
          <article key={address.id} className={address.isDefault ? "address-card is-default" : "address-card"}>
            <div className="address-card__head">
              <strong>{address.label}</strong>
              {address.isDefault ? <span className="pill">Default</span> : null}
            </div>
            <p>
              {address.recipient}
              <br />
              {address.line1}
              {address.line2 ? (
                <>
                  <br />
                  {address.line2}
                </>
              ) : null}
              <br />
              {address.city}, {address.state} {address.pincode}
              <br />
              {address.phone}
            </p>
            <div className="address-card__actions">
              <button type="button" className="text-button" onClick={() => startEdit(address)}>
                Edit
              </button>
              {!address.isDefault ? (
                <button type="button" className="text-button" onClick={() => void makeDefault(address)}>
                  Make default
                </button>
              ) : null}
              <button type="button" className="text-button text-button--danger" onClick={() => setDeleting(address)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit address" : "Add an address"} size="md">
        <form onSubmit={save} className="modal-form">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <FormField label="Label" htmlFor="address-label" hint="Home, Work, Parents…" error={errors.label}>
            <input
              id="address-label"
              value={draft.label}
              onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
              maxLength={30}
            />
          </FormField>
          <AddressFields
            value={draft}
            onChange={(field, value) => setDraft((current) => ({ ...current, [field]: value }))}
            errors={errors}
            prefix="account-address"
          />
          <CheckboxField
            label="Use as my default delivery address"
            checked={draft.isDefault}
            onChange={(checked) => setDraft((current) => ({ ...current, isDefault: checked }))}
          />
          <div className="modal-form__actions">
            <button type="button" className="button button--ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="button button--primary" disabled={busy}>
              {busy ? <Spinner label="Saving address" /> : null}
              {busy ? "Saving…" : "Save address"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete this address?" size="sm">
        <div className="modal-form">
          <p>
            {deleting ? `${deleting.label} — ${deleting.recipient}, ${deleting.city}.` : ""} Orders already placed keep
            their delivery address snapshot.
          </p>
          <div className="modal-form__actions">
            <button type="button" className="button button--ghost" onClick={() => setDeleting(null)}>
              Keep address
            </button>
            <button type="button" className="button button--danger" onClick={() => void remove()} disabled={deleteBusy}>
              {deleteBusy ? <Spinner label="Deleting address" /> : null}
              {deleteBusy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
