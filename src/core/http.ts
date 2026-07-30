import {
  ConnectionError,
  EntryBitError,
  TimeoutError,
  UserAbortError,
  parseRetryAfter,
} from "../errors/index.js";
import type { ApiKeyHeader, ClientOptions, Logger, LogLevel } from "../types/client.js";
import type { RequestSpec } from "../types/requests.js";
import { backoffDelayMs, sleep } from "./backoff.js";
import { buildQuery } from "./query.js";
import { errorFromResponse, readSuccessBody } from "./response.js";
import {
  CLIENT_TELEMETRY_HEADER,
  USER_AGENT,
  clientTelemetry,
  isBrowserLike,
  readEnvApiKey,
} from "./runtime.js";

export const DEFAULT_BASE_URL = "https://api.entrybit.net";

/**
 * Upper bound on how long a `Retry-After` header can delay an automatic
 * retry. Servers occasionally send absurd values (hours); beyond this cap
 * the SDK does not retry at all — it surfaces the `RateLimitError`, which
 * carries the unclamped `retryAfter` for the caller to act on.
 */
const RETRY_AFTER_CAP_MS = 30_000;

const LOG_RANK: Record<LogLevel, number> = { off: 0, error: 1, warn: 2, info: 3, debug: 4 };

function normalizeBaseUrl(url: string): string {
  // Linear scan instead of /\/+$/: that regex is polynomial-time on
  // adversarial input (CodeQL js/polynomial-redos).
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47 /* "/" */) end -= 1;
  return url.slice(0, end);
}

/**
 * Best-effort detection of a `redirect: "error"` rejection. undici (Node),
 * WebKit and Workers all mention "redirect" in the error or its cause; a miss
 * merely falls through to the ordinary retry path.
 */
function isRedirectRejection(cause: unknown): boolean {
  const seen: string[] = [];
  let current: unknown = cause;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current instanceof Error) {
      seen.push(current.message);
      current = current.cause;
    } else {
      if (typeof current === "string") seen.push(current);
      break;
    }
  }
  return /redirect/i.test(seen.join(" "));
}

/**
 * Merges header groups into one record with lowercased names, so a later
 * group genuinely overrides an earlier one regardless of casing (HTTP header
 * names are case-insensitive; plain-object spreads are not — mixed casing
 * would otherwise send BOTH values, combined by fetch).
 */
function mergeHeaders(
  ...groups: Array<Record<string, string> | undefined>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const group of groups) {
    if (!group) continue;
    for (const [name, value] of Object.entries(group)) {
      merged[name.toLowerCase()] = value;
    }
  }
  return merged;
}

