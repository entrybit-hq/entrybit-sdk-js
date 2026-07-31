import type { HttpClient } from "../core/http.js";
import { OrgControllers, OrgDoors, OrgRelays } from "./access.js";
import { Facilities } from "./facilities.js";
import { OrgMembers } from "./members.js";
import { OrgPassTemplates } from "./pass-templates.js";
import { OrgPasses } from "./passes.js";

/**
 * The `/api/v1/org/*` namespace (organization API keys). Sub-resources are
 * constructed lazily on first access and cached.
 */
export class Org {
  private passesInstance?: OrgPasses;
  private membersInstance?: OrgMembers;
  private facilitiesInstance?: Facilities;
  private passTemplatesInstance?: OrgPassTemplates;
  private controllersInstance?: OrgControllers;
  private doorsInstance?: OrgDoors;
  private relaysInstance?: OrgRelays;

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

  /** Named guest-pass display presets (`/api/v1/org/pass-templates`). */
  get passTemplates(): OrgPassTemplates {
    return (this.passTemplatesInstance ??= new OrgPassTemplates(this.http));
  }

  /** Controllers with doors + live online status (`/api/v1/org/controllers`). */
  get controllers(): OrgControllers {
    return (this.controllersInstance ??= new OrgControllers(this.http));
  }

  /** Momentary door opening (`/api/v1/org/doors`) — sent-not-opened semantics, never retried. */
  get doors(): OrgDoors {
    return (this.doorsInstance ??= new OrgDoors(this.http));
  }

  /** Bounded relay switching (`/api/v1/org/relays`). */
  get relays(): OrgRelays {
    return (this.relaysInstance ??= new OrgRelays(this.http));
  }
}
