import {
  APIError,
  AuthenticationError,
  ConnectionError,
  EntryBitError,
  PermissionError,
  RateLimitError,
  ValidationError,
  parseRetryAfter,
  parseWwwAuthenticate,
} from "./errors.js";
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

export type QueryValue = string | number | boolean | readonly string[] | null | undefined;

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

const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 8_000;

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      params.set(key, value.join(","));
    } else {
      params.set(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function backoffDelayMs(attempt: number): number {
  const exp = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** attempt);
  // Full jitter: uniform in [exp/2, exp].
  return exp / 2 + Math.random() * (exp / 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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

async function errorFromResponse(res: Response): Promise<EntryBitError> {
  const body = await readBody(res);
  const common = {
    status: res.status,
    code: codeFromBody(body),
    body,
    headers: res.headers,
  };
  switch (res.status) {
    case 400:
      return new ValidationError(messageFromBody(body, "Invalid request"), common);
    case 401:
      return new AuthenticationError(
        messageFromBody(body, "Authentication failed (invalid_token)"),
        common,
      );
    case 403: {
      const challenge = parseWwwAuthenticate(res.headers.get("www-authenticate"));
      const scopeSuffix = challenge.scope ? ` (missing scope: ${challenge.scope})` : "";
      return new PermissionError(
        messageFromBody(body, "Insufficient scope") + scopeSuffix,
        { ...common, missingScope: challenge.scope },
      );
    }
    case 429: {
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      return new RateLimitError(messageFromBody(body, "Rate limited"), {
        ...common,
        retryAfter,
      });
    }
    default:
      return new APIError(messageFromBody(body, `Request failed with status ${res.status}`), common);
  }
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
