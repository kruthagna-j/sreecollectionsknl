import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FormField, PageLoader } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, paiseToRupeeInput } from "../../lib/format";
import type { SettingsRow } from "../../lib/types";

type StoreForm = {
  name: string;
  tagline: string;
  supportEmail: string;
  supportPhone: string;
  supportWhatsApp: string;
  address: string;
  latitude: string;
  longitude: string;
};

type NotificationsForm = {
  sendCustomerEmail: boolean;
  sendOwnerEmail: boolean;
  ownerEmail: string;
  whatsappAutoOpen: boolean;
};

type TaxForm = {
  inclusive: boolean;
  ratePercent: string;
  gstin: string;
  state: string;
  note: string;
};

type GiftWrapForm = { feeRupees: string; label: string };
type CodForm = { enabled: boolean; maxTotalRupees: string; feeRupees: string };
type ReturnsForm = { enabled: boolean; windowDays: string; note: string };
type OperationalForm = { maintenance: boolean; message: string };
type HomeSection = { id: string; type: string; title: string; subtitle: string; enabled: boolean; order: number };
type HomeForm = {
  announcement: string;
  useDefaultHero: boolean;
  hero: { eyebrow: string; title: string; subtitle: string; ctaLabel: string; ctaHref: string; image: string };
  sections: HomeSection[];
};

type PublicProfileForm = {
  rating: string;
  ratingCount: string;
  yearsInBusiness: string;
  locality: string;
  closesAt: string;
  categories: string;
};

type Forms = {
  store: StoreForm;
  notifications: NotificationsForm;
  publicProfile: PublicProfileForm;
  tax: TaxForm;
  giftWrap: GiftWrapForm;
  cod: CodForm;
  returns: ReturnsForm;
  operational: OperationalForm;
  home: HomeForm;
};

const TABS: Array<{ key: keyof Forms; label: string; description: string }> = [
  { key: "store", label: "Store details", description: "Name, support contacts, WhatsApp number and address." },
  {
    key: "notifications",
    label: "Order messages",
    description: "Invoice emails and the WhatsApp handoff sent when an order is placed."
  },
  {
    key: "publicProfile",
    label: "Storefront facts",
    description: "Rating, locality and closing time shown on the home page."
  },
  { key: "tax", label: "Tax", description: "GST presentation used by new cart quotes and invoices." },
  { key: "giftWrap", label: "Gift wrap", description: "The optional wrapping fee offered on eligible products." },
  { key: "cod", label: "Cash on delivery", description: "Whether cash on delivery is offered, and its ceiling." },
  { key: "returns", label: "Returns", description: "The window in which delivered items may be returned." },
  { key: "operational", label: "Maintenance", description: "The storefront notice shown while the shop is paused." },
  { key: "home", label: "Home content", description: "Announcement, hero and the editorial section plan." }
];

const DEFAULTS: Forms = {
  store: {
    name: "Sree Collections",
    tagline: "Since 1998",
    supportEmail: "",
    supportPhone: "",
    supportWhatsApp: "",
    address: "",
    latitude: "",
    longitude: ""
  },
  notifications: { sendCustomerEmail: true, sendOwnerEmail: true, ownerEmail: "", whatsappAutoOpen: true },
  publicProfile: {
    rating: "",
    ratingCount: "",
    yearsInBusiness: "",
    locality: "",
    closesAt: "",
    categories: ""
  },
  tax: { inclusive: true, ratePercent: "5", gstin: "", state: "", note: "" },
  giftWrap: { feeRupees: "0", label: "" },
  cod: { enabled: false, maxTotalRupees: "0", feeRupees: "0" },
  returns: { enabled: true, windowDays: "7", note: "" },
  operational: { maintenance: false, message: "" },
  home: {
    announcement: "",
    useDefaultHero: true,
    hero: { eyebrow: "", title: "", subtitle: "", ctaLabel: "", ctaHref: "", image: "" },
    sections: []
  }
};

