import type { HttpClient } from "../core/http.js";
import type { OrgInvite } from "../types/invites.js";
import type { RequestOptions } from "../types/requests.js";

/** Pending organization invites (`/api/v1/invites`, user-delegated). */
export class Invites {
  constructor(private readonly http: HttpClient) {}

  /** Pending organization invites addressed to the authenticated user. */
  async list(options?: RequestOptions): Promise<OrgInvite[]> {
    const res = await this.http.request<{ success: boolean; invites: OrgInvite[] }>({
      method: "GET",
      path: "/api/v1/invites",
      ...options,
    });
    return res.invites;
  }
}
