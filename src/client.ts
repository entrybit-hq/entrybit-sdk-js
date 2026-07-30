import { HttpClient } from "./http.js";
import type { ClientOptions } from "./http.js";
import { Facilities, Invites, Me, Org, Passes } from "./resources.js";

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

  private readonly http: HttpClient;

  constructor(options: ClientOptions = {}) {
    this.http = new HttpClient(options);
    this.passes = new Passes(this.http);
    this.org = new Org(this.http);
    this.me = new Me(this.http);
    this.invites = new Invites(this.http);
    this.facilities = new Facilities(this.http, "/api/v1/facilities");
  }
}
