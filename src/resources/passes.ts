import type { HttpClient } from "../core/http.js";
import { encodePathParam } from "../core/params.js";
import { iterateCursorPages } from "../core/pagination.js";
import type {
  ListPassesParams,
  Pass,
  PassCreateRequest,
  PassCreateResponse,
  PassPage,
  RevokeResponse,
} from "../types/passes.js";
import type { RequestOptions } from "../types/requests.js";

/**
 * Guest passes. `OrgPasses` carries the operations the org endpoint serves
 * (list/iterate/create/revoke); the user-delegated endpoint additionally
 * serves single-pass GET, so `Passes` extends it. The org API has no
 * `GET /api/v1/org/passes/{id}` route — exposing `get` there would type a
 * method that can only ever 405.
 */
export class OrgPasses {
  constructor(
    protected readonly http: HttpClient,
    protected readonly basePath: string,
  ) {}

  /** Lists one page of passes. */
  list(params?: ListPassesParams, options?: RequestOptions): Promise<PassPage> {
    return this.http.request<PassPage>({
      method: "GET",
      path: this.basePath,
      query: { ...params },
      ...options,
    });
  }

  /** Iterates every pass across pages: `for await (const p of entrybit.passes.iterate())`. */
  iterate(params?: ListPassesParams, options?: RequestOptions): AsyncGenerator<Pass> {
    const { cursor, ...rest } = params ?? {};
    return iterateCursorPages<Pass>((c) => this.list({ ...rest, cursor: c }, options), cursor);
  }

  /** Creates one or more guest passes (delivery via `email` and/or `phone`). */
  create(body: PassCreateRequest, options?: RequestOptions): Promise<PassCreateResponse> {
    return this.http.request<PassCreateResponse>({
      method: "POST",
      path: this.basePath,
      body,
      ...options,
    });
  }

  /** Revokes (cancels) a pass by its public id. */
  async revoke(publicId: string, options?: RequestOptions): Promise<RevokeResponse> {
    return await this.http.request<RevokeResponse>({
      method: "DELETE",
      path: `${this.basePath}/${encodePathParam("publicId", publicId)}`,
      // Deliberately NOT auto-retried: the API answers 404/409 for an
      // already-revoked pass, so a retry after a lost success response would
      // surface a phantom failure to a caller whose revoke actually worked.
      ...options,
    });
  }
}

/** The caller's own guest passes (`/api/v1/passes`, user-delegated tokens). */
export class Passes extends OrgPasses {
  constructor(http: HttpClient, basePath = "/api/v1/passes") {
    super(http, basePath);
  }

  /** Fetches a single pass by its public id (`gst_…`). */
  async get(publicId: string, options?: RequestOptions): Promise<Pass> {
    const res = await this.http.request<{ success: boolean; pass: Pass }>({
      method: "GET",
      path: `${this.basePath}/${encodePathParam("publicId", publicId)}`,
      ...options,
    });
    return res.pass;
  }
}
