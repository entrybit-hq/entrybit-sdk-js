/** Options shared by every EntryBit error. */
export interface EntryBitErrorOptions {
  /** HTTP status code, when the error came from an HTTP response. */
  status?: number;
  /** Machine-readable error code from the response body (`error` or `code`). */
  code?: string;
  /** The parsed response body, when one was received. */
  body?: unknown;
  /** Response headers, when a response was received. */
  headers?: Headers;
  cause?: unknown;
}

/** Base class for every error thrown by the SDK. */
export class EntryBitError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly body?: unknown;
  readonly headers?: Headers;

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
  readonly missingScope?: string;

  constructor(message: string, options: EntryBitErrorOptions & { missingScope?: string } = {}) {
    super(message, options);
    this.name = "PermissionError";
    this.missingScope = options.missingScope;
  }
}

/** 429 — rate limited. Wait `retryAfter` seconds (when provided) before retrying. */
export class RateLimitError extends EntryBitError {
  /** Seconds to wait before retrying, parsed from the `Retry-After` header. */
  readonly retryAfter?: number;

  constructor(message: string, options: EntryBitErrorOptions & { retryAfter?: number } = {}) {
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

/** Any other non-2xx response (404, 409, 402, 5xx, …). */
export class APIError extends EntryBitError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "APIError";
  }
}

/** The request never produced an HTTP response (DNS, TLS, socket reset, aborted…). */
export class ConnectionError extends EntryBitError {
  constructor(message: string, options: EntryBitErrorOptions = {}) {
    super(message, options);
    this.name = "ConnectionError";
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
    if (key === "error") out.error = value;
    else if (key === "scope") out.scope = value;
    else if (key === "error_description") out.description = value;
  }
  return out;
}

/** Parses a `Retry-After` header into seconds (supports both delta-seconds and HTTP-date). */
export function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, (date - Date.now()) / 1000);
  return undefined;
}
