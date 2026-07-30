import type { HttpClient } from "../core/http.js";
import { Facilities } from "./facilities.js";
import { OrgMembers } from "./members.js";
import { OrgPasses } from "./passes.js";

/** The `/api/v1/org/*` namespace (organization API keys). */
export class Org {
  /** Organization-wide guest passes (`/api/v1/org/passes`). */
  readonly passes: OrgPasses;
  /** Member directory (`/api/v1/org/members`). */
  readonly members: OrgMembers;
  /** Organization facilities (`/api/v1/org/facilities`). */
  readonly facilities: Facilities;

  constructor(http: HttpClient) {
    this.passes = new OrgPasses(http, "/api/v1/org/passes");
    this.members = new OrgMembers(http);
    this.facilities = new Facilities(http, "/api/v1/org/facilities");
  }
}
