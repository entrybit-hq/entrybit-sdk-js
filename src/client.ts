import { HttpClient } from "./core/http.js";
import { Facilities } from "./resources/facilities.js";
import { Invites } from "./resources/invites.js";
import { Me } from "./resources/me.js";
import { OAuth } from "./resources/oauth.js";
import { Org } from "./resources/org.js";
import { Passes } from "./resources/passes.js";
import type { ClientDebugInfo, ClientEventMap, ClientOptions } from "./types/client.js";
import type { RequestSpec, ResponseWithMeta } from "./types/requests.js";

/**
 * The EntryBit API client.
 *
 * ```ts
 * import { EntryBit } from "@entrybit/sdk";
 *
 * // Server-to-server (organization API key from Settings → API keys):
 * const entrybit = new EntryBit({ apiKey: process.env.ENTRYBIT_API_KEY! });
 *
 * // User-delegated (OAuth2 access token):
 * const entrybit = new EntryBit({ getAccessToken: () => tokenStore.current() });
 * ```
 *
 * Resource namespaces are constructed lazily on first access and cached, so
 * a client only allocates the resources it actually uses.
 */
export class EntryBit {
  private readonly http: HttpClient;

  private passesInstance?: Passes;
  private orgInstance?: Org;
  private meInstance?: Me;
  private invitesInstance?: Invites;
  private facilitiesInstance?: Facilities;
  private oauthInstance?: OAuth;

  constructor(options: ClientOptions = {}) {
    this.http = new HttpClient(options);
  }

  /** The caller's own guest passes (`/api/v1/passes`, user-delegated). */
  get passes(): Passes {
    return (this.passesInstance ??= new Passes(this.http));
  }

  /** Organization resources (`/api/v1/org/*`, organization API keys). */
  get org(): Org {
    return (this.orgInstance ??= new Org(this.http));
  }

  /** The authenticated member (`/api/v1/me`). */
  get me(): Me {
    return (this.meInstance ??= new Me(this.http));
  }

  /** Pending invites for the authenticated user (`/api/v1/invites`). */
  get invites(): Invites {
    return (this.invitesInstance ??= new Invites(this.http));
  }

  /** Facilities the caller may invite guests to (`/api/v1/facilities`). */
  get facilities(): Facilities {
    return (this.facilitiesInstance ??= new Facilities(this.http, "/api/v1/facilities"));
  }

  /** OAuth2/OIDC endpoints (`/api/oauth/*`): code exchange, refresh, revoke, introspect, userinfo. */
  get oauth(): OAuth {
    return (this.oauthInstance ??= new OAuth(this.http));
  }

  /**
   * Escape hatch for endpoints the typed surface does not (yet) model.
   * Sends an authenticated request through the same retry/timeout/error
   * pipeline as every resource method and returns the parsed JSON body.
   *
   * ```ts
   * const page = await entrybit.request<{ items: unknown[] }>({
   *   method: "GET",
   *   path: "/api/v1/org/passes",
   *   query: { limit: 5 },
   * });
   * ```
   */
  request<T = unknown>(spec: RequestSpec): Promise<T> {
    return this.http.request<T>(spec);
  }

  /**
   * Like `request()`, but also returns transport metadata for the 2xx
   * response — `status`, `headers` and the API's `requestId` echo — for
   * callers that correlate successes with server logs.
   *
   * ```ts
   * const { data, requestId } = await entrybit.requestWithMeta<{ items: unknown[] }>({
   *   method: "GET",
   *   path: "/api/v1/org/passes",
   * });
   * ```
   */
  requestWithMeta<T = unknown>(spec: RequestSpec): Promise<ResponseWithMeta<T>> {
    return this.http.requestWithMeta<T>(spec);
  }

  /**
   * Subscribes to client observability events:
   * `"request"` fires once per HTTP attempt, `"response"` once per HTTP
   * response (including ones the SDK retries — see `ResponseEvent.willRetry`).
   * Listener failures — synchronous throws and async rejections alike — are
   * swallowed; an observer can never fail a request.
   *
   * ```ts
   * entrybit.on("response", (e) => {
   *   metrics.timing("entrybit.request", e.durationMs, { status: e.status });
   * });
   * ```
   */
  on<K extends keyof ClientEventMap>(
    event: K,
    listener: (payload: ClientEventMap[K]) => unknown,
  ): this {
    this.http.events.on(event, listener);
    return this;
  }

  /** Unsubscribes a listener previously registered with `on()`. */
  off<K extends keyof ClientEventMap>(
    event: K,
    listener: (payload: ClientEventMap[K]) => unknown,
  ): this {
    this.http.events.off(event, listener);
    return this;
  }

  /**
   * Diagnostic snapshot — SDK version, build commit, resolved configuration
   * and runtime facts. Include its output in bug reports; it names the auth
   * *mode* but never contains credential values.
   *
   * ```ts
   * console.log(entrybit.debugInfo());
   * // { name: "@entrybit/sdk", version: "0.2.1", buildSha: "abc123456789", … }
   * ```
   */
  debugInfo(): ClientDebugInfo {
    return this.http.debugInfo();
  }
}