/** Internal HTTP core: auth, retries, error mapping. Reach it via `EntryBit.request()`. */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly fetchOptions: (RequestInit & Record<string, unknown>) | undefined;
  private readonly defaultHeaders: Record<string, string>;
  private readonly telemetry: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly apiKeyHeader: ApiKeyHeader;
  private readonly accessToken: string | undefined;
  private readonly getAccessToken: (() => string | Promise<string>) | undefined;
  private readonly logger: Logger;
  private readonly logLevel: LogLevel;
  private tokenInFlight: Promise<string> | undefined;

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

    let apiKey = options.apiKey;
    if (modes === 0) {
      apiKey = readEnvApiKey();
      if (apiKey === undefined) {
        throw new EntryBitError(
          "No credential configured. Pass `apiKey` (or set the ENTRYBIT_API_KEY environment variable), `accessToken`, or `getAccessToken` — or pass `apiKey: null` to explicitly create an unauthenticated client.",
        );
      }
    }
    if (typeof apiKey === "string" && !apiKey.trim()) {
      throw new EntryBitError("`apiKey` must be a non-empty string.");
    }
    if (options.accessToken !== undefined && !options.accessToken.trim()) {
      throw new EntryBitError("`accessToken` must be a non-empty string.");
    }
    if (typeof apiKey === "string" && isBrowserLike() && options.dangerouslyAllowBrowser !== true) {
      throw new EntryBitError(
        "Refusing to use an organization API key in a browser-like environment: `eb_sk_…` keys are secrets and would be exposed to every visitor. Use user-delegated OAuth tokens in browsers, or pass `dangerouslyAllowBrowser: true` if you accept the risk.",
      );
    }

    this.apiKey = apiKey ?? undefined;
    this.apiKeyHeader = options.apiKeyHeader ?? "authorization";
    this.accessToken = options.accessToken;
    this.getAccessToken = options.getAccessToken;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.maxRetries = options.maxRetries ?? 2;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    const fetchFn = options.fetch ?? globalThis.fetch;
    if (typeof fetchFn !== "function") {
      throw new EntryBitError(
        "No `fetch` implementation available. Use Node.js >= 20 or pass `fetch` in the client options.",
      );
    }
    // Detach from any receiver: calling a native `fetch` with a foreign
    // `this` throws "Illegal invocation" on browsers and edge runtimes.
    this.fetchFn = fetchFn.bind(globalThis);
    this.fetchOptions = options.fetchOptions;
    this.defaultHeaders = options.defaultHeaders ?? {};
    // Opt-out supported for organizations that do not want runtime details
    // sent (README § Privacy documents exactly what this contains).
    this.telemetry = options.telemetry === false ? undefined : clientTelemetry();
    this.logger = options.logger ?? console;
    this.logLevel = options.logLevel ?? "warn";
  }

  private log(level: Exclude<LogLevel, "off">, message: string): void {
    if (LOG_RANK[level] <= LOG_RANK[this.logLevel]) {
      this.logger[level](`[entrybit-sdk] ${message}`);
    }
  }

  /**
   * Single-flight wrapper around `getAccessToken`: concurrent requests share
   * one in-flight call so a slow token refresh is not stampeded. The memo
   * only lives while the call is pending — every attempt issued after it
   * settles asks for a fresh token again.
   */
  private resolveAccessToken(): Promise<string> {
    this.tokenInFlight ??= Promise.resolve()
      .then(() => this.getAccessToken!())
      .finally(() => {
        this.tokenInFlight = undefined;
      });
    return this.tokenInFlight;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    if (this.apiKey !== undefined) {
      return this.apiKeyHeader === "x-api-key"
        ? { "x-api-key": this.apiKey }
        : { authorization: `Bearer ${this.apiKey}` };
    }
    if (this.getAccessToken) {
      const token = await this.resolveAccessToken();
      if (typeof token !== "string" || !token.trim()) {
        throw new EntryBitError("`getAccessToken` must return a non-empty string access token.");
      }
      return { authorization: `Bearer ${token}` };
    }
    if (this.accessToken !== undefined) {
      return { authorization: `Bearer ${this.accessToken}` };
    }
    return {};
  }

  async request<T>(spec: RequestSpec): Promise<T> {
    const url = `${this.baseUrl}${spec.path}${buildQuery(spec.query)}`;
    const retryable = spec.idempotent ?? spec.method === "GET";
    const timeoutMs = spec.timeoutMs ?? this.timeoutMs;
    const maxRetries = spec.maxRetries ?? this.maxRetries;

    const baseHeaders: Record<string, string> = {
      accept: "application/json",
      "user-agent": USER_AGENT,
      ...(this.telemetry !== undefined ? { [CLIENT_TELEMETRY_HEADER]: this.telemetry } : {}),
    };
    let bodyText: string | undefined;
    if (spec.form !== undefined && spec.body !== undefined) {
      throw new EntryBitError("`body` and `form` are mutually exclusive on a request.");
    }
    if (spec.form !== undefined) {
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(spec.form)) {
        if (value !== undefined) form.set(key, value);
      }
      bodyText = form.toString();
      baseHeaders["content-type"] = "application/x-www-form-urlencoded";
    } else if (spec.body !== undefined) {
      bodyText = JSON.stringify(spec.body);
      baseHeaders["content-type"] = "application/json";
    }

    let attempt = 0;
    for (;;) {
      if (spec.signal?.aborted) {
        throw new UserAbortError(`Request to ${spec.path} was aborted by the caller.`, {
          cause: spec.signal.reason as unknown,
        });
      }
      // Auth resolves per attempt so retries after long waits carry a fresh
      // token; the header merge is case-insensitive with auth winning last.
      const headers = mergeHeaders(
        baseHeaders,
        this.defaultHeaders,
        spec.headers,
        spec.unauthenticated ? undefined : await this.authHeaders(),
      );
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = spec.signal ? AbortSignal.any([spec.signal, timeoutSignal]) : timeoutSignal;
      const startedAt = Date.now();

      let res: Response;
      try {
        res = await this.fetchFn(url, {
          // A JSON API never legitimately redirects the SDK; following one
          // could forward the X-API-Key credential cross-origin.
          redirect: "error",
          ...this.fetchOptions,
          method: spec.method,
          headers,
          ...(bodyText !== undefined ? { body: bodyText } : {}),
          signal,
        });
      } catch (cause) {
        if (spec.signal?.aborted) {
          throw new UserAbortError(`Request to ${spec.path} was aborted by the caller.`, { cause });
        }
        const timedOut = timeoutSignal.aborted;
        // `redirect: "error"` makes a 3xx reject deterministically - retrying
        // it only burns the budget. Surface it clearly instead.
        if (!timedOut && isRedirectRejection(cause)) {
          throw new ConnectionError(
            `The server answered ${spec.path} with a redirect, which the SDK refuses to follow (following could forward credentials to another origin). Check that baseUrl points at the canonical API host.`,
            { cause },
          );
        }
        if (retryable && attempt < maxRetries) {
          const delayMs = backoffDelayMs(attempt);
          this.log(
            "info",
            `retrying ${spec.method} ${spec.path} in ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${maxRetries}): ${timedOut ? `timed out after ${timeoutMs}ms` : "network failure"}`,
          );
          await sleep(delayMs, spec.signal);
          attempt += 1;
          continue;
        }
        if (timedOut) {
          throw new TimeoutError(`Request to ${spec.path} timed out after ${timeoutMs} ms.`, {
            cause,
          });
        }
        throw new ConnectionError(`Request to ${spec.path} failed: ${String(cause)}`, { cause });
      }

      this.log(
        "debug",
        `${spec.method} ${spec.path} -> ${res.status} (${Date.now() - startedAt}ms)`,
      );

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        try {
          return (await readSuccessBody(res)) as T;
        } catch (cause) {
          // Malformed JSON is already a mapped SDK error; rethrow as-is.
          if (cause instanceof EntryBitError) throw cause;
          // A caller abort mid-body honors the documented signal contract.
          if (spec.signal?.aborted) {
            throw new UserAbortError(`Request to ${spec.path} was aborted by the caller.`, {
              cause,
            });
          }
          // Anything else means the body read itself failed (timeout fired
          // mid-body, connection reset). Retry when eligible.
          if (retryable && attempt < maxRetries) {
            await sleep(backoffDelayMs(attempt), spec.signal);
            attempt += 1;
            continue;
          }
          throw new ConnectionError(
            `Reading the response body from ${spec.path} failed: ${String(cause)}`,
            { cause },
          );
        }
      }

      const retryableStatus = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxRetries && retryableStatus) {
        // Retry-After is honored on 429 AND 5xx (RFC 9110's original use
        // case — e.g. a 503 during maintenance).
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        if (retryAfter !== undefined && retryAfter * 1000 > RETRY_AFTER_CAP_MS) {
          // The server asked for a longer wait than the SDK will hold the
          // caller: surface the mapped error (carrying the unclamped value).
          throw await errorFromResponse(res);
        }
        const delayMs = retryAfter !== undefined ? retryAfter * 1000 : backoffDelayMs(attempt);
        this.log(
          "info",
          `retrying ${spec.method} ${spec.path} in ${Math.round(delayMs)}ms (attempt ${attempt + 1}/${maxRetries}): HTTP ${res.status}`,
        );
        // Drain the body so the connection can be reused.
        await res.body?.cancel().catch(() => {});
        await sleep(delayMs, spec.signal);
        attempt += 1;
        continue;
      }

      throw await errorFromResponse(res);
    }
  }
}
