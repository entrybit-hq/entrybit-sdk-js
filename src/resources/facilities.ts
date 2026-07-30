import type { HttpClient } from "../core/http.js";
import type { Facility } from "../types/facilities.js";
import type { RequestOptions } from "../types/requests.js";

/** Facilities (`/api/v1/org/facilities` and `/api/v1/facilities`). */
export class Facilities {
  constructor(
    private readonly http: HttpClient,
    private readonly path: string,
  ) {}

  /** Lists the facilities visible to the credential. */
  async list(options?: RequestOptions): Promise<Facility[]> {
    const res = await this.http.request<{ success: boolean; facilities: Facility[] }>({
      method: "GET",
      path: this.path,
      ...options,
    });
    return res.facilities;
  }
}
