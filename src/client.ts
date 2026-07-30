import { HttpClient } from "./core/http.js";
import { Facilities } from "./resources/facilities.js";
import { Invites } from "./resources/invites.js";
import { Me } from "./resources/me.js";
import { OAuth } from "./resources/oauth.js";
import { Org } from "./resources/org.js";
import { Passes } from "./resources/passes.js";
import type { ClientOptions } from "./types/client.js";
import type { RequestSpec } from "./types/requests.js";

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
 */
export class EntryBit {
  /** The caller's own guest passes (`/api/v1/passes`, user-delegated). */
  readonly passes: Passes;
  /** Organization resources (`/api/v1/org/*`, organization API keys). */
  readonly org: Org;
  /** The authenticated member (`/api/v1/me`). */
  readonly me: Me;
  /** Pending invites for the authenticated user (`/api/v1/invites`). */
  readonly invites: Invites;
  /** Facilities the caller may invite guests to (`/api/v1/facilities`). */
  readonly facilities: Facilities;
  /** OAuth2/OIDC endpoints (`/api/oauth/*`): code exchange, refresh, revoke, introspect, userinfo. */
  readonly oauth: OAuth;

  private readonly http: HttpClient;

  constructor(options: ClientOptions = {}) {
    this.http = new HttpClient(options);
    this.passes = new Passes(this.http);
    this.org = new Org(this.http);
    this.me = new Me(this.http);
    this.invites = new Invites(this.http);
    this.facilities = new Facilities(this.http, "/api/v1/facilities");
    this.oauth = new OAuth(this.http);
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
}