function parseRows(rows: SettingsRow[]): Forms {
  const read = <T,>(key: string): Record<string, unknown> => {
    const row = rows.find((entry) => entry.key === key);
    if (!row) return {};
    try {
      const parsed = JSON.parse(row.value);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };
  const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
  const number = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
  const boolean = (value: unknown, fallback = false) => (typeof value === "boolean" ? value : fallback);
  const numberText = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? String(value) : "");
  const listText = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(", ") : "";

  const store = read("store");
  const notifications = read("notifications");
  const publicProfile = read("publicProfile");
  const tax = read("tax");
  const giftWrap = read("giftWrap");
  const cod = read("cod");
  const returns = read("returns");
  const operational = read("operational");
  const home = read("home");
  const heroRaw = home.hero && typeof home.hero === "object" ? (home.hero as Record<string, unknown>) : null;
  const sectionsRaw = Array.isArray(home.sections) ? (home.sections as Array<Record<string, unknown>>) : [];

  return {
    store: {
      name: text(store.name, DEFAULTS.store.name),
      tagline: text(store.tagline, DEFAULTS.store.tagline),
      supportEmail: text(store.supportEmail),
      supportPhone: text(store.supportPhone),
      supportWhatsApp: text(store.supportWhatsApp),
      address: text(store.address),
      latitude: store.latitude === null || store.latitude === undefined ? "" : String(store.latitude),
      longitude: store.longitude === null || store.longitude === undefined ? "" : String(store.longitude)
    },
    notifications: {
      sendCustomerEmail: boolean(notifications.sendCustomerEmail, true),
      sendOwnerEmail: boolean(notifications.sendOwnerEmail, true),
      ownerEmail: text(notifications.ownerEmail),
      whatsappAutoOpen: boolean(notifications.whatsappAutoOpen, true)
    },
    publicProfile: {
      rating: numberText(publicProfile.rating),
      ratingCount: numberText(publicProfile.ratingCount),
      yearsInBusiness: numberText(publicProfile.yearsInBusiness),
      locality: text(publicProfile.locality),
      closesAt: text(publicProfile.closesAt),
      categories: listText(publicProfile.categories)
    },
    tax: {
      inclusive: boolean(tax.inclusive, true),
      ratePercent: String(number(tax.defaultRateBps, 500) / 100),
      gstin: text(tax.gstin),
      state: text(tax.state),
      note: text(tax.note)
    },
    giftWrap: {
      feeRupees: paiseToRupeeInput(number(giftWrap.fee, 0)) || "0",
      label: text(giftWrap.label)
    },
    cod: {
      enabled: boolean(cod.enabled),
      maxTotalRupees: paiseToRupeeInput(number(cod.maxTotal, 0)) || "0",
      feeRupees: paiseToRupeeInput(number(cod.fee, 0)) || "0"
    },
    returns: {
      enabled: boolean(returns.enabled, true),
      windowDays: String(number(returns.windowDays, 7)),
      note: text(returns.note)
    },
    operational: {
      maintenance: boolean(operational.maintenance),
      message: text(operational.message)
    },
    home: {
      announcement: text(home.announcement),
      useDefaultHero: !heroRaw,
      hero: {
        eyebrow: text(heroRaw?.eyebrow),
        title: text(heroRaw?.title),
        subtitle: text(heroRaw?.subtitle),
        ctaLabel: text(heroRaw?.ctaLabel),
        ctaHref: text(heroRaw?.ctaHref),
        image: text(heroRaw?.image)
      },
      sections: sectionsRaw.map((section, index) => ({
        id: text(section.id, `section-${index + 1}`),
        type: text(section.type, "products"),
        title: text(section.title),
        subtitle: text(section.subtitle),
        enabled: boolean(section.enabled, true),
        order: number(section.order, index)
      }))
    }
  };
}

function amountToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function AdminSettings() {
  const { user } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [active, setActive] = useState<keyof Forms>("store");
  const [forms, setForms] = useState<Forms>(DEFAULTS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const initialized = useRef(false);

  const settings = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api<{ items: SettingsRow[]; editable: string[] }>("/admin/settings"),
    refetchOnWindowFocus: false
  });

  useEffect(() => {
    if (!settings.data || initialized.current) return;
    initialized.current = true;
    setForms(parseRows(settings.data.items));
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (payload: { key: keyof Forms; value: unknown }) =>
      api<{ key: string; value: unknown }>(`/admin/settings/${payload.key}`, {
        method: "PUT",
        body: { value: payload.value }
      }),
    onSuccess: (_data, payload) => {
      setFormError(null);
      setErrors({});
      notify(`${TABS.find((tab) => tab.key === payload.key)?.label ?? "Setting"} saved.`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      void queryClient.invalidateQueries({ queryKey: ["site"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
      initialized.current = false;
    },
    onError: (error) => setFormError(errorMessage(error))
  });

  const update = <K extends keyof Forms,>(key: K, value: Forms[K]) => {
    setForms((current) => ({ ...current, [key]: value }));
  };

  const updatedAt = settings.data?.items.find((item) => item.key === active)?.updated_at;
  const canEdit = user?.role === "owner" || user?.role === "admin";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const nextErrors: Record<string, string> = {};

    if (active === "store") {
      const form = forms.store;
      if (form.name.trim().length < 2) nextErrors.name = "Enter the store name.";
      if (form.supportEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.supportEmail.trim())) {
        nextErrors.supportEmail = "Enter a valid email address or leave it blank.";
      }
      if (form.latitude.trim() && !Number.isFinite(Number(form.latitude))) nextErrors.latitude = "Use a decimal degree value.";
      if (form.longitude.trim() && !Number.isFinite(Number(form.longitude))) nextErrors.longitude = "Use a decimal degree value.";
      const whatsappDigits = form.supportWhatsApp.replace(/\D/g, "");
      if (whatsappDigits && (whatsappDigits.length < 10 || whatsappDigits.length > 15)) {
        nextErrors.supportWhatsApp = "Enter a full phone number with country code, or leave it blank.";
      }
      if (Object.keys(nextErrors).length) return setErrors(nextErrors);
      save.mutate({
        key: "store",
        value: {
          name: form.name.trim(),
          tagline: form.tagline.trim(),
          supportEmail: form.supportEmail.trim(),
          supportPhone: form.supportPhone.trim(),
          supportWhatsApp: form.supportWhatsApp.trim(),
          address: form.address.trim(),
          latitude: form.latitude.trim() ? Number(form.latitude) : null,
          longitude: form.longitude.trim() ? Number(form.longitude) : null
        }
      });
      return;
    }

    if (active === "notifications") {
      const form = forms.notifications;
      if (form.ownerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail.trim())) {
        nextErrors.ownerEmail = "Enter a valid email address or leave it blank.";
      }
      if (Object.keys(nextErrors).length) return setErrors(nextErrors);
      save.mutate({
        key: "notifications",
        value: {
          sendCustomerEmail: form.sendCustomerEmail,
          sendOwnerEmail: form.sendOwnerEmail,
          ownerEmail: form.ownerEmail.trim(),
          whatsappAutoOpen: form.whatsappAutoOpen
        }
      });
      return;
    }

    if (active === "publicProfile") {
      const form = forms.publicProfile;
      const rating = form.rating.trim() === "" ? null : Number(form.rating);
      const ratingCount = form.ratingCount.trim() === "" ? null : Number(form.ratingCount);
      const years = form.yearsInBusiness.trim() === "" ? null : Number(form.yearsInBusiness);
      const closesAt = form.closesAt.trim();
      if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
        nextErrors.rating = "Use a rating between 0 and 5, or leave it blank.";
      }
      if (ratingCount !== null && (!Number.isInteger(ratingCount) || ratingCount < 0)) {
        nextErrors.ratingCount = "Use a whole number of ratings, or leave it blank.";
      }
      if (years !== null && (!Number.isInteger(years) || years < 0 || years > 200)) {
        nextErrors.yearsInBusiness = "Use a whole number of years, or leave it blank.";
      }
      if (closesAt && !/^([01]\d|2[0-3]):[0-5]\d$/.test(closesAt)) {
        nextErrors.closesAt = "Use a 24-hour time such as 21:30, or leave it blank.";
      }
      if (Object.keys(nextErrors).length) return setErrors(nextErrors);
      save.mutate({
        key: "publicProfile",
        value: {
          rating,
          ratingCount,
          yearsInBusiness: years,
          locality: form.locality.trim(),
          closesAt,
          categories: form.categories
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 6)
        }
      });
      return;
    }

    if (active === "tax") {
      const form = forms.tax;
      const percent = Number(form.ratePercent);
      if (!Number.isFinite(percent) || percent < 0 || percent > 28) {
        nextErrors.ratePercent = "Use a GST rate between 0 and 28.";
      }
      if (Object.keys(nextErrors).length) return setErrors(nextErrors);
      save.mutate({
        key: "tax",
        value: {
          inclusive: form.inclusive,
          defaultRateBps: Math.round(percent * 100),
          gstin: form.gstin.trim(),
          state: form.state.trim(),
          note: form.note.trim()
        }
      });
      return;
    }

    if (active === "giftWrap") {
      const fee = amountToPaise(forms.giftWrap.feeRupees);
      if (fee === null) nextErrors.feeRupees = "Enter the wrapping fee, or 0.";
      if (Object.keys(nextErrors).length) return setErrors(nextErrors);
      save.mutate({ key: "giftWrap", value: { fee, label: forms.giftWrap.label.trim() } });
      return;
    }

    if (active === "cod") {
      const maxTotal = amountToPaise(forms.cod.maxTotalRupees);
      const fee = amountToPaise(forms.cod.feeRupees);
      if (maxTotal === null) nextErrors.maxTotalRupees = "Enter the maximum order value, or 0.";
      if (fee === null) nextErrors.feeRupees = "Enter the COD fee, or 0.";
      if (Object.keys(nextErrors).length) return setErrors(nextErrors);
      save.mutate({
        key: "cod",
        value: { enabled: forms.cod.enabled, maxTotal, fee }
      });
      return;
    }

    if (active === "returns") {
      const days = Number(forms.returns.windowDays);
      if (!Number.isInteger(days) || days < 0 || days > 60) {
        nextErrors.windowDays = "Choose a whole number of days between 0 and 60.";
      }
      if (Object.keys(nextErrors).length) return setErrors(nextErrors);
      save.mutate({
        key: "returns",
        value: { enabled: forms.returns.enabled, windowDays: days, note: forms.returns.note.trim() }
      });
      return;
    }

    if (active === "operational") {
      save.mutate({
        key: "operational",
        value: { maintenance: forms.operational.maintenance, message: forms.operational.message.trim() }
      });
      return;
    }

    const home = forms.home;
    if (!home.useDefaultHero) {
      if (home.hero.title.trim().length < 2) nextErrors.heroTitle = "Add a hero headline, or use the default hero.";
      if (home.hero.ctaHref.trim() && !home.hero.ctaHref.trim().startsWith("/")) {
        nextErrors.heroCtaHref = "Use a store path beginning with /.";
      }
      if (home.hero.image.trim() && !/^(\/|https:\/\/)/.test(home.hero.image.trim())) {
        nextErrors.heroImage = "Use a local /path or an https:// image URL.";
      }
    }
    const seen = new Set<string>();
    for (const section of home.sections) {
      if (!section.id.trim() || !section.type.trim() || !section.title.trim()) {
        nextErrors.sections = "Every section needs an ID, type and title.";
        break;
      }
      if (seen.has(section.id.trim())) {
        nextErrors.sections = "Section IDs must be unique.";
        break;
      }
      seen.add(section.id.trim());
      if (!Number.isInteger(Number(section.order)) || Number(section.order) < 0 || Number(section.order) > 100) {
        nextErrors.sections = "Section order must be a whole number from 0 to 100.";
        break;
      }
    }
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);
    save.mutate({
      key: "home",
      value: {
        announcement: home.announcement.trim(),
        hero: home.useDefaultHero
          ? null
          : {
              eyebrow: home.hero.eyebrow.trim(),
              title: home.hero.title.trim(),
              subtitle: home.hero.subtitle.trim(),
              ctaLabel: home.hero.ctaLabel.trim(),
              ctaHref: home.hero.ctaHref.trim(),
              image: home.hero.image.trim()
            },
        sections: home.sections.map((section) => ({
          id: section.id.trim(),
          type: section.type.trim(),
          title: section.title.trim(),
          subtitle: section.subtitle.trim(),
          enabled: section.enabled,
          order: Number(section.order)
        }))
      }
    });
  };

  if (settings.isLoading) return <PageLoader label="Loading store settings…" />;
  if (settings.isError) {
    return (
      <div className="admin-page">
        <Alert tone="error" title="Settings could not load">
          {errorMessage(settings.error)}
        </Alert>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-page__head">
        <p className="eyebrow">Store</p>
        <h1>Settings</h1>
        <p>
          Changes apply to new storefront requests immediately. Existing orders keep the totals recorded when they were
          placed. {updatedAt ? `This section was last saved ${formatDateTime(updatedAt)}.` : ""}
        </p>
      </header>

      <div className="admin-settings">
        <nav className="admin-settings__tabs" aria-label="Setting sections">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={active === tab.key ? "is-active" : undefined}
              onClick={() => {
                setActive(tab.key);
                setErrors({});
                setFormError(null);
              }}
            >
              <strong>{tab.label}</strong>
              <small>{tab.description}</small>
            </button>
          ))}
        </nav>

        <form className="admin-card admin-card--padded admin-settings__panel" onSubmit={submit}>
          {!canEdit ? (
            <Alert tone="info" title="Read-only for your role">
              Finance staff can review these settings. Saving requires the owner or an administrator account.
            </Alert>
          ) : null}
          {formError ? <Alert tone="error">{formError}</Alert> : null}

          {active === "store" ? (
            <StorePanel
              value={forms.store}
              onChange={(value) => update("store", value)}
              errors={errors}
            />
          ) : null}

          {active === "notifications" ? (
            <NotificationsPanel
              value={forms.notifications}
              onChange={(value) => update("notifications", value)}
              errors={errors}
            />
          ) : null}

          {active === "publicProfile" ? (
            <PublicProfilePanel
              value={forms.publicProfile}
              onChange={(value) => update("publicProfile", value)}
              errors={errors}
            />
          ) : null}

          {active === "tax" ? <TaxPanel value={forms.tax} onChange={(value) => update("tax", value)} errors={errors} /> : null}

          {active === "giftWrap" ? (
            <GiftWrapPanel value={forms.giftWrap} onChange={(value) => update("giftWrap", value)} errors={errors} />
          ) : null}

          {active === "cod" ? <CodPanel value={forms.cod} onChange={(value) => update("cod", value)} errors={errors} /> : null}

          {active === "returns" ? (
            <ReturnsPanel value={forms.returns} onChange={(value) => update("returns", value)} errors={errors} />
          ) : null}

          {active === "operational" ? (
            <OperationalPanel value={forms.operational} onChange={(value) => update("operational", value)} errors={errors} />
          ) : null}

          {active === "home" ? <HomePanel value={forms.home} onChange={(value) => update("home", value)} errors={errors} /> : null}

          <div className="admin-form__actions">
            <button type="submit" className="button button--primary" disabled={save.isPending || !canEdit}>
              {save.isPending ? "Saving…" : "Save this section"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type PanelProps<T> = { value: T; onChange: (value: T) => void; errors: Record<string, string> };

function StorePanel({ value, onChange, errors }: PanelProps<StoreForm>) {
  return (
    <>
      <h2 className="admin-card__title">Store details</h2>
      <p className="muted">These details appear in the header, footer, invoices and policy pages where published.</p>
      <div className="form-grid">
        <FormField label="Store name" htmlFor="setting-store-name" required error={errors.name}>
          <input
            id="setting-store-name"
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            maxLength={120}
          />
        </FormField>
        <FormField label="Tagline" htmlFor="setting-store-tagline">
          <input
            id="setting-store-tagline"
            value={value.tagline}
            onChange={(event) => onChange({ ...value, tagline: event.target.value })}
            maxLength={120}
          />
        </FormField>
        <FormField
          label="Support email"
          htmlFor="setting-store-email"
          error={errors.supportEmail}
          hint="A monitored inbox. Also used for the store's order email when no owner address is set."
        >
          <input
            id="setting-store-email"
            type="email"
            value={value.supportEmail}
            onChange={(event) => onChange({ ...value, supportEmail: event.target.value })}
            maxLength={160}
          />
        </FormField>
        <FormField label="Support phone" htmlFor="setting-store-phone">
          <input
            id="setting-store-phone"
            value={value.supportPhone}
            onChange={(event) => onChange({ ...value, supportPhone: event.target.value })}
            maxLength={40}
          />
        </FormField>
        <FormField
          label="WhatsApp number"
          htmlFor="setting-store-whatsapp"
          error={errors.supportWhatsApp}
          hint="Numbers only, with country code. Used for the order handoff and contact links."
        >
          <input
            id="setting-store-whatsapp"
            inputMode="tel"
            value={value.supportWhatsApp}
            onChange={(event) => onChange({ ...value, supportWhatsApp: event.target.value })}
            maxLength={20}
            placeholder="+91 98765 43210"
          />
        </FormField>
        <FormField label="Store address" htmlFor="setting-store-address" className="form-grid__full">
          <textarea
            id="setting-store-address"
            value={value.address}
            onChange={(event) => onChange({ ...value, address: event.target.value })}
            maxLength={500}
            rows={3}
            placeholder="Only publish an address customers can actually visit."
          />
        </FormField>
        <FormField label="Latitude" htmlFor="setting-store-lat" error={errors.latitude} hint="Optional, decimal degrees.">
          <input
            id="setting-store-lat"
            inputMode="decimal"
            value={value.latitude}
            onChange={(event) => onChange({ ...value, latitude: event.target.value })}
          />
        </FormField>
        <FormField label="Longitude" htmlFor="setting-store-lng" error={errors.longitude} hint="Optional, decimal degrees.">
          <input
            id="setting-store-lng"
            inputMode="decimal"
            value={value.longitude}
            onChange={(event) => onChange({ ...value, longitude: event.target.value })}
          />
        </FormField>
      </div>
    </>
  );
}

function PublicProfilePanel({ value, onChange, errors }: PanelProps<PublicProfileForm>) {
  return (
    <>
      <h2 className="admin-card__title">Storefront facts</h2>
      <p className="muted">
        These figures appear on the home page. Enter only details the shop can stand behind, and leave a field blank
        rather than estimating.
      </p>
      <div className="form-grid">
        <FormField label="Rating" htmlFor="setting-profile-rating" error={errors.rating} hint="From 0 to 5, or blank.">
          <input
            id="setting-profile-rating"
            type="number"
            inputMode="decimal"
            min={0}
            max={5}
            step="0.1"
            value={value.rating}
            onChange={(event) => onChange({ ...value, rating: event.target.value })}
          />
        </FormField>
        <FormField
          label="Number of customer ratings"
          htmlFor="setting-profile-rating-count"
          error={errors.ratingCount}
        >
          <input
            id="setting-profile-rating-count"
            type="number"
            inputMode="numeric"
            min={0}
            value={value.ratingCount}
            onChange={(event) => onChange({ ...value, ratingCount: event.target.value })}
          />
        </FormField>
        <FormField
          label="Years in business"
          htmlFor="setting-profile-years"
          error={errors.yearsInBusiness}
          hint="Leave blank if the shop does not state it."
        >
          <input
            id="setting-profile-years"
            type="number"
            inputMode="numeric"
            min={0}
            max={200}
            value={value.yearsInBusiness}
            onChange={(event) => onChange({ ...value, yearsInBusiness: event.target.value })}
          />
        </FormField>
        <FormField label="Locality" htmlFor="setting-profile-locality" hint="Shown as the visit line on the home page.">
          <input
            id="setting-profile-locality"
            value={value.locality}
            onChange={(event) => onChange({ ...value, locality: event.target.value })}
            maxLength={120}
            placeholder="Gandhi Nagar, Kurnool"
          />
        </FormField>
        <FormField
          label="Closing time"
          htmlFor="setting-profile-closes"
          error={errors.closesAt}
          hint="24-hour time. Shown as a shop detail, not as a live open/closed status."
        >
          <input
            id="setting-profile-closes"
            type="time"
            value={value.closesAt}
            onChange={(event) => onChange({ ...value, closesAt: event.target.value })}
          />
        </FormField>
        <FormField
          label="Shop categories"
          htmlFor="setting-profile-categories"
          hint="Comma-separated. Up to six."
        >
          <input
            id="setting-profile-categories"
            value={value.categories}
            onChange={(event) => onChange({ ...value, categories: event.target.value })}
            maxLength={400}
            placeholder="Gift shops, Personalised gift shops"
          />
        </FormField>
      </div>
      <Alert tone="info">
        The rating is shown as a shop fact, with no link to any directory. Do not present it as a review collected by this
        website.
      </Alert>
    </>
  );
}

function NotificationsPanel({ value, onChange, errors }: PanelProps<NotificationsForm>) {
  return (
    <>
      <h2 className="admin-card__title">Order messages</h2>
      <p className="muted">
        Email is sent by the server only when <code>SMTP_URL</code> and <code>SMTP_FROM</code> are set in its environment.
        The invoice PDF is attached to both emails. WhatsApp opens a prepared chat; the sender still presses send.
      </p>
      <label className="admin-switch">
        <input
          type="checkbox"
          checked={value.sendCustomerEmail}
          onChange={(event) => onChange({ ...value, sendCustomerEmail: event.target.checked })}
        />
        <span>
          <strong>Email the invoice to the customer</strong>
          <small>Sent to the address entered at checkout, with the invoice PDF attached.</small>
        </span>
      </label>
      <label className="admin-switch">
        <input
          type="checkbox"
          checked={value.sendOwnerEmail}
          onChange={(event) => onChange({ ...value, sendOwnerEmail: event.target.checked })}
        />
        <span>
          <strong>Email each new order to the store</strong>
          <small>Uses the owner address below, or the store support email when that is blank.</small>
        </span>
      </label>
      <div className="form-grid">
        <FormField
          label="Owner email"
          htmlFor="setting-notify-owner"
          error={errors.ownerEmail}
          hint="Where new order emails go. Leave blank to use the support email."
        >
          <input
            id="setting-notify-owner"
            type="email"
            value={value.ownerEmail}
            onChange={(event) => onChange({ ...value, ownerEmail: event.target.value })}
            maxLength={160}
          />
        </FormField>
      </div>
      <label className="admin-switch">
        <input
          type="checkbox"
          checked={value.whatsappAutoOpen}
          onChange={(event) => onChange({ ...value, whatsappAutoOpen: event.target.checked })}
        />
        <span>
          <strong>Open WhatsApp after an order</strong>
          <small>
            Starts a chat with the store with the order details written out. Requires the WhatsApp number in Store
            details.
          </small>
        </span>
      </label>
      <Alert tone="info">
        WhatsApp never sends by itself: the customer presses send in WhatsApp. Email attempts are recorded per order and
        can be resent from the order screen.
      </Alert>
    </>
  );
}

function TaxPanel({ value, onChange, errors }: PanelProps<TaxForm>) {
  return (
    <>
      <h2 className="admin-card__title">Tax</h2>
      <p className="muted">
        Tax is stored as integer basis points. Changing the tax mode affects new cart quotes; recorded orders are not
        rewritten.
      </p>
      <label className="admin-switch">
        <input
          type="checkbox"
          checked={value.inclusive}
          onChange={(event) => onChange({ ...value, inclusive: event.target.checked })}
        />
        <span>
          <strong>Prices include GST</strong>
          <small>When off, GST is added on top of the displayed item prices.</small>
        </span>
      </label>
      <div className="form-grid">
        <FormField label="Default GST rate (%)" htmlFor="setting-tax-rate" required error={errors.ratePercent}>
          <input
            id="setting-tax-rate"
            type="number"
            inputMode="decimal"
            min={0}
            max={28}
            step="0.01"
            value={value.ratePercent}
            onChange={(event) => onChange({ ...value, ratePercent: event.target.value })}
          />
        </FormField>
        <FormField label="GSTIN" htmlFor="setting-tax-gstin" hint="Leave blank if not registered.">
          <input
            id="setting-tax-gstin"
            value={value.gstin}
            onChange={(event) => onChange({ ...value, gstin: event.target.value.toUpperCase() })}
            maxLength={20}
          />
        </FormField>
        <FormField label="State of registration" htmlFor="setting-tax-state">
          <input
            id="setting-tax-state"
            value={value.state}
            onChange={(event) => onChange({ ...value, state: event.target.value })}
            maxLength={80}
          />
        </FormField>
        <FormField label="Invoice note" htmlFor="setting-tax-note">
          <input
            id="setting-tax-note"
            value={value.note}
            onChange={(event) => onChange({ ...value, note: event.target.value })}
            maxLength={500}
          />
        </FormField>
      </div>
      <Alert tone="info">
        Product-level tax rates override this default. Ask an accountant to confirm inclusive pricing and the rates used
        before taking real orders.
      </Alert>
    </>
  );
}

function GiftWrapPanel({ value, onChange, errors }: PanelProps<GiftWrapForm>) {
  return (
    <>
      <h2 className="admin-card__title">Gift wrapping</h2>
      <p className="muted">The fee is charged per wrapped item, on products marked as gift-wrappable.</p>
      <div className="form-grid">
        <FormField label="Wrapping fee (₹)" htmlFor="setting-wrap-fee" required error={errors.feeRupees}>
          <input
            id="setting-wrap-fee"
            type="number"
            inputMode="decimal"
            min={0}
            value={value.feeRupees}
            onChange={(event) => onChange({ ...value, feeRupees: event.target.value })}
          />
        </FormField>
        <FormField label="Label shown to customers" htmlFor="setting-wrap-label">
          <input
            id="setting-wrap-label"
            value={value.label}
            onChange={(event) => onChange({ ...value, label: event.target.value })}
            maxLength={120}
            placeholder="Signature gold-ribbon wrap"
          />
        </FormField>
      </div>
    </>
  );
}

function CodPanel({ value, onChange, errors }: PanelProps<CodForm>) {
  return (
    <>
      <h2 className="admin-card__title">Cash on delivery</h2>
      <p className="muted">
        Cash on delivery is the only payment method in this build. Online payment stays unavailable until a provider is
        configured and verified in its sandbox.
      </p>
      <label className="admin-switch">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
        />
        <span>
          <strong>Offer cash on delivery</strong>
          <small>When off, checkout reports that no payment method is available.</small>
        </span>
      </label>
      <div className="form-grid">
        <FormField label="Maximum order value (₹)" htmlFor="setting-cod-max" required error={errors.maxTotalRupees}>
          <input
            id="setting-cod-max"
            type="number"
            inputMode="decimal"
            min={0}
            value={value.maxTotalRupees}
            onChange={(event) => onChange({ ...value, maxTotalRupees: event.target.value })}
          />
        </FormField>
        <FormField label="COD handling fee (₹)" htmlFor="setting-cod-fee" required error={errors.feeRupees}>
          <input
            id="setting-cod-fee"
            type="number"
            inputMode="decimal"
            min={0}
            value={value.feeRupees}
            onChange={(event) => onChange({ ...value, feeRupees: event.target.value })}
          />
        </FormField>
      </div>
    </>
  );
}

function ReturnsPanel({ value, onChange, errors }: PanelProps<ReturnsForm>) {
  return (
    <>
      <h2 className="admin-card__title">Returns</h2>
      <p className="muted">
        The window is counted from delivery for items marked return-eligible. A refund is only recorded after the store
        team writes how it was made.
      </p>
      <label className="admin-switch">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
        />
        <span>
          <strong>Accept return requests</strong>
          <small>When off, the customer return form is closed.</small>
        </span>
      </label>
      <div className="form-grid">
        <FormField label="Return window (days)" htmlFor="setting-returns-window" required error={errors.windowDays}>
          <input
            id="setting-returns-window"
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            value={value.windowDays}
            onChange={(event) => onChange({ ...value, windowDays: event.target.value })}
          />
        </FormField>
        <FormField label="Customer-facing note" htmlFor="setting-returns-note" className="form-grid__full">
          <textarea
            id="setting-returns-note"
            value={value.note}
            onChange={(event) => onChange({ ...value, note: event.target.value })}
            maxLength={500}
            rows={3}
          />
        </FormField>
      </div>
    </>
  );
}

function OperationalPanel({ value, onChange }: PanelProps<OperationalForm>) {
  return (
    <>
      <h2 className="admin-card__title">Maintenance notice</h2>
      <p className="muted">
        This shows a maintenance screen to shoppers on the storefront. The API remains reachable, so this is a notice,
        not a security lock. Staff can still open the dashboard.
      </p>
      <label className="admin-switch">
        <input
          type="checkbox"
          checked={value.maintenance}
          onChange={(event) => onChange({ ...value, maintenance: event.target.checked })}
        />
        <span>
          <strong>Show the maintenance screen</strong>
          <small>Existing orders are unaffected.</small>
        </span>
      </label>
      <FormField label="Message for shoppers" htmlFor="setting-op-message">
        <textarea
          id="setting-op-message"
          value={value.message}
          onChange={(event) => onChange({ ...value, message: event.target.value })}
          maxLength={500}
          rows={3}
          placeholder="We are tending to the shop and will be back shortly."
        />
      </FormField>
    </>
  );
}

function HomePanel({ value, onChange, errors }: PanelProps<HomeForm>) {
  const ordered = [...value.sections].sort((left, right) => left.order - right.order);

  const patchSection = (index: number, patch: Partial<HomeSection>) => {
    const target = ordered[index];
    onChange({
      ...value,
      sections: value.sections.map((section) => (section.id === target.id ? { ...section, ...patch } : section))
    });
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const target = ordered[index];
    const neighbour = ordered[index + direction];
    if (!target || !neighbour) return;
    onChange({
      ...value,
      sections: value.sections.map((section) => {
        if (section.id === target.id) return { ...section, order: neighbour.order };
        if (section.id === neighbour.id) return { ...section, order: target.order };
        return section;
      })
    });
  };

  const removeSection = (index: number) => {
    const target = ordered[index];
    onChange({ ...value, sections: value.sections.filter((section) => section.id !== target.id) });
  };

  const addSection = () => {
    const nextOrder = ordered.length ? Math.max(...ordered.map((section) => section.order)) + 1 : 1;
    onChange({
      ...value,
      sections: [
        ...value.sections,
        {
          id: `section-${Date.now()}`,
          type: "products",
          title: "New section",
          subtitle: "",
          enabled: true,
          order: nextOrder
        }
      ]
    });
  };

  return (
    <>
      <h2 className="admin-card__title">Home content</h2>
      <FormField label="Announcement bar" htmlFor="setting-home-announcement" hint="Shown at the top of every storefront page.">
        <input
          id="setting-home-announcement"
          value={value.announcement}
          onChange={(event) => onChange({ ...value, announcement: event.target.value })}
          maxLength={200}
        />
      </FormField>

      <div className="admin-settings__group">
        <label className="admin-switch">
          <input
            type="checkbox"
            checked={value.useDefaultHero}
            onChange={(event) => onChange({ ...value, useDefaultHero: event.target.checked })}
          />
          <span>
            <strong>Use the built-in hero</strong>
            <small>The editorial hero shipped with the storefront, including its illustration.</small>
          </span>
        </label>

        {!value.useDefaultHero ? (
          <div className="form-grid">
            <FormField label="Eyebrow" htmlFor="setting-hero-eyebrow">
              <input
                id="setting-hero-eyebrow"
                value={value.hero.eyebrow}
                onChange={(event) => onChange({ ...value, hero: { ...value.hero, eyebrow: event.target.value } })}
                maxLength={120}
              />
            </FormField>
            <FormField label="Headline" htmlFor="setting-hero-title" required error={errors.heroTitle}>
              <input
                id="setting-hero-title"
                value={value.hero.title}
                onChange={(event) => onChange({ ...value, hero: { ...value.hero, title: event.target.value } })}
                maxLength={160}
              />
            </FormField>
            <FormField label="Subtitle" htmlFor="setting-hero-subtitle" className="form-grid__full">
              <textarea
                id="setting-hero-subtitle"
                value={value.hero.subtitle}
                onChange={(event) => onChange({ ...value, hero: { ...value.hero, subtitle: event.target.value } })}
                maxLength={500}
                rows={2}
              />
            </FormField>
            <FormField label="Button label" htmlFor="setting-hero-cta">
              <input
                id="setting-hero-cta"
                value={value.hero.ctaLabel}
                onChange={(event) => onChange({ ...value, hero: { ...value.hero, ctaLabel: event.target.value } })}
                maxLength={60}
              />
            </FormField>
            <FormField label="Button link" htmlFor="setting-hero-href" error={errors.heroCtaHref} hint="A store path such as /shop.">
              <input
                id="setting-hero-href"
                value={value.hero.ctaHref}
                onChange={(event) => onChange({ ...value, hero: { ...value.hero, ctaHref: event.target.value } })}
                maxLength={200}
              />
            </FormField>
            <FormField label="Hero image" htmlFor="setting-hero-image" error={errors.heroImage} className="form-grid__full">
              <input
                id="setting-hero-image"
                value={value.hero.image}
                onChange={(event) => onChange({ ...value, hero: { ...value.hero, image: event.target.value } })}
                maxLength={500}
                placeholder="/images/hero.svg"
              />
            </FormField>
          </div>
        ) : null}
      </div>

      <div className="admin-settings__group">
        <div className="admin-settings__group-head">
          <div>
            <h3>Section plan</h3>
            <p className="muted">
              These headings are stored for the content plan. The current storefront keeps its fixed editorial layout,
              so enabling a section here does not add a new home block yet.
            </p>
          </div>
          <button type="button" className="button button--ghost button--small" onClick={addSection}>
            Add section
          </button>
        </div>
        {errors.sections ? <Alert tone="error">{errors.sections}</Alert> : null}
        {ordered.length ? (
          <div className="table-wrap">
            <table className="admin-table admin-table--sections">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Type</th>
                  <th scope="col">Title</th>
                  <th scope="col">Subtitle</th>
                  <th scope="col">Order</th>
                  <th scope="col">Enabled</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((section, index) => (
                  <tr key={section.id}>
                    <td>
                      <input
                        value={section.id}
                        onChange={(event) => patchSection(index, { id: event.target.value })}
                        maxLength={40}
                        aria-label={`Section ${index + 1} ID`}
                      />
                    </td>
                    <td>
                      <input
                        value={section.type}
                        onChange={(event) => patchSection(index, { type: event.target.value })}
                        maxLength={40}
                        aria-label={`Section ${index + 1} type`}
                      />
                    </td>
                    <td>
                      <input
                        value={section.title}
                        onChange={(event) => patchSection(index, { title: event.target.value })}
                        maxLength={120}
                        aria-label={`Section ${index + 1} title`}
                      />
                    </td>
                    <td>
                      <input
                        value={section.subtitle}
                        onChange={(event) => patchSection(index, { subtitle: event.target.value })}
                        maxLength={300}
                        aria-label={`Section ${index + 1} subtitle`}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        value={section.order}
                        onChange={(event) => patchSection(index, { order: Number(event.target.value) })}
                        aria-label={`Section ${index + 1} order`}
                        className="admin-input--narrow"
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={section.enabled}
                        onChange={(event) => patchSection(index, { enabled: event.target.checked })}
                        aria-label={`Section ${index + 1} enabled`}
                      />
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => moveSection(index, -1)}
                          disabled={index === 0}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => moveSection(index, 1)}
                          disabled={index === ordered.length - 1}
                        >
                          Down
                        </button>
                        <button type="button" className="text-link text-link--danger" onClick={() => removeSection(index)}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No sections planned yet.</p>
        )}
      </div>
    </>
  );
}
