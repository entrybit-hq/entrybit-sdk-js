import { backoffDelayMs, sleep } from "./backoff.js";
import { ConnectionError, EntryBitError, parseRetryAfter } from "./errors.js";
import { buildQuery } from "./query.js";
import type { QueryValue } from "./query.js";
import { errorFromResponse, readBody } from "./response.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://api.entrybit.net";
export const USER_AGENT = `entrybit-sdk-js/${VERSION}`;

/** How an organization API key is transmitted. */
export type ApiKeyHeader = "authorization" | "x-api-key";

export interface ClientOptions {
  /**
   * Organization API key (`eb_sk_…`), created in **Settings → API keys**.
   * Server-to-server auth with `org:*` scopes. Mutually exclusive with
   * `accessToken` / `getAccessToken`.
   */
  apiKey?: string;
  /**
   * Which header carries the API key: `Authorization: Bearer …` (default)
   * or `X-API-Key: …`.
   */
  apiKeyHeader?: ApiKeyHeader;
  /**
   * A user-delegated OAuth2 access token. Mutually exclusive with `apiKey`
   * and `getAccessToken`.
   */
  accessToken?: string;
  /**
   * Called before each request to obtain a fresh user-delegated access token
   * (use this when your app refreshes tokens). Mutually exclusive with
   * `apiKey` and `accessToken`.
   */
  getAccessToken?: () => string | Promise<string>;
  /** API origin. Defaults to `https://api.entrybit.net`. */
  baseUrl?: string;
  /**
   * Maximum retry attempts after the first try, for 429/5xx responses and
   * network failures on idempotent GET requests. Defaults to 2. Set 0 to disable.
   */
  maxRetries?: number;
  /** Per-request timeout in milliseconds. Defaults to 30 000. */
  timeoutMs?: number;
  /** Custom `fetch` implementation (used by tests; defaults to `globalThis.fetch`). */
  fetch?: typeof globalThis.fetch;
  /** Extra headers sent with every request. */
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /**
   * Overrides retry eligibility. By default only GET requests are retried
   * (they are idempotent); pass `true` to opt a request in.
   */
  idempotent?: boolean;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Internal HTTP core: auth, retries, error mapping. Not part of the semver surface. */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly apiKey?: string;
  private readonly apiKeyHeader: ApiKeyHeader;
  private readonly accessToken?: string;
  private readonly getAccessToken?: () => string | Promise<string>;

  constructor(options: ClientOptions) {
    const modes = [
      options.apiKey !== undefined,
      options.accessToken !== undefined,
      options.getAccessToken !== undefined,
    ].filter(Boolean).length;
    if (modes > 1) {
      throw new EntryBitError(
        "Configure exactly one auth mode: `apiKey` (organization key), `accessToken`, or `getAccessToken` (user-delegated).",
      );
    }
    if (options.apiKey !== undefined && !options.apiKey.trim()) {
      throw new EntryBitError("`apiKey` must be a non-empty string.");
    }
    if (options.accessToken !== undefined && !options.accessToken.trim()) {
      throw new EntryBitError("`accessToken` must be a non-empty string.");
    }
    this.apiKey = options.apiKey;
    this.apiKeyHeader = options.apiKeyHeader ?? "authorization";
    this.accessToken = options.accessToken;
    this.getAccessToken = options.getAccessToken;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.defaultHeaders = options.defaultHeaders ?? {};
    if (typeof this.fetchFn !== "function") {
      throw new EntryBitError(
        "No `fetch` implementation available. Use Node.js >= 20 or pass `fetch` in the client options.",
      );
    }
  }

  private async authHeaders(): Promise<Record<string, string>> {
    if (this.apiKey !== undefined) {
      return this.apiKeyHeader === "x-api-key"
        ? { "X-API-Key": this.apiKey }
        : { Authorization: `Bearer ${this.apiKey}` };
    }
    if (this.getAccessToken) {
      const token = await this.getAccessToken();
      return { Authorization: `Bearer ${token}` };
    }
    if (this.accessToken !== undefined) {
      return { Authorization: `Bearer ${this.accessToken}` };
    }
    return {};
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${options.path}${buildQuery(options.query)}`;
    const retryable = options.idempotent ?? options.method === "GET";
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
      ...this.defaultHeaders,
      ...(await this.authHeaders()),
    };
    let bodyText: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyText = JSON.stringify(options.body);
    }

    let attempt = 0;
    for (;;) {
      let res: Response;
      try {
        res = await this.fetchFn(url, {
          method: options.method,
          headers,
          body: bodyText,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (cause) {
        if (retryable && attempt < this.maxRetries) {
          await sleep(backoffDelayMs(attempt));
          attempt += 1;
          continue;
        }
        throw new ConnectionError(`Request to ${options.path} failed: ${String(cause)}`, { cause });
      }

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await readBody(res)) as T;
      }

      const shouldRetry =
        retryable && attempt < this.maxRetries && (res.status === 429 || res.status >= 500);
      if (shouldRetry) {
        const retryAfter = res.status === 429 ? parseRetryAfter(res.headers.get("retry-after")) : undefined;
        const delayMs = retryAfter !== undefined ? retryAfter * 1000 : backoffDelayMs(attempt);
        // Drain the body so the connection can be reused.
        await res.body?.cancel().catch(() => {});
        await sleep(delayMs);
        attempt += 1;
        continue;
      }

      throw await errorFromResponse(res);
    }
  }
}
