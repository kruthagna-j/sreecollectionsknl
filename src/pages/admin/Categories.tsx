import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, EmptyState, FormField, Modal, PageLoader, StatusBadge } from "../../components/ui";
import { api, errorMessage, fieldErrors } from "../../lib/api";
import { useToast } from "../../context/ToastContext";

type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: number;
  product_count: number;
};

type CategoryList = { items: AdminCategory[] };

type Draft = {
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyDraft: Draft = { name: "", slug: "", description: "", sortOrder: "0", isActive: true };

export function AdminCategories() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: () => api<CategoryList>("/admin/categories")
  });

  const save = useMutation({
    mutationFn: (payload: { id?: string; body: unknown }) =>
      payload.id
        ? api<{ category: AdminCategory }>(`/admin/categories/${payload.id}`, { method: "PATCH", body: payload.body })
        : api<{ category: AdminCategory }>("/admin/categories", { method: "POST", body: payload.body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
      notify(editing ? "Category updated." : "Category created.");
      close();
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      setFormError(errorMessage(error));
    }
  });

  const openNew = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setErrors({});
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (category: AdminCategory) => {
    setEditing(category);
    setDraft({
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
      sortOrder: String(category.sort_order ?? 0),
      isActive: Boolean(category.is_active)
    });
    setErrors({});
    setFormError(null);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setEditing(null);
    setFormError(null);
    setErrors({});
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const nextErrors: Record<string, string> = {};
    if (draft.name.trim().length < 2) nextErrors.name = "Use at least two characters.";
    if (draft.slug && !/^[a-z0-9-]+$/.test(draft.slug.trim())) {
      nextErrors.slug = "Use lowercase letters, numbers and hyphens.";
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
        slug: draft.slug.trim() || undefined,
        description: draft.description.trim(),
        sortOrder,
        isActive: draft.isActive
      }
    });
  };

  const items = categories.data?.items ?? [];

  return (
    <div className="admin-page">
      <header className="admin-page__head admin-page__head--row">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1>Categories</h1>
          <p>Categories organise the storefront filters. Products keep their category even when it is hidden.</p>
        </div>
        <button type="button" className="button button--primary button--small" onClick={openNew}>
          New category
        </button>
      </header>

      {categories.isLoading ? <PageLoader label="Loading categories…" /> : null}
      {categories.isError ? (
        <EmptyState
          title="Categories could not load"
          description={errorMessage(categories.error)}
          action={{ label: "Try again", onClick: () => void categories.refetch() }}
        />
      ) : null}

      {categories.data && !items.length ? (
        <EmptyState
          title="No categories yet"
          description="Create the first category before publishing products."
          action={{ label: "Create a category", onClick: openNew }}
        />
      ) : null}

      {items.length ? (
        <div className="admin-card">
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">URL</th>
                  <th scope="col">Products</th>
                  <th scope="col">Sort</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <strong>{category.name}</strong>
                      {category.description ? <small className="muted admin-cell-note">{category.description}</small> : null}
                    </td>
                    <td>
                      <code>/shop?category={category.slug}</code>
                    </td>
                    <td>{category.product_count}</td>
                    <td>{category.sort_order}</td>
                    <td>
                      <StatusBadge
                        status={category.is_active ? "published" : "archived"}
                        label={category.is_active ? "Visible" : "Hidden"}
                      />
                    </td>
                    <td>
                      <button type="button" className="text-link" onClick={() => openEdit(category)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal open={open} onClose={close} title={editing ? `Edit ${editing.name}` : "New category"} size="md">
        <form className="admin-form" onSubmit={submit}>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <FormField label="Name" htmlFor="category-name" required error={errors.name}>
            <input
              id="category-name"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              maxLength={80}
              required
            />
          </FormField>
          <FormField
            label="URL slug"
            htmlFor="category-slug"
            hint="Leave blank to generate it from the name."
            error={errors.slug}
          >
            <input
              id="category-slug"
              value={draft.slug}
              onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))}
              maxLength={80}
              placeholder="birthday"
            />
          </FormField>
          <FormField label="Description" htmlFor="category-description">
            <textarea
              id="category-description"
              value={draft.description}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              maxLength={300}
              rows={3}
            />
          </FormField>
          <div className="form-grid">
            <FormField label="Sort order" htmlFor="category-sort" hint="Lower numbers appear first." error={errors.sortOrder}>
              <input
                id="category-sort"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                value={draft.sortOrder}
                onChange={(event) => setDraft((current) => ({ ...current, sortOrder: event.target.value }))}
              />
            </FormField>
            <label className="admin-switch">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
              />
              <span>
                <strong>Visible in storefront</strong>
                <small>Hidden categories keep their products but leave navigation.</small>
              </span>
            </label>
          </div>
          <div className="admin-form__actions">
            <button type="button" className="button button--ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="button button--primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save changes" : "Create category"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
