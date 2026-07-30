import type { components } from "../generated/schema.js";
import type { ListPassesParams } from "./passes.js";

// Schema-derived types (generated from spec/openapi.json — do not hand-edit).
export type Member = components["schemas"]["Member"];
export type MemberPage = components["schemas"]["MemberPage"];

export interface ListMembersParams extends ListPassesParams {
  /**
   * Field selection, e.g. `["name", "email"]` or `"name,email"`.
   * Which fields the server returns also depends on the credential's tier
   * (`org:members:read` = basic, `org:members:contact:read` adds email/phone).
   */
  fields?: string | readonly string[] | undefined;
  status?: "active" | "inactive" | "all" | undefined;
}

export interface GetMemberParams {
  fields?: string | readonly string[] | undefined;
}
