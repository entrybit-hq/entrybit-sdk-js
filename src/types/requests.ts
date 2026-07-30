/** Values accepted in a request's `query` map. */
export type QueryValue = string | number | boolean | readonly string[] | null | undefined;

/** Options accepted by every resource method for a single call. */
export interface RequestOptions {
  /** Cancels the request; surfaces as `UserAbortError` and is never retried. */
  signal?: AbortSignal | undefined;
  /** Overrides the client-level `timeoutMs` for this call. */
  timeoutMs?: number | undefined;
  /** Overrides the client-level `maxRetries` for this call. */
  maxRetries?: number | undefined;
  /**
   * Extra headers for this call (case-insensitive; win over `defaultHeaders`).
   * The credential header always wins last - per-call headers cannot replace
   * `Authorization`/`X-API-Key` on an authenticated client.
   */
  headers?: Record<string, string> | undefined;
}

/** Full request descriptor, as accepted by the `EntryBit.request()` escape hatch. */
export interface RequestSpec extends RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, QueryValue> | undefined;
  /** JSON request body. Mutually exclusive with `form`. */
  body?: unknown;
  /** `application/x-www-form-urlencoded` body (OAuth endpoints). */
  form?: Record<string, string | undefined> | undefined;
  /**
   * Overrides retry eligibility. By default only GET requests are retried
   * (they are idempotent); pass `true` to opt a request in.
   */
  idempotent?: boolean | undefined;
  /** Skips credential attachment (OAuth endpoints authenticate via body params). */
  unauthenticated?: boolean | undefined;
}
