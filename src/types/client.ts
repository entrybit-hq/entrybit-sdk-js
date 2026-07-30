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
   * own `method`/`headers`/`body`/`signal` always win.
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
   * request/response (method, path, status, duration — never headers or
   * bodies). Defaults to `"warn"` (currently silent).
   */
  logLevel?: LogLevel | undefined;
}
