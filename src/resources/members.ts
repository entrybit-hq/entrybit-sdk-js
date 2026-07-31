import type { HttpClient } from "../core/http.js";
import { encodePathParam } from "../core/params.js";
import { iterateCursorPages } from "../core/pagination.js";
import type { GetMemberParams, ListMembersParams, Member, MemberPage } from "../types/members.js";
import type { RequestOptions } from "../types/requests.js";

function serializeMemberQuery(params: ListMembersParams | GetMemberParams | undefined) {
  if (!params) return {};
  const { fields, ...rest } = params as ListMembersParams;
  return {
    ...rest,
    fields: Array.isArray(fields) ? fields.join(",") : (fields as string | undefined),
  };
}

/** The organization's member directory (`/api/v1/org/members`). */
export class OrgMembers {
  constructor(private readonly http: HttpClient) {}

  /** Lists one page of the member directory. */
  list(params?: ListMembersParams, options?: RequestOptions): Promise<MemberPage> {
    return this.http.request<MemberPage>({
      method: "GET",
      path: "/api/v1/org/members",
      query: serializeMemberQuery(params),
      ...options,
    });
  }

  /** Iterates every member across pages: `for await (const m of entrybit.org.members.iterate())`. */
  iterate(params?: ListMembersParams, options?: RequestOptions): AsyncGenerator<Member> {
    const { cursor, ...rest } = params ?? {};
    return iterateCursorPages<Member>((c) => this.list({ ...rest, cursor: c }, options), cursor);
  }

  /** Fetches a single member by id (`emp_…`). */
  async get(memberId: string, params?: GetMemberParams, options?: RequestOptions): Promise<Member> {
    const res = await this.http.request<{ success: boolean; member: Member }>({
      method: "GET",
      path: `/api/v1/org/members/${encodePathParam("memberId", memberId)}`,
      query: serializeMemberQuery(params),
      ...options,
    });
    return res.member;
  }
}
