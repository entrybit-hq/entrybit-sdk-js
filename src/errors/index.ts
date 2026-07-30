/** Options shared by every EntryBit error. */
export interface EntryBitErrorOptions {
  /** HTTP status code, when the error came from an HTTP response. */
  status?: number | undefined;
  /** Machine-readable error code from the response body (`error` or `code`). */
  code?: string | undefined;
  /** The parsed response body, when one was received. */
  body?: unknown;
  /** Response headers, when a response was received. */
  headers?: Headers | undefined;
  cause?: unknown;
}

/** Base class for every error thrown by the SDK. */
export class EntryBitError extends Error {
  readonly status?: number | undefined;
  readonly code?: string | undefined;
  readonly body?: unknown;
  readonly headers?: Headers | undefined;

  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "EntryBitError";
    this.status = options.status;
    this.code = options.code;
    this.body = options.body;
    this.headers = options.headers;
  }
}

/** 401 — the credential is missing, malformed, expired or revoked (RFC 6750 `invalid_token`). */
export class AuthenticationError extends EntryBitError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "AuthenticationError";
  }
}

/** 403 — the credential is valid but lacks a required scope (RFC 6750 `insufficient_scope`). */
export class PermissionError extends EntryBitError {
  /**
   * The scope named by the `WWW-Authenticate` challenge, e.g. `"org:members:contact:read"`.
   * `undefined` when the server did not name one.
   */
  readonly missingScope?: string | undefined;

  constructor(message: string, options: EntryBitErrorOptions & { missingScope?: string | undefined } = {}) {
    super(message, options);
    this.name = "PermissionError";
    this.missingScope = options.missingScope;
  }
}

/** 429 — rate limited. Wait `retryAfter` seconds (when provided) before retrying. */
export class RateLimitError extends EntryBitError {
  /** Seconds to wait before retrying, parsed from the `Retry-After` header. */
  readonly retryAfter?: number | undefined;

  constructor(message: string, options: EntryBitErrorOptions & { retryAfter?: number | undefined } = {}) {
    super(message, options);
    this.name = "RateLimitError";
    this.retryAfter = options.retryAfter;
  }
}

/** 400 — the request was rejected as invalid before reaching the resource. */
export class ValidationError extends EntryBitError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "ValidationError";
  }
}

/**
 * 422 — the request was well-formed but failed parameter validation
 * (e.g. `limit` outside 1–100). Subclass of `ValidationError`, so catching
 * `ValidationError` covers both 400 and 422.
 */
export class UnprocessableEntityError extends ValidationError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "UnprocessableEntityError";
  }
}

/** Any non-2xx response without a more specific class (402, 405, …). */
export class APIError extends EntryBitError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "APIError";
  }
}

/** 404 — the resource does not exist (or is not visible to the credential). Subclass of `APIError`. */
export class NotFoundError extends APIError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "NotFoundError";
  }
}

/** 409 — the request conflicts with current resource state (e.g. a pass already used). Subclass of `APIError`. */
export class ConflictError extends APIError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "ConflictError";
  }
}

/** 5xx — the server failed. Subclass of `APIError`. */
export class InternalServerError extends APIError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "InternalServerError";
  }
}

/** The request never produced an HTTP response (DNS, TLS, socket reset…). */
export class ConnectionError extends EntryBitError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "ConnectionError";
  }
}

/**
 * The per-request timeout (`timeoutMs`) elapsed before a response arrived.
 * Subclass of `ConnectionError`, so existing `ConnectionError` handling
 * still catches timeouts.
 */
export class TimeoutError extends ConnectionError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "TimeoutError";
  }
}

/** The caller's `AbortSignal` cancelled the request. Never retried. */
export class UserAbortError extends EntryBitError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "UserAbortError";
  }
}

/**
 * Parses an RFC 6750 `WWW-Authenticate` challenge, e.g.
 * `Bearer error="insufficient_scope", scope="org:members:read"`.
 */
export function parseWwwAuthenticate(header: string | null): {
  error?: string;
  scope?: string;
  description?: string;
} {
  if (!header) return {};
  const out: { error?: string; scope?: string; description?: string } = {};
  const paramRe = /(\w+)\s*=\s*"([^"]*)"/g;
  for (const match of header.matchAll(paramRe)) {
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined) continue;
    if (key === "error") out.error = value;
    else if (key === "scope") out.scope = value;
    else if (key === "error_description") out.description = value;
  }
  return out;
}

/**
 * Parses a `Retry-After` header into seconds. Accepts the two spec-defined
 * forms only — delta-seconds (digits) or an HTTP-date; anything else
 * (including `1e3` / `0x5` / whitespace) is treated as absent so the retry
 * loop falls back to exponential backoff instead of retrying immediately.
 */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  // Only attempt date parsing on something shaped like an HTTP-date (always
  // contains month letters and a time) — Date.parse alone is far too lenient
  // (e.g. it reads "-5" as a year).
  if (/[A-Za-z]/.test(trimmed) && trimmed.includes(":")) {
    const date = Date.parse(trimmed);
    if (!Number.isNaN(date)) return Math.max(0, (date - Date.now()) / 1000);
  }
  return undefined;
}
