/** How an organization API key is transmitted. */
export type ApiKeyHeader = "authorization" | "x-api-key";

export type LogLevel = "off" | "error" | "warn" | "info" | "debug";

/** Minimal logger contract; `console` satisfies it. Header values are never logged. */
export interface Logger {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

/**
 * Identifies an integration built on top of the SDK. Appended to the
 * `User-Agent` and `x-entrybit-client` headers so support can tell
 * integrations apart: `entrybit-sdk-js/0.2.1 my-app/2.1.0 (https://…)`.
 */
export interface AppInfo {
  name: string;
  version?: string | undefined;
  url?: string | undefined;
}

/**
 * Payload of the `"request"` event — emitted once per HTTP attempt, just
 * before it is sent. Retries re-emit with an incremented `attempt`.
 */
export interface RequestEvent {
  method: string;
  path: string;
  /** 0 on the first attempt; +1 per retry. */
  attempt: number;
}

/**
 * Payload of the `"response"` event — emitted once per HTTP response,
 * including responses the SDK is about to retry (`willRetry: true`).
 * Requests that fail before response headers arrive (network failure,
 * timeout, abort mid-connect) emit no `"response"` event; once headers have
 * been received the event fires even if reading the body then fails or is
 * aborted. Deliberately carries no headers, bodies or query values — see
 * README § Privacy.
 */
export interface ResponseEvent {
  method: string;
  path: string;
  status: number;
  /** `x-request-id` echoed by the API, when present. Quote it to support. */
  requestId: string | undefined;
  /** Client-measured duration of this attempt in milliseconds. */
  durationMs: number;
  /** 0 on the first attempt; +1 per retry. */
  attempt: number;
  /**
   * `true` when the SDK will retry (retryable status within the retry
   * budget, or a response-body read failure on an idempotent request).
   */
  willRetry: boolean;
}

/** Events observable via `entrybit.on()` / `entrybit.off()`. */
export interface ClientEventMap {
  request: RequestEvent;
  response: ResponseEvent;
}

/**
 * Snapshot returned by `EntryBit.debugInfo()`. Safe to paste into bug
 * reports: it names the auth *mode* but never carries credential values.
 * Field names here must never match secret-scanning heuristics (e.g.
 * `api[-_]?key`) — this object is designed to be logged, and a
 * heuristic-matching name would raise clear-text-logging alerts in every
 * consumer's code scanning.
 */
export interface ClientDebugInfo {
  name: "@entrybit/sdk";
  version: string;
  /** Git commit the bundle was built from; `"dev"` when running from source. */
  buildSha: string;
  userAgent: string;
  baseUrl: string;
  authMode: "apiKey" | "accessToken" | "getAccessToken" | "none";
  /**
   * The header that carries the credential: the `apiKeyHeader` option for
   * organization-key auth, always `authorization` for token auth.
   */
  authHeaderName: ApiKeyHeader;
  maxRetries: number;
  timeoutMs: number;
  telemetry: boolean;
  logLevel: LogLevel;
  /** `"custom"` when a `fetch` implementation other than `globalThis.fetch` was provided. */
  fetch: "global" | "custom";
  runtime: {
    node: string | undefined;
    platform: string | undefined;
    arch: string | undefined;
    browserLike: boolean;
  };
}

export interface ClientOptions {
  /**
   * Organization API key (`eb_sk_…`), created in **Settings → API keys**.
   * Server-to-server auth with `org:*` scopes. Mutually exclusive with
   * `accessToken` / `getAccessToken`. When no auth option is configured the
   * client falls back to the `ENTRYBIT_API_KEY` environment variable; pass
   * `null` to explicitly create an unauthenticated client (e.g. against a
   * local mock server).
   */
  apiKey?: string | null | undefined;
  /**
   * Which header carries the API key: `Authorization: Bearer …` (default)
   * or `X-API-Key: …`.
   */
  apiKeyHeader?: ApiKeyHeader | undefined;
  /**
   * A user-delegated OAuth2 access token. Mutually exclusive with `apiKey`
   * and `getAccessToken`.
   */
  accessToken?: string | undefined;
  /**
   * Called to obtain a fresh user-delegated access token (use this when your
   * app refreshes tokens). Invoked per attempt, so retries after long waits
   * pick up a current token. Mutually exclusive with `apiKey` / `accessToken`.
   */
  getAccessToken?: (() => string | Promise<string>) | undefined;
  /** API origin. Defaults to `https://api.entrybit.net`. */
  baseUrl?: string | undefined;
  /**
   * Maximum retry attempts after the first try, for 429/5xx responses and
   * network failures on idempotent requests. Defaults to 2. Set 0 to disable.
   */
  maxRetries?: number | undefined;
  /**
   * Per-request timeout in milliseconds (per attempt, covering the HTTP
   * exchange; time spent inside your `getAccessToken` callback is not
   * counted - give it its own timeout). Defaults to 30 000.
   */
  timeoutMs?: number | undefined;
  /** Custom `fetch` implementation. Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch | undefined;
  /**
   * Extra `RequestInit` fields merged into every `fetch` call — e.g. an
   * undici `dispatcher` for proxies or connection-pool tuning. The SDK's
   * own `method`/`headers`/`body`/`signal`/`redirect` always win (redirects
   * stay errors — following one could forward credentials cross-origin).
   */
  fetchOptions?: (RequestInit & Record<string, unknown>) | undefined;
  /** Extra headers sent with every request (header names are case-insensitive). */
  defaultHeaders?: Record<string, string> | undefined;
  /**
   * Whether to send the `x-entrybit-client` header (SDK version, runtime
   * version, OS/arch — never user data; used for support triage). Set
   * `false` to omit it entirely. Defaults to `true`. See README § Privacy
   * for everything the SDK transmits.
   */
  telemetry?: boolean | undefined;
  /**
   * Organization API keys are secrets; the client refuses to run with one in
   * a browser-like environment unless this is explicitly set. Prefer
   * user-delegated OAuth tokens in browsers.
   */
  dangerouslyAllowBrowser?: boolean | undefined;
  /** Where log lines go. Defaults to `console`. */
  logger?: Logger | undefined;
  /**
   * Log verbosity. `"info"` logs retry decisions; `"debug"` adds one line per
   * request/response (method, path, status, duration, request id — never
   * headers or bodies). Defaults to the `ENTRYBIT_LOG` environment variable
   * when it names a valid level, else `"warn"` (currently silent). An
   * explicit option always wins over the environment.
   */
  logLevel?: LogLevel | undefined;
  /**
   * Identifies your integration in the `User-Agent` and `x-entrybit-client`
   * headers (name, optional version and URL). Omitted entirely from the
   * telemetry header when `telemetry: false`.
   */
  appInfo?: AppInfo | undefined;
}
