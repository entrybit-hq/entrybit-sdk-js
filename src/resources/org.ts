import type { HttpClient } from "../core/http.js";
import { Facilities } from "./facilities.js";
import { OrgMembers } from "./members.js";
import { OrgPasses } from "./passes.js";

/**
 * The `/api/v1/org/*` namespace (organization API keys). Sub-resources are
 * constructed lazily on first access and cached.
 */
export class Org {
  private passesInstance?: OrgPasses;
  private membersInstance?: OrgMembers;
  private facilitiesInstance?: Facilities;

  constructor(private readonly http: HttpClient) {}

  /** Organization-wide guest passes (`/api/v1/org/passes`). */
  get passes(): OrgPasses {
    return (this.passesInstance ??= new OrgPasses(this.http, "/api/v1/org/passes"));
  }

  /** Member directory (`/api/v1/org/members`). */
  get members(): OrgMembers {
    return (this.membersInstance ??= new OrgMembers(this.http));
  }

  /** Organization facilities (`/api/v1/org/facilities`). */
  get facilities(): Facilities {
    return (this.facilitiesInstance ??= new Facilities(this.http, "/api/v1/org/facilities"));
  }
}
