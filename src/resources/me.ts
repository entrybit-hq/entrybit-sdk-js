import type { HttpClient } from "../core/http.js";
import type { MeResponse } from "../types/me.js";
import type { RequestOptions } from "../types/requests.js";

/** The authenticated member (`/api/v1/me`, user-delegated). */
export class Me {
  constructor(private readonly http: HttpClient) {}

  /** The authenticated member's profile, organization and custom member fields. */
  get(options?: RequestOptions): Promise<MeResponse> {
    return this.http.request<MeResponse>({ method: "GET", path: "/api/v1/me", ...options });
  }
}
