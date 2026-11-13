import { Children, cloneElement, isValidElement, useEffect, useId, useRef, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { money } from "../lib/format";
import { classNames } from "../lib/format";
import { useEscape, useLockBody } from "../lib/hooks";
import { CheckIcon, ChevronRightIcon, CloseIcon, MinusIcon, PlusIcon, StarIcon } from "./Icons";

export function Price({
  price,
  compareAt,
  size = "md"
}: {
  price: number;
  compareAt?: number | null;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <p className={classNames("price", `price--${size}`)}>
      <span className="price__current">{money(price)}</span>
      {compareAt && compareAt > price ? (
        <>
          <s className="price__compare" aria-label={`Original price ${money(compareAt)}`}>
            {money(compareAt)}
          </s>
          <span className="price__save">{Math.round(((compareAt - price) / compareAt) * 100)}% off</span>
        </>
      ) : null}
    </p>
  );
}

export function StarRating({
  rating,
  count,
  size = 15,
  showCount = true
}: {
  rating: number;
  count?: number;
  size?: number;
  showCount?: boolean;
}) {
  if (!rating && !count) {
    return <span className="rating rating--empty">No reviews yet</span>;
  }
  return (
    <span className="rating" aria-label={`${rating} out of 5 stars${count ? ` from ${count} reviews` : ""}`}>
      <span className="rating__stars">
        {[1, 2, 3, 4, 5].map((star) => (
          <StarIcon key={star} size={size} filled={star <= Math.round(rating)} />
        ))}
      </span>
      {showCount ? <span className="rating__count">{count ? `${rating.toFixed(1)} · ${count}` : rating.toFixed(1)}</span> : null}
    </span>
  );
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 20,
  disabled,
  label = "Quantity"
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        <MinusIcon size={15} />
      </button>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="stepper__input"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value.replace(/\D/g, ""));
          if (Number.isFinite(next) && next > 0) onChange(Math.min(max, Math.max(min, next)));
        }}
        aria-live="polite"
      />
      <button
        type="button"
        className="stepper__button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        <PlusIcon size={15} />
      </button>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon
}: {
  title: string;
  description?: string;
  action?: { label: string; to: string } | { label: string; onClick: () => void };
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-state__icon">{icon}</div> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? (
        "to" in action ? (
          <Link to={action.to} className="button button--primary">
            {action.label}
            <ChevronRightIcon size={16} />
          </Link>
        ) : (
          <button type="button" className="button button--primary" onClick={action.onClick}>
            {action.label}
          </button>
        )
      ) : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  action,
  align = "left"
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: { label: string; to: string };
  align?: "left" | "center";
}) {
  return (
    <div className={classNames("section-heading", align === "center" && "section-heading--center")}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {subtitle ? <p className="section-heading__subtitle">{subtitle}</p> : null}
      </div>
      {action ? (
        <Link className="text-link" to={action.to}>
          {action.label}
          <ChevronRightIcon size={15} />
        </Link>
      ) : null}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.to && index < items.length - 1 ? <Link to={item.to}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
            {index < items.length - 1 ? <ChevronRightIcon size={12} /> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const STATUS_TONES: Record<string, string> = {
  pending: "amber",
  confirmed: "blue",
  packed: "blue",
  shipped: "violet",
  delivered: "green",
  cancelled: "red",
  returned: "amber",
  refunded: "green",
  paid: "green",
  cod_pending: "amber",
  requested: "amber",
  approved: "green",
  rejected: "red",
  received: "blue",
  closed: "neutral",
  open: "blue",
  in_progress: "amber",
  draft: "neutral",
  published: "green",
  scheduled: "blue",
  unpublished: "amber",
  archived: "neutral",
  discontinued: "red",
  approved_review: "green"
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONES[status] ?? "neutral";
  return (
    <span className={`badge badge--${tone}`}>
      <span className="badge__dot" aria-hidden="true" />
      {label ?? status.replaceAll("_", " ")}
    </span>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  action
}: {
  tone?: "info" | "success" | "warning" | "error";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`alert alert--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <div>
        {title ? <p className="alert__title">{title}</p> : null}
        {children ? <div className="alert__body">{children}</div> : null}
      </div>
      {action ? <div className="alert__action">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="spinner" role="status" aria-label={label}>
      <span />
    </span>
  );
}

export function PageLoader({ label = "Gathering the collection…" }: { label?: string }) {
  return (
    <div className="page-loader">
      <span className="page-loader__mark" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="product-card product-card--skeleton" aria-hidden="true">
      <div className="skeleton skeleton--image" />
      <div className="skeleton skeleton--line" />
      <div className="skeleton skeleton--line skeleton--short" />
    </div>
  );
}

export function FormField({
  label,
  error,
  hint,
  required,
  children,
  htmlFor,
  className
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  const describedBy = htmlFor ? (error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined) : undefined;
  const body =
    error && describedBy
      ? Children.map(children, (child) => {
          if (!isValidElement(child)) return child;
          const type = child.type;
          if (type !== "input" && type !== "select" && type !== "textarea") return child;
          // React 19 narrows a validated child to ReactElement<unknown>, so the props type has to be restated.
          return cloneElement(child as ReactElement<Record<string, unknown>>, { "aria-invalid": true, "aria-describedby": describedBy });
        })
      : children;

  return (
    <div className={classNames("field", error && "field--error", className)}>
      <label htmlFor={htmlFor}>
        {label}
        {required ? <span className="field__required"> *</span> : null}
      </label>
      {body}
      {hint && !error ? (
        <p className="field__hint" id={htmlFor ? `${htmlFor}-hint` : undefined}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={htmlFor ? `${htmlFor}-error` : undefined} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CheckboxField({
  label,
  description,
  checked,
  onChange,
  name,
  error
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  name?: string;
  error?: string;
}) {
  return (
    <label className={classNames("check", error && "check--error")}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="check__box" aria-hidden="true">
        <CheckIcon size={13} />
      </span>
      <span className="check__copy">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
        {error ? <small className="check__error">{error}</small> : null}
      </span>
    </label>
  );
}

export function Pagination({
  page,
  pages,
  onChange
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;
  const visible = new Set<number>([1, pages, page - 1, page, page + 1]);
  const numbers = [...visible].filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} className="pagination__arrow">
        Previous
      </button>
      {numbers.map((value, index) => (
        <span key={value} className="pagination__slot">
          {index > 0 && value - numbers[index - 1] > 1 ? <span className="pagination__gap">…</span> : null}
          <button
            type="button"
            className={classNames("pagination__page", value === page && "is-current")}
            onClick={() => onChange(value)}
            aria-current={value === page ? "page" : undefined}
          >
            {value}
          </button>
        </span>
      ))}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages} className="pagination__arrow">
        Next
      </button>
    </nav>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md"
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useLockBody(open);
  useEscape(open, onClose);

  useEffect(() => {
    if (open) window.setTimeout(() => closeRef.current?.focus(), 30);
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal__panel modal__panel--${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal__header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" ref={closeRef} className="icon-button" onClick={onClose} aria-label="Close dialog">
            <CloseIcon size={18} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function LiveNote({ children }: { children: ReactNode }) {
  return <p className="live-note">{children}</p>;
}
