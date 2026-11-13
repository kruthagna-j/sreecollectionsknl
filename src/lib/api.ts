const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readCookie(name: string): string | null {
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return entry.slice(name.length + 1);
  }
}

async function ensureSecurityCookie(): Promise<void> {
  if (readCookie("sc_csrf")) return;
  await fetch(`${API_BASE}/health`, { credentials: "include" });
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) await ensureSecurityCookie();

  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = readCookie("sc_csrf");
    if (token) headers.set("x-csrf-token", token);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: "include",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "We could not reach the store. Check your connection and try again.");
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { code?: string; message?: string; details?: unknown } }).error
      : undefined;
    throw new ApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "Something went wrong. Please try again.",
      error?.details ?? null
    );
  }

  return payload as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const details = error.details;
  if (Array.isArray(details)) {
    const result: Record<string, string> = {};
    for (const entry of details) {
      if (!entry || typeof entry !== "object") continue;
      const { field, message } = entry as { field?: unknown; message?: unknown };
      if (typeof field === "string" && typeof message === "string") result[field] = message;
    }
    return result;
  }
  if (details && typeof details === "object" && "fields" in details) {
    const fields = (details as { fields?: unknown }).fields;
    if (fields && typeof fields === "object") return fields as Record<string, string>;
  }
  return {};
}

export function invoiceUrl(orderNumber: string, email?: string | null): string {
  const suffix = email ? `?email=${encodeURIComponent(email)}` : "";
  return `${API_BASE}/orders/${encodeURIComponent(orderNumber)}/invoice${suffix}`;
}

export function invoicePdfUrl(orderNumber: string, email?: string | null): string {
  const suffix = email ? `?email=${encodeURIComponent(email)}` : "";
  return `${API_BASE}/orders/${encodeURIComponent(orderNumber)}/invoice.pdf${suffix}`;
}
