import type { components } from "../generated/schema.js";

// Schema-derived types (generated from spec/openapi.json — do not hand-edit).
export type Pass = components["schemas"]["Pass"];
export type PassPage = components["schemas"]["PassPage"];
export type PassCreateRequest = components["schemas"]["PassCreateRequest"];
export type PassCreateResponse = components["schemas"]["PassCreateResponse"];
export type RevokeResponse = components["schemas"]["RevokeResponse"];
/**
 * Presentation options for the guest pass page — strictly allowlisted
 * server-side (unknown keys are a named 400). Options shape presentation
 * only; entry validation, credentials and link lifetime are never affected.
 */
export type PassDisplayOptions = components["schemas"]["PassDisplayOptions"];
export type PassTemplate = components["schemas"]["PassTemplate"];

export interface ListPassesParams {
  /** Page size, 1–100 (server default 30). */
  limit?: number | undefined;
  /** Keyset cursor from a previous page's `next_cursor`. */
  cursor?: string | undefined;
  /** Free-text search. */
  search?: string | undefined;
}
