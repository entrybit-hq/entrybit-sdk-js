import type { HttpClient } from "../core/http.js";
import type {
  CommandAccepted,
  Controller,
  DoorOpenRequest,
  RelayCloseRequest,
  RelayOpenRequest,
} from "../types/access.js";
import type { RequestOptions } from "../types/requests.js";

/**
 * Controllers (`/api/v1/org/controllers`, scope `org:controllers:read`) —
 * discovery for the door/relay commands: which serials exist, which doors are
 * remotely openable, and whether each controller is connected right now
 * (live registry truth, refreshed per request).
 */
export class OrgControllers {
  constructor(private readonly http: HttpClient) {}

  /** Lists the organization's controllers with doors and live online state. */
  async list(options?: RequestOptions): Promise<Controller[]> {
    const res = await this.http.request<{ success: boolean; controllers: Controller[] }>({
      method: "GET",
      path: "/api/v1/org/controllers",
      ...options,
    });
    return res.controllers;
  }
}

/**
 * Controllers for a USER-DELEGATED token (`/api/v1/controllers`, scope
 * `controllers:read`). The server additionally requires the signed-in user's
 * live `controllers:manage` organization permission, so a token can never
 * exceed what that person can already do in the dashboard — a user without it
 * gets `PermissionError` rather than a list.
 */
export class Controllers {
  constructor(private readonly http: HttpClient) {}

  /** Lists the caller's org controllers with doors and live online state. */
  async list(options?: RequestOptions): Promise<Controller[]> {
    const res = await this.http.request<{ success: boolean; controllers: Controller[] }>({
      method: "GET",
      path: "/api/v1/controllers",
      ...options,
    });
    return res.controllers;
  }
}

/**
 * Momentary door opening for a USER-DELEGATED token (`/api/v1/doors/open`,
 * scope `doors:open` + the user's live `controllers:manage` permission).
 *
 * Identical contract to {@link OrgDoors}: a resolved promise means the command
 * was **sent** (written to the controller's socket), not that the door
 * physically opened; an offline controller rejects with `ConflictError`
 * (`code: "controller_offline"`) and is never queued; and the call is never
 * auto-retried.
 */
export class Doors {
  constructor(private readonly http: HttpClient) {}

  /** Momentarily opens one door on behalf of the signed-in user. */
  open(body: DoorOpenRequest, options?: RequestOptions): Promise<CommandAccepted> {
    return this.http.request<CommandAccepted>({
      method: "POST",
      path: "/api/v1/doors/open",
      body,
      ...options,
      // Never auto-retried; pinned after the spread (see OrgDoors.open).
      idempotent: false,
    });
  }
}

/**
 * Momentary door opening (`/api/v1/org/doors/open`, scope `org:doors:open`).
 *
 * The contract, verbatim from the API:
 * - A resolved promise means the command was **sent** (written to the
 *   controller's socket) — NOT that the door physically opened.
 * - An offline controller rejects with `ConflictError` (`code:
 *   "controller_offline"`). The command is never queued or replayed.
 * - The SDK never auto-retries this call, and neither should you without
 *   live human intent — a duplicated open re-fires the lock.
 * - Only grantable `Control` doors are accepted; hold-open, lock and
 *   lockdown are not exposed to API keys at all.
 */
export class OrgDoors {
  constructor(private readonly http: HttpClient) {}

  /** Momentarily opens one door (the controller re-locks after its configured delay). */
  open(body: DoorOpenRequest, options?: RequestOptions): Promise<CommandAccepted> {
    return this.http.request<CommandAccepted>({
      method: "POST",
      path: "/api/v1/org/doors/open",
      body,
      ...options,
      // AFTER the options spread on purpose: never auto-retried, and not
      // overridable — an untyped caller sneaking `idempotent: true` into the
      // options must not re-arm retries on a physical actuation.
      idempotent: false,
    });
  }
}

/**
 * Bounded relay switching (`/api/v1/org/relays/*`, scope `org:relays:open`).
 * Same sent-not-executed contract and never-retried semantics as `OrgDoors`.
 */
export class OrgRelays {
  constructor(private readonly http: HttpClient) {}

  /** Switches a relay ON for `duration` seconds (0–300, default 5; 0 = controller default). */
  open(body: RelayOpenRequest, options?: RequestOptions): Promise<CommandAccepted> {
    return this.http.request<CommandAccepted>({
      method: "POST",
      path: "/api/v1/org/relays/open",
      body,
      ...options,
      // Never auto-retried; pinned after the spread (see OrgDoors.open).
      idempotent: false,
    });
  }

  /** Switches a relay OFF now — the safe direction, same scope as `open`. */
  close(body: RelayCloseRequest, options?: RequestOptions): Promise<CommandAccepted> {
    return this.http.request<CommandAccepted>({
      method: "POST",
      path: "/api/v1/org/relays/close",
      body,
      ...options,
      // Never auto-retried; pinned after the spread (see OrgDoors.open).
      idempotent: false,
    });
  }
}
