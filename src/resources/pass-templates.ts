import { encodePathParam } from "../core/params.js";
import type { HttpClient } from "../core/http.js";
import type { PassDisplayOptions, PassTemplate } from "../types/passes.js";
import type { RequestOptions } from "../types/requests.js";

/**
 * Pass templates (`/api/v1/org/pass-templates`, scopes
 * `org:pass_templates:read` / `org:pass_templates:write`) — named,
 * org-scoped display presets for the guest pass page. Reference one by name
 * on pass creation (`template: "pool-guest"`); per-request `display` options
 * override it field-by-field. Options are frozen into each pass link at
 * creation, so editing a template only affects passes created afterwards.
 */
export class OrgPassTemplates {
  constructor(private readonly http: HttpClient) {}

  /** Lists the organization's templates, ordered by name. */
  async list(options?: RequestOptions): Promise<PassTemplate[]> {
    const res = await this.http.request<{ success: boolean; templates: PassTemplate[] }>({
      method: "GET",
      path: "/api/v1/org/pass-templates",
      ...options,
    });
    return res.templates;
  }

  /**
   * Creates or replaces the named template (whole-object replace, not a
   * patch). Unknown display keys are rejected with a 400 naming the key.
   */
  async upsert(
    name: string,
    display: PassDisplayOptions,
    options?: RequestOptions,
  ): Promise<PassTemplate> {
    const res = await this.http.request<{ success: boolean; template: PassTemplate }>({
      method: "PUT",
      path: `/api/v1/org/pass-templates/${encodePathParam("name", name)}`,
      body: { display },
      ...options,
    });
    return res.template;
  }

  /** Deletes a template. Passes already created from it keep their frozen display. */
  async delete(name: string, options?: RequestOptions): Promise<void> {
    await this.http.request<unknown>({
      method: "DELETE",
      path: `/api/v1/org/pass-templates/${encodePathParam("name", name)}`,
      ...options,
    });
  }
}
