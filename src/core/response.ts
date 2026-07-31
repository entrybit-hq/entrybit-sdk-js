import {
  APIError,
  AuthenticationError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  PermissionError,
  RateLimitError,
  UnprocessableEntityError,
  ValidationError,
  parseRetryAfter,
  parseWwwAuthenticate,
} from "../errors/index.js";
import type { EntryBitError } from "../errors/index.js";

/** Reads a response body, parsing JSON when possible and falling back to text. */
export async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Reads a 2xx response body. Unlike `readBody`, read failures propagate (the
 * caller maps them to `ConnectionError`, retrying when eligible) and a
 * non-empty body that is not valid JSON raises `APIError` instead of being
 * returned as text and breaking the caller's type expectations.
 */
export async function readSuccessBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const requestId = requestIdFrom(res);
    throw new APIError(
      withRequestId(`Expected a JSON response body but received: ${text.slice(0, 120)}`, requestId),
      { status: res.status, headers: res.headers, body: text, requestId },
    );
  }
}

/** The API's `x-request-id` echo, when present (support-ticket correlation). */
export function requestIdFrom(res: Response): string | undefined {
  return res.headers.get("x-request-id") ?? undefined;
}

/**
 * Appends the request id to an error message, so a bare stack trace in a
 * log aggregator is already support-ticket-ready. The
 * single source of the suffix format — every error message that has a
 * request id in scope goes through here.
 */
export function withRequestId(message: string, requestId: string | undefined): string {
  return requestId !== undefined ? `${message} (request id: ${requestId})` : message;
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    for (const key of ["message", "error_description", "error", "code"]) {
      const v = b[key];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  if (typeof body === "string" && body.length > 0) return body.slice(0, 200);
  return fallback;
}

function codeFromBody(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return b.error;
    if (typeof b.code === "string") return b.code;
  }
  return undefined;
}

/** Maps a non-2xx response to the matching `EntryBitError` subclass. */
export async function errorFromResponse(res: Response): Promise<EntryBitError> {
  const body = await readBody(res);
  const requestId = requestIdFrom(res);
  const common = {
    status: res.status,
    code: codeFromBody(body),
    body,
    headers: res.headers,
    requestId,
  };
  const withId = (message: string): string => withRequestId(message, requestId);
  switch (res.status) {
    case 400:
      return new ValidationError(withId(messageFromBody(body, "Invalid request")), common);
    case 401:
      return new AuthenticationError(
        withId(messageFromBody(body, "Authentication failed (invalid_token)")),
        common,
      );
    case 403: {
      const challenge = parseWwwAuthenticate(res.headers.get("www-authenticate"));
      const scopeSuffix = challenge.scope ? ` (missing scope: ${challenge.scope})` : "";
      return new PermissionError(
        withId(messageFromBody(body, "Insufficient scope") + scopeSuffix),
        { ...common, missingScope: challenge.scope },
      );
    }
    case 404:
      return new NotFoundError(withId(messageFromBody(body, "Not found")), common);
    case 409:
      return new ConflictError(
        withId(messageFromBody(body, "Conflict with current resource state")),
        common,
      );
    case 422:
      return new UnprocessableEntityError(
        withId(messageFromBody(body, "Validation failed")),
        common,
      );
    case 429: {
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      return new RateLimitError(withId(messageFromBody(body, "Rate limited")), {
        ...common,
        retryAfter,
      });
    }
    default:
      if (res.status >= 500) {
        return new InternalServerError(
          withId(messageFromBody(body, `Server error (status ${res.status})`)),
          common,
        );
      }
      return new APIError(
        withId(messageFromBody(body, `Request failed with status ${res.status}`)),
        common,
      );
  }
}
