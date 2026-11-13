import { randomBytes } from "node:crypto";
export class AppError extends Error {
    status;
    code;
    details;
    constructor(status, code, message, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}
export function fail(status, code, message, details) {
    throw new AppError(status, code, message, details);
}
export function parseBody(schema, value) {
    const result = schema.safeParse(value);
    if (!result.success) {
        throw new AppError(400, "VALIDATION_ERROR", "Please check the highlighted fields and try again.", result.error.issues.map((issue) => ({
            field: issue.path.join(".") || "form",
            message: issue.message
        })));
    }
    return result.data;
}
export function route(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res)).catch(next);
    };
}
export function pageParams(query, maxPageSize = 48) {
    const page = Math.max(1, Number.parseInt(String(query.page ?? "1"), 10) || 1);
    const requested = Number.parseInt(String(query.pageSize ?? "12"), 10) || 12;
    const pageSize = Math.min(maxPageSize, Math.max(1, requested));
    return { page, pageSize, offset: (page - 1) * pageSize };
}
export function toBool(value) {
    if (value === "true" || value === "1")
        return true;
    if (value === "false" || value === "0")
        return false;
    return undefined;
}
export function round(value) {
    return Math.round(value);
}
export function formatOrderNumber(date = new Date()) {
    const stamp = date.toISOString().slice(0, 10).replaceAll("-", "");
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    // 32 symbols divide 256 evenly, so `byte % 32` is unbiased — and the suffix is part of the
    // guest order-lookup capability, so it must not come from Math.random().
    const bytes = randomBytes(6);
    let suffix = "";
    for (let index = 0; index < bytes.length; index += 1) {
        suffix += alphabet[bytes[index] % alphabet.length];
    }
    return `SC-${stamp}-${suffix}`;
}
export function slugify(value) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}
export function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
export function rupees(paise) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(paise / 100);
}
