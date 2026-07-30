import type { HttpClient } from "./http.js";
import { iterateCursorPages } from "./pagination.js";
import type { components } from "./generated/schema.js";

// ---------------------------------------------------------------------------
// Schema-derived types (generated from spec/openapi.json — do not hand-edit).
// ---------------------------------------------------------------------------

export type Pass = components["schemas"]["Pass"];
export type PassPage = components["schemas"]["PassPage"];
export type PassCreateRequest = components["schemas"]["PassCreateRequest"];
export type PassCreateResponse = components["schemas"]["PassCreateResponse"];
export type RevokeResponse = components["schemas"]["RevokeResponse"];
export type Member = components["schemas"]["Member"];
export type MemberPage = components["schemas"]["MemberPage"];
export type Facility = components["schemas"]["Facility"];
export type OrgInvite = components["schemas"]["OrgInvite"];
export type MeResponse = components["schemas"]["MeResponse"];

// ---------------------------------------------------------------------------
// List parameters
// ---------------------------------------------------------------------------

export interface ListPassesParams {
  /** Page size, 1–100 (server default 30). */
  limit?: number;
  /** Keyset cursor from a previous page's `next_cursor`. */
  cursor?: string;
  /** Free-text search. */
  search?: string;
}

export interface ListMembersParams extends ListPassesParams {
  /**
   * Field selection, e.g. `["name", "email"]` or `"name,email"`.
   * Which fields the server returns also depends on the credential's tier
   * (`org:members:read` = basic, `org:members:contact:read` adds email/phone).
   */
  fields?: string | readonly string[];
  status?: "active" | "inactive" | "all";
}

export interface GetMemberParams {
  fields?: string | readonly string[];
}

function serializeMemberQuery(params: ListMembersParams | GetMemberParams | undefined) {
  if (!params) return {};
  const { fields, ...rest } = params as ListMembersParams;
  return {
    ...rest,
    fields: Array.isArray(fields) ? fields.join(",") : (fields as string | undefined),
  };
}

// ---------------------------------------------------------------------------
// /api/v1/passes — the caller's own guest passes (user-delegated tokens)
// ---------------------------------------------------------------------------

export class Passes {
  constructor(
    private readonly http: HttpClient,
    private readonly basePath: string = "/api/v1/passes",
  ) {}

  /** Lists one page of passes. */
  list(params?: ListPassesParams): Promise<PassPage> {
    return this.http.request<PassPage>({ method: "GET", path: this.basePath, query: { ...params } });
  }

  /** Iterates every pass across pages: `for await (const p of entrybit.passes.iterate())`. */
  iterate(params?: Omit<ListPassesParams, "cursor"> & { cursor?: string }): AsyncGenerator<Pass> {
    const { cursor, ...rest } = params ?? {};
    return iterateCursorPages<Pass>(
      (c) => this.list({ ...rest, cursor: c }),
      cursor,
    );
  }

  /** Fetches a single pass by its public id (`gst_…`). */
  async get(publicId: string): Promise<Pass> {
    const res = await this.http.request<{ success: boolean; pass: Pass }>({
      method: "GET",
      path: `${this.basePath}/${encodeURIComponent(publicId)}`,
    });
    return res.pass;
  }

  /** Creates one or more guest passes (delivery via `email` and/or `phone`). */
  create(body: PassCreateRequest): Promise<PassCreateResponse> {
    return this.http.request<PassCreateResponse>({ method: "POST", path: this.basePath, body });
  }

  /** Revokes (cancels) a pass by its public id. */
  revoke(publicId: string): Promise<RevokeResponse> {
    return this.http.request<RevokeResponse>({
      method: "DELETE",
      path: `${this.basePath}/${encodeURIComponent(publicId)}`,
    });
  }
}

// ---------------------------------------------------------------------------
// /api/v1/org/members — the organization's member directory
// ---------------------------------------------------------------------------

export class OrgMembers {
  constructor(private readonly http: HttpClient) {}

  /** Lists one page of the member directory. */
  list(params?: ListMembersParams): Promise<MemberPage> {
    return this.http.request<MemberPage>({
      method: "GET",
      path: "/api/v1/org/members",
      query: serializeMemberQuery(params),
    });
  }

  /** Iterates every member across pages: `for await (const m of entrybit.org.members.iterate())`. */
  iterate(params?: ListMembersParams): AsyncGenerator<Member> {
    const { cursor, ...rest } = params ?? {};
    return iterateCursorPages<Member>(
      (c) => this.list({ ...rest, cursor: c }),
      cursor,
    );
  }

  /** Fetches a single member by id (`emp_…`). */
  async get(memberId: string, params?: GetMemberParams): Promise<Member> {
    const res = await this.http.request<{ success: boolean; member: Member }>({
      method: "GET",
      path: `/api/v1/org/members/${encodeURIComponent(memberId)}`,
      query: serializeMemberQuery(params),
    });
    return res.member;
  }
}

// ---------------------------------------------------------------------------
// /api/v1/org/facilities and /api/v1/facilities
// ---------------------------------------------------------------------------

export class Facilities {
  constructor(
    private readonly http: HttpClient,
    private readonly path: string,
  ) {}

  /** Lists the facilities visible to the credential. */
  async list(): Promise<Facility[]> {
    const res = await this.http.request<{ success: boolean; facilities: Facility[] }>({
      method: "GET",
      path: this.path,
    });
    return res.facilities;
  }
}

// ---------------------------------------------------------------------------
// /api/v1/me and /api/v1/invites (user-delegated)
// ---------------------------------------------------------------------------

export class Me {
  constructor(private readonly http: HttpClient) {}

  /** The authenticated member's profile, organization and custom member fields. */
  get(): Promise<MeResponse> {
    return this.http.request<MeResponse>({ method: "GET", path: "/api/v1/me" });
  }
}

export class Invites {
  constructor(private readonly http: HttpClient) {}

  /** Pending organization invites addressed to the authenticated user. */
  async list(): Promise<OrgInvite[]> {
    const res = await this.http.request<{ success: boolean; invites: OrgInvite[] }>({
      method: "GET",
      path: "/api/v1/invites",
    });
    return res.invites;
  }
}

// ---------------------------------------------------------------------------
// /api/v1/org/* namespace (organization API keys)
// ---------------------------------------------------------------------------

export class Org {
  /** Organization-wide guest passes (`/api/v1/org/passes`). */
  readonly passes: Passes;
  /** Member directory (`/api/v1/org/members`). */
  readonly members: OrgMembers;
  /** Organization facilities (`/api/v1/org/facilities`). */
  readonly facilities: Facilities;

  constructor(http: HttpClient) {
    this.passes = new Passes(http, "/api/v1/org/passes");
    this.members = new OrgMembers(http);
    this.facilities = new Facilities(http, "/api/v1/org/facilities");
  }
}
